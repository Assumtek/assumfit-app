import type { Reading, SleepNight } from '../../domain/types';

/** O que dá para pedir ao aparelho que meça na hora. */
/**
 * `oneKey` mede batimento, pressão e oxigenação numa corrida só — verificado
 * nesta pulseira. `oneKeyFull` é o tipo mais amplo do SDK, que o cabeçalho diz
 * trazer HRV e estresse junto; ainda não confirmado neste firmware.
 */
export type MeasurableKind =
  | 'hrv'
  | 'spo2'
  | 'bloodPressure'
  | 'stress'
  | 'oneKey'
  | 'oneKeyFull';

export type DiscoveredDevice = {
  /**
   * Serviços anunciados no pacote de propaganda.
   *
   * Serve para separar o relógio do resto: num ambiente urbano a varredura
   * acha vinte aparelhos, e quem anuncia Heart Rate (0x180D) é quase certamente
   * um wearable. Nem todo firmware anuncia serviço, então é dica, não filtro —
   * filtrar por isso esconderia o Staranb se ele não anunciar.
   */
  serviceUUIDs?: string[];
  /**
   * Já estava conectado ao sistema quando a varredura começou.
   *
   * Aparelho conectado NÃO anuncia, então ele nunca apareceria no
   * `startDeviceScan`. Vem de `connectedDevices`, e a tela precisa distinguir
   * porque o RSSI dele é estimado, não medido.
   */
  alreadyConnected?: boolean;
  id: string;
  name: string;
  /** Intensidade do sinal em dBm. Mais próximo de zero é mais forte. */
  rssi: number;
};

export type ConnectionState = 'idle' | 'scanning' | 'connecting' | 'connected' | 'error';

/**
 * O que o serviço está fazendo com a pulseira NESTE momento.
 *
 * Existe porque a janela entre "conectou" e "primeira leitura" leva até um
 * minuto — a pulseira sincroniza memória e mede em série, um sensor só — e
 * durante ela a tela dizia apenas "aguardando", que é indistinguível de
 * travado. Quem sabe a etapa é o serviço; isto é o canal que a leva à tela.
 */
export type BandActivity =
  | { kind: 'sync'; step: SyncStep; done: number; total: number }
  | { kind: 'measure'; what: MeasurableKind };

/**
 * A etapa da sincronização, em vez de um "sincronizando" opaco.
 *
 * A leitura da memória são seis consultas em série pelo canal serial, cada uma
 * com suas tentativas — de meio minuto a um minuto no total. Sem dizer qual
 * delas está correndo, a espera inteira parece uma tela travada, e foi
 * exatamente assim que uma pessoa em teste (ago/2026) concluiu que o app estava
 * quebrado e o desinstalou. Nomear a etapa custa uma linha e transforma espera
 * em progresso.
 */
export type SyncStep =
  'heartRate' | 'hrv' | 'stress' | 'spo2' | 'pressure' | 'steps' | 'sleep' | 'memory';

/** Quantas consultas a leitura da memória do dia faz, para a barra de progresso. */
export const SYNC_TOTAL_STEPS = 6;

/** Um ponto de série com o instante em que foi medido. */
export type Sample = { at: number; value: number };

/**
 * O que o aparelho registrou sozinho ao longo do dia.
 *
 * Instantes em epoch, não rótulos: quem decide como agrupar é a tela, e um
 * rótulo de hora gravado aqui obrigaria o serviço a saber do fuso e do formato.
 */
export type DayHistory = {
  heartRate: Sample[];
  /**
   * A série de HRV do dia, medida nas janelas agendadas do firmware.
   *
   * Ela sempre existiu no aparelho e era descartada: só a ÚLTIMA amostra era
   * lida, para acompanhar o score. A curva na tela, enquanto isso, se montava
   * repetindo essa mesma amostra a cada batimento — noventa cópias de um número
   * só, desenhadas como se fossem noventa medições.
   */
  hrv: Sample[];
  stress: Sample[];
  spo2: Sample[];
  pressure: { at: number; systolic: number; diastolic: number }[];
  steps: { at: number; steps: number }[];
};

