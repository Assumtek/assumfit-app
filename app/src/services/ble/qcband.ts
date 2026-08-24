import {
  QCBand,
  type QCDevice,
  type QCHrvSeries,
  type QCSampleSeries,
  type QCState,
} from '../../../modules/qcband';
import { nightFrom } from '../../domain/sleep';
import { montarNoites, type SegmentoComInstante } from '../../domain/sleep';
import type { SportKind } from '../../domain/sport';
import type { Reading, SleepNight, SleepPhase, SleepSegment } from '../../domain/types';
import { comTeto, eTempoEsgotado, TETO_CONSULTA_MS, TETO_MEDICAO_MS } from './timeout';
import {
  SYNC_TOTAL_STEPS,
  type BandActivity,
  type BleService,
  type ConnectionState,
  type DayHistory,
  type DiscoveredDevice,
  type MeasurableKind,
  type Sample,
  type SportState,
  type SyncStep,
} from './types';

/**
 * Implementação sobre o SDK do fabricante.
 *
 * Substitui a engenharia reversa de `staranb.ts` no caminho do aparelho real: o
 * fornecedor já implementou e testou o protocolo, e reimplementá-lo a partir de
 * bytes observados dá mais trabalho e produz resultado pior. O `staranb.ts`
 * continua como contingência — ele prova que o canal serial funciona e serve
 * para qualquer aparelho que fale o perfil padrão do Bluetooth SIG.
 *
 * Uma diferença de comportamento que vale saber: o SDK entrega **batimento já
 * calculado** em tempo real e o **HRV como série histórica**, consultada por
 * dia. Não existe HRV instantâneo, e é uma característica do hardware, não da
 * ponte — a pulseira mede HRV em janelas agendadas.
 */
export class QCBandService implements BleService {
  /** Duas horas entre sequências automáticas. Ver `ultimaSequencia`. */
  private static readonly INTERVALO_SEQUENCIA_MS = 2 * 60 * 60 * 1000;

  private state: ConnectionState = 'idle';
  /** Motivo do último `error`, para novos assinantes o receberem junto. */
  private stateReason: string | undefined;
  private stateListeners = new Set<(s: ConnectionState, reason?: string) => void>();
  private readingListeners = new Set<(r: Reading) => void>();
  /**
   * A etapa em curso no canal serial, para a tela narrar a espera.
   *
   * É estado do SERVIÇO, não do store: quem sabe que a varredura do dia 4
   * começou é o laço que a executa, e subir isso por callback é o que evita o
   * store adivinhar etapas a partir de efeitos colaterais.
   */
  private activity: BandActivity | null = null;
  private activityListeners = new Set<(a: BandActivity | null) => void>();
  private measureFailureListeners = new Set<(motivo: string) => void>();
  /**
   * A grandeza que está ocupando o sensor AGORA, e o pedido de parar a
   * sequência automática.
   *
   * O sensor óptico é um só: duas medições ao mesmo tempo não existem, e o
   * firmware recusa a segunda com a mensagem de encaixe — que descreve outra
   * coisa. Sem este par, o app disputava a pulseira consigo mesmo.
   */
  private medindo: MeasurableKind | null = null;
  private abortarAutomatica = false;
  /**
   * Quando a sequência automática rodou pela última vez.
   *
   * Ela corria a CADA conexão — e o app reconecta sempre que volta ao primeiro
   * plano, então abrir a tela disparava minutos de "Medindo…" com o sensor
   * ocupado. Era isso que parecia uma medição de estresse infinita.
   *
   * O intervalo é generoso de propósito: a pulseira já mede sozinha nas janelas
   * agendadas — batimento a cada 5 min, estresse a cada 30, oxigênio e HRV de
   * hora em hora, tudo confirmado no aparelho —, e a memória dela é lida na
   * sincronização. A sequência sob demanda é um complemento para quem acabou de
   * parear, não a fonte principal.
   */
  private ultimaSequencia = 0;
  private battery: number | null = null;
  private lastHrv: number | null = null;
  /** Instante da amostra de HRV — quase nunca é o da leitura. */
  private lastHrvAt: number | null = null;
  /**
   * Última leitura conhecida, campo a campo.
   *
   * O SDK entrega uma grandeza por vez, em blocos independentes: batimento vem
   * a cada poucos segundos, SpO₂ só quando há medição, passos quando mudam. O
   * `Reading` do domínio é um instante COMPLETO — sem acumular, cada evento
   * apagaria o que os outros trouxeram, e a tela piscaria entre um campo
   * preenchido e todos vazios.
   */
  private partial: Omit<Reading, 'recordedAt' | 'source'> = {
    heartRate: 0,
    heartRateAt: undefined,
    hrvMs: null,
    spo2Pct: null,
    temperatureC: null,
    steps: null,
    distanceM: null,
    activeKcal: null,
    bpSystolic: null,
    bpDiastolic: null,
    stressScore: null,
    respRate: null,
  };
  private subscriptions: { remove: () => void }[] = [];

  constructor() {
    if (!QCBand) return;

    this.subscriptions.push(
      QCBand.addListener('onState', (event: QCState) => {
        this.state = event.state;
        this.stateReason = event.reason;
        if (__DEV__)
          console.log(`[qcband] estado: ${event.state}${event.reason ? `, ${event.reason}` : ''}`);
        this.stateListeners.forEach((l) => l(event.state, event.reason));
        // Saiu de conectado, a etapa morreu junto — sem isto a tela seguiria
        // dizendo "medindo estresse" com a pulseira já fora do alcance.
        if (event.state !== 'connected') this.setActivity(null);
        if (event.state === 'connected') void this.afterConnect();
      }));

    /*
     O módulo nativo emitia `onLog` desde o início e NINGUÉM escutava.

     É o que tornou a falha de conexão invisível: cada passo do CoreBluetooth já
     era registrado do lado Swift, e tudo caía no vazio. O Metro ficava mudo, e
     um pareamento travado não deixava rastro nenhum — a única coisa que dava
     para dizer era "não avança".
     */
    this.subscriptions.push(
      QCBand.addListener('onLog', ({ raw }) => {
        /*
         Quadro cru do aparelho é volumoso e constante — some por padrão.
         Continua a um `EXPO_PUBLIC_BLE_VERBOSE=1` de distância, que é o que
         serve para mapear comando novo sem afogar o resto do log.
         */
        if (!__DEV__) return;
        if (raw.startsWith('[AnyHashable') && process.env.EXPO_PUBLIC_BLE_VERBOSE !== '1') return;
        console.log('[qcband]', raw);
      }));

    this.subscriptions.push(QCBand.addListener('onReading', (event) => this.ingest(event)));
  }

