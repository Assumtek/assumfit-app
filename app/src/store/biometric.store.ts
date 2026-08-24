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

/**
 * O dia civil em que a varredura de noites rodou por último.
 *
 * Era um booleano — uma vez por SESSÃO — e a sessão de um app de pulseira
 * atravessa dias: o iOS segura o BLE em segundo plano e o processo não morre.
 * Num aparelho em produção (ago/2026) a varredura rodou no dia da instalação e
 * nunca mais; as noites seguintes ficaram só na memória do aparelho.
 */
let sonoRetroativoDoDia: string | null = null;

/** Última tentativa de buscar noite vencida — o garrote do ciclo de 4 min. */
let ultimaBuscaDeSono = 0;
/** Último envio da memória de hoje ao servidor; e o dia civil da varredura dos dias anteriores. */
let ultimoEnvioDaMemoria = 0;
let varreduraDaMemoriaDoDia: string | null = null;

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
  /** Dia civil LOCAL em que foi gravado — passos e atividade são do dia, e não podem amanhecer com o valor de ontem. */
  dia?: string;
  sleep: SleepNight | null;
  sleepNights?: SleepNight[];
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
  /**
   * O dia em 24 fatias, com passos e calorias DAQUELA hora.
   *
   * Substituiu `stepsByHour`, que misturava delta (da memória) com acumulado
   * (do evento ao vivo) no mesmo array. Ver `domain/hourly.ts`.
   */
  horas: FatiaDoDia[];
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
  amostras: { at: number; value: number }[]): SleepNight | null {
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
  /** As últimas noites que a pulseira entregou (até 14): o detalhe dos dias anteriores. */
  sleepNights?: SleepNight[];
  stressByHour: { hour: string; value: number }[];
  spo2History: { at: number; value: number }[];
  stressHistory: { at: number; value: number }[];
  pressureHistory: PressureReading[];
  horas: FatiaDoDia[];
  activity: Activity;
  hrvHistory: Sample[];
  hrHistory: Sample[];
}) {
  gravarDerivado({
    dia: hojeLocal(),
    sleep: e.sleep,
    sleepNights: e.sleepNights,
    stressByHour: e.stressByHour,
    spo2History: e.spo2History,
    stressHistory: e.stressHistory,
    pressureHistory: e.pressureHistory,
    horas: e.horas,
    activity: e.activity,
    hrvHistory: e.hrvHistory,
    hrHistory: e.hrHistory,
  });
}

