import { PermissionsAndroid, Platform } from 'react-native';
import { BleManager, Device, State, type Subscription } from 'react-native-ble-plx';

import type { Reading } from '../../domain/types';
import {
  askBattery,
  askHeartRateHistory,
  COLMI_UUID,
  continueRealtime,
  isValid as isValidColmi,
  KEEPALIVE_MS,
  parseFrame,
  REALTIME,
  startRealtime,
  stopRealtime,
} from './colmiProtocol';
import type {
  BleService,
  ConnectionState,
  DiscoveredDevice,
  GattNotification,
  GattService,
} from './types';

/**
 * UUIDs GATT do Staranb ANB-X1.
 *
 * Os padronizados pelo Bluetooth SIG (Heart Rate e Battery) estão corretos e
 * valem para qualquer dispositivo que os implemente. Os proprietários do
 * Staranb — PPG bruto, SpO₂, temperatura — ainda NÃO foram mapeados.
 *
 * Para preencher, com a amostra em mãos:
 *   1. nRF Connect → parear com o relógio
 *   2. anotar service e characteristic de cada dado
 *   3. substituir os `null` abaixo e escrever o parser correspondente
 *   4. validar HRV contra um Polar H10 em repouso (alvo: r > 0,85)
 */
const UUID = {
  heartRate: {
    service: '0000180d-0000-1000-8000-00805f9b34fb',
    measurement: '00002a37-0000-1000-8000-00805f9b34fb',
  },
  battery: {
    service: '0000180f-0000-1000-8000-00805f9b34fb',
    level: '00002a19-0000-1000-8000-00805f9b34fb',
  },
  /**
   * Serviços usados só para PERGUNTAR ao sistema quem já está conectado.
   *
   * `connectedDevices` do iOS exige uma lista de serviços e devolve apenas quem
   * os expõe. Perguntar só por frequência cardíaca e bateria não achou o
   * H59_F607 — ele não expõe nenhum dos dois de forma indexável. Generic Access
   * (0x1800) é OBRIGATÓRIO em todo periférico BLE por especificação, então é o
   * denominador comum que faz a consulta devolver qualquer coisa conectada.
   * Os 0xFFF0/0xFFE0/0xFEE7 entram porque são os serviços proprietários mais
   * comuns em módulos BLE baratos, categoria desta pulseira.
   */
  discovery: [
    '00001800-0000-1000-8000-00805f9b34fb',
    '0000180a-0000-1000-8000-00805f9b34fb',
    '0000180d-0000-1000-8000-00805f9b34fb',
    '0000180f-0000-1000-8000-00805f9b34fb',
    '0000fff0-0000-1000-8000-00805f9b34fb',
    '0000ffe0-0000-1000-8000-00805f9b34fb',
    '0000fee7-0000-1000-8000-00805f9b34fb',
  ],
  /** Proprietários — a mapear com o nRF Connect. */
  staranb: {
    service: null as string | null,
    ppgRaw: null as string | null,
    spo2: null as string | null,
    temperature: null as string | null,
  },
} as const;

/** Quantos intervalos RR guardar para o cálculo de RMSSD. */
const RR_WINDOW = 60;

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Os valores do ble-plx chegam em base64; decodifica sem depender de polyfill. */
function decodeBase64(input: string): Uint8Array {
  const clean = input.replace(/=+$/, '');
  const out = new Uint8Array((clean.length * 3) >> 2);
  let bits = 0;
  let acc = 0;
  let i = 0;
  for (const char of clean) {
    const value = B64.indexOf(char);
    if (value < 0) continue;
    acc = (acc << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[i++] = (acc >> bits) & 0xff;
    }
  }
  return out.subarray(0, i);
}

/**
 * Heart Rate Measurement (0x2A37), conforme a especificação do Bluetooth SIG.
 * O que interessa de verdade são os intervalos RR — é deles que sai o HRV.
 */