  private setActivity(activity: BandActivity | null) {
    this.activity = activity;
    this.activityListeners.forEach((l) => l(activity));
  }

  onMeasureFailure(listener: (motivo: string) => void): () => void {
    this.measureFailureListeners.add(listener);
    return () => {
      this.measureFailureListeners.delete(listener);
    };
  }

  onActivity(listener: (activity: BandActivity | null) => void): () => void {
    this.activityListeners.add(listener);
    listener(this.activity);
    return () => {
      this.activityListeners.delete(listener);
    };
  }

  /**
   * O que acontece assim que o SDK aceita o aparelho.
   *
   * A consulta de recursos vem primeiro por um motivo prático: ela é a resposta
   * de `setTime`, ou seja, acertar o relógio e descobrir o que o firmware
   * suporta são a mesma chamada. E a partir dela sabemos se vale sequer pedir
   * HRV.
   */
  private async afterConnect() {
    if (!QCBand) return;

    const features = await QCBand.getFeatures().catch(
      () => ({}) as Record<string, boolean | number>);

    /*
     As chaves são as que o APARELHO devolve, não as constantes do cabeçalho.

     A versão anterior procurava `QCBandFeatureHRV === '1'` — nomes que eu deduzi
     do `.h` e que não existem na resposta. O firmware devolve `feature.hrv` com
     booleano, então a checagem dava sempre falso e o app concluía que a pulseira
     não media HRV. Ela mede: foi o próprio log do aparelho que desmentiu.
     */
    const temHrv = features['feature.hrv'] === true;
    console.log(`[qcband] recursos do firmware: HRV=${temHrv ? 'sim' : 'não'}`, features);

    await QCBand.getBattery()
      .then(({ level }) => {
        this.battery = level;
      })
      .catch(() => undefined);

    if (temHrv) await this.refreshHrv();
    await QCBand.startRealtimeHeartRate().catch(() => undefined);
    void this.measureAll(features);
  }

  /**
   * Pede as grandezas que só existem sob demanda.
   *
   * Era a resposta para "por que a tela só mostra batimento": a pulseira
   * transmite frequência cardíaca sozinha, mas SpO₂, pressão, estresse e HRV só
   * são medidos quando alguém pede — e ninguém pedia. O aparelho declara
   * suporte a todos eles em `getFeatures`.
   *
   * Em série, não em paralelo: é UM sensor óptico no pulso, e medições
   * simultâneas disputam o mesmo hardware. Cada uma leva dezenas de segundos, e
   * por isso nada aqui é aguardado pelo fluxo de conexão — a tela já mostra
   * batimento enquanto o resto chega.
   */
  private async measureAll(features: Record<string, boolean | number>) {
    if (!QCBand) return;
    if (Date.now() - this.ultimaSequencia < QCBandService.INTERVALO_SEQUENCIA_MS) {
      if (__DEV__) console.log('[qcband] sequência automática pulada, rodou há pouco');
      return;
    }
    this.ultimaSequencia = Date.now();

    /*
     Ligar o monitoramento agendado ANTES de pedir qualquer medição.

     Estresse e HRV têm um interruptor no firmware, separado da capacidade:
     `getFeatures` diz que a pulseira SABE medir, este estado diz se ela ESTÁ
     medindo. Com ele desligado — que é como a pulseira chega —, a medição sob
     demanda conclui com sucesso e devolve vazio, e o histórico nunca enche. Era
     a causa do estresse ausente e do HRV que só aparecia às vezes.

     Ligar uma vez basta: o ajuste fica no aparelho.
     */
    const estado = await QCBand.getMonitoring().catch(() => null);
    if (estado) {
      console.log(
        `[qcband] agendado: estresse=${estado.stress} hrv=${estado.hrv} ` +
          `pressão=${estado.bloodPressure} spo2=${estado.spo2} fc=${estado.heartRate}`);

      /*
       Os CINCO, não dois.

       Estresse e HRV eram os únicos ligados, e era por isso que só eles tinham
       histórico: a pulseira não registra o que não está agendado. Pressão,
       oxigênio e frequência cardíaca chegam desligados de fábrica, e o app do
       fabricante os liga na primeira conexão — foi ele que produziu as curvas
       de 24 h que existem hoje no aparelho.

       Em série, e só o que estiver desligado: cada escrita é um comando no
       canal serial, e reescrever o que já está certo gasta rádio à toa.
      */
      const agendar: [keyof typeof estado, string][] = [
        ['stress', 'feature.stress'],
        ['hrv', 'feature.hrv'],
        ['bloodPressure', 'feature.bloodPressure'],
        ['spo2', 'feature.bloodOxygen'],
        ['heartRate', 'feature.heartRate'],
      ];
      for (const [chave, recurso] of agendar) {
        // Frequência cardíaca não costuma vir declarada em `getFeatures` — ela
        // é o básico do aparelho. Ausente vale como presente só para ela.
        const suportado =
          chave === 'heartRate' ? features[recurso] !== false : features[recurso] === true;
        if (suportado && !estado[chave]) {
          await QCBand.setMonitoring(chave, true).catch(() => undefined);
          if (__DEV__) console.log(`[qcband] agendamento ligado: ${chave}`);
        }
      }
    }

    const pedidos: string[] = [];

    /*
     O que o `oneKey` cobre saiu do APARELHO, não do cabeçalho.

     Ele devolve `{ hr, sbp, dbp, so2, score }` — batimento, pressão e
     oxigenação numa tacada. Não traz HRV nem estresse, ao contrário do que o
     modelo documentado no `.h` sugeria, e por isso os dois continuam pedindo
     medição própria.

     Temperatura não entra em lista nenhuma: `getFeatures` desta pulseira não
     declara o recurso, e pedir uma medição que o firmware não tem só gastaria
     tempo antes de falhar.
     */
    if (features['feature.oneKeyMeasure'] === true) {
      pedidos.push('oneKey');
    } else {
      if (features['feature.bloodOxygen'] === true) pedidos.push('spo2');
      if (features['feature.bloodPressure'] === true) pedidos.push('bloodPressure');
    }
    if (features['feature.stress'] === true) pedidos.push('stress');
    if (features['feature.hrv'] === true) pedidos.push('hrv');

    /*
     Temperatura NÃO entra: este hardware não tem o sensor.

     Verificado nos três caminhos do SDK — histórico agendado, histórico manual
     e medição sob demanda —, todos vazios, além de o recurso não constar em
     `getFeatures`. O campo `temp` existe no modelo do cabeçalho porque ele
     descreve a família inteira de aparelhos do fabricante, não esta pulseira.
     */

    this.abortarAutomatica = false;
    for (const kind of pedidos) {
      // Alguém pediu uma medição no meio: a automática para por aqui. Ela é
      // oportunista — a próxima conexão tenta de novo — e insistir só produz
      // recusa do firmware por sensor ocupado.
      if (this.abortarAutomatica) break;
      // Narrada ANTES de começar: cada medição leva dezenas de segundos, e é
      // exatamente esta espera que a tela precisa explicar.
      this.setActivity({ kind: 'measure', what: kind as MeasurableKind });
      this.medindo = kind as MeasurableKind;
      try {
        /*
         Teto aqui também, e não só no botão "medir agora".

         Esta é a sequência que roda na CONEXÃO, e o `completedHandle` do SDK
         pode nunca ser chamado — sensor que não converge, pulseira frouxa. Sem
         teto, este `await` pendurava para sempre: a etapa continuava anunciada
         e a tela dizia "Medindo estresse…" indefinidamente, sem nada que a
         pessoa pudesse fazer. Visto em campo (ago/2026), no teste em aparelho.

         Estourou, desliga o sensor: desistir sem desligar deixa o próximo
         pedido disputando um sensor já ocupado.
        */
        await this.comSensorLivre(() =>
          comTeto(
            QCBand!.measure(kind as Parameters<NonNullable<typeof QCBand>['measure']>[0]),
            TETO_MEDICAO_MS,
            kind));
        if (__DEV__) console.log(`[qcband] medição concluída: ${kind}`);
      } catch (err) {
        // Falha de medição é rotina, não erro de programa: pulseira frouxa no
        // pulso, braço em movimento, aparelho sem contato com a pele. Seguir
        // para a próxima grandeza vale mais que interromper a série.
        if (eTempoEsgotado(err)) {
          await this.stopMeasure(kind as MeasurableKind).catch(() => undefined);
          console.warn(`[qcband] medição de ${kind} passou do teto e foi abortada`);
        } else if (__DEV__) {
          console.warn(`[qcband] medição de ${kind} falhou:`, err);
        }
        /*
         O motivo do firmware sobe para quem pode mostrá-lo.

         Sem isto a sequência inteira falhava calada: três medições recusadas
         pelo mesmo aviso de encaixe, e a tela apenas sem número.
        */
        const motivo = err instanceof Error ? err.message : '';
        if (motivo) this.measureFailureListeners.forEach((l) => l(motivo));
      } finally {
        // Só solta se ainda for nossa: um pedido sob demanda pode ter assumido
        // o sensor no meio, e zerar ali apagaria o dono verdadeiro.
        if (this.medindo === kind) this.medindo = null;
      }
    }

    // O HRV não vem por callback: é série histórica, e a medição que acabou de
    // rodar acrescentou uma amostra a ela.
    if (features['feature.hrv'] === true) await this.refreshHrv();

    // Só limpa a PRÓPRIA etapa: a varredura de memória corre em paralelo no
    // mesmo canal, e apagar o "sincronizando" dela mentiria um ocioso.
    if (this.activity?.kind === 'measure') this.setActivity(null);
  }