function gravarDerivado(d: Derivado) {
  try {
    // A data é carimbada AQUI, no único escritor. Ficava só em
    // `persistirDerivado`, e o caminho da leitura ao vivo gravava sem ela: todo
    // arranque frio lia "outro dia" e zerava os passos de hoje (build 5).
    new File(Paths.document, ARQUIVO_DERIVADO).write(JSON.stringify({ ...d, dia: d.dia ?? hojeLocal() }));
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
import { armarLembreteDePulseira, cancelarLembreteDePulseira } from '../services/notifications.service';
import * as api from '../services/api.service';
import { fetchLastNight, isHealthAvailable, requestSleepAccess } from '../services/health.service';
import {
  notifyAttention,
  notifyBreathing,
  notifyExerciseDetected,
  setupAndroidChannel,
  type MetricaDeAtencao,
} from '../services/notifications.service';
import {
  comDeltaNaHora,
  comFatiasDaMemoria,
  comoAcumulado,
  comoDeltas,
  deltaDoAcumulado,
  modoDaSerie,
  fatiasVazias,
  normalizar,
  totalDoDiaComAncora,
  type FatiaDoDia,
} from '../domain/hourly';
import { spo2DaNoite } from '../domain/sleep';
import { noiteSustentaODia } from '../domain/bodyBattery';
import { avaliarInicioDeExercicio, ESTADO_INICIAL, type EstadoDeExercicio } from '../domain/exerciseOnset';
import { lerEmCurso } from '../services/sport-outbox';
import { syncQueue } from '../services/sync.service';
import { rateHeartRate, ratePressure, rateSpo2 } from '../domain/ratings';
import { textoDaFalha } from '../domain/bandErrors';
import { comAmostraDeHrv, mesclarSeries, porHoraCronologico, ultimoInstante } from '../domain/series';
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

/**
 * O último acumulado do dia visto NESTA sessão, para converter o evento ao
 * vivo (que é acumulado) em delta da hora (que é o que a fatia guarda).
 *
 * Vive fora do estado de propósito: não é informação de tela, é a memória de
 * uma conversão. Zera na virada de dia, junto com as fatias.
 */
const ultimoAcumulado: { steps: number | null; kcal: number | null } = { steps: null, kcal: null };

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
  /** Quando a última sincronização com dado na mão terminou. Tela de Dispositivo. */
  lastSyncAt: number | null;
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
  sleepNights: SleepNight[];
  activity: Activity;
  /** O dia em 24 fatias, com passos e calorias daquela hora. */
  horas: FatiaDoDia[];
  /**
   * O estado em disco veio de uma versão anterior, que guardava os passos por
   * hora em outro formato, e o dia precisa ser relido da pulseira.
   */
  precisaResincronizar: boolean;
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

/** AAAA-MM-DD do relógio LOCAL. O fuso do servidor não interessa: a noite é de quem dormiu. */
function hojeLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Varre as noites guardadas na memória da pulseira (até 7 dias) e as envia.
 *
 * É o que preenche o sono dos dias em que o celular não estava por perto — e o
 * que recupera as noites perdidas quando a busca diária falhou. Idempotente no
 * servidor: re-enviar a mesma noite não duplica.
 */
async function varrerSonoRetroativo(): Promise<void> {
  if (sonoRetroativoDoDia === hojeLocal() || !ble.fetchSleepHistory) return;
  // As datas que já tínhamos ANTES de perguntar: é o que separa "a memória
  // respondeu" de "a memória trouxe algo que faltava".
  const porDataAntes = useBiometricStore.getState().sleepNights.map((n) => n.date);
  const noites = await comTeto(
    ble.fetchSleepHistory(),
    TETO_MEMORIA_SONO_MS,
    'memória de sono').catch(() => [] as const);
  for (const n of noites) api.pushSleepNight(n);
  /*
   A varredura TAMBÉM atualiza a tela. Ela só empurrava para o servidor, e o
   efeito era o relato de 21/08: a lista de noites (do servidor) já dizia 20/08
   enquanto o topo da tela (o store) seguia em 19/08. A noite mais recente da
   memória vale como a atual quando é mais nova do que a que está na tela.
  */
  if (noites.length > 0) {
    // Guarda as noites no aparelho: o servidor só recebe score e minutos, e o
    // detalhe (fases, horários) de um dia anterior só existe aqui.
    const porData = new Map(useBiometricStore.getState().sleepNights.map((n) => [n.date, n]));
    for (const n of noites) porData.set(n.date, n);
    const sleepNights = [...porData.values()].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 14);
    useBiometricStore.setState({ sleepNights });
  }
  const maisNova = [...noites].sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  const atual = useBiometricStore.getState().sleep;
  if (maisNova && (!atual || maisNova.date > atual.date)) {
    useBiometricStore.setState({ sleep: comOxigenioDaNoite(maisNova, useBiometricStore.getState().spo2History) });
    persistirDerivado(useBiometricStore.getState());
  }
  /*
   O portão só fecha quando a varredura trouxe NOITE NOVA.

   Fechava com qualquer noite na mão, e isso bastava para o dia inteiro: a
   memória quase sempre tem as noites velhas, então a primeira varredura do dia
   achava três noites antigas, dava por cumprida e não tentava mais. A noite que
   o firmware ainda não tinha consolidado quando o app perguntou ficava para o
   dia seguinte, e no seguinte a mesma coisa (Bruno, 24/08/2026: sono parado
   desde a noite de 21 para 22).

   Zero também não fecha, pelo motivo antigo: pode ser memória vazia ou o SDK
   mudo naquele instante, e a tentativa seguinte merece nova chance.
  */
  const jaTinhamos = new Set(porDataAntes);
  const trouxeNova = noites.some((n) => !jaTinhamos.has(n.date));
  if (trouxeNova) sonoRetroativoDoDia = hojeLocal();
}

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
      'sincronização')) as DayHistory | null;
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

  /*
   Uma amostra por hora, a última de cada, EM ORDEM DE RELÓGIO.
   `porHoraCronologico` existe porque a versão local devolvia na ordem de
   inserção e a memória do firmware não promete ordem: o eixo da tela de
   estresse chegou a dizer "14h, 6h, 20h, 7h" (Leonardo, 24/08/2026).
  */
  const estresse = historico.stress.length
    ? porHoraCronologico(historico.stress)
    : get().stressByHour;
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
  /*
   A memória vem em DELTAS ou em ACUMULADO, e o cabeçalho do fabricante não
   diz qual: `comoDeltas` decide pela forma da própria série. Sem isso, uma
   série acumulada era somada e o dia inchava, 10.000 passos aqui contra 2.147
   no app do fabricante (relato da fundadora, 23/08).
  */
  const fatias = historico.steps.length
    ? comFatiasDaMemoria(get().horas, comoDeltas(historico.steps))
    : get().horas;
  if (__DEV__ && historico.steps.length) {
    // Qual formato este firmware usa é a pergunta que originou o defeito;
    // deixá-la respondida no log poupa a próxima investigação.
    console.log(
      `[passos] memória em ${modoDaSerie(historico.steps)}, ${historico.steps.length} fatias, ` +
        `contador do aparelho=${get().latest?.steps ?? 'sem leitura'}`,
    );
  }
  /*
   O TOTAL de hoje: o contador do aparelho é a ÂNCORA, porque é o mesmo número
   que o app do fabricante mostra. A memória preenche o dia quando esse
   contador ainda não chegou (app aberto de manhã, antes do primeiro evento;
   relato de 21/08), nunca para corrigi-lo para cima.
  */
  const atividade = get().activity;
  const contador = get().latest?.steps ?? null;
  const totalDeHoje = totalDoDiaComAncora(fatias, contador);
  const atividadeAtualizada =
    totalDeHoje > atividade.steps || contador != null
      ? { ...atividade, steps: totalDeHoje }
      : atividade;
  // Memória como base, e o que chegou ao vivo DEPOIS dela continua: o pico de
  // agora não some quando a memória (atrasada, grão de 5 min) chega.
  const fc = mesclarSeries(historico.heartRate, get().hrHistory, 90);
  /*
     A curva de HRV vem da MEMÓRIA, como todas as outras.

     Ela se construía sozinha, para a frente, a partir do que passava ao vivo —
     e como a leitura contínua carrega sempre a última amostra conhecida, o que
     se acumulava era a mesma medição repetida. A pulseira já guardava a série
     de verdade, com os instantes das janelas agendadas; era só perguntar.
    */
  const variabilidade = mesclarSeries(historico.hrv, get().hrvHistory, 90);
  const oxigenio = historico.spo2.length ? historico.spo2 : get().spo2History;

  set({
    precisaResincronizar: false,
    stressByHour: estresse,
    stressHistory: estresseCru,
    pressureHistory: pressao,
    horas: fatias,
    activity: atividadeAtualizada,
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

  /*
   A NOITE também vence — e era a única grandeza fora deste ciclo.

   A busca do sono morava só no ritual de conexão. Quem mantém o app vivo e a
   pulseira ao alcance nunca reconecta — o iOS segura o BLE em segundo plano — e
   o sono parava no dia da última abertura a frio, com todo o resto fluindo.
   Dois aparelhos em produção mostraram exatamente isso (ago/2026): fechar o
   app "consertava", porque forçava o ritual.

   Meia hora entre tentativas, porque de madrugada a noite ainda não fechou:
   perguntar a cada ciclo seria gastar o canal com a resposta já conhecida. O
   dia de referência é o LOCAL — a noite pertence a quem dormiu, não ao fuso do
   servidor.
  */
  const atual = get().sleep;
  const vencida = !atual || !noiteSustentaODia(atual, hojeLocal());
  if (vencida && ble.fetchSleep && Date.now() - ultimaBuscaDeSono > 30 * 60_000) {
    ultimaBuscaDeSono = Date.now();
    const nova = await comTeto(ble.fetchSleep(), TETO_SONO_MS, 'sono da pulseira').catch(
      () => null);
    if (nova && (!atual || nova.date > atual.date)) {
      set({ sleep: comOxigenioDaNoite(nova, get().spo2History) });
      api.pushSleepNight(nova);
    }
    // Noite nova na mão é a deixa para varrer as que ficaram para trás — o
    // portão diário de dentro decide se há algo a fazer.
    await varrerSonoRetroativo();
  }

  persistirDerivado(get());
  // Marcado só com dado na mão: leitura que falhou não deve bloquear a próxima
  // tentativa pelo intervalo mínimo.
  ultimaSincronia = Date.now();
  set({ lastSyncAt: ultimaSincronia });

  /*
   A memória de HOJE também vai ao servidor.

   O servidor só recebia o que chegava AO VIVO — e as pulseiras variam muito no
   que emitem ao vivo: em 24 h, uma mandou 13.539 batimentos e 13 eventos de
   passos, 38 de oxigênio, 28 de estresse; outra manda tudo em cada evento
   (ago/2026). O histórico, o insight e o score do servidor ficavam cegos
   para o que a tela já via pela memória. A cada meia hora, as séries do dia
   sobem; o servidor ignora instante repetido, então reenviar não duplica.
  */
  if (api.isAuthenticated() && Date.now() - ultimoEnvioDaMemoria > 30 * 60_000) {
    const amostras: api.MemoryReading[] = [
      ...historico.heartRate.map((a) => ({ recordedAt: a.at, heartRate: a.value })), ...historico.stress.map((a) => ({ recordedAt: a.at, stressScore: a.value })), ...historico.spo2.map((a) => ({ recordedAt: a.at, spo2Pct: a.value })), ...historico.steps.map((p) => ({ recordedAt: p.at, steps: p.steps })),
    ];
    if (amostras.length) {
      ultimoEnvioDaMemoria = Date.now();
      api.ingestMemory(amostras).catch(() => {
        // Falhou a rede: a próxima meia hora tenta de novo.
        ultimoEnvioDaMemoria = 0;
      });
    }
  }

  // Os dias ANTERIORES (1–6) uma vez por dia civil — não só 20 s depois de
  // conectar, porque uma sessão que atravessa dias nunca reconecta.
  if (varreduraDaMemoriaDoDia !== hojeLocal()) {
    varreduraDaMemoriaDoDia = hojeLocal();
    void get().recoverBandMemory();
  }
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
  sleepNights: [],
  activity: {
    steps: 0,
    goal: 10000,
    distanceKm: 0,
    activeKcal: 0,
    activeMin: 0,
  },
  horas: fatiasVazias(),
  precisaResincronizar: false,
  stressByHour: [],
  spo2History: [],
  stressHistory: [],
  pressureHistory: [],
  batteryPct: null,
  lastSyncAt: null,
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
      /*
       O que é DO DIA não atravessa a meia-noite. Passos, distância, calorias
       e a curva de passos eram restaurados como estavam — e às 9h da manhã a
       tela dizia os passos de ontem até a pulseira mandar o primeiro passo
       de hoje (relato de testador, 21/08). Gravado em outro dia, zera; a
       pulseira preenche o dia novo conforme anda.
      */
      const mesmoDia = derivado.dia === hojeLocal();
      if (!mesmoDia) {
        ultimoAcumulado.steps = null;
        ultimoAcumulado.kcal = null;
      }
      set({
        sleep: derivado.sleep ?? get().sleep,
        sleepNights: derivado.sleepNights ?? get().sleepNights,
        stressByHour: mesmoDia ? (derivado.stressByHour ?? []) : [],
        spo2History: derivado.spo2History ?? [],
        stressHistory: derivado.stressHistory ?? [],
        pressureHistory: derivado.pressureHistory ?? [],
        horas: mesmoDia ? normalizar(derivado.horas) : fatiasVazias(),
        /*
         Estado gravado por uma versão anterior não tem `horas`, e o que havia
         no lugar (`stepsByHour`) era uma lista de valores SEM a hora de cada
         um: não dá para reconstruir a distribuição sem inventar. Quem tem a
         resposta é a pulseira, que guarda o dia inteiro, então a migração
         marca a falta e o `hydrate` manda ressincronizar.

         Um testador atualizou para a 1.0.5 (7) e viu o histórico de atividade
         do dia sumir; era isto.
        */
        precisaResincronizar:
          mesmoDia && !Array.isArray((derivado as { horas?: unknown }).horas),
        hrvHistory: derivado.hrvHistory ?? [],
        hrHistory: derivado.hrHistory ?? [],
        activity: mesmoDia
          ? (derivado.activity ?? get().activity)
          : { ...(derivado.activity ?? get().activity), steps: 0, distanceKm: 0, activeKcal: 0, activeMin: 0 },
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
      'sono da pulseira').catch(() => null);
    const noite =
      (daPulseira ? { ...daPulseira, source: 'band' as const } : null) ??
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

    // As noites ANTERIORES, no máximo uma vez por dia civil. DEPOIS do
    // syncHistory e com await, nunca em paralelo: o canal serial colide.
    await varrerSonoRetroativo();

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
    /*
     Migração de formato passa na frente do intervalo mínimo: o dia na tela
     está vazio porque o estado antigo não sabia guardá-lo, e esperar meia hora
     por isso é o que o testador viu como "perdi o histórico de hoje".
    */
    const migrando = get().precisaResincronizar;
    if (!force && !migrando && Date.now() - ultimaSincronia < INTERVALO_MINIMO_SYNC_MS) {
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
        ...h.heartRate.map((a) => ({ recordedAt: a.at, heartRate: a.value })), ...h.stress.map((a) => ({ recordedAt: a.at, stressScore: a.value })), ...h.spo2.map((a) => ({ recordedAt: a.at, spo2Pct: a.value })), /*
         O servidor guarda `max(steps)` por dia, ou seja, espera CONTADOR: em
         delta ele guardaria a maior fatia como se fosse o dia inteiro.
        */
        ...comoAcumulado(h.steps).map((p) => ({ recordedAt: p.at, steps: p.steps })),
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
      'sono da pulseira').catch(() => null);
    if (daPulseira) {
      // O MESMO recorte dos outros caminhos: sem ele, a noite buscada pelo
      // botão chegava sem a curva de oxigênio — e "Oxigênio durante a noite"
      // aparecia vazio com a série do dia inteira no aparelho.
      set({ sleep: comOxigenioDaNoite(daPulseira, get().spo2History) });
      api.pushSleepNight(daPulseira);
      persistirDerivado(get());
      console.log('[health] sono veio da pulseira, sem precisar do app Saúde');
      return true;
    }

    const pediu = await requestSleepAccess();
    if (!pediu) {
      console.warn('[health] não foi possível pedir acesso, ver aviso acima');
      return false;
    }
    const noite = await comTeto(fetchLastNight(), TETO_CONSULTA_MS, 'sono do app Saúde').catch(
      () => null);
    console.log(
      `[health] noite encontrada: ${noite ? `${noite.totalMin} min, score ${noite.score}` : 'nenhuma'}`);
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
      // Lembrar de usar a pulseira, sem ser chato: arma ao desconectar com
      // pulseira pareada, cancela ao reconectar (sugestão de testador, 23/08).
      if (connection === 'connected') void cancelarLembreteDePulseira().catch(() => undefined);
      else if ((connection === 'idle' || connection === 'error') && typeof get().pairedDeviceId === 'string') void armarLembreteDePulseira().catch(() => undefined);
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
      const { hrvHistory, hrHistory, activity, stressByHour, pressureHistory, horas } = get();

      /*
       As séries se constroem a partir do que o aparelho manda.

       Antes eram listas escritas à mão — doze horas de estresse, uma semana de
       pressão, um dia de passos. Agora cada leitura acrescenta o seu ponto, e a
       tela desenha o que existe. Enquanto a pulseira não medir, o gráfico fica
       vazio, que é a informação correta.
       */
      const rotulo = new Date(reading.recordedAt).getHours() + 'h';

      /*
       As barras saem do histórico COM CARIMBO, não de uma lista paralela de
       rótulos: era ela que embaralhava a ordem quando a memória e o ao vivo se
       misturavam, e manter duas fontes para o mesmo gráfico é o que permitia a
       divergência existir.
      */
      const historicoDeStress =
        reading.stressScore == null
          ? get().stressHistory
          : [...get().stressHistory, { at: reading.recordedAt, value: reading.stressScore }].slice(-HISTORY_SIZE);
      const stress =
        reading.stressScore == null ? stressByHour : porHoraCronologico(historicoDeStress);

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

      /*
       O evento ao vivo traz o ACUMULADO do dia; a fatia guarda o que aconteceu
       na hora. A conversão passa por `deltaDoAcumulado`, e o primeiro evento
       depois de abrir o app não vira barra: sem referência anterior, não há
       como saber quanto daquele total é desta hora.
      */
      const deltaPassos = deltaDoAcumulado(ultimoAcumulado.steps, reading.steps ?? null);
      const deltaKcal = deltaDoAcumulado(ultimoAcumulado.kcal, reading.activeKcal ?? null);
      const fatias = comDeltaNaHora(
        horas,
        new Date(reading.recordedAt).getHours(),
        deltaPassos,
        deltaKcal,
      );
      if (reading.steps != null) ultimoAcumulado.steps = reading.steps;
      if (reading.activeKcal != null) ultimoAcumulado.kcal = reading.activeKcal;

      const variabilidade = comAmostraDeHrv(hrvHistory, reading, HISTORY_SIZE);
      const coracao = [...hrHistory, { at: reading.recordedAt, value: reading.heartRate }].slice(
        -HISTORY_SIZE);

      gravarDerivado({
        sleep: get().sleep,
        stressByHour: stress,
        // A leitura ao vivo não traz oxigenação com carimbo próprio — quem
        // preenche esta série é `syncHistory`, lendo a memória do aparelho.
        spo2History: get().spo2History,
        stressHistory: get().stressHistory,
        pressureHistory: pressao,
        horas: fatias,
        activity:
          reading.steps == null
            ? activity
            : {
                ...activity,
                steps: reading.steps,
                // Distância e calorias chegam no mesmo evento; sem eles aqui a
                // tela ficava em zero ao lado de milhares de passos.
                distanceKm: reading.distanceM != null ? reading.distanceM / 1000 : activity.distanceKm,
                activeKcal: reading.activeKcal ?? activity.activeKcal,
              },
        hrvHistory: variabilidade,
        hrHistory: coracao,
      });

      set({
        latest: reading,
        stressByHour: stress,
        pressureHistory: pressao,
        horas: fatias,
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
/** Último total de passos visto e quando — movimento recente desarma o aviso de batimento. */
let passosVistos: { steps: number; at: number } | null = null;
let batimentoAltoDesde: number | null = null;
const MOVIMENTO_RECENTE_MS = 10 * 60_000;
/** "Parece exercício?" — o estado mora em `domain/exerciseOnset.ts`; aqui só se guarda. */
let exercicio: EstadoDeExercicio = ESTADO_INICIAL;
/*
 Cinco minutos, não dez. Eram dez; um testador (21/08) achou longo demais para
 quem está parado — e tem razão: batimento de alerta que se mantém por cinco
 minutos com a pessoa sentada já não é pico de escada nem susto. O que protege
 contra o falso aviso é a exigência de REPOUSO (sem treino, sem sessão, sem
 passos), não a duração.
*/
const BATIMENTO_SUSTENTADO_MS = 5 * 60_000;

function emMovimento(reading: Reading, agora: number): boolean {
  if (reading.steps == null) return false;
  const anterior = passosVistos;
  passosVistos = { steps: reading.steps, at: agora };
  if (!anterior) return false;
  // Mais de ~150 passos em dez minutos é caminhada, não repouso.
  return reading.steps - anterior.steps > 150 && agora - anterior.at <= MOVIMENTO_RECENTE_MS;
}

function vigiarLeitura(reading: Reading) {
  const agora = Date.now();
  /*
   "Em atividade" é treino guiado, sessão de esporte OU movimento recente.

   Um testador se mexeu um pouco e recebeu "sua frequência cardíaca merece
   atenção" (21/08). Batimento alto durante exercício é o exercício — o aviso
   só faz sentido com a pessoa PARADA e por um tempo: batimento acima da
   faixa por cinco minutos sem passos.
  */
  const emAtividadeRegistrada = useWorkoutStore.getState().execution !== null || lerEmCurso(agora) !== null;
  // Uma chamada só por leitura: `emMovimento` guarda o último total de passos.
  const movendo = emMovimento(reading, agora);
  const treinando = emAtividadeRegistrada || movendo;

  // -- batimento alto COM movimento, sem nada aberto → "começou a treinar?" --
  // Antes do resto, e antes do `return` de "treinando": o movimento que define
  // exercício é o mesmo que silencia as outras vigias. Pedido de um testador
  // (21/08): a pessoa esquece de registrar; o app percebe e pergunta.
  const inicio = avaliarInicioDeExercicio(exercicio, {
    heartRate: reading.heartRate,
    emMovimento: movendo,
    emAtividadeRegistrada,
    agora,
  });
  exercicio = inicio.estado;
  if (inicio.perguntar) void notifyExerciseDetected();

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
  if (treinando) {
    batimentoAltoDesde = null;
    return; // durante treino, tudo oscila por definição
  }
  // Batimento só alerta SUSTENTADO: cinco minutos acima da faixa, parado.
  if (rateHeartRate(reading.heartRate).state === 'alert') {
    batimentoAltoDesde = batimentoAltoDesde ?? agora;
  } else {
    batimentoAltoDesde = null;
  }
  const batimentoSustentado = batimentoAltoDesde != null && agora - batimentoAltoDesde >= BATIMENTO_SUSTENTADO_MS;
  const alertas: [MetricaDeAtencao, boolean][] = [
    ['spo2', rateSpo2(reading.spo2Pct).state === 'alert'],
    ['pressao', ratePressure(reading.bpSystolic, reading.bpDiastolic).state === 'alert'],
    ['hr', batimentoSustentado],
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

/**
 * A noite, ao voltar ao primeiro plano: se a que está na tela não sustenta o
 * dia de hoje, busca agora, ignorando o portão de 30 minutos da
 * sincronização. Um testador (Bruno, 23/08) abriu o app às 11h, depois de
 * acordar e se mexer, e a noite continuava a de anteontem: a volta ao
 * primeiro plano só reconectava a pulseira.
 */
export async function buscarNoiteSeVencida(): Promise<void> {
  const st = useBiometricStore.getState();
  if (st.connection !== 'connected' || !ble.fetchSleep) return;
  const atual = st.sleep;
  if (atual && noiteSustentaODia(atual, hojeLocal())) return;
  ultimaBuscaDeSono = Date.now();
  const nova = await comTeto(ble.fetchSleep(), TETO_SONO_MS, 'sono da pulseira').catch(() => null);
  if (nova && (!atual || nova.date > atual.date)) {
    useBiometricStore.setState({ sleep: comOxigenioDaNoite(nova, useBiometricStore.getState().spo2History) });
    api.pushSleepNight(nova);
    persistirDerivado(useBiometricStore.getState());
  }
  await varrerSonoRetroativo();
}

/**
 * Buscar a noite AGORA, a pedido de quem está olhando a tela.
 *
 * Existe porque todo o resto é automático e silencioso: os portões (30 minutos
 * entre tentativas, um dia entre varreduras) protegem o canal serial, mas
 * quando o sono está parado há dias eles viram uma parede sem maçaneta. Aqui
 * eles são ignorados de propósito, e a função DIZ o que encontrou, porque a
 * pergunta de quem toca o botão é "a pulseira tem a minha noite ou não?".
 */
export type ResultadoDaBuscaDeNoite =
  | { estado: 'sem-pulseira' }
  | { estado: 'nova'; noite: SleepNight }
  | { estado: 'sem-novidade'; noiteNaMemoria: SleepNight | null }
  /** Perguntamos e a pulseira não respondeu. Não é o mesmo que não ter noite. */
  | { estado: 'nao-respondeu' };

export async function buscarNoiteAgora(): Promise<ResultadoDaBuscaDeNoite> {
  const st = useBiometricStore.getState();
  if (st.connection !== 'connected' || !ble.fetchSleep) return { estado: 'sem-pulseira' };

  ultimaBuscaDeSono = Date.now();
  sonoRetroativoDoDia = null; // o botão fura o portão do dia, é para isso que ele existe
  const antes = st.sleep;

  /*
   `null` aqui é "consultei e não há"; a exceção é "não consegui consultar". A
   tela precisa dos dois, porque dizer "a pulseira não tem noite" quando a
   pergunta nem chegou é afirmar ausência a partir de erro.
  */
  let nova: SleepNight | null = null;
  try {
    nova = await comTeto(ble.fetchSleep(), TETO_SONO_MS, 'sono da pulseira');
  } catch {
    return { estado: 'nao-respondeu' };
  }
  if (nova && (!antes || nova.date > antes.date)) {
    useBiometricStore.setState({
      sleep: comOxigenioDaNoite({ ...nova, source: 'band' }, useBiometricStore.getState().spo2History),
    });
    api.pushSleepNight(nova);
    persistirDerivado(useBiometricStore.getState());
    await varrerSonoRetroativo();
    return { estado: 'nova', noite: nova };
  }

  // A consulta rápida não trouxe nada: a memória inteira pode ter.
  await varrerSonoRetroativo();
  const depois = useBiometricStore.getState().sleep;
  if (depois && (!antes || depois.date > antes.date)) return { estado: 'nova', noite: depois };
  return { estado: 'sem-novidade', noiteNaMemoria: nova ?? depois ?? null };
}
