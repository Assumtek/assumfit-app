import type { Reading, SleepNight } from '../../domain/types';

/** O que dá para pedir ao aparelho que meça na hora. */
export type MeasurableKind = 'hrv' | 'spo2' | 'bloodPressure' | 'stress' | 'oneKey';

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
  onStateChange(listener: (state: ConnectionState) => void): () => void;
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
  fetchHistory?(): Promise<DayHistory>;
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