  /**
   * Puxa a série de HRV de hoje e guarda a última amostra.
   *
   * A média do dia seria mais estável e menos útil: o score compara a pessoa com
   * a linha de base DELA, e para isso o valor recente é o que importa.
   */
  private async refreshHrv() {
    if (!QCBand) return;
    const { amostras } = await this.hrvMaisRecente();
    if (!amostras.length) return;
    // O instante é o da AMOSTRA, não o de agora: a pulseira mede HRV em janelas
    // agendadas, e carimbar com `Date.now()` faria um dado de dias atrás
    // parecer recém-medido — o oposto do que a tela precisa dizer.
    const ultima = amostras[amostras.length - 1];
    this.lastHrv = ultima.value;
    this.lastHrvAt = ultima.at;
  }

  /**
   * A série de HRV mais recente que a pulseira ainda guarda — não só a de hoje.
   *
   * Pedíamos apenas o dia 0 e desistíamos, e num dia sem medição isso virava
   * "sem HRV" com quatro dias de dado a um índice de distância. O app do
   * fabricante faz o contrário e é por isso que ele mostra "HRV · 14 ago ·
   * 45 ms" enquanto o nosso mostrava traço: o número existe, só não é de hoje.
   *
   * Mostrar medição antiga COM A DATA não fere a regra de "medido ou traço" —
   * ela existe contra número inventado, e este foi medido. O que seria mentira é
   * apresentá-lo como atual, e por isso o instante volta junto.
   *
   * O protocolo endereça 0–6. Para na primeira que tiver valor: uma consulta por
   * dia num canal serial, e varrer sete sem necessidade custa segundos.
   */
  private async hrvMaisRecente(): Promise<{ amostras: Sample[]; diasAtras: number }> {
    if (!QCBand) return { amostras: [], diasAtras: 0 };
    for (let dia = 0; dia <= 6; dia++) {
      const series = await comTeto(QCBand.getHrv(dia), TETO_CONSULTA_MS, 'hrv').catch(() => []);
      const amostras = amostrasComCarimbo(series);
      if (amostras.length) {
        if (__DEV__) console.log(`[qcband] HRV: ${amostras.length} amostras do dia -${dia}`);
        return { amostras, diasAtras: dia };
      }
    }
    return { amostras: [], diasAtras: 0 };
  }

