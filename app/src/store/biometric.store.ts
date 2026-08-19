import { File, Paths } from 'expo-file-system';
import { create } from 'zustand';

/**
 * Última leitura conhecida, no aparelho.
 *
 * Um único registro, não série: o que a tela precisa para não abrir vazia é o
 * valor mais recente. A série completa fica no servidor, que é quem sabe juntar
 * o que veio de mais de um aparelho.
 */
const ARQUIVO_ULTIMA = 'ultima-leitura.v1.json';

/**
 * Estado derivado que o app reconstruía do zero a cada abertura.
 *
 * A leitura mais recente já era gravada, mas o SONO e as séries não — e elas só
 * se preenchem com leitura ao vivo. Na prática: fechou o app, a noite sumia e os
 * gráficos voltavam a zero, mesmo o dado já tendo sido medido. É o que faltava
 * para "não ficar esperando carregar toda vez".
 */
const ARQUIVO_DERIVADO = 'estado-derivado.v1.json';

/**
 * O aparelho que já foi pareado neste celular.
 *
 * Existe para o app não pedir a tela de conectar toda vez que abre. Pareamento
 * é uma decisão que a pessoa já tomou — repetir a pergunta a cada abertura
 * trata o passo como se fosse reversível a cada uso, e não é.
 *
 * Guarda só o identificador do periférico. Não é dado biométrico e não
 * identifica pessoa: é o endereço que o CoreBluetooth atribui ao aparelho
 * NESTE celular, e o próprio iOS o rotaciona entre instalações.
 */
const ARQUIVO_APARELHO = 'aparelho-pareado.v1.json';
const ARQUIVO_SEM_PULSEIRA = 'sem-pulseira.v1.json';

async function lerAparelhoPareado(): Promise<string | null> {
  try {
    const f = new File(Paths.document, ARQUIVO_APARELHO);
    return f.exists ? ((JSON.parse(await f.text()) as { id: string }).id ?? null) : null;
  } catch {
    return null;
  }
}

function lerSemPulseira(): boolean {
  try {
    return new File(Paths.document, ARQUIVO_SEM_PULSEIRA).exists;
  } catch {
    return false;
  }
}

function gravarSemPulseira() {
  try {
    const f = new File(Paths.document, ARQUIVO_SEM_PULSEIRA);
    if (!f.exists) f.create();
    f.write('{}');
  } catch {
    // Sem disco a escolha vale só nesta sessão — a próxima abertura pergunta.
  }
}

/** Uma varredura de noites por sessão: a memória da pulseira não muda durante o dia. */
let sonoRetroativoEnviado = false;

/**
 * A leitura de memória em curso, para que pedidos simultâneos a compartilhem.
 *
 * Fora do estado de propósito: é controle de concorrência, e o `syncing` do
 * store é o que a tela observa. Guardar a promessa aqui evita que dois gestos
 * de "puxar para atualizar" disputem o canal serial da pulseira, que não
 * suporta leitura simultânea.
 */
let sincronizacaoEmCurso: Promise<void> | null = null;

/**
 * Quando a última leitura de memória terminou, e o intervalo mínimo entre elas.
 *
 * Fora do estado: é bookkeeping de cadência, e a tela observa `syncing`. Dois
 * minutos é o suficiente para que navegar entre telas não custe uma varredura
 * de um minuto cada vez, e curto o bastante para o dado não envelhecer no dia.
 */
let ultimaSincronia = 0;
const INTERVALO_MINIMO_SYNC_MS = 2 * 60_000;

function gravarAparelhoPareado(id: string | null) {
  try {
    const f = new File(Paths.document, ARQUIVO_APARELHO);
    if (id === null) {
      if (f.exists) f.delete();
      return;
    }
    if (!f.exists) f.create();
    f.write(JSON.stringify({ id }));
  } catch {
    // Falha de disco não pode derrubar a conexão: sem o arquivo o app só volta
    // a perguntar na próxima abertura, que é o comportamento antigo.
  }
}

type Derivado = {
  sleep: SleepNight | null;
  stressByHour: { hour: string; value: number }[];
  /**
   * Oxigenação ao longo do dia, com o instante de cada amostra.
   *
   * Guarda o instante, e não um rótulo de hora como as outras: SpO₂ é medida em
   * janelas irregulares, e o que importa numa dessaturação é QUANDO ela
   * aconteceu — uma queda às 4h da manhã diz algo que a mesma queda às 16h não
   * diz.
   */
  spo2History: { at: number; value: number }[];
  /**
   * Estresse com o INSTANTE de cada amostra, ao lado do agrupado por hora.
   *
   * Os dois existem porque respondem a perguntas diferentes: `stressByHour` é o
   * que o gráfico de barras desenha, e esta é a entrada da bateria do corpo,
   * que integra carga ao longo do tempo e precisa saber quantos minutos
   * separaram duas medições. Agrupar por hora apaga exatamente isso.
   */
  stressHistory: { at: number; value: number }[];
  pressureHistory: PressureReading[];
  stepsByHour: number[];
  activity: Activity;
  /**
   * Coração e variabilidade também sobrevivem ao fechamento do app.
   *
   * Ficavam de fora, e o efeito era invisível para quem escreveu e óbvio para
   * quem usa: abrir o app zerava as duas curvas, e elas só voltavam depois de
   * uma sincronização inteira. Quem abrisse sem a pulseira por perto via "sem
   * série ainda" sobre dados que existiam.
   *
   * Opcionais porque um arquivo gravado por uma versão anterior não os tem — e
   * hidratar com `undefined` é melhor que descartar o arquivo todo.
   */
  hrvHistory?: Sample[];
  hrHistory?: Sample[];
};


/**
 * Preenche a curva de oxigênio DA NOITE, quando as duas metades existem.
 *
 * A noite vem da pulseira sem SpO₂ — a memória de sono e a de oxigênio são
 * consultas diferentes —, e o gráfico "Oxigênio durante a noite" nascia vazio
 * por isso. Aqui as duas se encontram: a noite traz a janela, a série traz as
 * amostras do dia, e o recorte é o que a tela desenha.
 *
 * Devolve a noite INTOCADA quando falta qualquer uma das partes: gráfico vazio
 * é melhor que gráfico com o dia inteiro fingindo ser a noite.
 */