function parseHeartRate(bytes: Uint8Array): { bpm: number; rrIntervalsMs: number[] } {
  const flags = bytes[0];
  const is16Bit = (flags & 0x01) !== 0;
  const hasEnergy = (flags & 0x08) !== 0;
  const hasRr = (flags & 0x10) !== 0;

  let offset = 1;
  const bpm = is16Bit ? bytes[offset] | (bytes[offset + 1] << 8) : bytes[offset];
  offset += is16Bit ? 2 : 1;
  if (hasEnergy) offset += 2;

  const rrIntervalsMs: number[] = [];
  if (hasRr) {
    for (; offset + 1 < bytes.length; offset += 2) {
      // RR vem em unidades de 1/1024 s.
      rrIntervalsMs.push(((bytes[offset] | (bytes[offset + 1] << 8)) * 1000) / 1024);
    }
  }
  return { bpm, rrIntervalsMs };
}

/**
 * RMSSD — raiz quadrada da média dos quadrados das diferenças sucessivas entre
 * intervalos RR. É a métrica de HRV que a spec usa, e a mesma que o Polar
 * reporta, o que torna a validação contra o H10 uma comparação direta.
 */
function rmssd(rr: number[]): number | null {
  if (rr.length < 2) return null;
  let sum = 0;
  for (let i = 1; i < rr.length; i++) {
    const diff = rr[i] - rr[i - 1];
    sum += diff * diff;
  }
  return Math.sqrt(sum / (rr.length - 1));
}

async function ensureAndroidPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const granted = await PermissionsAndroid.requestMultiple([
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
  ]);
  return Object.values(granted).every((r) => r === PermissionsAndroid.RESULTS.GRANTED);
}

/**
 * Implementação real sobre o Staranb ANB-X1.
 *
 * INCOMPLETA por dependência de hardware: hoje entrega FC, HRV e bateria pelos
 * serviços padrão. SpO₂, temperatura e PPG bruto ficam nos valores neutros de
 * `Reading` até os UUIDs proprietários serem mapeados. Enquanto isso,
 * `services/ble/index.ts` continua apontando para o mock.
 */
export class StaranbBleService implements BleService {
  private manager = new BleManager();
  private device: Device | null = null;
  private state: ConnectionState = 'idle';
  private stateListeners = new Set<(s: ConnectionState) => void>();
  private readingListeners = new Set<(r: Reading) => void>();
  private subscriptions: Subscription[] = [];
  private rr: number[] = [];
  private battery: number | null = null;
  /** Avisa uma vez só que a pulseira não manda RR — senão sai um aviso por batimento. */
  private warnedNoRr = false;
  private lastBpm: number | null = null;
  private lastSpo2: number | null = null;
  private keepalive: ReturnType<typeof setInterval> | null = null;

  private setState(state: ConnectionState) {
    this.state = state;
    this.stateListeners.forEach((l) => l(state));
  }