  /**
   * Traduz um evento do SDK em leitura do domínio.
   *
   * Só emite quando há batimento, e o motivo é o contrato: `Reading.heartRate`
   * não é anulável, porque é o único sinal que todo wearable entrega e o eixo do
   * score de energia. SpO₂ que chegue antes do primeiro batimento fica guardado
   * e sai junto do próximo — nada se perde, e nenhuma leitura nasce sem o campo
   * que a define.
   */
  private ingest(event: Record<string, unknown>) {
    const kind = event.kind as string | undefined;
    const value = typeof event.value === 'number' ? event.value : null;

    switch (kind) {
      case 'heartRate':
        if (value !== null) this.partial.heartRate = value;
        break;
      case 'spo2':
        this.partial.spo2Pct = value;
        break;
      case 'hrv':
        // Medido agora, e não lido do histórico: vale mais que a última amostra
        // agendada, porque o score compara a pessoa com o estado dela AGORA.
        this.lastHrv = value;
        this.lastHrvAt = Date.now();
        break;
      case 'stress':
        /*
         Chega pelo campo da SISTÓLICA no retorno do SDK.

         O fabricante reaproveita a estrutura de pressão arterial para devolver
         o estresse, sem nenhuma chave com esse nome. A tradução acontece no
         módulo nativo, que sabe qual medição foi pedida; aqui já chega como
         estresse. Ver `emitMeasurement` em `QCBandModule.swift`.
         */
        this.partial.stressScore = value;
        break;
      case 'temperature':
        this.partial.temperatureC = value;
        break;
      case 'steps':
        this.partial.steps = value;
        // Vêm no mesmo bloco do firmware; descartá-los era o "distância e
        // calorias zeradas com 5.628 passos".
        if (typeof event.distance === 'number') this.partial.distanceM = event.distance;
        if (typeof event.calorie === 'number') this.partial.activeKcal = event.calorie;
        break;
      case 'bloodPressure':
        this.partial.bpSystolic = typeof event.systolic === 'number' ? event.systolic : null;
        this.partial.bpDiastolic = typeof event.diastolic === 'number' ? event.diastolic : null;
        break;
      case 'battery':
        if (value !== null) this.battery = value;
        return;
      case 'measuringFail':
        // Pulseira mal encaixada: o aparelho avisa em vez de inventar número.
        console.warn('[qcband] medição falhou, verifique o encaixe no pulso');
        return;
      default:
        return;
    }

    /*
     O batimento carrega o PRÓPRIO instante.

     Sem isto, o acumulador reemitia o último batimento a cada evento de outra
     grandeza, com o carimbo de agora — e passos mudam a cada passada. Quem
     corria via a frequência de repouso rotulada como ao vivo.
    */
    if (kind === 'heartRate') this.partial.heartRateAt = Date.now();

    if (!this.partial.heartRate) return;

    if (__DEV__) {
      const mostrado = kind === 'bloodPressure' ? `${event.systolic}/${event.diastolic}` : value;
      console.log(`[qcband] leitura: ${kind}=${mostrado}`);
    }

    const reading: Reading = {
      ...this.partial,
      // O HRV não vem no fluxo contínuo: é série agendada, buscada à parte. A
      // última amostra conhecida acompanha a leitura para o score não perder o
      // componente de maior peso a cada batimento.
      hrvMs: this.lastHrv,
      hrvAt: this.lastHrvAt ?? undefined,
      recordedAt: Date.now(),
      source: 'staranb',
    };
    this.readingListeners.forEach((l) => l(reading));
  }

  /**
   * Noite mais recente medida pela PULSEIRA.
   *
   * A pulseira declara `feature.newSleepProtocol` desde o primeiro pareamento —
   * a informação estava no log e eu fui buscar sono no HealthKit, que no
   * aparelho desta pessoa está vazio. A fonte certa estava no pulso o tempo
   * todo.
   *
   * Tenta ontem primeiro: a noite que acabou de terminar é registrada no dia em
   * que COMEÇOU, então de manhã ela está em `dayIndex` 1, não 0.
   */
  /**
   * Medição sob demanda, disparada pela pessoa.
   *
   * A pulseira transmite batimento sozinha, mas SpO₂, pressão, estresse e HRV
   * só existem quando alguém pede. Antes isso só acontecia ao conectar; agora
   * cada tela de saúde tem o próprio botão, porque medir de novo é justamente o
   * que se quer fazer ao olhar um número e desconfiar dele.
   */
  async stopMeasure(kind: MeasurableKind): Promise<void> {
    // Silencioso de propósito: quem chama já desistiu da medição, e um erro
    // aqui só trocaria um problema por outro na tela.
    await QCBand?.stopMeasure(kind).catch(() => undefined);
  }

  /**
   * Medição PEDIDA por alguém — e ela tem prioridade sobre a automática.
   *
   * O sensor óptico é um só, e o firmware recusa uma segunda medição enquanto
   * a primeira corre. A recusa vem com a mensagem de encaixe (`未正确佩戴手环`),
   * que descreve a causa mais comum e não esta: quem lê conclui que a pulseira
   * está frouxa quando na verdade ela está ocupada.
   *
   * Foi exatamente o que aconteceu em campo (ago/2026): a sequência automática
   * começa a cada conexão e ocupa o sensor por minutos; um toque em "medir"
   * nesse intervalo era recusado, e a tela mandava apertar uma pulseira que já
   * estava firme — tanto que o app do fabricante media normalmente.
   *
   * Quem pediu ganha: a automática é oportunista e pode esperar a próxima
   * conexão; a pessoa está olhando para a tela agora.
   */
  async measure(kind: MeasurableKind): Promise<void> {
    if (!QCBand) throw new Error('Pulseira não disponível neste build');

    if (this.medindo) {
      // Cede a vez: desliga o sensor da automática antes de pedir o nosso, e
      // sinaliza para o laço não seguir para a próxima grandeza.
      this.abortarAutomatica = true;
      await this.stopMeasure(this.medindo).catch(() => undefined);
    }

    this.medindo = kind;
    try {
      await this.comSensorLivre(() => QCBand!.measure(kind));
      // HRV não chega por callback: é série histórica, e a medição que acabou de
      // rodar acrescentou uma amostra a ela.
      if (kind === 'hrv') await this.refreshHrv();
    } finally {
      this.medindo = null;
    }
  }