function comOxigenioDaNoite(
  noite: SleepNight | null,
  amostras: { at: number; value: number }[],
): SleepNight | null {
  if (!noite?.startAt || !noite.endAt || amostras.length === 0) return noite;
  return { ...noite, spo2Night: spo2DaNoite(noite.startAt, noite.endAt, amostras) };
}

async function lerDerivado(): Promise<Derivado | null> {
  try {
    const f = new File(Paths.document, ARQUIVO_DERIVADO);
    return f.exists ? (JSON.parse(await f.text()) as Derivado) : null;
  } catch {
    return null;
  }
}

/**
 * Persiste o derivado a partir do ESTADO, não de um literal montado à mão.
 *
 * Havia três chamadas escrevendo o mesmo objeto campo a campo, e o custo
 * apareceu na primeira série nova: `spo2History` entrou no tipo e as três
 * precisaram ser editadas juntas — duas foram, uma não, e o dado sumia do disco
 * sem nenhum erro em tempo de execução.
 */
function persistirDerivado(e: {
  sleep: SleepNight | null;
  stressByHour: { hour: string; value: number }[];
  spo2History: { at: number; value: number }[];
  stressHistory: { at: number; value: number }[];
  pressureHistory: PressureReading[];
  stepsByHour: number[];
  activity: Activity;
  hrvHistory: Sample[];
  hrHistory: Sample[];
}) {
  gravarDerivado({
    sleep: e.sleep,
    stressByHour: e.stressByHour,
    spo2History: e.spo2History,
    stressHistory: e.stressHistory,
    pressureHistory: e.pressureHistory,
    stepsByHour: e.stepsByHour,
    activity: e.activity,
    hrvHistory: e.hrvHistory,
    hrHistory: e.hrHistory,
  });
}

function gravarDerivado(d: Derivado) {
  try {
    new File(Paths.document, ARQUIVO_DERIVADO).write(JSON.stringify(d));
  } catch {
    // Falha de disco não pode interromper a coleta ao vivo.
  }
}

async function lerUltimaLocal(): Promise<Reading | null> {
  try {
    const f = new File(Paths.document, ARQUIVO_ULTIMA);
    return f.exists ? (JSON.parse(await f.text()) as Reading) : null;
  } catch {
    return null;
  }
}

function gravarUltimaLocal(reading: Reading) {
  try {
    new File(Paths.document, ARQUIVO_ULTIMA).write(JSON.stringify(reading));
  } catch {
    // Falha de disco não pode interromper a coleta ao vivo.
  }
}

import type { Activity, PressureReading, Reading, SleepNight, SleepSegment } from '../domain/types';
import { ble } from '../services/ble';
import * as api from '../services/api.service';
import { fetchLastNight, isHealthAvailable, requestSleepAccess } from '../services/health.service';
import {
  notifyAttention,
  notifyBreathing,
  setupAndroidChannel,
  type MetricaDeAtencao,
} from '../services/notifications.service';
import { spo2DaNoite } from '../domain/sleep';
import { syncQueue } from '../services/sync.service';
import { rateHeartRate, ratePressure, rateSpo2 } from '../domain/ratings';
import { textoDaFalha } from '../domain/bandErrors';
import { comAmostraDeHrv, ultimoInstante } from '../domain/series';
import { useWorkoutStore } from './workout.store';
import type {
  BandActivity,
  ConnectionState,
  DayHistory,
  DiscoveredDevice,
  MeasurableKind,
  Sample,
} from '../services/ble';
import {
  comTeto,
  eTempoEsgotado,
  TETO_CONSULTA_MS,
  TETO_MEMORIA_SONO_MS,
  TETO_SONO_MS,
  TETO_MEDICAO_MS,
  TETO_SINCRONIA_MS,
} from '../services/ble/timeout';

/**
 * Freio da atualização de sinal, por aparelho.
 *
 * Fica FORA do estado de propósito: é bookkeeping da varredura, e guardá-lo no
 * store provocaria exatamente o re-render que ele existe para evitar.
 */
const RSSI_UPDATE_MS = 1000;
const lastSeen = new Map<string, number>();

/** Quantas leituras manter em memória para o gráfico ao vivo. */
const HISTORY_SIZE = 90;