  scan(onDevice: (device: DiscoveredDevice) => void): () => void {
    let stopped = false;
    /** Ids já registrados no log — com `allowDuplicates`, sem isto sai um por anúncio. */
    const seen = new Set<string>();

    const start = async () => {
      if (!(await ensureAndroidPermissions())) {
        this.setState('error');
        return;
      }
      // Espera o rádio ligar antes de varrer — no boot ele costuma vir "Unknown".
      const ready = await this.manager.state();
      if (ready !== State.PoweredOn) {
        await new Promise<void>((resolve) => {
          const sub = this.manager.onStateChange((s) => {
            if (s === State.PoweredOn) {
              sub.remove();
              resolve();
            }
          }, true);
        });
      }
      if (stopped) return;

      /**
       * Aparelho JÁ CONECTADO não anuncia — e a varredura só vê quem anuncia.
       *
       * É o motivo mais comum de "pareei no Bluetooth e o app não acha": assim
       * que o iOS ou o app do fabricante conecta na pulseira, ela para de
       * anunciar e some do `startDeviceScan` para sempre. Nenhum tempo de espera
       * resolve, porque não há o que esperar.
       *
       * `connectedDevices` pergunta ao SISTEMA quem já está conectado, por
       * serviço. Passamos os padrão porque são os únicos que conhecemos hoje —
       * uma pulseira que exponha frequência cardíaca ou bateria aparece aqui
       * mesmo estando ocupada com outro app.
       */
      try {
        const already = await this.manager.connectedDevices([...UUID.discovery]);
        if (__DEV__) console.log(`[ble] já conectados ao sistema: ${already.length}`);
        for (const device of already) {
          if (stopped) return;
          if (__DEV__) console.log(`[ble] conectado: ${device.id} | nome=${device.name ?? '(sem nome)'}`);
          onDevice({
            id: device.id,
            name: device.name ?? 'Aparelho conectado',
            rssi: device.rssi ?? -50,
            serviceUUIDs: device.serviceUUIDs ?? [UUID.heartRate.service],
            alreadyConnected: true,
          });
        }
      } catch {
        // Consulta indisponível não pode impedir a varredura normal.
      }

      if (stopped) return;
      this.setState('scanning');
      // `allowDuplicates` ligado de propósito: sem ele o RSSI congela na primeira
      // leitura, e é justamente a variação dele que permite achar o relógio
      // aproximando o celular. Custa bateria, mas a varredura dura segundos.
      this.manager.startDeviceScan(null, { allowDuplicates: true }, (error, device) => {
        if (error) {
          this.setState('error');
          return;
        }
        if (!device) return;

        /**
         * Aparelho SEM nome continua na lista.
         *
         * A versão anterior fazia `if (!device.name) return`, descartando tudo
         * que não anunciasse nome — e boa parte das pulseiras BLE anuncia sem
         * nome nenhum: o nome vive no serviço GAP e só fica legível DEPOIS de
         * conectar, ou vem num pacote de scan response que nem sempre é capturado.
         * Era o filtro mais provável para o Staranb nunca aparecer.
         */
        if (__DEV__) {
          // Diagnóstico da fase de mapeamento: imprime cada anúncio uma única
          // vez, com tudo que o rádio entrega. É o que permite ver no log se a
          // pulseira está anunciando e sob que forma.
          if (!seen.has(device.id)) {
            seen.add(device.id);
            console.log(
              `[ble] ${device.id} | nome=${device.name ?? device.localName ?? '(sem nome)'}` +
                ` | rssi=${device.rssi} | conectável=${device.isConnectable}` +
                ` | serviços=${(device.serviceUUIDs ?? []).join(',') || '(nenhum anunciado)'}`,
            );
          }
        }

        onDevice({
          // `localName` vem do pacote de scan response e às vezes existe quando
          // `name` não; os últimos quatro dígitos do id são o último recurso,
          // porque um rótulo vazio na lista é indistinguível de outro vazio.
          id: device.id,
          name: device.name ?? device.localName ?? `Sem nome · ${device.id.slice(-5)}`,
          rssi: device.rssi ?? -100,
          serviceUUIDs: device.serviceUUIDs ?? undefined,
        });
      });
    };

    void start();

    return () => {
      stopped = true;
      this.manager.stopDeviceScan();
    };
  }

  async connect(deviceId: string): Promise<void> {
    this.setState('connecting');
    this.manager.stopDeviceScan();
    try {
      /**
       * Timeout explícito e reconexão tolerante.
       *
       * `connectToDevice` sem timeout pode pendurar indefinidamente quando o
       * aparelho está ocupado com outro central — e "pendurado" é pior que
       * "falhou", porque a tela fica em "Conectando" para sempre sem nada a
       * fazer. Trinta segundos cobre pulseira lenta e ainda desiste.
       *
       * `autoConnect` deixa o sistema reconectar sozinho quando a pulseira sai
       * e volta do alcance, que é o comportamento esperado de um wearable que
       * fica no pulso o dia inteiro.
       */
      const device = await this.manager.connectToDevice(deviceId, {
        timeout: 30_000,
        autoConnect: true,
      });
      await device.discoverAllServicesAndCharacteristics();
      this.device = device;
      await this.readBattery(device);

      /**
       * Dois caminhos, nesta ordem.
       *
       * O perfil padrão do Bluetooth SIG é tentado primeiro porque é o único
       * que não depende de engenharia reversa. Quando ele não existe — caso do
       * H59, que não expõe 0x180D —, cai para o protocolo serial da família
       * Colmi, que é o que este firmware realmente fala.
       *
       * Tentar os dois, e não escolher por modelo, mantém o código válido para
       * qualquer wearable que venha depois: quem implementa o perfil padrão
       * funciona sem tocar em nada aqui.
       */
      const services = await device.services();
      const temPerfilPadrao = services.some((svc) => svc.uuid.toLowerCase() === UUID.heartRate.service);

      if (temPerfilPadrao) {
        this.monitorHeartRate(device);
      } else {
        await this.startColmi(device);
      }

      this.setState('connected');
    } catch (err) {
      /**
       * O erro original é a ÚNICA informação útil aqui, e a versão anterior o
       * jogava fora com um `catch` vazio — "Não foi possível conectar" não
       * distingue pulseira fora de alcance, aparelho ocupado por outro app,
       * pareamento recusado ou serviço inexistente, e cada um pede uma ação
       * diferente de quem está segurando o relógio.
       */
      const reason = err instanceof Error ? err.message : String(err);
      console.warn('[ble] falha ao conectar:', reason);
      this.setState('error');
      throw new Error(reason || 'Não foi possível conectar ao dispositivo');
    }
  }