  /**
   * Roda `fn` com o sensor óptico LIVRE — sem o batimento contínuo por cima.
   *
   * O batimento ao vivo é ligado na conexão e só era desligado ao desconectar,
   * ou seja, ficava ocupando o sensor o tempo inteiro. E o sensor é um só: com
   * ele tomado, `startToMeasuring` é recusado — e a recusa vem com a mensagem
   * de encaixe (`未正确佩戴手环`), que descreve outra causa e mandava apertar
   * uma pulseira que já estava firme.
   *
   * A pista veio da interface do fabricante: lá o batimento contínuo só corre
   * quando alguém toca em "iniciar medição", e a medição de um toque tem botão
   * próprio. Eles nunca deixam os dois disputando.
   *
   * O contínuo volta no fim, inclusive quando a medição falha: é ele que
   * alimenta a leitura ao vivo da home, e deixá-lo desligado trocaria um
   * problema por outro.
   */
  private async comSensorLivre<T>(fn: () => Promise<T>): Promise<T> {
    await QCBand?.stopRealtimeHeartRate().catch(() => undefined);
    try {
      return await fn();
    } finally {
      await QCBand?.startRealtimeHeartRate().catch(() => undefined);
    }
  }

  /**
   * O que a pulseira registrou sozinha hoje.
   *
   * **Uma consulta por vez.** A primeira versão usava `Promise.all`, apostando
   * que ler memória não disputava nada e que o SDK enfileiraria sozinho. Ele
   * não enfileira: as cinco consultas colidem no canal serial e falham TODAS,
   * com um erro que não diz nada sobre concorrência. A sonda que revelou isso
   * lia em série e trazia o dia inteiro — o mesmo aparelho, no mesmo instante,
   * respondendo a uma de cada vez.
   *
   * Cada leitor devolve lista vazia em vez de estourar. Um histórico ausente é
   * rotina — o agendamento pode ter sido ligado agora, e a pulseira ainda não
   * teve janela para preencher — e derrubar os outros quatro por causa dele
   * seria trocar quatro séries boas por nenhuma.
   */
  async fetchHistory(dayIndex = 0): Promise<DayHistory> {
    const vazio: DayHistory = {
      heartRate: [],
      hrv: [],
      stress: [],
      spo2: [],
      pressure: [],
      steps: [],
    };
    if (!QCBand) return vazio;

    let passo = 0;
    const anunciar = (step: SyncStep) => {
      passo += 1;
      this.setActivity({ kind: 'sync', step, done: passo, total: SYNC_TOTAL_STEPS });
    };

    /*
     Cada leitor registra o PRÓPRIO desfecho.

     Um `catch` mudo devolvendo lista vazia torna "o firmware não guarda isso"
     indistinguível de "a chamada falhou" — e as duas pedem ações opostas. Numa
     ponte para SDK de terceiro, essa diferença é a maior parte do trabalho de
     descobrir o que o aparelho realmente faz.
    */
    const ler = async <T>(nome: string, fn: () => Promise<T[]>): Promise<T[]> => {
      /*
       Tenta de novo, com espera crescente.

       O SDK não está pronto no instante em que o estado vira `connected`: a
       primeira rodada de leituras falha e a seguinte, segundos depois, traz o
       dia inteiro. Foi o que a sonda mostrou lado a lado, e é a explicação de
       o histórico parecer inexistente quando na verdade só tinha sido pedido
       cedo demais.

       Quatro tentativas cobrem a janela observada com folga. Falhar depois
       disso é resposta legítima — este firmware não guarda essa grandeza —, e
       aí a lista vazia é a verdade, não um erro escondido.
      */
      for (let tentativa = 0; tentativa < 4; tentativa++) {
        try {
          /*
           Teto por consulta, não só por sincronização inteira.

           Uma consulta que pendura para sempre travava as outras quatro atrás
           dela: o `catch` abaixo nunca era alcançado, porque não havia rejeição
           — havia ausência de resposta. Com teto, a que pendurou vira uma série
           vazia e as seguintes ainda acontecem, que é a diferença entre perder
           uma grandeza e perder a sincronização toda.
          */
          const r = await comTeto(fn(), TETO_CONSULTA_MS, nome);
          if (__DEV__) console.log(`[qcband] ${nome}: ${r.length} bruto`);
          return r;
        } catch (err) {
          // Teto estourado não merece nova tentativa: a consulta anterior segue
          // pendente lá dentro, e insistir por cima dela só empilha espera no
          // canal serial. Falhou por tempo, esta grandeza fica para a próxima.
          if (eTempoEsgotado(err)) {
            console.warn(`[qcband] ${nome} não respondeu em ${TETO_CONSULTA_MS / 1000}s`);
            return [];
          }
          if (tentativa === 3) {
            console.warn(`[qcband] ${nome} indisponível após 4 tentativas:`, err);
            return [];
          }
          await new Promise((r) => setTimeout(r, 800 * (tentativa + 1)));
        }
      }
      return [];
    };

    /*
     `try/finally` para a etapa SEMPRE ser apagada.

     A limpeza estava só no caminho de sucesso, e uma exceção aqui deixaria o
     canal declarando "sincronizando" para sempre — o painel de progresso ficaria
     na tela indefinidamente, que é exatamente o sintoma que ele existe para
     eliminar.
    */
    try {
      anunciar('heartRate');
      const fc = await ler('fc', () => QCBand!.getHeartRateHistory(dayIndex));
      anunciar('hrv');
      /*
       HRV varre para trás; as outras grandezas, não.

       Ela é medida uma vez por hora, no máximo, e um dia sem uso da pulseira a
       deixa vazia — enquanto batimento e passos enchem o dia inteiro. Buscar a
       mais recente que ainda existe é o que evita a tela dizer "sem HRV" com
       dado de anteontem guardado no aparelho.
      */
      const hrvRecente = dayIndex === 0 ? (await this.hrvMaisRecente()).amostras : [];
      anunciar('stress');
      const estresse = await ler('estresse', () => QCBand!.getStressHistory(dayIndex));
      anunciar('spo2');
      const oxigenio = await ler('spo2', () => QCBand!.getSpo2History(dayIndex));
      anunciar('pressure');
      // A porta de pressão não aceita dia — só existe a leitura corrente.
      const pressao =
        dayIndex === 0 ? await ler('pressão', () => QCBand!.getPressureHistory()) : [];
      anunciar('steps');
      const passos = await ler('passos', () => QCBand!.getStepsHistory(dayIndex));

      const hoje = new Date();
      const inicioDoDia = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()).getTime();

      const historico: DayHistory = {
        heartRate: amostrasDeSerie(fc),
        hrv: hrvRecente,
        stress: amostrasComCarimbo(estresse),
        // A medição pedida na mão fica de fora da série do dia: ela costuma ser
        // feita parado e de propósito, e misturá-la com a agendada distorce a
        // mínima — que é justamente o número que importa em oxigenação.
        spo2: oxigenio
          .filter((p) => !p.manual && p.value > 0)
          .map((p) => ({ at: p.at, value: p.value })),
        /*
       Pressão vem vazia NESTE firmware, e isso está medido.

       As quatro portas do SDK foram sondadas no aparelho: a agendada responde
       com sucesso e devolve zero, a variante por idade falha, a manual falha.
       O app do fabricante mostra curva de pressão porque acumula no BANCO DELE
       a partir das medições agendadas que chegam por callback — não porque lê
       um histórico do aparelho.

       Mantido aqui de propósito: outro firmware da mesma família pode
       responder, e o custo de tentar é uma consulta que falha rápido. Quem
       preenche a série de pressão hoje é a leitura ao vivo.
      */
        pressure: pressao.filter((p) => p.at >= inicioDoDia && p.systolic > 0),
        steps: passos
          .map((p) => ({
            at: instanteDoFirmware(p.at),
            steps: p.steps,
            kcal: Number.isFinite(p.calories) ? Math.max(0, p.calories) : 0,
          }))
          .filter((p) => p.at > 0 && p.steps > 0),
      };

      if (__DEV__) {
        console.log(
          `[qcband] histórico do dia: fc=${historico.heartRate.length} estresse=${historico.stress.length} ` +
            `spo2=${historico.spo2.length} pressão=${historico.pressure.length} passos=${historico.steps.length}`);
      }
      return historico;
    } finally {
      if (this.activity?.kind === 'sync') this.setActivity(null);
    }
  }

  async findDevice(): Promise<boolean> {
    if (!QCBand) return false;
    return QCBand.findBand().catch(() => false);
  }

  async vibrate(): Promise<boolean> {
    if (!QCBand) return false;
    /*
     Falha em silêncio, e de propósito: vibrar é um REFORÇO de um aviso que já
     está sendo dado na tela e na notificação do sistema. Pulseira fora de
     alcance no fim do descanso não é motivo para interromper o treino com uma
     mensagem de erro.
    */
    return comTeto(QCBand.vibrate(), TETO_CONSULTA_MS, 'vibração').catch(() => false);
  }

  /**
   * Calibração de uso. Teto próprio: ela LEVA dois minutos, e o teto de
   * consulta (15 s) a mataria sempre — mas teto tem que existir, porque o bloco
   * de conclusão do fabricante pode simplesmente não ser chamado.
   */
  async wearCalibration(): Promise<boolean> {
    if (!QCBand) return false;
    return comTeto(QCBand.wearCalibration(), 150_000, 'calibração');
  }

  async enableAncs(): Promise<boolean> {
    if (!QCBand) return false;
    return comTeto(QCBand.enableAncs(), TETO_CONSULTA_MS, 'ANCS').catch(() => false);
  }

  async getNotificationFilter(): Promise<{ type: number; enabled: boolean }[] | null> {
    if (!QCBand) return null;
    // `null` quando a pulseira não responde: a tela precisa distinguir "não
    // respondeu" de "respondeu vazio". Escondida, a seção inteira sumia e um
    // testador (Bruno, 22/08) não achou a opção que o anúncio citava.
    const filtro = await comTeto(
      QCBand.getNotificationFilter(),
      TETO_CONSULTA_MS,
      'filtro de avisos').catch(() => null);
    if (__DEV__) {
      // A SONDAGEM: o cabeçalho documenta um vocabulário fixo sem identificador
      // de app, e é aqui que se vê o que ESTE firmware devolve de fato.
      console.log(`[qcband] filtro de avisos: ${JSON.stringify(filtro)}`);
    }
    return filtro;
  }

  async setNotificationFilter(entries: { type: number; enabled: boolean }[]): Promise<boolean> {
    if (!QCBand) return false;
    return comTeto(
      QCBand.setNotificationFilter(entries),
      TETO_CONSULTA_MS,
      'filtro de avisos').catch(() => false);
  }

  async fetchSleep(): Promise<SleepNight | null> {
    if (!QCBand) return null;

    this.setActivity({ kind: 'sync', step: 'sleep', done: 1, total: 1 });
    try {
      /*
       Os DOIS dias juntos, e só depois a noite.

       Era "dia 1, depois dia 0, devolve o primeiro com sono". Uma noite com
       levantada no meio fica partida em dois dias da memória — um testador
       (22/08) dormiu 23h30, levantou à 1h, voltou até 6h45 e o app mostrou os
       59 minutos do primeiro bloco. Quem junta os blocos é o domínio
       (`montarNoites`); aqui só se recolhe tudo e se entrega a mais recente.
      */
      /*
       Falha e vazio são coisas diferentes, e o `.catch(() => [])` de antes
       apagava a diferença: a consulta que NÃO respondeu virava lista vazia, e
       a tela dizia "a pulseira não tem noite mais recente" com a mesma
       confiança de quem perguntou e ouviu não (Bruno, 24/08/2026, com o botão
       novo já instalado). Num app de saúde, afirmar ausência a partir de erro
       é o mesmo defeito de tratar sinal ausente como zero.

       Se TODAS as consultas falharem, isto rejeita, e quem chamou diz que não
       conseguiu perguntar. Uma que responda já é resposta.
      */
      const bruto: SegmentoBruto[] = [];
      let falhas = 0;
      for (const dia of [1, 0]) {
        const doDia = await comTeto(QCBand.getSleep(dia), TETO_CONSULTA_MS, 'sono').catch(() => {
          falhas += 1;
          return [] as SegmentoBruto[];
        });
        if (__DEV__) console.log(`[qcband] sono do dia ${dia}: ${doDia.length} segmentos`);
        bruto.push(...doDia);
      }
      if (falhas === 2) throw new Error('A pulseira não respondeu à consulta de sono');
      /*
       Porta antiga vazia não quer dizer noite inexistente: esta pulseira
       declara `newSleepProtocol`, e o protocolo novo (V2) tem a própria porta.
       Só se pergunta por ela quando a primeira não trouxe nada, para não
       gastar o canal serial em duplicidade.
      */
      if (bruto.length === 0 && QCBand.getSleepV2) {
        const v2 = await comTeto(QCBand.getSleepV2(1), TETO_CONSULTA_MS, 'sono v2').catch(
          () => [] as SegmentoBruto[],
        );
        if (__DEV__) console.log(`[qcband] sono v2: ${v2.length} segmentos`);
        bruto.push(...v2);
      }
      return noitesDoBruto(bruto)[0] ?? null;
    } finally {
      if (this.activity?.kind === 'sync') this.setActivity(null);
    }
  }

  /**
   * Varre a memória do aparelho, um dia por vez — canal serial, nunca em
   * paralelo. É o que preenche o sono dos dias ANTERIORES no histórico de
   * saúde: a noite mais recente já sobe pelo `fetchSleep`, mas quem dormia com
   * a pulseira antes de o envio existir tem as noites presas aqui.
   */
  async fetchSleepHistory(): Promise<SleepNight[]> {
    if (!QCBand) return [];

    /*
     Do mais RECENTE para o mais antigo — a ordem importa e não é estética.

     Eram sete consultas partindo do dia 6, e o teto de fora mal cobria as sete
     somadas. Bastava a pulseira responder devagar para a varredura ser cortada
     no fim — e o fim, nessa ordem, era HOJE e ONTEM. A peça que existe para
     recuperar noite perdida perdia justamente as que interessam.

     Lendo ao contrário, o corte custa a noite de seis dias atrás, que é o que
     menos falta.
    */
    // Recolhe os sete dias e monta as noites de uma vez: noite que cruza a
    // fronteira de "dia" do firmware (levantada na madrugada) sai inteira.
    const bruto: SegmentoBruto[] = [];
    let falhas = 0;
    for (let dia = 0; dia <= 6; dia++) {
      this.setActivity({ kind: 'sync', step: 'memory', done: dia + 1, total: 7 });
      const doDia = await comTeto(QCBand.getSleep(dia), TETO_CONSULTA_MS, 'sono').catch(() => {
        falhas += 1;
        return [] as SegmentoBruto[];
      });
      bruto.push(...doDia);
    }
    // Sete consultas mudas é aparelho fora de alcance, não sete noites em
    // claro: quem chamou precisa saber a diferença.
    if (falhas === 7) throw new Error('A pulseira não respondeu à memória de sono');
    // A memória inteira pela porta nova, quando a antiga veio vazia.
    if (bruto.length === 0 && QCBand.getSleepV2) {
      const v2 = await comTeto(QCBand.getSleepV2(6), TETO_CONSULTA_MS, 'sono v2').catch(
        () => [] as SegmentoBruto[],
      );
      if (__DEV__) console.log(`[qcband] memória de sono v2: ${v2.length} segmentos`);
      bruto.push(...v2);
    }
    const noites = noitesDoBruto(bruto);
    if (__DEV__) console.log(`[qcband] noites na memória: ${noites.length}`);
    if (this.activity?.kind === 'sync') this.setActivity(null);
    return noites;
  }

  scan(onDevice: (device: DiscoveredDevice) => void): () => void {
    const native = QCBand;
    if (!native) return () => undefined;

    const sub = native.addListener('onDevice', (device: QCDevice) => {
      onDevice({
        id: device.id,
        // Aparelho sem nome continua na lista: a H59 anuncia anônima, e filtrar
        // por nome a esconderia — foi exatamente o que travou o pareamento antes.
        name: device.name || `Sem nome · ${device.id.slice(-5)}`,
        rssi: device.rssi,
        serviceUUIDs: device.serviceUUIDs,
        // Já conectado ao sistema: a tela mostra outro rótulo e o filtro de
        // pulseira o deixa passar sem precisar reconhecer o nome.
        alreadyConnected: device.alreadyConnected,
      });
    });

    void native.startScan();

    return () => {
      sub.remove();
      void native.stopScan();
    };
  }

  async connect(deviceId: string): Promise<void> {
    if (!QCBand) throw new Error('SDK do fabricante indisponível neste build');
    try {
      await QCBand.connect(deviceId);
    } catch (err) {
      /*
       Conexão FRIA: o nativo só conecta em aparelho presente no mapa de
       descobertos, e o mapa nasce vazio a cada processo — o `connect` do
       arranque, o do primeiro plano e o botão Reconectar caíam todos aqui e
       falhavam em silêncio. A saída é redescobrir: escaneia até o aparelho
       pareado aparecer (ou 12 s) e conecta com ele fresco no mapa.
      */
      await this.redescobrir(deviceId);
      await QCBand.connect(deviceId);
    }
  }

  /** Escaneia até o aparelho aparecer; resolve na hora, rejeita no prazo. */
  private redescobrir(deviceId: string, prazoMs = 12_000): Promise<void> {
    return new Promise((resolve, reject) => {
      let encerrado = false;
      const finalizar = (erro?: Error) => {
        if (encerrado) return;
        encerrado = true;
        clearTimeout(timer);
        parar();
        if (erro) reject(erro);
        else resolve();
      };
      const parar = this.scan((device) => {
        if (device.id === deviceId) finalizar();
      });
      const timer = setTimeout(
        () => finalizar(new Error('Pulseira não encontrada por perto')),
        prazoMs);
    });
  }

  /**
   * Sessão de esporte na pulseira.
   *
   * O contínuo (`realTimeHeartRate`) é o modo de leitura FORA de exercício, e o
   * firmware o encerra sozinho depois de um tempo — por isso uma sessão de 36
   * min saiu com uma amostra só. No modo esporte o aparelho mede sem parar e
   * entrega pelo `currentSportInfo`, que a ponte já traduz em `heartRate`.
   *
   * Início desliga o contínuo (o sensor é um só) e fim o religa: é ele que
   * alimenta a leitura ao vivo da home.
   */
  async setSportState(kind: SportKind, state: SportState): Promise<void> {
    if (!QCBand) return;
    const tipo = TIPO_DE_ESPORTE_DO_FIRMWARE[kind] ?? OUTRO_EXERCICIO;
    const estado = { start: 1, pause: 2, continue: 3, stop: 4 }[state];
    if (state === 'start') await QCBand.stopRealtimeHeartRate().catch(() => undefined);
    await comTeto(QCBand.setSportMode(tipo, estado), TETO_CONSULTA_MS, 'modo esporte').catch(
      (err) => console.warn(`[qcband] modo esporte ${kind}/${state}:`, err));
    if (state === 'stop') await QCBand.startRealtimeHeartRate().catch(() => undefined);
  }

  async disconnect(): Promise<void> {
    if (!QCBand) return;
    await QCBand.stopRealtimeHeartRate().catch(() => undefined);
    await QCBand.disconnect();
    this.battery = null;
    this.lastHrv = null;
    this.lastHrvAt = null;
  }

  subscribe(onReading: (reading: Reading) => void): () => void {
    this.readingListeners.add(onReading);
    return () => {
      this.readingListeners.delete(onReading);
    };
  }

  onStateChange(listener: (state: ConnectionState, reason?: string) => void): () => void {
    this.stateListeners.add(listener);
    listener(this.state, this.stateReason);
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  getBatteryLevel(): number | null {
    return this.battery;
  }
}

