import type { Reading } from '../../domain/types';
import type { BandActivity, BleService, ConnectionState, DayHistory, DiscoveredDevice, SyncStep } from './types';

const DEVICE: DiscoveredDevice = {
  id: 'E4:C3:B2:A1:00:1F',
  name: 'AssumFit Watch',
  rssi: -58,
};

/** Passeio aleatório limitado, para o valor variar sem sair da faixa fisiológica. */
function drift(value: number, step: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value + (Math.random() - 0.5) * step));
}

/**
 * Wearable simulado. Serve para desenvolver e testar todas as telas antes do
 * hardware chegar — e depois continua útil no simulador, onde não há BLE.
 */
export class MockBleService implements BleService {
  private state: ConnectionState = 'idle';
  private stateListeners = new Set<(s: ConnectionState) => void>();
  private readingListeners = new Set<(r: Reading) => void>();
  private activityListeners = new Set<(a: BandActivity | null) => void>();
  /** O filtro de avisos que o mock "guarda", para a seção da tela existir em desenvolvimento. */
  private filtro: { type: number; enabled: boolean }[] = [
    { type: 0, enabled: true },
    { type: 1, enabled: false },
    { type: 5, enabled: true },
    { type: 12, enabled: false },
    { type: 23, enabled: false },
    { type: 15, enabled: false },
    { type: 16, enabled: false },
    { type: 17, enabled: false },
  ];
  private timer: ReturnType<typeof setInterval> | null = null;

  private hrv = 72;
  private hr = 58;
  private spo2 = 98;
  private temp = 36.6;
  private stress = 28;
  private steps = 7842;

  private setState(state: ConnectionState) {
    this.state = state;
    this.stateListeners.forEach((l) => l(state));
  }

  scan(onDevice: (device: DiscoveredDevice) => void): () => void {
    this.setState('scanning');
    const t = setTimeout(() => onDevice(DEVICE), 900);
    return () => clearTimeout(t);
  }

  async connect(_deviceId: string): Promise<void> {
    this.setState('connecting');
    await new Promise((resolve) => setTimeout(resolve, 1800));
    this.setState('connected');
    this.start();
  }

  async findDevice(): Promise<boolean> {
    // O simulado "vibra" com sucesso — é o que deixa testar a tela sem hardware.
    return true;
  }

  async disconnect(): Promise<void> {
    this.stop();
    this.setState('idle');
  }

  subscribe(onReading: (reading: Reading) => void): () => void {
    this.readingListeners.add(onReading);
    // O mock existe para as telas serem desenvolvidas sem hardware, então ele
    // começa a emitir assim que alguém escuta — exigir o fluxo de pareamento
    // antes de qualquer dado derrotaria o propósito. O serviço real só emite
    // depois de conectar de verdade.
    this.start();
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

  onActivity(listener: (activity: BandActivity | null) => void): () => void {
    this.activityListeners.add(listener);
    return () => this.activityListeners.delete(listener);
  }

  private emitActivity(a: BandActivity | null) {
    this.activityListeners.forEach((l) => l(a));
  }

  /**
   * A memória do dia, NARRADA etapa a etapa como a pulseira real — seis
   * consultas, ~700 ms cada. Sem isto a tela de Dispositivo nunca mostrava o
   * estado "sincronizando" em desenvolvimento (revisão de acabamento, 22/08),
   * e o coração dela era código não visto. Devolve séries pequenas e
   * plausíveis, carimbadas em hoje.
   */
  async fetchHistory(): Promise<DayHistory> {
    const etapas: SyncStep[] = ['heartRate', 'hrv', 'stress', 'spo2', 'pressure', 'steps'];
    for (let i = 0; i < etapas.length; i++) {
      this.emitActivity({ kind: 'sync', step: etapas[i], done: i + 1, total: etapas.length });
      await new Promise((r) => setTimeout(r, 700));
    }
    this.emitActivity(null);
    const agora = Date.now();
    const serie = (n: number, base: number, amp: number, passoMin: number) =>
      Array.from({ length: n }, (_, i) => ({ at: agora - (n - i) * passoMin * 60_000, value: Math.round(base + Math.sin(i) * amp) }));
    return {
      heartRate: serie(48, 64, 8, 5),
      hrv: serie(6, 70, 12, 60),
      stress: serie(6, 35, 10, 60),
      spo2: serie(4, 97, 1, 90),
      pressure: [{ at: agora - 3 * 3_600_000, systolic: 118, diastolic: 76 }],
      steps: Array.from({ length: 8 }, (_, i) => ({ at: agora - (8 - i) * 3_600_000, steps: 400 + i * 120 })),
    };
  }

  async getNotificationFilter(): Promise<{ type: number; enabled: boolean }[]> {
    return this.filtro.map((f) => ({ ...f }));
  }

  async setNotificationFilter(entries: { type: number; enabled: boolean }[]): Promise<boolean> {
    this.filtro = entries.map((f) => ({ ...f }));
    return true;
  }

  async enableAncs(): Promise<boolean> {
    return true;
  }

  getBatteryLevel(): number {
    return 87;
  }

  private start() {
    if (this.timer) return;
    this.emit();
    this.timer = setInterval(() => this.emit(), 1800);
  }

  private stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private emit() {
    this.hrv = drift(this.hrv, 2.8, 35, 105);
    this.hr = drift(this.hr, 1.5, 44, 88);
    this.spo2 = drift(this.spo2, 0.25, 95, 99);
    this.temp = drift(this.temp, 0.06, 35.8, 37.4);
    this.stress = drift(this.stress, 3, 15, 65);
    this.steps += Math.round(Math.random() * 6);

    const reading: Reading = {
      recordedAt: Date.now(),
      hrvMs: this.hrv,
      heartRate: this.hr,
      spo2Pct: this.spo2,
      temperatureC: this.temp,
      steps: this.steps,
      bpSystolic: 118,
      bpDiastolic: 76,
      stressScore: this.stress,
      respRate: 14,
      source: 'mock',
    };
    this.readingListeners.forEach((l) => l(reading));
  }
}