  async disconnect(): Promise<void> {
    // Encerra a medição no APARELHO, não só do nosso lado: deixar o sensor
    // ligado depois de desconectar drena a bateria dele sem produzir nada.
    if (this.keepalive) clearInterval(this.keepalive);
    this.keepalive = null;
    if (this.device) await this.sendColmi(this.device, stopRealtime(REALTIME.heartRate)).catch(() => undefined);

    this.subscriptions.forEach((s) => s.remove());
    this.subscriptions = [];
    if (this.device) await this.manager.cancelDeviceConnection(this.device.id).catch(() => undefined);
    this.device = null;
    this.rr = [];
    this.battery = null;
    this.setState('idle');
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

  /**
   * Enumera tudo que o aparelho conectado expõe.
   *
   * É a ferramenta de mapeamento dos UUIDs proprietários. Além do identificador,
   * devolve as PROPRIEDADES de cada característica — notificar, ler, escrever —,
   * porque só o UUID não diz como consumir: SpO₂ pode chegar por notificação
   * contínua ou por leitura sob demanda, e tentar o método errado devolve vazio
   * sem erro nenhum.
   *
   * Para as legíveis, lê uma amostra em hexadecimal. É o que permite reconhecer
   * o dado sem documentação nenhuma: um byte entre 90 e 100 num aparelho no
   * pulso é SpO₂; dois bytes perto de 3700 são temperatura em centésimos de grau.
   */

  /**
   * Assina tudo que notifica e devolve os bytes crus.
   *
   * O H59_V2.0 não tem 0x180D nem 0x180F. Ele expõe dois canais seriais —
   * `6e400002/6e400003` (padrão Nordic UART) e `de5bf72a/de5bf729` — mais o
   * serviço 0xFEE7 da Huami. Em aparelhos assim o dado biométrico trafega como
   * quadro proprietário por um desses canais, e não existe documentação: a
   * única forma de descobrir o formato é olhar o que ele empurra.
   *
   * Assina TUDO de propósito. Escolher qual canal escutar seria supor qual é o
   * certo, e supor é exatamente o que já custou horas aqui.
   */
  async listenAll(onData: (data: GattNotification) => void): Promise<() => void> {
    const device = this.device;
    if (!device) throw new Error('Conecte o aparelho antes de escutar');

    await device.discoverAllServicesAndCharacteristics();
    const services = await device.services();
    const subs: Subscription[] = [];

    for (const service of services) {
      for (const char of await service.characteristics()) {
        if (!char.isNotifiable && !char.isIndicatable) continue;
        subs.push(
          char.monitor((error, c) => {
            // Falha numa característica não pode derrubar as outras: parte
            // delas exige comando de ativação antes e recusa a assinatura.
            if (error || !c?.value) return;
            const bytes = decodeBase64(c.value);
            const frame = {
              charUuid: c.uuid,
              hex: toHex(bytes),
              ascii: toAscii(bytes),
              at: Date.now(),
            };
            // Vai para o log ALÉM da tela: engenharia reversa é ciclo de
            // observar e ajustar, e depender de alguém transcrever a tela a
            // cada iteração torna o ciclo lento demais para ser útil.
            if (__DEV__) console.log(`[gatt] ${frame.charUuid.slice(0, 8)} ${frame.hex} |${frame.ascii}|`);
            onData(frame);
          }),
        );
      }
    }

    return () => subs.forEach((s) => s.remove());
  }

  /**
   * Escreve bytes crus, para sondar comandos.
   *
   * Protocolo proprietário costuma exigir um "handshake" antes de empurrar
   * qualquer dado — sem ele os canais ficam mudos mesmo assinados. Poder mandar
   * bytes pela tela evita recompilar o app a cada tentativa.
   */
  async writeRaw(serviceUuid: string, charUuid: string, hex: string): Promise<void> {
    const device = this.device;
    if (!device) throw new Error('Conecte o aparelho antes de escrever');
    const bytes = hex.trim().split(/[\s,]+/).filter(Boolean).map((h) => parseInt(h, 16));
    if (bytes.some((b) => Number.isNaN(b))) throw new Error('Hexadecimal inválido');
    await device.writeCharacteristicWithResponseForService(serviceUuid, charUuid, encodeBase64(new Uint8Array(bytes)));
  }

  async inspect(): Promise<GattService[]> {
    const device = this.device;
    if (!device) throw new Error('Conecte o aparelho antes de inspecionar');

    await device.discoverAllServicesAndCharacteristics();
    const services = await device.services();

    return Promise.all(
      services.map(async (service) => {
        const chars = await service.characteristics();
        return {
          uuid: service.uuid,
          known: knownName(service.uuid),
          characteristics: await Promise.all(
            chars.map(async (c) => ({
              uuid: c.uuid,
              known: knownName(c.uuid),
              notifiable: c.isNotifiable || c.isIndicatable,
              readable: c.isReadable,
              writable: c.isWritableWithResponse || c.isWritableWithoutResponse,
              // Leitura sob guarda: característica anunciada como legível pode
              // recusar na prática, e uma recusa não pode abortar a varredura
              // inteira — perder todos os UUIDs por causa de um seria o pior
              // resultado possível numa ferramenta de descoberta.
              sample: c.isReadable
                ? await c
                    .read()
                    .then((r) => (r.value ? toHex(decodeBase64(r.value)) : null))
                    .catch(() => null)
                : null,
            })),
          ),
        };
      }),
    );
  }

  private async readBattery(device: Device) {
    try {
      const char = await device.readCharacteristicForService(UUID.battery.service, UUID.battery.level);
      if (char.value) this.battery = decodeBase64(char.value)[0] ?? null;
    } catch {
      this.battery = null; // nem todo firmware expõe o serviço de bateria
    }
  }


  /**
   * Protocolo serial da família Colmi — ver `colmiProtocol.ts`.
   *
   * Assina o canal de notificação e MANDA o comando de leitura contínua. O
   * segundo passo é o que faltava: neste protocolo o aparelho não empurra nada
   * por conta própria, ele responde. Ficar só escutando produz silêncio
   * indistinguível de aparelho quebrado — foi exatamente o que aconteceu aqui.
   */
  private async startColmi(device: Device) {
    const sub = device.monitorCharacteristicForService(
      COLMI_UUID.service,
      COLMI_UUID.notify,
      (error, char) => {
        if (error) {
          console.warn('[ble] canal serial falhou:', error.message);
          return;
        }
        if (!char?.value) return;

        const bytes = decodeBase64(char.value);
        // Quadro com checksum inválido é descartado: numa leitura biométrica,
        // aceitar byte corrompido é pior que perder a amostra.
        if (!isValidColmi(bytes)) return;
        this.onColmiFrame(bytes);
      },
    );
    this.subscriptions.push(sub);

    // Bateria primeiro: é a resposta mais simples do protocolo e serve de
    // confirmação de que o canal está vivo antes de pedir o sensor.
    await this.sendColmi(device, askBattery());
    // O histórico traz o que a pulseira mediu enquanto estava sozinha — é o que
    // enche a tela nos primeiros segundos, antes de a medição ao vivo produzir
    // o primeiro valor.
    await this.sendColmi(device, askHeartRateHistory());
    await this.sendColmi(device, startRealtime(REALTIME.heartRate));

    /**
     * Keepalive.
     *
     * Sem ele o sensor desliga poucos segundos depois do START e nenhum valor
     * chega a ser produzido — foi o que o log mostrou: dezenas de `69 01 00 00`
     * seguidos de um `69 01 01 00`, o código de erro encerrando a sessão. O
     * aparelho precisa ser lembrado de continuar.
     */
    this.keepalive = setInterval(() => {
      void this.sendColmi(device, continueRealtime(REALTIME.heartRate));
    }, KEEPALIVE_MS);
  }

  private async sendColmi(device: Device, bytes: Uint8Array) {
    await device
      .writeCharacteristicWithResponseForService(COLMI_UUID.service, COLMI_UUID.write, encodeBase64(bytes))
      .catch((err: unknown) => console.warn('[ble] escrita no canal serial falhou:', err));
  }

  private onColmiFrame(bytes: Uint8Array) {
    const frame = parseFrame(bytes);
    if (__DEV__ && frame.kind === 'unknown') {
      console.log(`[colmi] quadro não mapeado: ${toHex(bytes)}`);
    }

    if (frame.kind === 'battery') {
      this.battery = frame.level;
      return;
    }

    if (frame.kind === 'measuring') {
      if (__DEV__ && frame.code !== 0) console.log(`[colmi] sensor respondeu código ${frame.code}`);
      return;
    }

    if (frame.kind === 'history') {
      // A última amostra da página mais recente serve de valor de partida: é
      // melhor mostrar um batimento medido há minutos do que tela vazia
      // enquanto a medição ao vivo não converge.
      const last = frame.samples.at(-1);
      if (last != null) this.lastBpm = last;
      if (__DEV__ && frame.samples.length) {
        console.log(`[colmi] histórico página ${frame.page}: ${frame.samples.join(', ')} bpm`);
      }
      return;
    }

    if (frame.kind === 'heartRate') {
      this.lastBpm = frame.bpm;
    } else if (frame.kind === 'spo2') {
      this.lastSpo2 = frame.percent;
    } else {
      return;
    }

    if (this.lastBpm == null) return;

    /**
     * HRV fica ZERADO neste caminho, e é uma limitação real do aparelho.
     *
     * O protocolo Colmi entrega batimento já calculado, não os intervalos RR —
     * e sem RR não existe RMSSD. Como o HRV pesa 40% do score de energia, isto
     * não é detalhe: com este hardware o número principal do produto fica
     * apoiado em sinal que ele não mede. Registrado em PLANO.md.
     */
    const reading: Reading = {
      recordedAt: Date.now(),
      heartRate: this.lastBpm,
      // `null`, não zero: o que este aparelho não entrega precisa chegar à tela
      // como ausência. Zero aqui produzia "HRV 0 ms · Pode melhorar" com a
      // mesma tipografia de uma medição real.
      hrvMs: null,
      spo2Pct: this.lastSpo2,
      temperatureC: null,
      steps: null,
      bpSystolic: null,
      bpDiastolic: null,
      stressScore: null,
      respRate: null,
      source: 'staranb',
    };
    this.readingListeners.forEach((l) => l(reading));
  }

  private monitorHeartRate(device: Device) {
    const sub = device.monitorCharacteristicForService(
      UUID.heartRate.service,
      UUID.heartRate.measurement,
      (error, char) => {
        /**
         * O erro da assinatura era ENGOLIDO, e é o diagnóstico mais importante
         * que existe aqui: se a pulseira não expõe 0x180D, este callback dispara
         * uma vez com erro e nunca mais — o app fica em "Aguardando leitura"
         * para sempre, sem nada indicando que o serviço nem existe.
         */
        if (error) {
          /**
           * Loga, mas NÃO derruba a conexão.
           *
           * Marcar 'error' aqui foi um erro meu: o vínculo BLE está de pé, só a
           * assinatura de um serviço falhou. Como consequência o app concluía
           * que não havia pulseira conectada, oferecia "parear" e devolvia a
           * pessoa para a tela de busca num laço — com a pulseira conectada o
           * tempo todo. E derrubava junto o Diagnóstico GATT, que é justamente a
           * ferramenta que precisa da conexão viva para descobrir por que a
           * assinatura falhou.
           *
           * Uma pulseira sem 0x180D é um aparelho conectado do qual ainda não
           * sabemos ler — não é um aparelho desconectado.
           */
          console.warn('[ble] assinatura de frequência cardíaca falhou:', error.message);
          return;
        }
        if (!char?.value) return;

        const { bpm, rrIntervalsMs } = parseHeartRate(decodeBase64(char.value));
        if (rrIntervalsMs.length) {
          this.rr = [...this.rr, ...rrIntervalsMs].slice(-RR_WINDOW);
        }

        /**
         * Sem intervalos RR, a leitura sai MESMO ASSIM — só sem HRV.
         *
         * A versão anterior fazia `if (hrv == null) return`, e isso travava o
         * app inteiro numa condição comum: o campo RR é OPCIONAL na
         * especificação do Bluetooth SIG, e boa parte das pulseiras baratas
         * manda só o BPM. Nessas, `this.rr` nunca enchia, o RMSSD nunca existia
         * e NENHUMA leitura era emitida — com a frequência cardíaca chegando
         * perfeitamente a cada segundo, sem nada na tela e sem erro no log.
         *
         * Zero segue a convenção já usada abaixo para os sinais não mapeados:
         * significa "não medido", não "medido como zero".
         */
        const hrv = rmssd(this.rr);
        if (__DEV__ && hrv == null && !this.warnedNoRr) {
          this.warnedNoRr = true;
          console.warn(
            `[ble] FC recebida (${bpm} bpm) mas sem intervalos RR — esta pulseira não expõe HRV pelo perfil padrão.`,
          );
        }

        const reading: Reading = {
          recordedAt: Date.now(),
          hrvMs: hrv,
          heartRate: bpm,
          // Ausência explícita: este perfil só entrega batimento e RR.
          spo2Pct: null,
          temperatureC: null,
          steps: null,
          bpSystolic: null,
          bpDiastolic: null,
          stressScore: null,
          respRate: null,
          source: 'staranb',
        };
        this.readingListeners.forEach((l) => l(reading));
      },
    );
    this.subscriptions.push(sub);
  }
}

/** Bytes em hexadecimal, para reconhecer o dado sem documentação. */
function toHex(bytes: Uint8Array | number[]): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join(' ');
}