/**
 * Série de passo fixo → amostras com instante.
 *
 * O firmware entrega `values[]` a partir da meia-noite da data, um ponto a cada
 * `secondInterval`. O índice É o horário, e é isso que se perde ao guardar só
 * os valores: uma lista de números não sabe dizer se o pico foi às 7h ou às 19h.
 *
 * Zero significa "não mediu nesta janela", não "batimento zero" — a pulseira
 * preenche o vetor inteiro do dia mesmo antes de o dia acabar.
 */
type SegmentoBruto = { type: number; minutes: number; start: string; end?: string };

/**
 * Segmentos crus do SDK → noites do domínio, da mais recente para a mais antiga.
 *
 * O firmware numera as fases (1 acordado, 2 leve, 3 profundo, 4 REM) e carimba
 * início e fim de cada bloco. Aqui só se traduz; quem decide o que é "a mesma
 * noite" é `montarNoites`, no domínio, onde isso é testável sem pulseira.
 */
function noitesDoBruto(bruto: SegmentoBruto[]): SleepNight[] {
  const fases: Record<number, SleepPhase> = { 1: 'awake', 2: 'light', 3: 'deep', 4: 'rem' };
  const segmentos: SegmentoComInstante[] = [];
  for (const s of bruto) {
    const phase = fases[s.type];
    if (!phase || !(s.minutes > 0)) continue;
    const startAt = instanteDoFirmware(s.start ?? '');
    if (startAt <= 0) continue;
    const fim = instanteDoFirmware(s.end ?? '');
    segmentos.push({ phase, minutes: s.minutes, startAt, endAt: fim > startAt ? fim : startAt + s.minutes * 60_000 });
  }
  return montarNoites(segmentos);
}

