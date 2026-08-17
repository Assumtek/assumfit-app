/**
 * Ciclos de sono — por que acordar às 6h30 pode ser melhor que acordar às 7h.
 *
 * O sono se organiza em ciclos de cerca de 90 minutos, e acordar NO FIM de um
 * ciclo (sono leve) é diferente de acordar no meio de um (sono profundo): a
 * mesma quantidade de horas rende disposição diferente conforme onde o
 * despertador cai. É o que esta tela entrega — não mais horas, e sim a hora
 * certa.
 *
 * Os números são médias populacionais, e a tela DIZ isso: ciclo de 90 min e
 * 15 min para pegar no sono são referência de fisiologia do sono, não medição
 * desta pessoa. O produto é de bem-estar e não faz diagnóstico; sugerir hora
 * de acordar é organização de rotina, não tratamento.
 *
 * Módulo de domínio puro: minutos entram, minutos saem. Sem React e sem
 * relógio interno — a hora atual é sempre um parâmetro, o que torna cada faixa
 * testável sem simular o tempo.
 */

/** Duração média de um ciclo completo. */
export const CICLO_MIN = 90;
/** Tempo médio para pegar no sono depois de deitar. */
export const LATENCIA_MIN = 15;

/** Quantos ciclos valem a pena sugerir: 4 é o mínimo aceitável, 6 o ideal. */
export const CICLOS_SUGERIDOS = [6, 5, 4] as const;

export type SleepOption = {
  /** Minutos desde a meia-noite, já normalizado em 24 h. */
  minutes: number;
  /** `22:45`. */
  label: string;
  cycles: number;
  /** Horas de sono efetivo (sem a latência), para a tela dizer o que entrega. */
  hours: number;
};

const DIA = 24 * 60;

/** `1365` → `22:45`. Normaliza a volta do dia sozinho. */
export function formatMinutes(minutes: number): string {
  const m = ((minutes % DIA) + DIA) % DIA;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** `22:45` → `1365`. Entrada inválida devolve `null` em vez de NaN. */
export function parseMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/**
 * A que horas acordar, se for deitar AGORA (ou no horário informado).
 *
 * A latência entra na conta: quem deita 23h não começa o ciclo às 23h. Da
 * melhor para a menos boa — seis ciclos primeiro, porque é a que a pessoa
 * escolhe quando pode.
 */
export function wakeOptions(bedMinutes: number): SleepOption[] {
  return CICLOS_SUGERIDOS.map((cycles) => {
    const dormindo = cycles * CICLO_MIN;
    const minutes = (bedMinutes + LATENCIA_MIN + dormindo) % DIA;
    return { minutes, label: formatMinutes(minutes), cycles, hours: dormindo / 60 };
  });
}

/**
 * A que horas deitar, para acordar no horário desejado.
 *
 * O inverso do anterior, e o mais usado dos dois: quase todo mundo tem hora
 * marcada para acordar e escolhe a hora de deitar.
 */
export function bedOptions(wakeMinutes: number): SleepOption[] {
  return CICLOS_SUGERIDOS.map((cycles) => {
    const dormindo = cycles * CICLO_MIN;
    const minutes = ((wakeMinutes - LATENCIA_MIN - dormindo) % DIA + DIA) % DIA;
    return { minutes, label: formatMinutes(minutes), cycles, hours: dormindo / 60 };
  });
}

/** `7.5` → `7h30`; `6` → `6h`. Nunca "7.5 horas" na tela. */
export function formatHours(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`;
}

/**
 * A leitura humana de cada opção — a avaliação em destaque, o número como
 * sub-rótulo, como em toda métrica do app.
 */
export function cycleLabel(cycles: number): string {
  if (cycles >= 6) return 'noite completa';
  if (cycles === 5) return 'boa noite';
  return 'mínimo aceitável';
}