type BiometricState = {
  connection: ConnectionState;
  /**
   * Motivo do último `error` de conexão, quando o serviço soube dizer.
   *
   * Nascia no módulo nativo ("feche o app do fabricante…") e morria antes da
   * tela: o `connectError` só cobre rejeição do `connect()`, e a falha da
   * entrega ao SDK chega DEPOIS, pelo estado. Sem isto ela era só "erro".
   */
  connectionReason: string | null;
  /** Etapa em curso no canal da pulseira — o que preenche a espera com verdade. */
  bandActivity: BandActivity | null;
  devices: DiscoveredDevice[];
  latest: Reading | null;
  /**
   * A série de HRV, com o instante de cada amostra.
   *
   * Eram números soltos, e isso escondia dois defeitos que só o carimbo de hora
   * revela: a mesma amostra entrava de novo a cada batimento (a curva era uma
   * reta feita de noventa cópias) e as abas de período não tinham como filtrar
   * nada, porque não havia tempo no dado. Num produto de saúde, uma curva que
   * não corresponde a medições é pior que curva nenhuma.
   */
  hrvHistory: Sample[];
  hrHistory: Sample[];
  /** `null` até haver uma noite medida. Não se inventa sono. */
  sleep: SleepNight | null;
  activity: Activity;
  /** Passos acumulados hora a hora, das 6h às 22h. */
  stepsByHour: number[];
  /** Stress por hora do dia, para o gráfico de barras. */
  stressByHour: { hour: string; value: number }[];
  /**
   * Oxigenação do dia, com o instante de cada amostra.
   *
   * Guarda o instante em vez de um rótulo de hora, ao contrário das outras
   * séries: SpO₂ é medida em janelas irregulares, e numa dessaturação importa
   * QUANDO ela aconteceu — uma queda às 4h diz algo que a mesma queda às 16h
   * não diz.
   */
  spo2History: { at: number; value: number }[];
  /** Estresse com instante, entrada da bateria do corpo. */
  stressHistory: { at: number; value: number }[];
  /** Últimas aferições de pressão, para a dispersão. */
  pressureHistory: PressureReading[];
  batteryPct: number | null;
  /**
   * Aparelho já pareado neste celular, lido do disco na abertura.
   *
   * `undefined` enquanto o disco não respondeu — e essa terceira posição
   * importa: a navegação precisa distinguir "ainda não sei" de "não há", ou
   * mostraria a tela de conectar por um instante a quem já tem pulseira.
   */
  pairedDeviceId: string | null | undefined;
  /**
   * A pessoa escolheu usar o app SEM a pulseira — quem está esperando o
   * aparelho chegar, ou o revisor da App Store, que nunca terá um. Persiste em
   * disco: sem isso, cada abertura voltaria a cobrar o pareamento. Mesmo
   * `undefined` de "disco ainda não respondeu" do `pairedDeviceId`.
   */
  bandSkipped: boolean | undefined;
  skipBand: () => void;

  startScan: () => () => void;
  connect: (deviceId: string) => Promise<void>;
  /** Motivo da última falha de conexão, para a tela poder mostrar. */
  connectError: string | null;
  disconnect: () => Promise<void>;
  /** Preenche a tela com a última leitura conhecida, antes de qualquer nova. */
  hydrate: () => Promise<void>;
  /** Pede acesso ao sono no app Saúde e já traz a última noite. */
  connectHealth: () => Promise<boolean>;
  /**
   * Traz do APARELHO as séries do dia, em vez de esperar acumular ao vivo.
   *
   * Roda na conexão. Também dá para chamar à mão — é o que um "puxar para
   * atualizar" faria.
   */
  /**
   * `force` distingue GESTO de montagem de tela.
   *
   * Sem essa distinção, abrir a tela de Saúde disparava uma leitura completa —
   * seis consultas em série, perto de um minuto — a cada visita, e o painel de
   * progresso parecia que o app vivia carregando. A memória do aparelho não
   * muda a cada minuto; puxar para atualizar continua forçando.
   */
  syncHistory: (force?: boolean) => Promise<void>;
  /** Há uma leitura de memória em curso — a tela usa para não disparar duas. */
  syncing: boolean;
  /** Por que a última sincronização não trouxe nada, em linguagem de gente. */
  syncError: string | null;
  recoverBandMemory: () => Promise<void>;
  /** Grandeza sendo medida agora, `null` quando não há medição em curso. */
  measuring: MeasurableKind | null;
  /** Quando a medição corrente começou — a tela conta o tempo com isto. */
  measureStartedAt: number | null;
  /** Motivo da última falha de medição, para a tela poder mostrar. */
  measureError: string | null;
  /** Manda a pulseira medir agora. Ver `MeasureButton`. */
  measureNow: (kind: MeasurableKind) => Promise<void>;
  cancelMeasure: () => Promise<void>;
  listen: () => () => void;
};

/**
 * Hipnograma sintético com arquitetura fisiológica correta: sono profundo
 * concentrado nos primeiros ciclos, REM alongando em direção à manhã, com
 * despertares curtos entre ciclos. Um sorteio uniforme produziria uma noite
 * que não existe.
 */
/*
 NENHUM dado de exemplo mora mais aqui.

 Este bloco tinha uma noite de sono com score 82, 7.842 passos, uma semana de
 pressão e uma curva de temperatura de 24 horas — tudo escrito à mão para a
 interface ter o que desenhar antes de existir hardware. Cumpriu o papel e
 passou a atrapalhar: num produto de saúde, número plausível que ninguém mediu é
 pior que campo vazio, porque não há como distinguir os dois olhando.

 Agora tudo começa vazio e só é preenchido pelo que a pulseira entrega. Onde não
 há medição, `ratings.ts` devolve `available: false` e a tela mostra traço.
 */

/*
 Os tetos vivem em `services/ble/timeout.ts`, junto do porquê de existirem.
 Estavam aqui como um `Promise.race` escrito à mão só para a medição, enquanto
 sincronizar e buscar a noite — mesmo SDK, mesmo modo de falhar — não tinham
 nenhum.
*/

/**
 * Traz do APARELHO as séries do dia, em vez de esperar acumular ao vivo.
 *
 * Era o buraco entre a nossa tela e a do fabricante. As séries se construíam
 * para a frente, uma leitura por vez, o que só preenche o gráfico se o app
 * ficar aberto e conectado o dia inteiro — na prática, quase nunca. A pulseira
 * registrava tudo sozinha nas janelas agendadas, e essa memória nunca era lida.
 *
 * O que vem do aparelho SUBSTITUI o acumulado, não se soma: são as mesmas
 * medições vistas de dois jeitos, e concatenar produziria pontos repetidos na
 * mesma hora. A memória do aparelho é a versão mais completa das duas.
 *
 * Fora do objeto do store porque `syncHistory` passou a ser só o porteiro da
 * concorrência: aninhar trinta linhas dentro de um IIFE ali dentro escondia
 * qual das duas coisas estava sendo lida.
 */
type Set = (parcial: Partial<BiometricState>) => void;
type Get = () => BiometricState;

