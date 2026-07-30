import { NativeModule, requireOptionalNativeModule } from 'expo-modules-core';

/**
 * Ponte para o SDK do fabricante (QCBandSDK / QRing).
 *
 * `requireOptionalNativeModule` e não import estático: o framework é arm64 puro,
 * sem fatia de simulador, então num build de simulador o módulo simplesmente não
 * existe. Import estático derrubaria o app inteiro na abertura — e o simulador é
 * onde a maior parte do desenvolvimento acontece.
 */
export type QCDevice = {
  id: string;
  name: string;
  rssi: number;
  serviceUUIDs: string[];
  /** Veio da consulta ao sistema, não de um anúncio — ele já estava conectado. */
  alreadyConnected?: boolean;
};

export type QCState = {
  state: 'idle' | 'scanning' | 'connecting' | 'connected' | 'error';
  reason?: string;
};

export type QCHrvSeries = {
  /** `yyyy-MM-dd` */
  date: string;
  /** Segundos entre amostras consecutivas. */
  secondInterval: number;
  values: number[];
};

/**
 * Ponto de oxigenação medido pela pulseira.
 *
 * Traz o próprio instante, ao contrário de HRV/estresse/FC: o firmware mede
 * SpO₂ em janelas irregulares, não em passo fixo, e uma série com intervalo
 * constante mentiria sobre quando cada amostra aconteceu.
 */
export type QCSpo2Point = {
  /** Epoch em milissegundos. */
  at: number;
  value: number;
  min: number;
  max: number;
  /** Medição pedida na mão, não agendada. */
  manual: boolean;
};

export type QCPressurePoint = { at: number; systolic: number; diastolic: number };

/**
 * Fatia de atividade do dia.
 *
 * `steps` é o que aconteceu NAQUELE trecho, não o acumulado — é o que permite
 * barras por hora em vez de uma rampa sempre crescente.
 */
export type QCStepsPoint = {
  /** `yyyy-MM-dd HH:mm:ss`, como o firmware entrega. */
  at: string;
  steps: number;
  calories: number;
  distanceM: number;
  activeMin: number;
};

type QCBandEvents = {
  onDevice: (device: QCDevice) => void;
  onState: (state: QCState) => void;
  onReading: (reading: Record<string, unknown>) => void;
  onLog: (entry: { raw: string }) => void;
};

declare class QCBandNativeModule extends NativeModule<QCBandEvents> {
  /**
   * Se existe rádio de verdade atrás deste módulo.
   *
   * No simulador o módulo EXISTE — precisa existir, porque o
   * `ExpoModulesProvider` gerado o referencia por nome em qualquer build — mas
   * sem o framework do fabricante, que é arm64 puro. Checar a presença do
   * módulo não basta; é preciso perguntar se ele tem rádio.
   */
  isSupported(): boolean;
  startScan(): Promise<void>;
  stopScan(): Promise<void>;
  connect(id: string): Promise<void>;
  disconnect(): Promise<void>;
  /**
   * Dicionário de recursos do firmware conectado.
   *
   * É o que responde, empiricamente, se esta pulseira entrega HRV — o cabeçalho
   * do SDK diz "Only Ring Support", mas quem decide é a flag que o aparelho
   * devolve, não o comentário.
   */
  getFeatures(): Promise<Record<string, boolean | number>>;
  startRealtimeHeartRate(): Promise<void>;
  stopRealtimeHeartRate(): Promise<void>;
  getHrv(dayIndex: number): Promise<QCHrvSeries[]>;
  /**
   * Manda a pulseira medir agora.
   *
   * `oneKey` mede batimento, SpO₂ e pressão numa tacada só. Os valores NÃO
   * voltam por esta promessa — chegam por `onReading`, porque a medição leva
   * dezenas de segundos e o aparelho vai reportando.
   */
  measure(
    kind: 'hrv' | 'heartRate' | 'spo2' | 'bloodPressure' | 'stress' | 'oneKey',
  ): Promise<boolean>;
  stopMeasure(kind: string): Promise<void>;
  /**
   * Se o monitoramento agendado de estresse e HRV está LIGADO.
   *
   * Separado da capacidade: `getFeatures` diz que a pulseira sabe medir, isto
   * diz se ela está medindo. Desligado, a medição sob demanda volta vazia e o
   * histórico nunca enche.
   */
  getMonitoring(): Promise<{
    stress: boolean;
    hrv: boolean;
    bloodPressure: boolean;
    spo2: boolean;
    heartRate: boolean;
  }>;
  setMonitoring(
    kind: 'stress' | 'hrv' | 'bloodPressure' | 'spo2' | 'heartRate',
    enable: boolean,
  ): Promise<void>;
  /**
   * As séries que a PULSEIRA guardou, em vez das que o app acumulou.
   *
   * É a diferença entre abrir o app e ver a curva do dia inteiro ou ver um
   * gráfico que só se constrói enquanto a tela fica aberta. O aparelho registra
   * sozinho nas janelas agendadas; estas chamadas trazem esse registro.
   *
   * `dayIndex` 0 é hoje, 1 é ontem. Pressão não recorta por dia: o SDK devolve
   * o histórico agendado inteiro, e quem fatia é o consumidor.
   */
  getHeartRateHistory(dayIndex: number): Promise<QCHrvSeries[]>;
  getStressHistory(dayIndex: number): Promise<QCHrvSeries[]>;
  getSpo2History(dayIndex: number): Promise<QCSpo2Point[]>;
  getPressureHistory(): Promise<QCPressurePoint[]>;
  getStepsHistory(dayIndex: number): Promise<QCStepsPoint[]>;
  /**
   * Lembrete de sedentarismo do FIRMWARE: a pulseira vibra sozinha, com o
   * celular desligado inclusive. `days` na ordem domingo → sábado, 1 liga.
   */
  getSedentary(): Promise<{ beginTime: string; endTime: string; days: number[]; intervalMin: number }>;
  /**
   * Lembrete de água: ALARME do firmware, um slot por horário. A pulseira
   * vibra na hora marcada com o celular em qualquer estado.
   */
  getWaterReminder(index: number): Promise<{ enabled: boolean; time: string; days: number[] }>;
  setWaterReminder(index: number, time: string, days: number[], enabled: boolean): Promise<void>;
  setSedentary(beginTime: string, endTime: string, days: number[], intervalMin: number): Promise<void>;
  /**
   * Sono medido pela PULSEIRA. `dayIndex` 0 é hoje, 1 é ontem.
   *
   * `type`: 1 acordado, 2 leve, 3 profundo, 4 REM — os valores do enum do
   * fabricante, comparados por número porque o nome que o Swift importa não é
   * determinável lendo o cabeçalho.
   */
  getSleep(dayIndex: number): Promise<{ type: number; minutes: number; start: string; end: string }[]>;
  getBattery(): Promise<{ level: number; charging: boolean }>;
  /** Vibra a pulseira — o "localizar" de quem não lembra onde a deixou. */
  findBand(): Promise<boolean>;
}

export const QCBand = requireOptionalNativeModule<QCBandNativeModule>('QCBand');

/** `false` no simulador e em qualquer build sem o framework do fabricante. */
export const qcBandAvailable = QCBand !== null && QCBand.isSupported();
