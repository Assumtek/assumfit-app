import { QCBand, type QCDevice, type QCHrvSeries, type QCState } from '../../../modules/qcband';
import { nightFrom } from '../../domain/sleep';
import type { Reading, SleepNight, SleepPhase, SleepSegment } from '../../domain/types';
import type {
  BleService,
  ConnectionState,
  DayHistory,
  DiscoveredDevice,
  MeasurableKind,
  Sample,
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
  private state: ConnectionState = 'idle';
  private stateListeners = new Set<(s: ConnectionState) => void>();
  private readingListeners = new Set<(r: Reading) => void>();
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
    hrvMs: null,
    spo2Pct: null,
    temperatureC: null,
    steps: null,
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
        if (__DEV__) console.log(`[qcband] estado: ${event.state}${event.reason ? ` — ${event.reason}` : ''}`);
        this.stateListeners.forEach((l) => l(event.state));
        if (event.state === 'connected') void this.afterConnect();
      }),
    );

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
      }),
    );

    this.subscriptions.push(
      QCBand.addListener('onReading', (event) => this.ingest(event)),
    );
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
      () => ({}) as Record<string, boolean | number>,
    );

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
          `pressão=${estado.bloodPressure} spo2=${estado.spo2} fc=${estado.heartRate}`,
      );

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

    for (const kind of pedidos) {
      try {
        await QCBand.measure(kind as Parameters<typeof QCBand.measure>[0]);
        if (__DEV__) console.log(`[qcband] medição concluída: ${kind}`);
      } catch (err) {
        // Falha de medição é rotina, não erro de programa: pulseira frouxa no
        // pulso, braço em movimento, aparelho sem contato com a pele. Seguir
        // para a próxima grandeza vale mais que interromper a série.
        if (__DEV__) console.warn(`[qcband] medição de ${kind} falhou:`, err);
      }
    }

    // O HRV não vem por callback: é série histórica, e a medição que acabou de
    // rodar acrescentou uma amostra a ela.
    if (features['feature.hrv'] === true) await this.refreshHrv();

  }

  /**
   * Puxa a série de HRV de hoje e guarda a última amostra.
   *
   * A média do dia seria mais estável e menos útil: o score compara a pessoa com
   * a linha de base DELA, e para isso o valor recente é o que importa.
   */
  private async refreshHrv() {
    if (!QCBand) return;
    const series = await QCBand.getHrv(0).catch(() => []);
    const values = series.flatMap((s) => s.values).filter((v) => v > 0);
    if (__DEV__) console.log(`[qcband] histórico de HRV: ${values.length} amostras`);
    if (values.length) {
      this.lastHrv = values[values.length - 1];
      /*
       O instante é o do FIM da série, não o de agora.

       A última amostra do histórico pode ser de horas atrás — a pulseira mede
       HRV em janelas agendadas. Carimbar com `Date.now()` faria um dado velho
       parecer recém-medido, que é o oposto do que a tela precisa dizer.
       */
      const ultima = series[series.length - 1];
      const passos = ultima.values.length - 1;
      this.lastHrvAt = new Date(`${ultima.date}T00:00:00`).getTime() + passos * ultima.secondInterval * 1000;
    }
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
        console.warn('[qcband] medição falhou — verifique o encaixe no pulso');
        return;
      default:
        return;
    }

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
  async measure(kind: MeasurableKind): Promise<void> {
    if (!QCBand) throw new Error('Pulseira não disponível neste build');
    await QCBand.measure(kind);
    // HRV não chega por callback: é série histórica, e a medição que acabou de
    // rodar acrescentou uma amostra a ela.
    if (kind === 'hrv') await this.refreshHrv();
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
    const vazio: DayHistory = { heartRate: [], stress: [], spo2: [], pressure: [], steps: [] };
    if (!QCBand) return vazio;

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
          const r = await fn();
          if (__DEV__) console.log(`[qcband] ${nome}: ${r.length} bruto`);
          return r;
        } catch (err) {
          if (tentativa === 3) {
            console.warn(`[qcband] ${nome} indisponível após 4 tentativas:`, err);
            return [];
          }
          await new Promise((r) => setTimeout(r, 800 * (tentativa + 1)));
        }
      }
      return [];
    };

    const fc = await ler('fc', () => QCBand!.getHeartRateHistory(dayIndex));
    const estresse = await ler('estresse', () => QCBand!.getStressHistory(dayIndex));
    const oxigenio = await ler('spo2', () => QCBand!.getSpo2History(dayIndex));
    // A porta de pressão não aceita dia — só existe a leitura corrente.
    const pressao = dayIndex === 0 ? await ler('pressão', () => QCBand!.getPressureHistory()) : [];
    const passos = await ler('passos', () => QCBand!.getStepsHistory(dayIndex));

    const hoje = new Date();
    const inicioDoDia = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()).getTime();

    const historico: DayHistory = {
      heartRate: amostrasDeSerie(fc),
      stress: amostrasDeSerie(estresse),
      // A medição pedida na mão fica de fora da série do dia: ela costuma ser
      // feita parado e de propósito, e misturá-la com a agendada distorce a
      // mínima — que é justamente o número que importa em oxigenação.
      spo2: oxigenio.filter((p) => !p.manual && p.value > 0).map((p) => ({ at: p.at, value: p.value })),
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
        .map((p) => ({ at: instanteDoFirmware(p.at), steps: p.steps }))
        .filter((p) => p.at > 0 && p.steps > 0),
    };

    if (__DEV__) {
      console.log(
        `[qcband] histórico do dia: fc=${historico.heartRate.length} estresse=${historico.stress.length} ` +
          `spo2=${historico.spo2.length} pressão=${historico.pressure.length} passos=${historico.steps.length}`,
      );
    }
    return historico;
  }

  async findDevice(): Promise<boolean> {
    if (!QCBand) return false;
    return QCBand.findBand().catch(() => false);
  }

  async fetchSleep(): Promise<SleepNight | null> {
    if (!QCBand) return null;

    for (const dia of [1, 0]) {
      const bruto = await QCBand.getSleep(dia).catch(() => []);
      if (__DEV__) console.log(`[qcband] sono do dia ${dia}: ${bruto.length} segmentos`);
      const noite = montarNoite(bruto);
      if (noite) return noite;
    }
    return null;
  }

  /**
   * Varre a memória do aparelho, um dia por vez — canal serial, nunca em
   * paralelo. É o que preenche o sono dos dias ANTERIORES no histórico de
   * saúde: a noite mais recente já sobe pelo `fetchSleep`, mas quem dormia com
   * a pulseira antes de o envio existir tem as noites presas aqui.
   */
  async fetchSleepHistory(): Promise<SleepNight[]> {
    if (!QCBand) return [];

    const noites: SleepNight[] = [];
    for (let dia = 6; dia >= 0; dia--) {
      const bruto = await QCBand.getSleep(dia).catch(() => []);
      const noite = montarNoite(bruto);
      if (noite) noites.push(noite);
    }
    if (__DEV__) console.log(`[qcband] noites na memória: ${noites.length}`);
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
        prazoMs,
      );
    });
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

  onStateChange(listener: (state: ConnectionState) => void): () => void {
    this.stateListeners.add(listener);
    listener(this.state);
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
/** Segmentos crus do SDK → noite do domínio. `null` quando o dia não tem sono. */
function montarNoite(bruto: { type: number; minutes: number; start: string }[]): SleepNight | null {
  const fases: Record<number, SleepPhase> = { 1: 'awake', 2: 'light', 3: 'deep', 4: 'rem' };
  if (!bruto.length) return null;

  const segments: SleepSegment[] = bruto
    .filter((s) => fases[s.type] && s.minutes > 0)
    .map((s) => ({ phase: fases[s.type], minutes: s.minutes }));
  if (!segments.length) return null;

  // A data vem do início do primeiro segmento: quem dormiu dia 28 às 23h e
  // acordou dia 29 reconhece aquela como a noite do dia 28.
  const data = (bruto[0].start ?? '').slice(0, 10) || new Date().toISOString().slice(0, 10);
  return nightFrom(data, segments);
}

function amostrasDeSerie(series: QCHrvSeries[]): Sample[] {
  const amostras: Sample[] = [];
  for (const serie of series) {
    const base = new Date(`${serie.date}T00:00:00`).getTime();
    if (Number.isNaN(base)) continue;
    serie.values.forEach((value, i) => {
      if (value > 0) amostras.push({ at: base + i * serie.secondInterval * 1000, value });
    });
  }
  return amostras.sort((a, b) => a.at - b.at);
}

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