async function lerMemoriaDoDia(set: Set, get: Get): Promise<void> {
  set({ syncing: true, syncError: null });
  /*
     Teto na sincronização INTEIRA, além do teto por consulta que a ponte já
     aplica. São duas redes com propósitos diferentes: a de baixo impede que uma
     grandeza pendurada leve as outras junto; esta impede que a soma das cinco
     — com tentativas e esperas crescentes — passe do que alguém aceita esperar
     olhando para um indicador girando.
    */
  let historico: DayHistory | null = null;
  try {
    historico = (await comTeto(
      ble.fetchHistory?.() ?? Promise.resolve(null),
      TETO_SINCRONIA_MS,
      'sincronização',
    )) as DayHistory | null;
  } catch (err) {
    set({
      syncError: eTempoEsgotado(err)
        ? 'A pulseira parou de responder no meio da leitura. Aproxime o pulso do celular e puxe para atualizar de novo.'
        : 'Não deu para ler a memória da pulseira agora. Tente de novo em instantes.',
    });
  } finally {
    set({ syncing: false });
  }
  if (!historico) return;

  const porHora = (amostras: { at: number; value: number }[]) => {
    // Uma amostra por hora, a última de cada — doze pontos legíveis no lugar
    // de duzentos empilhados no mesmo rótulo.
    const mapa = new Map<string, number>();
    for (const a of amostras) mapa.set(`${new Date(a.at).getHours()}h`, a.value);
    return [...mapa.entries()].map(([hour, value]) => ({ hour, value })).slice(-12);
  };

  const estresse = historico.stress.length ? porHora(historico.stress) : get().stressByHour;
  const estresseCru = historico.stress.length ? historico.stress : get().stressHistory;
  const pressao = historico.pressure.length
    ? historico.pressure
        .map((p) => ({
          systolic: p.systolic,
          diastolic: p.diastolic,
          at: `${new Date(p.at).getHours()}h`,
        }))
        .slice(-14)
    : get().pressureHistory;
  const passos = historico.steps.length
    ? historico.steps.map((p) => p.steps).slice(-17)
    : get().stepsByHour;
  const fc = historico.heartRate.length ? historico.heartRate.slice(-90) : get().hrHistory;
  /*
     A curva de HRV vem da MEMÓRIA, como todas as outras.

     Ela se construía sozinha, para a frente, a partir do que passava ao vivo —
     e como a leitura contínua carrega sempre a última amostra conhecida, o que
     se acumulava era a mesma medição repetida. A pulseira já guardava a série
     de verdade, com os instantes das janelas agendadas; era só perguntar.
    */
  const variabilidade = historico.hrv.length ? historico.hrv.slice(-90) : get().hrvHistory;
  const oxigenio = historico.spo2.length ? historico.spo2 : get().spo2History;

  set({
    stressByHour: estresse,
    stressHistory: estresseCru,
    pressureHistory: pressao,
    stepsByHour: passos,
    hrHistory: fc,
    hrvHistory: variabilidade,
    spo2History: oxigenio,
    /*
     A noite quase sempre chega ANTES da série de oxigênio — são consultas
     diferentes ao canal serial, e a do sono roda primeiro. Recompor aqui é o
     que faz o gráfico da noite se preencher na mesma sincronização, em vez de
     só na próxima abertura do app.
    */
    sleep: comOxigenioDaNoite(get().sleep, oxigenio),
  });

  persistirDerivado(get());
  // Marcado só com dado na mão: leitura que falhou não deve bloquear a próxima
  // tentativa pelo intervalo mínimo.
  ultimaSincronia = Date.now();
}

