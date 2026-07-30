/** Uma leitura instantânea do wearable. Espelha `biometric_readings` no banco. */
/**
 * Uma leitura do wearable.
 *
 * **`null` significa NÃO MEDIDO, e é diferente de zero.** A distinção não é
 * preciosismo: o hardware real entrega um subconjunto do que o produto desenha.
 * O H59 dá batimento e não dá HRV; um relógio futuro pode dar HRV e não dar
 * pressão. Enquanto ausência era representada por `0`, a tela mostrava
 * "HRV 0 ms · Pode melhorar" com a mesma confiança de um valor medido — dado
 * fabricado apresentado como medição, que num produto de saúde é o pior defeito
 * possível.
 *
 * `heartRate` e `recordedAt` não são anuláveis porque uma leitura sem nenhum dos
 * dois não é leitura.
 */
export type Reading = {
  recordedAt: number;
  heartRate: number;
  hrvMs: number | null;
  /**
   * Quando o HRV foi medido — não é o mesmo instante da leitura.
   *
   * Nesta pulseira o HRV vem de medição AGENDADA, enquanto o batimento é
   * contínuo. Sem separar os dois instantes, uma amostra de horas atrás viaja
   * colada em cada batimento novo e a tela a apresenta como se fosse de agora.
   */
  hrvAt?: number;
  spo2Pct: number | null;
  temperatureC: number | null;
  steps: number | null;
  bpSystolic: number | null;
  bpDiastolic: number | null;
  stressScore: number | null;
  respRate: number | null;
  source: 'staranb' | 'healthkit' | 'health-connect' | 'mock';
};

export type SleepPhase = 'rem' | 'deep' | 'light' | 'awake';

/** Um trecho contínuo numa fase. A sequência deles é o hipnograma. */
export type SleepSegment = { phase: SleepPhase; minutes: number };

export type SleepNight = {
  date: string;
  score: number;
  totalMin: number;
  /**
   * Quão CONSOLIDADO foi o sono profundo, de 0 a 100. `null` sem profundo.
   *
   * Separado de `phases.deep` porque responde outra pergunta: aquele é quanto,
   * este é em quantos pedaços. Ver `deepSleepContinuity`.
   */
  deepContinuity: number | null;
  phases: Record<SleepPhase, number>;
  /** Ordem real das fases ao longo da noite — o que revela a arquitetura do sono. */
  segments: SleepSegment[];
  /** SpO₂ amostrado durante a noite, para detectar dessaturação. */
  spo2Night: number[];
};

/** Par sistólica/diastólica de uma aferição. */
export type PressureReading = { systolic: number; diastolic: number; at: string };

export type Activity = {
  steps: number;
  goal: number;
  distanceKm: number;
  activeKcal: number;
  activeMin: number;
};

export type BioAgeFactor = {
  key: 'hrv' | 'sleep' | 'hr' | 'spo2' | 'temp';
  label: string;
  /** Valor do usuário já formatado para exibição. */
  value: string;
  /** Referência da faixa etária, formatada. */
  reference: string;
  /** Anos somados ou subtraídos da idade real. Negativo rejuvenesce. */
  years: number;
};

export type BioAge = {
  realAge: number;
  bioAge: number;
  /** realAge − bioAge. Positivo = mais jovem que a idade cronológica. */
  delta: number;
  factors: BioAgeFactor[];
};

export type Sex = 'f' | 'm';

export type User = {
  name: string;
  birthYear: number;
  sex: Sex;
};