/**
 * Nomes do Bluetooth SIG para os UUIDs padrão.
 *
 * Só os que interessam a um wearable de saúde. O que NÃO aparecer nesta lista é
 * proprietário — e é exatamente o que estamos procurando, então a ausência de
 * nome aqui é o sinal útil, não uma lacuna da tabela.
 */
const SIG_NAMES: Record<string, string> = {
  '1800': 'Generic Access',
  '1801': 'Generic Attribute',
  '180a': 'Device Information',
  '180d': 'Heart Rate',
  '180f': 'Battery',
  '1809': 'Health Thermometer',
  '1822': 'Pulse Oximeter',
  '181b': 'Body Composition',
  '2a19': 'Battery Level',
  '2a37': 'Heart Rate Measurement',
  '2a38': 'Body Sensor Location',
  '2a1c': 'Temperature Measurement',
  '2a5f': 'PLX Continuous Measurement',
  '2a5e': 'PLX Spot-Check Measurement',
  '2a24': 'Model Number',
  '2a26': 'Firmware Revision',
  '2a29': 'Manufacturer Name',
};

function knownName(uuid: string): string | null {
  // UUID de 128 bits que segue a base do SIG carrega o de 16 bits nas posições
  // 5 a 8: 0000180d-0000-1000-8000-00805f9b34fb. Fora desse molde, é custom.
  const lower = uuid.toLowerCase();
  const isSigBase = lower.length === 36 && lower.endsWith('-0000-1000-8000-00805f9b34fb');
  return SIG_NAMES[isSigBase ? lower.slice(4, 8) : lower] ?? null;
}

/** Bytes imprimíveis viram texto; o resto vira ponto. Nome e firmware chegam assim. */
function toAscii(bytes: Uint8Array | number[]): string {
  return Array.from(bytes)
    .map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : '·'))
    .join('');
}

/** O ble-plx só aceita base64 na escrita, e o RN não tem `btoa` nativo. */
function encodeBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const chunk = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += B64[(chunk >> 18) & 63] + B64[(chunk >> 12) & 63];
    out += i + 1 < bytes.length ? B64[(chunk >> 6) & 63] : '=';
    out += i + 2 < bytes.length ? B64[chunk & 63] : '=';
  }
  return out;
}