export const useBiometricStore = create<BiometricState>((set, get) => ({
  connection: 'idle',
  connectionReason: null,
  bandActivity: null,
  pairedDeviceId: undefined,
  bandSkipped: undefined,
  skipBand: () => {
    set({ bandSkipped: true });
    gravarSemPulseira();
  },
  devices: [],
  syncing: false,
  syncError: null,
  latest: null,
  hrvHistory: [],
  hrHistory: [],
  sleep: null,
  activity: {
    steps: 0,
    goal: 10000,
    distanceKm: 0,
    activeKcal: 0,
    activeMin: 0,
  },
  stepsByHour: [],
  stressByHour: [],
  spo2History: [],
  stressHistory: [],
  pressureHistory: [],
  batteryPct: null,
  connectError: null,
  measuring: null,
  measureStartedAt: null,
  measureError: null,

  startScan: () => {
    lastSeen.clear();
    set({ devices: [], connectError: null });
    return ble.scan((device) => {
      set((s) => {
        const index = s.devices.findIndex((d) => d.id === device.id);
        if (index === -1) return { devices: [...s.devices, device] };

        // Aparelho já visto: ATUALIZA o sinal, mas com freio.
        //
        // Com `allowDuplicates` ligado o rádio entrega dezenas de anúncios por
        // segundo, e escrever no estado a cada um faz a lista inteira
        // re-renderizar e as linhas trocarem de lugar sem parar — ilegível.
        // Um intervalo mínimo por aparelho basta para o número continuar vivo
        // sem tremer.
        const now = Date.now();
        if (now - (lastSeen.get(device.id) ?? 0) < RSSI_UPDATE_MS) return s;
        lastSeen.set(device.id, now);

        const devices = [...s.devices];
        // Suavização exponencial: o RSSI oscila vários dBm entre anúncios
        // consecutivos mesmo com o aparelho parado. Sem isso, a ordenação por
        // proximidade embaralharia linhas por puro ruído de rádio.
        const smoothed = Math.round(devices[index].rssi * 0.7 + device.rssi * 0.3);
        devices[index] = { ...device, rssi: smoothed };
        return { devices };
      });
    });
  },

  connect: async (deviceId) => {
    // A falha é CAPTURADA e vira estado, não rejeição solta.
    //
    // Sem isto, um erro de conexão virava "Uncaught (in promise)" no console e
    // nada na tela: a pessoa toca no aparelho, o app não reage e não há como
    // saber por quê. A mensagem do rádio é o único diagnóstico disponível, e
    // ela precisa chegar à interface.
    set({ connectError: null });
    try {
      await ble.connect(deviceId);
      gravarAparelhoPareado(deviceId);
      set({
        pairedDeviceId: deviceId,
        batteryPct: ble.getBatteryLevel(),
        connectError: null,
      });
      // A memória da pulseira guarda uma SEMANA — quem passou dias longe do
      // celular tem os dias presos lá. A varredura espera o arranque da
      // conexão assentar (o canal é serial e o dia de hoje tem prioridade).
      setTimeout(() => void get().recoverBandMemory(), 20_000);
    } catch (err) {
      set({
        connectError: err instanceof Error ? err.message : 'Falha ao conectar',
      });
    }
  },

  disconnect: async () => {
    await ble.disconnect();
    /*
     Desconectar ESQUECE o aparelho.

     É a diferença entre "saiu do alcance" e "não quero mais este aparelho". A
     primeira acontece sozinha e não passa por aqui; esta só acontece quando
     alguém toca em desconectar, e aí voltar a perguntar na próxima abertura é
     o comportamento certo.
    */
    gravarAparelhoPareado(null);
    set({
      pairedDeviceId: null,
      latest: null,
      hrvHistory: [],
      hrHistory: [],
      batteryPct: null,
    });
  },

  /**
   * Preenche a tela com o que JÁ existe, antes de qualquer leitura nova.
   *
   * Sem isto o app abria vazio e só ganhava número quando a pulseira entregava
   * uma leitura — dezenas de segundos de traço numa tela que já tinha dado para
   * mostrar. Não era dado falso nem faltante: era dado guardado que ninguém
   * buscava. O `GET /biometric/latest` existia no servidor desde o início e não
   * tinha um único consumidor.
   *
   * A ordem importa. O arquivo local vem primeiro porque responde na hora e
   * funciona sem rede; o servidor vem depois e corrige, porque é ele quem tem a
   * leitura mais recente entre todos os aparelhos.
   */
  hydrate: async () => {
    /*
     O aparelho pareado vem PRIMEIRO, e sozinho decide a tela inicial.

     Antes de qualquer leitura: a navegação está esperando por ele, e cada
     milissegundo aqui é tela de conectar piscando na cara de quem já pareou.
    */
    const pareado = await lerAparelhoPareado();
    // Num único set: a navegação desbloqueia quando `pairedDeviceId` chega, e
    // precisa encontrar `bandSkipped` já resolvido no mesmo instante.
    set({ pairedDeviceId: pareado, bandSkipped: lerSemPulseira() });

    /*
     Reconecta em segundo plano, sem bloquear nada.

     A home já sabe mostrar "Sem conexão" e já se preenche com o que está em
     disco, então não há por que segurar a interface esperando o rádio. Falha
     silenciosa é o certo: a pulseira pode estar longe ou carregando, e isso
     não é erro que mereça alerta — o cabeçalho da home já comunica o estado.
    */
    if (pareado) {
      void ble
        .connect(pareado)
        .then(() => set({ batteryPct: ble.getBatteryLevel() }))
        .catch(() => undefined);
    }

    const local = await lerUltimaLocal();
    if (local && !get().latest) set({ latest: local });

    // O derivado vem junto: sono e séries que só a leitura ao vivo preenche.
    const derivado = await lerDerivado();
    if (derivado) {
      set({
        sleep: derivado.sleep ?? get().sleep,
        stressByHour: derivado.stressByHour ?? [],
        spo2History: derivado.spo2History ?? [],
        stressHistory: derivado.stressHistory ?? [],
        pressureHistory: derivado.pressureHistory ?? [],
        stepsByHour: derivado.stepsByHour ?? [],
        hrvHistory: derivado.hrvHistory ?? [],
        hrHistory: derivado.hrHistory ?? [],
        activity: derivado.activity ?? get().activity,
      });
    }

    /*
     A PULSEIRA primeiro; o app Saúde como complemento.

     Nesta ordem porque a pulseira é a fonte do produto — quem assina recebe o
     aparelho, e ele mede sono (`feature.newSleepProtocol`). O HealthKit serve a
     quem também tem Apple Watch, ou às noites em que a pulseira ficou
     carregando.

     Só sono do HealthKit, e nunca HRV: o Apple Watch reporta SDNN e a pulseira
     reporta RMSSD, e misturar os dois na mesma linha de base produziria um
     denominador que não corresponde a nenhum dos métodos.
     */
    const daPulseira = await comTeto(
      ble.fetchSleep?.() ?? Promise.resolve(null),
      TETO_SONO_MS,
      'sono da pulseira',
    ).catch(() => null);
    const noite =
      daPulseira ??
      (isHealthAvailable()
        ? await comTeto(fetchLastNight(), TETO_CONSULTA_MS, 'sono do app Saúde').catch(() => null)
        : null);
    if (noite) {
      set({ sleep: comOxigenioDaNoite(noite, get().spo2History) });
      api.pushSleepNight(noite);
    }

    // Forçado: conexão nova é o momento em que o dado local está mais velho, e
    // o intervalo mínimo existe contra visita de tela, não contra pareamento.
    await get().syncHistory(true);

    /*
     As noites ANTERIORES sobem uma vez por sessão — é o que preenche o sono
     dos dias passados no histórico de saúde de quem já dormia com a pulseira
     antes de o envio existir. DEPOIS do syncHistory e com await, nunca em
     paralelo: o canal da pulseira é serial e leitura simultânea colide.
    */
    if (!sonoRetroativoEnviado && ble.fetchSleepHistory) {
      const noites = await comTeto(
        ble.fetchSleepHistory(),
        TETO_MEMORIA_SONO_MS,
        'memória de sono',
      ).catch(() => [] as const);
      for (const n of noites) api.pushSleepNight(n);
      // O flag só queima com noite na mão: zero tanto pode ser memória vazia
      // quanto o SDK mudo naquele instante — visto em produção — e neste caso
      // o refresh seguinte merece nova chance.
      if (noites.length > 0) sonoRetroativoEnviado = true;
    }

    if (!api.isAuthenticated()) return;
    try {
      const doServidor = await api.fetchLatestReading();
      // Só substitui se for MAIS NOVA: uma leitura ao vivo que chegou enquanto
      // a requisição viajava não pode ser rebaixada por um registro antigo.
      const atual = get().latest;
      if (doServidor && (!atual || doServidor.recordedAt > atual.recordedAt)) {
        set({ latest: doServidor });
        gravarUltimaLocal(doServidor);
      }
    } catch {
      // Sem servidor, o local já cumpriu o papel.
    }
  },

  /**
   * Pede o acesso ao sono e busca a noite na sequência.
   *
   * Separado do `hydrate` porque é AÇÃO da pessoa, não carregamento: o diálogo
   * do iOS só deve aparecer quando ela tocar em conectar, nunca na abertura do
   * app. Pedir permissão sem contexto é a forma mais rápida de ser negado.
   */
  /**
   * Medição sob demanda, disparada pela tela.
   *
   * Uma por vez: é UM sensor óptico no pulso, e duas medições simultâneas
   * disputam o mesmo hardware — a segunda falharia sem explicação clara.
   *
   * Não devolve valor. O resultado chega por `subscribe`, como qualquer outra
   * leitura, e a tela se atualiza sozinha quando ele entra.
   */
  measureNow: async (kind) => {
    if (get().measuring) return;
    if (get().connection !== 'connected') {
      set({ measureError: 'Conecte a pulseira para medir.' });
      return;
    }
    if (!ble.measure) {
      set({ measureError: 'Este aparelho não mede sob demanda.' });
      return;
    }

    // O instante da última leitura ANTES de medir: é ele que diz, no fim, se
    // a medição produziu valor ou terminou vazia.
    const antes = get().latest?.recordedAt ?? 0;
    /*
     O CARIMBO da amostra mais nova, não o tamanho da série.

     Contar itens funcionava enquanto a série se construía do zero a cada
     sessão. Desde que `syncHistory` passou a enchê-la da memória do aparelho,
     ela chega no teto de `HISTORY_SIZE` — e aí toda medição bem-sucedida
     empurra a mais antiga para fora, o tamanho não muda, e a tela acusava
     "concluiu sem devolver valor" sobre uma medição que deu certo. Visto em
     campo (ago/2026), no primeiro teste em aparelho.
    */
    const hrvAntes = ultimoInstante(get().hrvHistory);

    set({ measuring: kind, measureError: null, measureStartedAt: Date.now() });
    try {
      /*
       Corrida contra o relógio, e não `await` puro.

       O SDK do fabricante só chama o bloco de conclusão quando a leitura
       CONVERGE. Pulseira frouxa, braço em movimento ou sensor fora da pele
       produzem uma medição que roda para sempre: a promessa nativa nunca
       resolve nem rejeita, e o botão girava até o app ser fechado. Visto em
       campo (ago/2026).
      */
      await comTeto(ble.measure(kind), TETO_MEDICAO_MS, kind);

      /*
       Terminou — mas mediu?

       Com o monitoramento agendado desligado no firmware, a medição sob
       demanda conclui com SUCESSO e devolve vazio. Sem esta checagem a tela
       dizia "pronto" e continuava mostrando traço, que é a forma mais
       confusa possível de falhar.
      */
      const depois = get().latest?.recordedAt ?? 0;
      const chegou =
        kind === 'hrv' ? ultimoInstante(get().hrvHistory) > hrvAntes : depois > antes;
      if (!chegou) {
        set({
          measureError:
            'A pulseira concluiu sem devolver valor. Costuma ser contato com a pele: ' +
            'aperte a pulseira um furo e meça de novo, com o braço parado.',
        });
      }
    } catch (err) {
      // Falha de medição é rotina, não erro de programa: pulseira frouxa,
      // braço em movimento, sensor sem contato com a pele. A frase precisa
      // dizer o que fazer, não o que quebrou.
      const foiTempo = eTempoEsgotado(err);
      // Tempo esgotado deixa o sensor LIGADO no aparelho: desligar é parte de
      // desistir, senão a próxima medição disputa um sensor já ocupado.
      if (foiTempo) await ble.stopMeasure?.(kind).catch(() => undefined);
      const detalhe = err instanceof Error ? err.message : 'a medição não concluiu';
      /*
       A palavra do APARELHO ganha do nosso palpite.

       O firmware manda a causa real — "a pulseira não está corretamente
       encaixada", "bateria baixa" — e ela chegava aqui e era substituída por
       uma frase genérica escrita por nós. Medido em campo (ago/2026): as três
       medições da conexão falhavam com o aviso de encaixe, e nenhuma tela
       dizia isso a quem podia resolver em dois segundos.
      */
      // O código vem da ponte nativa (`promise.reject(codigo, ...)`) e ganha da
      // frase: frase de firmware muda entre versões, código é contrato.
      const codigo = typeof (err as { code?: unknown })?.code === 'string'
        ? (err as { code: string }).code
        : null;
      const doFirmware = textoDaFalha(detalhe, codigo);
      set({
        measureError:
          doFirmware ??
          (foiTempo
            ? 'A medição passou de um minuto e meio sem concluir. Ajuste a pulseira no pulso, ' +
              'deixe o braço parado e tente de novo.'
            : `Não deu para medir: ${detalhe}. Ajuste a pulseira no pulso e tente de novo.`),
      });
    } finally {
      set({ measuring: null, measureStartedAt: null });
    }
  },

  /** Desistir no meio: desliga o sensor e devolve o botão. */
  cancelMeasure: async () => {
    const kind = get().measuring;
    if (!kind) return;
    set({ measuring: null, measureStartedAt: null, measureError: null });
    await ble.stopMeasure?.(kind).catch(() => undefined);
  },

  syncHistory: (force = false) => {
    /*
     Leitura recente não se repete por montagem de tela.

     O corte é por IDADE do dado, não por sessão: quem abre Saúde, sai e volta
     em dez segundos não precisa de outra varredura, e quem volta meia hora
     depois precisa.
    */
    if (!force && Date.now() - ultimaSincronia < INTERVALO_MINIMO_SYNC_MS) {
      return Promise.resolve();
    }
    /*
     Quem chega no meio ESPERA a leitura em curso, em vez de desistir.

     Desistir devolvia o controle na hora, e o efeito na tela era o contrário
     do pretendido: o indicador de "puxar para atualizar" parava enquanto a
     pulseira ainda estava respondendo, como se a atualização tivesse
     terminado sem trazer nada. Compartilhando a mesma promessa, todos os
     pedidos terminam junto com o trabalho real — e o canal serial da pulseira,
     que não suporta leitura simultânea, continua com uma só.
    */
    if (sincronizacaoEmCurso) return sincronizacaoEmCurso;
    sincronizacaoEmCurso = lerMemoriaDoDia(set, get).finally(() => {
      sincronizacaoEmCurso = null;
    });
    return sincronizacaoEmCurso;
  },

  /**
   * Varre a MEMÓRIA da pulseira — os dias em que o celular não estava por
   * perto. O protocolo endereça 7 dias (0–6); o de hoje já entra pelo
   * `syncHistory`, então aqui vão do mais antigo ao de ontem, em série (o
   * canal é serial), direto para o servidor. Re-varrer os mesmos dias em
   * cada reconexão não duplica nada: o ingest é idempotente por
   * (usuário, instante, fonte).
   */
  recoverBandMemory: async () => {
    if (!ble.fetchHistory || !api.isAuthenticated()) return;
    for (let dia = 6; dia >= 1; dia--) {
      const h = await ble.fetchHistory(dia).catch(() => null);
      if (!h) continue;
      const amostras: api.MemoryReading[] = [
        ...h.heartRate.map((a) => ({ recordedAt: a.at, heartRate: a.value })),
        ...h.stress.map((a) => ({ recordedAt: a.at, stressScore: a.value })),
        ...h.spo2.map((a) => ({ recordedAt: a.at, spo2Pct: a.value })),
        ...h.steps.map((p) => ({ recordedAt: p.at, steps: p.steps })),
      ];
      if (amostras.length) await api.ingestMemory(amostras).catch(() => undefined);
      if (__DEV__ && amostras.length)
        console.log(`[memória] dia -${dia}: ${amostras.length} amostras`);
    }
  },

  connectHealth: async () => {
    // A pulseira tem precedência aqui também: se ela já mediu, não há por que
    // pedir permissão de dado de saúde a quem não precisa conceder.
    const daPulseira = await comTeto(
      ble.fetchSleep?.() ?? Promise.resolve(null),
      TETO_SONO_MS,
      'sono da pulseira',
    ).catch(() => null);
    if (daPulseira) {
      set({ sleep: daPulseira });
      api.pushSleepNight(daPulseira);
      const e = get();
      persistirDerivado(get());
      console.log('[health] sono veio da pulseira, sem precisar do app Saúde');
      return true;
    }

    const pediu = await requestSleepAccess();
    if (!pediu) {
      console.warn('[health] não foi possível pedir acesso — ver aviso acima');
      return false;
    }
    const noite = await comTeto(fetchLastNight(), TETO_CONSULTA_MS, 'sono do app Saúde').catch(
      () => null,
    );
    console.log(
      `[health] noite encontrada: ${noite ? `${noite.totalMin} min, score ${noite.score}` : 'nenhuma'}`,
    );
    if (noite) {
      set({ sleep: comOxigenioDaNoite(noite, get().spo2History) });
      api.pushSleepNight(noite);
    }
    // `true` significa "o diálogo foi apresentado", não "autorizado": o iOS não
    // conta ao app se a pessoa recusou — negar e não ter dado são a mesma coisa
    // vista daqui, por design de privacidade da Apple.
    return true;
  },

  /** Liga store e wearable. Chamado uma vez, na raiz da árvore. */
  listen: () => {
    syncQueue.start();
    void get().hydrate();
    void setupAndroidChannel();

    /*
     Ciclo de sincronização ENQUANTO conectada — é o que torna a conexão
     fluida de verdade.

     A varredura da memória rodava uma vez, na conexão, e dali em diante a
     tela só mudava se chegasse leitura ao vivo: "Lendo agora" piscando e os
     anéis parados, porque estresse, SpO₂ e passos que a pulseira registra
     sozinha (agendados a cada 30 min) nunca eram relidos. A bateria idem —
     o serviço a conhecia e o store nunca perguntava, e a home mostrava "—"
     com a pulseira conectada do lado.

     Duas cadências: uma leitura inicial ~10 s após conectar (dá tempo de o
     `afterConnect` do serviço buscar a bateria e ligar os agendamentos) e um
     ciclo de 4 min depois disso. O canal é serial — cada varredura leva
     poucos segundos e o intervalo é folgado de propósito.
     */
    let cicloSync: ReturnType<typeof setInterval> | null = null;
    let leituraInicial: ReturnType<typeof setTimeout> | null = null;
    const pararCiclo = () => {
      if (cicloSync) clearInterval(cicloSync);
      if (leituraInicial) clearTimeout(leituraInicial);
      cicloSync = null;
      leituraInicial = null;
    };
    const puxarDoAparelho = async () => {
      // Antes e depois: a bateria pode ter chegado ao serviço no meio da
      // varredura, e a segunda leitura apanha o valor fresco.
      set({ batteryPct: ble.getBatteryLevel() });
      await get().syncHistory();
      set({ batteryPct: ble.getBatteryLevel() });
    };

    const offState = ble.onStateChange((connection, reason) => {
      /*
       Mudou o estado do rádio, a falha anterior de leitura deixou de valer.

       Sem isto o aviso "a leitura não terminou" ficaria na tela até alguém
       sincronizar de novo — inclusive depois de reconectar, e inclusive
       tomando o lugar da linha que narra o que a pulseira está fazendo agora.
       Erro que sobrevive à sua própria causa é ruído.
      */
      set({ connection, connectionReason: reason ?? null, syncError: null });
      pararCiclo();
      if (connection === 'connected') {
        leituraInicial = setTimeout(() => void puxarDoAparelho(), 10_000);
        cicloSync = setInterval(() => void puxarDoAparelho(), 4 * 60_000);
      } else {
        // Fora do ar o valor congelaria mentindo atualidade; traço é a verdade.
        set({ batteryPct: null });
      }
    });
    // Serviço sem etapas (mock, GATT próprio) simplesmente não narra nada.
    const offActivity = ble.onActivity?.((bandActivity) => set({ bandActivity }));
    /*
     A falha das medições AUTOMÁTICAS vira aviso na tela.

     Só quando há tradução conhecida: mensagem crua do firmware, em chinês, é
     pior que silêncio. E não sobrescreve um erro de medição sob demanda em
     curso — quem pediu a medição merece a resposta do próprio pedido.
    */
    const offMeasureFailure = ble.onMeasureFailure?.((motivo) => {
      const texto = textoDaFalha(motivo);
      if (texto && !get().measuring) set({ measureError: texto });
    });
    const offReading = ble.subscribe((reading) => {
      vigiarLeitura(reading);
      // Toda leitura entra na fila de envio. Ela só sai de lá com confirmação
      // do servidor, e o ingest é idempotente — reenvio não duplica.
      syncQueue.enqueue(reading);
      gravarUltimaLocal(reading);
      const { hrvHistory, hrHistory, activity, stressByHour, pressureHistory, stepsByHour } = get();

      /*
       As séries se constroem a partir do que o aparelho manda.

       Antes eram listas escritas à mão — doze horas de estresse, uma semana de
       pressão, um dia de passos. Agora cada leitura acrescenta o seu ponto, e a
       tela desenha o que existe. Enquanto a pulseira não medir, o gráfico fica
       vazio, que é a informação correta.
       */
      const rotulo = new Date(reading.recordedAt).getHours() + 'h';

      const stress =
        reading.stressScore == null
          ? stressByHour
          : // Uma amostra por hora: substitui a da hora corrente em vez de
            // empilhar dezenas de pontos no mesmo rótulo.
            [
              ...stressByHour.filter((p) => p.hour !== rotulo),
              { hour: rotulo, value: reading.stressScore },
            ].slice(-12);

      const pressao =
        reading.bpSystolic == null || reading.bpDiastolic == null
          ? pressureHistory
          : [
              ...pressureHistory,
              {
                systolic: reading.bpSystolic,
                diastolic: reading.bpDiastolic,
                at: rotulo,
              },
            ].slice(-14);

      const passos =
        reading.steps == null
          ? stepsByHour
          : [...stepsByHour.filter((_, i) => i < stepsByHour.length), reading.steps].slice(-17);

      const variabilidade = comAmostraDeHrv(hrvHistory, reading, HISTORY_SIZE);
      const coracao = [...hrHistory, { at: reading.recordedAt, value: reading.heartRate }].slice(
        -HISTORY_SIZE,
      );

      gravarDerivado({
        sleep: get().sleep,
        stressByHour: stress,
        // A leitura ao vivo não traz oxigenação com carimbo próprio — quem
        // preenche esta série é `syncHistory`, lendo a memória do aparelho.
        spo2History: get().spo2History,
        stressHistory: get().stressHistory,
        pressureHistory: pressao,
        stepsByHour: passos,
        activity: reading.steps == null ? activity : { ...activity, steps: reading.steps },
        hrvHistory: variabilidade,
        hrHistory: coracao,
      });

      set({
        latest: reading,
        stressByHour: stress,
        pressureHistory: pressao,
        stepsByHour: passos,
        // Só o que foi medido entra na série. Um `null` virando ponto no
        // gráfico desenharia uma queda a zero que nunca aconteceu.
        hrvHistory: variabilidade,
        hrHistory: coracao,
        activity: reading.steps == null ? activity : { ...activity, steps: reading.steps },
      });
    });
    return () => {
      syncQueue.stop();
      pararCiclo();
      offState();
      offActivity?.();
      offMeasureFailure?.();
      offReading();
    };
  },
}));