/**
 * Série que JÁ vem com carimbo → amostras do domínio.
 *
 * É o caminho de HRV e estresse desde o SDK 1.0.0.20260812: o instante vem do
 * aparelho, normalizado pelo próprio SDK numa grade de 5 minutos, em vez de ser
 * reconstruído aqui a partir do índice. `amostrasDeSerie` abaixo continua
 * existindo para a frequência cardíaca, que ainda é entregue como vetor de
 * passo fixo — e o dia em que ela também ganhar carimbo, some.
 */
function amostrasComCarimbo(series: QCSampleSeries[]): Sample[] {
  const amostras: Sample[] = [];
  for (const serie of series) {
    for (const ponto of serie.samples) {
      if (ponto.value > 0 && Number.isFinite(ponto.at)) {
        amostras.push({ at: ponto.at, value: ponto.value });
      }
    }
  }
  return amostras.sort((a, b) => a.at - b.at);
}

function amostrasDeSerie(series: QCHrvSeries[], nome = 'serie'): Sample[] {
  const amostras: Sample[] = [];
  for (const serie of series) {
    const base = new Date(`${serie.date}T00:00:00`).getTime();
    console.log(
        `valores=${serie.values.length} positivos=${serie.values.filter((v) => v > 0).length} ` +
        `base=${Number.isNaN(base) ? 'NaN: DATA NÃO PARSEIA' : new Date(base).toISOString()}`);
    if (Number.isNaN(base)) continue;
    serie.values.forEach((value, i) => {
      if (value > 0) amostras.push({ at: base + i * serie.secondInterval * 1000, value });
    });
  }
  const r = amostras.sort((a, b) => a.at - b.at);
  console.log(
      (r.length
        ? ` · de ${new Date(r[0].at).toISOString()} a ${new Date(r[r.length - 1].at).toISOString()}`
        : ''));
  return r;
}