/**
 * Contrato do wearable. A tela nunca fala com o BLE direto — sempre com esta
 * interface. A implementação real (`react-native-ble-plx` + os UUIDs GATT do
 * Staranb) entra no M5, quando a amostra chegar, e só precisa satisfazer isto.
 */
export interface BleService {
  scan(onDevice: (device: DiscoveredDevice) => void): () => void;
  connect(deviceId: string): Promise<void>;
  disconnect(): Promise<void>;
  /** Emite cada nova leitura. Devolve a função de cancelamento. */
  subscribe(onReading: (reading: Reading) => void): () => void;
  /**
   * O `reason` acompanha o estado `error` quando o serviço sabe o motivo — "o
   * SDK recusou o aparelho", "feche o app do fabricante". Ele nascia no módulo
   * nativo e morria no caminho; sem ele a tela só sabia dizer "erro".
   */
  onStateChange(listener: (state: ConnectionState, reason?: string) => void): () => void;
  /**
   * Emite a etapa em curso (sincronizando memória, medindo estresse…) e `null`
   * ao ficar ocioso. Opcional: o mock não tem etapas, o GATT próprio tampouco.
   */
  onActivity?(listener: (activity: BandActivity | null) => void): () => void;
  getBatteryLevel(): number | null;
  /**
   * Enumera o GATT do aparelho conectado.
   *
   * Existe para o mapeamento dos UUIDs proprietários: sem isto, descobrir o que
   * o ANB-X1 expõe exige um app de terceiros e transcrever à mão trinta e seis
   * caracteres por característica, com o erro de digitação garantido em algum
   * lugar. Opcional na interface porque o mock não tem GATT nenhum.
   */
  inspect?(): Promise<GattService[]>;
  /**
   * Noite medida pelo próprio wearable, quando ele mede.
   *
   * Opcional porque nem todo aparelho registra sono — o GATT padrão do
   * Bluetooth SIG não tem perfil para isso.
   */
  fetchSleep?(): Promise<SleepNight | null>;
  /** As noites que a pulseira ainda guarda na memória, da mais antiga à mais nova. */
  fetchSleepHistory?(): Promise<SleepNight[]>;
  /** Vibra a pulseira para a pessoa achá-la. Resolve `false` se não alcançou. */
  findDevice?(): Promise<boolean>;
  /**
   * Uma vibração curta no pulso, para um aviso NOSSO.
   *
   * Separada de `findDevice` pelo propósito, ainda que hoje as duas usem o
   * mesmo comando do firmware. Só vale com o app vivo e conectado — o aviso
   * que chega com o app suspenso depende do ANCS, que é do sistema.
   */
  vibrate?(): Promise<boolean>;
  /**
   * Calibração de uso — o estado que faz TODA medição falhar até ser feita.
   *
   * O SDK 1.0.0.20260812 documentou `error.code == -4` ("não calibrado") como
   * desfecho possível de qualquer medição, e a ponte o traduz para o código
   * `sem-calibracao`. Antes disso, uma pulseira não calibrada produzia medição
   * que conclui sem valor e sem mensagem — indistinguível de defeito.
   *
   * Leva até dois minutos, vestida e parada, e é feita UMA vez. Por isso é a
   * pessoa quem dispara, na tela do dispositivo: rodar ao conectar prenderia
   * quem só queria ver o batimento.
   */
  wearCalibration?(): Promise<boolean>;
  /** Liga o ANCS, sem o qual notificação nenhuma chega ao pulso com o app fechado. */
  enableAncs?(): Promise<boolean>;
  /**
   * O motivo da última medição AUTOMÁTICA que falhou, como o firmware o disse.
   *
   * As medições da conexão rodam sozinhas e falhavam em silêncio: a pulseira
   * respondia "não está corretamente encaixada" às três, e a pessoa via telas
   * vazias sem nenhuma pista de que bastava apertar a pulseira. O que o botão
   * "medir" já mostrava, isto leva ao que acontece sem ninguém pedir.
   */
  onMeasureFailure?(listener: (motivo: string) => void): () => void;
  /** O filtro de avisos por categoria. Ver `domain/bandNotifications.ts`. */
  getNotificationFilter?(): Promise<{ type: number; enabled: boolean }[]>;
  setNotificationFilter?(entries: { type: number; enabled: boolean }[]): Promise<boolean>;
  /**
   * As séries que a PULSEIRA guardou hoje, não as que o app acumulou.
   *
   * É a diferença central entre a nossa tela e a do app do fabricante. Nós
   * construíamos os gráficos para a frente, ponto a ponto, a partir da leitura
   * ao vivo — o que só funciona se o app ficar aberto e conectado o dia todo.
   * O aparelho registra sozinho nas janelas agendadas, e essa memória estava
   * ali desde o começo sem ninguém buscar.
   *
   * Opcional porque depende do aparelho guardar histórico: o GATT padrão do
   * Bluetooth SIG não tem nada parecido, e o wearable simulado não tem memória.
   */
  /** `dayIndex` 0 é hoje; o protocolo do aparelho endereça até 6 (uma semana). */
  fetchHistory?(dayIndex?: number): Promise<DayHistory>;
  /**
   * Manda o aparelho medir AGORA a grandeza pedida.
   *
   * Opcional porque depende do aparelho: o GATT padrão do Bluetooth SIG não tem
   * comando de medição sob demanda, e o wearable simulado não tem o que medir.
   * A promessa resolve quando a medição TERMINA — leva dezenas de segundos —, e
   * o valor chega por `subscribe`, não por aqui.
   */
  measure?(kind: MeasurableKind): Promise<void>;
  /**
   * Aborta uma medição em curso e desliga o sensor.
   *
   * Existe porque `measure` pode não terminar NUNCA: o SDK do fabricante só
   * chama o bloco de conclusão quando a leitura converge, e pulseira frouxa ou
   * braço em movimento produzem uma medição que roda para sempre. Quem desiste
   * precisa desligar o sensor, não só parar de olhar.
   */
  stopMeasure?(kind: MeasurableKind): Promise<void>;
  /**
   * Assina TODAS as características notificáveis e despeja o que chegar.
   *
   * É a ferramenta de engenharia reversa. O H59 não expõe frequência cardíaca
   * padrão — ele conversa por canais seriais proprietários, e a única forma de
   * descobrir o formato é ver os bytes que ele empurra sozinho, sem filtro
   * nenhum sobre o que "deveria" chegar.
   */
  listenAll?(onData: (data: GattNotification) => void): Promise<() => void>;
  /** Envia bytes crus numa característica de escrita, para sondar comandos. */
  writeRaw?(serviceUuid: string, charUuid: string, hex: string): Promise<void>;
}

export type GattNotification = {
  charUuid: string;
  /** Bytes em hexadecimal, separados por espaço. */
  hex: string;
  /** Os mesmos bytes como texto, quando são imprimíveis — nome e versão vêm assim. */
  ascii: string;
  at: number;
};

/** Um serviço GATT e o que ele expõe. */
export type GattService = {
  uuid: string;
  /** Nome conhecido do Bluetooth SIG, quando é um serviço padrão. */
  known: string | null;
  characteristics: GattCharacteristic[];
};

export type GattCharacteristic = {
  uuid: string;
  known: string | null;
  /** Propriedades que importam para saber COMO ler: notificar, ler, escrever. */
  notifiable: boolean;
  readable: boolean;
  writable: boolean;
  /** Primeiro valor lido, em hexadecimal. Só para característica legível. */
  sample: string | null;
};