/** Percentual de sono profundo — entra no cálculo da idade biológica. */
export function deepSleepPct(sleep: SleepNight): number {
  return sleep.phases.deep / sleep.totalMin;
}

// ============================================================================
// Vigias de leitura — decidem quando uma medição vira notificação.
// ============================================================================

/** Último aviso por métrica. Alerta repetido é alerta ignorado. */
const ultimoAviso = new Map<string, number>();
const COOLDOWN_ATENCAO_MS = 6 * 3600_000;

/** Leituras seguidas com batimento alto, e desde quando. */
let ritmoAltoDesde: number | null = null;
let ultimoConviteRespiracao = 0;
const COOLDOWN_RESPIRACAO_MS = 3600_000;
/** O limiar do próprio `rateHeartRate`: acima disso em repouso é alerta. */
const BPM_ALTO = 100;
/** Dois minutos sustentados — um pico ao subir escada não é convite. */
const SUSTENTADO_MS = 2 * 60_000;

/**
 * Olha cada leitura que chega e decide se algo merece notificação.
 *
 * Duas vigias, duas éticas:
 *
 * - **Atenção**: medição em estado de alerta (`ratings.ts` decide, não este
 *   arquivo — a régua clínica mora num lugar só). Uma por métrica a cada 6 h.
 * - **Respiração**: batimento acima do limiar por 2 minutos SEGUIDOS, fora de
 *   treino. Convite, não alarme — e nunca durante exercício, onde batimento
 *   alto é o objetivo, não um problema.
 */