/** `OdmSportPlusExerciseModelTypeOtherExercise` — o balde do que o firmware não nomeia. */
const OUTRO_EXERCICIO = 10;

/**
 * Nossa modalidade → `OdmSportPlusExerciseModelType` do SDK.
 *
 * O código muda o ÍCONE e o algoritmo de passos/distância do firmware, não a
 * medição de batimento — qualquer tipo abre o sensor. Mapear mesmo assim custa
 * nada e faz o registro da pulseira bater com o do app.
 */
const TIPO_DE_ESPORTE_DO_FIRMWARE: Partial<Record<SportKind, number>> = {
  corrida: 7,
  caminhada: 4,
  ciclismo: 9,
  trilha: 8,
  escalada: 34,
  skate: 36,
  spinning: 24,
  esteira: 40,
  eliptico: 26,
  remo: 27,
  corda: 5,
  natacao: 6,
  futebol: 32,
  volei: 33,
  basquete: 31,
  tenis: 29,
  danca: 35,
  yoga: 22,
};

/**
 * `2026-07-29 15:23:00` → epoch local.
 *
 * O firmware manda com espaço no lugar do `T`, que o `Date` do JS aceita no
 * Safari mas não é ISO — trocar é mais barato que confiar na tolerância do
 * motor, que já mudou entre versões do JavaScriptCore.
 */
function instanteDoFirmware(texto: string): number {
  const t = new Date(texto.replace(' ', 'T')).getTime();
  return Number.isNaN(t) ? 0 : t;
}
