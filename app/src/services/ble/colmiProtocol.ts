/**
 * Protocolo serial da família Colmi R02/R03 — que é o que o H59 fala.
 *
 * O "Staranb ANB-X1" é um H59 da Shenzhen Tianpengyu rebatizado, e o firmware
 * (`H59_2.00.16`) usa exatamente os mesmos UUIDs dos anéis Colmi R02/R03/R06:
 *
 *   6E40FFF0-…  serviço principal (padrão Nordic UART)
 *     6E400002-…  escrita
 *     6E400003-…  notificação
 *   DE5BF728-…  porta serial secundária
 *
 * Essa coincidência não é acaso: são SoCs BlueX/RF03 com o mesmo firmware de
 * referência, revendidos sob dezenas de marcas. E é uma sorte enorme, porque o
 * protocolo já foi documentado em código aberto — o que transformaria dias de
 * engenharia reversa numa tarde de implementação.
 *
 * Fontes:
 *   https://github.com/tahnok/colmi_r02_client
 *   https://github.com/atc1441/ATC_RF03_Ring
 *   https://codeberg.org/Freeyourgadget/Gadgetbridge/pulls/3896
 *
 * ⚠️ Os comandos abaixo vêm dessas fontes, não de documentação do fabricante.
 * A estrutura do pacote e a bateria são consenso entre as três; os subtipos de
 * leitura em tempo real precisam ser confirmados contra ESTE aparelho — use a
 * tela de Diagnóstico GATT para ver o que cada um devolve antes de confiar.
 */

export const COLMI_UUID = {
  service: '6e40fff0-b5a3-f393-e0a9-e50e24dcca9e',
  write: '6e400002-b5a3-f393-e0a9-e50e24dcca9e',
  notify: '6e400003-b5a3-f393-e0a9-e50e24dcca9e',
} as const;

/** Todo pacote tem exatamente 16 bytes. Nem mais, nem menos. */
export const PACKET_SIZE = 16;

export const CMD = {
  battery: 0x03,
  /** Liga a transmissão contínua; o subtipo diz qual grandeza. */
  startRealtime: 0x69,
  stopRealtime: 0x6a,
  realtimeData: 0x1e,
  heartRateHistory: 0x15,
  spo2History: 0x2c,
  steps: 0x48,
  sleep: 0x44,
} as const;

/** Subtipos da leitura contínua. */
export const REALTIME = {
  heartRate: 1,
  spo2: 2,
} as const;

/**
 * Monta um pacote de 16 bytes com checksum.
 *
 * O checksum é a soma dos 15 primeiros bytes módulo 255 — note que é 255, e não
 * 256: usar máscara `& 0xff` funciona na maioria dos casos e diverge justamente
 * quando a soma é múltipla de 255, produzindo um pacote que o aparelho descarta
 * em silêncio. É o tipo de erro que custa horas porque não gera resposta
 * nenhuma, só ausência.
 */
export function packet(command: number, payload: number[] = []): Uint8Array {
  const bytes = new Uint8Array(PACKET_SIZE);
  bytes[0] = command & 0xff;
  payload.slice(0, PACKET_SIZE - 2).forEach((b, i) => {
    bytes[i + 1] = b & 0xff;
  });

  let sum = 0;
  for (let i = 0; i < PACKET_SIZE - 1; i++) sum += bytes[i];
  bytes[PACKET_SIZE - 1] = sum % 255;
  return bytes;
}

export const startRealtime = (kind: number) => packet(CMD.startRealtime, [kind, 0]);

/**
 * Mantém a transmissão viva.
 *
 * Este protocolo não faz streaming contínuo: o aparelho para sozinho poucos
 * segundos depois do START se ninguém pedir para continuar. O log capturado
 * mostrou exatamente isso — uma sequência de `69 01 00 00` (medindo, sem valor)
 * terminando num `69 01 01 00`, que é o código de erro encerrando a sessão.
 *
 * O terceiro byte é a AÇÃO: 0 inicia, 3 continua. Sem o 3 periódico, nenhum
 * valor chega a ser produzido — o sensor desliga antes de terminar a medição.
 */
export const continueRealtime = (kind: number) => packet(CMD.startRealtime, [kind, 3]);

export const stopRealtime = (kind: number) => packet(CMD.stopRealtime, [kind, 0]);
export const askBattery = () => packet(CMD.battery);
export const askHeartRateHistory = () => packet(CMD.heartRateHistory, [0]);

/** Intervalo do keepalive. Curto o bastante para o sensor não desistir. */
export const KEEPALIVE_MS = 8000;

export type ColmiFrame =
  | { kind: 'battery'; level: number; charging: boolean }
  | { kind: 'heartRate'; bpm: number }
  | { kind: 'spo2'; percent: number }
  /** Página do histórico. `samples` traz os batimentos não nulos da página. */
  | { kind: 'history'; page: number; samples: number[] }
  /** O aparelho recusou ou interrompeu a medição. */
  | { kind: 'measuring'; code: number }
  | { kind: 'unknown'; command: number; bytes: Uint8Array };

/**
 * Interpreta um quadro recebido.
 *
 * A resposta ecoa o comando no primeiro byte, então é ele que decide o formato.
 * Quadro desconhecido volta como `unknown` em vez de ser descartado — durante o
 * mapeamento, o que ainda não sabemos ler é a informação mais valiosa que
 * existe, e engolir seria repetir o erro que já custou caro aqui.
 */
export function parseFrame(bytes: Uint8Array): ColmiFrame {
  if (bytes.length < 4) return { kind: 'unknown', command: bytes[0] ?? -1, bytes };

  switch (bytes[0]) {
    case CMD.battery:
      return { kind: 'battery', level: bytes[1], charging: bytes[2] === 1 };

    case CMD.startRealtime:
    case CMD.realtimeData: {
      // Layout: [cmd, subtipo, código, valor].
      const subtype = bytes[1];
      const code = bytes[2];
      const value = bytes[3];

      // Código diferente de zero, ou valor zero, significa que o sensor ainda
      // não produziu leitura — NÃO é um valor de zero. Devolver `measuring` em
      // vez de `unknown` permite à interface dizer "medindo" em vez de fingir
      // que nada aconteceu, e ao chamador saber que precisa insistir.
      if (code !== 0 || value === 0) return { kind: 'measuring', code };
      if (subtype === REALTIME.heartRate) return { kind: 'heartRate', bpm: value };
      if (subtype === REALTIME.spo2) return { kind: 'spo2', percent: value };
      return { kind: 'unknown', command: bytes[0], bytes };
    }

    case CMD.heartRateHistory: {
      /**
       * Histórico paginado: byte 1 é o índice da página, o resto são amostras.
       *
       * A maioria das páginas vem zerada — são horas em que o aparelho não
       * estava no pulso. Zero aqui é AUSÊNCIA de medição, não batimento zero, e
       * por isso é filtrado em vez de virar amostra.
       */
      const samples = Array.from(bytes.slice(2, PACKET_SIZE - 1)).filter((b) => b >= 30 && b <= 220);
      return { kind: 'history', page: bytes[1], samples };
    }

    default:
      return { kind: 'unknown', command: bytes[0], bytes };
  }
}

/** Confere o checksum de um quadro recebido, para descartar leitura corrompida. */
export function isValid(bytes: Uint8Array): boolean {
  if (bytes.length !== PACKET_SIZE) return false;
  let sum = 0;
  for (let i = 0; i < PACKET_SIZE - 1; i++) sum += bytes[i];
  return bytes[PACKET_SIZE - 1] === sum % 255;
}