function vigiarLeitura(reading: Reading) {
  const treinando = useWorkoutStore.getState().execution !== null;
  const agora = Date.now();

  // -- ritmo acelerado → respiração guiada --
  if (treinando || reading.heartRate <= BPM_ALTO) {
    ritmoAltoDesde = null;
  } else {
    ritmoAltoDesde = ritmoAltoDesde ?? agora;
    if (
      agora - ritmoAltoDesde >= SUSTENTADO_MS &&
      agora - ultimoConviteRespiracao >= COOLDOWN_RESPIRACAO_MS
    ) {
      ultimoConviteRespiracao = agora;
      ritmoAltoDesde = null;
      void notifyBreathing();
    }
  }

  // -- medição fora da faixa → atenção --
  if (treinando) return; // durante treino, tudo oscila por definição
  const alertas: [MetricaDeAtencao, boolean][] = [
    ['spo2', rateSpo2(reading.spo2Pct).state === 'alert'],
    ['pressao', ratePressure(reading.bpSystolic, reading.bpDiastolic).state === 'alert'],
    ['hr', rateHeartRate(reading.heartRate).state === 'alert'],
  ];
  for (const [metrica, alerta] of alertas) {
    if (!alerta) continue;
    const anterior = ultimoAviso.get(metrica) ?? 0;
    if (agora - anterior < COOLDOWN_ATENCAO_MS) continue;
    ultimoAviso.set(metrica, agora);
    void notifyAttention(metrica);
    break; // um aviso por leitura: três banners simultâneos é pânico, não cuidado
  }
}
