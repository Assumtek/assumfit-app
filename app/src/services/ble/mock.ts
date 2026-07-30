import type { Reading } from '../../domain/types';
import type { BleService, ConnectionState, DiscoveredDevice } from './types';

const DEVICE: DiscoveredDevice = {
  id: 'E4:C3:B2:A1:00:1F',
  name: 'Staranb ANB-X1',
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
