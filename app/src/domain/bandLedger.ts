/**
 * O livro-razão da pulseira: o que ela entregou hoje, grandeza por grandeza.
 *
 * A tela de Dispositivo foi refeita (22/08/2026) em volta de UMA pergunta:
 * "o que já chegou e o que falta?". Antes, isso só existia durante a
 * sincronização, como lista de etapas, e sumia ao terminar — quem abria a
 * tela cinco minutos depois via "conectada" e nada mais. Aqui cada grandeza
 * tem a hora da última chegada, ou o traço honesto de que nada veio.
 *
 * Módulo de domínio puro: recebe as séries que a store já guarda e devolve
 * linhas prontas para a tela. "Hoje" é do calendário local.
 */

import type { SyncStep } from '../services/ble';
import type { PressureReading, SleepNight } from './types';

export type Amostra = { at: number; value: number };

export type EntradaDoRazao = {
  step: SyncStep;
  label: string;
  /** Epoch ms da última chegada de hoje; `null` quando nada chegou. */
  lastAt: number | null;
  /** Resumo curto do que chegou ("96 amostras", "1 noite"). `null` sem dado. */
  resumo: string | null;
};

export type SeriesDaPulseira = {
  hrHistory: Amostra[];
  hrvHistory: Amostra[];
  stressHistory: Amostra[];
  spo2History: Amostra[];
  pressureHistory: PressureReading[];
  /**
   * Total de passos de HOJE (`activity.steps`), não a série por hora: a série
   * guarda totais acumulados, e somá-la deu "203.057 até agora" na primeira
   * inspeção. O total já existe; o razão só o cita.
   */
  stepsToday: number;
  sleep: SleepNight | null;
  /** Quando a última sincronização terminou — é a hora em que os passos "chegaram". */
  syncedAt: number | null;
};

export const ORDEM_DO_RAZAO: { step: SyncStep; label: string }[] = [
  { step: 'heartRate', label: 'Batimentos' },
  { step: 'hrv', label: 'Variabilidade cardíaca' },
  { step: 'stress', label: 'Estresse' },
  { step: 'spo2', label: 'Oxigenação' },
  { step: 'pressure', label: 'Pressão' },
  { step: 'steps', label: 'Passos' },
  { step: 'sleep', label: 'Sono da noite' },
];

function inicioDoDia(agora: number): number {
  const d = new Date(agora);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function ultimaDeHoje(amostras: Amostra[], desde: number): { at: number; n: number } | null {
  let at = 0;
  let n = 0;
  for (const a of amostras) {
    if (a.at >= desde && Number.isFinite(a.at)) {
      n += 1;
      if (a.at > at) at = a.at;
    }
  }
  return n > 0 ? { at, n } : null;
}

function plural(n: number, um: string, muitos: string): string {
  return `${n} ${n === 1 ? um : muitos}`;
}

export function entregasDaPulseira(series: SeriesDaPulseira, agora = Date.now()): EntradaDoRazao[] {
  const desde = inicioDoDia(agora);

  const porSerie = (step: SyncStep, amostras: Amostra[]): EntradaDoRazao => {
    const u = ultimaDeHoje(amostras, desde);
    return {
      step,
      label: ORDEM_DO_RAZAO.find((o) => o.step === step)!.label,
      lastAt: u?.at ?? null,
      resumo: u ? plural(u.n, 'amostra', 'amostras') : null,
    };
  };

  const pressao = series.pressureHistory
    .map((p) => ({ at: Date.parse(p.at), value: p.systolic }))
    .filter((p) => Number.isFinite(p.at));

  const totalPassos = Math.max(0, Math.round(series.stepsToday));

  // A noite "de hoje" é a que sustenta o dia: começou ontem à tarde e acabou
  // hoje de manhã. `date` é a tarde em que começou, então ontem conta.
  const ontem = new Date(desde - 1);
  const dataDeOntem = `${ontem.getFullYear()}-${String(ontem.getMonth() + 1).padStart(2, '0')}-${String(ontem.getDate()).padStart(2, '0')}`;
  const noiteDeHoje = series.sleep && (series.sleep.date === dataDeOntem || (series.sleep.endAt ?? 0) >= desde);

  return [
    porSerie('heartRate', series.hrHistory),
    porSerie('hrv', series.hrvHistory),
    porSerie('stress', series.stressHistory),
    porSerie('spo2', series.spo2History),
    porSerie('pressure', pressao),
    {
      step: 'steps',
      label: 'Passos',
      // Os passos não têm carimbo próprio: a hora é a da sincronização que os
      // trouxe. Sem sincronização ainda, há o total (ao vivo) e não há hora —
      // e a tela diz "hoje" em vez de inventar minuto.
      lastAt: totalPassos > 0 ? series.syncedAt : null,
      resumo: totalPassos > 0 ? `${totalPassos.toLocaleString('pt-BR')} até agora` : null,
    },
    {
      step: 'sleep',
      label: 'Sono da noite',
      lastAt: noiteDeHoje ? (series.sleep!.endAt ?? desde) : null,
      resumo: noiteDeHoje
        ? `${Math.floor(series.sleep!.totalMin / 60)}h ${String(series.sleep!.totalMin % 60).padStart(2, '0')}m`
        : null,
    },
  ];
}

/** Quantas grandezas já chegaram hoje — o número que a faixa de instrumento mostra. */
export function chegaramHoje(entradas: EntradaDoRazao[]): number {
  return entradas.filter((e) => e.lastAt != null || e.resumo != null).length;
}

/** As que ainda não chegaram, pelo nome — para a explicação citar só o que falta. */
export function faltamHoje(entradas: EntradaDoRazao[]): string[] {
  return entradas.filter((e) => e.lastAt == null && e.resumo == null).map((e) => e.label);
}
