import { WEEK_ORDER } from './workout';

/**
 * Agenda de movimento: a semana como sequência (streak) de dias em que a
 * pessoa DE FATO se mexeu — treino do plano CONCLUÍDO ou sessão de esporte
 * registrada. É o oposto complementar da agenda de plano: aquela mostrava o
 * combinado, esta mostra o cumprido.
 *
 * A unidade é MINUTO por dia, não sim/não: é o que dá altura às barras do
 * card. A primeira versão contava dias pelo agregado de volume (kg × reps) do
 * dashboard — e uma sessão de corrida concluída, feita de blocos por tempo,
 * somava zero volume e ficava invisível. Visto em produção no primeiro treino
 * do plano de corrida (ago/2026).
 *
 * Módulo de domínio puro: recebe datas, devolve estrutura. Nada de React,
 * nada de paleta — roda em teste sem montar componente.
 */

export type MovementDay = {
  /** Dia da semana, na ordem de exibição (segunda primeiro). */
  weekday: (typeof WEEK_ORDER)[number];
  /** Minutos de movimento registrados no dia. */
  minutos: number;
  /** Houve treino ou esporte neste dia. */
  feito: boolean;
  ehHoje: boolean;
  /** Ainda não chegou — não conta a favor nem contra a sequência. */
  futuro: boolean;
};

export type MovementWeek = {
  /**
   * Dias consecutivos com movimento, terminando hoje ou ontem. Hoje ainda em
   * branco NÃO zera a sequência — igual à streak do Duolingo, o dia corrente
   * é uma chance, não uma falta.
   */
  streak: number;
  /** Hoje já tem movimento registrado. */
  hojeFeito: boolean;
  dias: MovementDay[];
};

/** `YYYY-MM-DD` no fuso LOCAL do aparelho — a chave canônica de "dia". */
export function dayKey(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/**
 * Minutos de movimento por dia, das duas fontes: execuções de treino do plano
 * (só as CONCLUÍDAS — cancelada ou esquecida aberta não é movimento) e
 * sessões de esporte. Instantes convertidos no fuso local, que é onde a
 * pessoa treinou.
 *
 * Sessão VINCULADA a uma execução (dia de esporte do plano registrado pelo
 * cronômetro) é o MESMO ato contado por dois sistemas: a execução vinculada é
 * ignorada e vale a sessão, que carrega GPS, caloria e batimento.
 */
export function movementMinutes(
  executions: { id?: string; status: string; startedAt: string; durationSec: number | null }[],
  sportSessions: { startedAt: string; durationS: number; workoutExecutionId?: string | null }[],
): Map<string, number> {
  const minutos = new Map<string, number>();
  const somar = (iso: string, min: number) => {
    const chave = dayKey(new Date(iso));
    minutos.set(chave, (minutos.get(chave) ?? 0) + min);
  };

  const vinculadas = new Set(
    sportSessions.map((s) => s.workoutExecutionId).filter((id): id is string => !!id),
  );

  for (const e of executions) {
    if (e.status !== 'FINISHED') continue;
    if (e.id && vinculadas.has(e.id)) continue;
    // Concluído sem duração registrada ainda é um treino feito: vale 1 min
    // para acender o dia, em vez de sumir por falta de metadado.
    somar(e.startedAt, Math.max(1, Math.round((e.durationSec ?? 0) / 60)));
  }
  for (const s of sportSessions) {
    somar(s.startedAt, Math.max(1, Math.round(s.durationS / 60)));
  }
  return minutos;
}

export type WeekPoint = {
  /** Rótulo da semana: o dia/mês da segunda-feira ("4/8"). */
  label: string;
  value: number;
};

/**
 * Série semanal para gráfico de evolução: soma `value` por semana (segunda a
 * domingo, fuso local), das `semanas-1` anteriores até a corrente — a última
 * posição é SEMPRE a semana atual, ainda em curso.
 */
export function weeklySeries(
  pontos: { date: Date; value: number }[],
  semanas: number,
  hoje: Date,
): WeekPoint[] {
  const segunda = new Date(hoje);
  segunda.setHours(0, 0, 0, 0);
  segunda.setDate(segunda.getDate() - ((segunda.getDay() + 6) % 7));

  const inicio = new Date(segunda);
  inicio.setDate(inicio.getDate() - 7 * (semanas - 1));

  const buckets = Array.from({ length: semanas }, (_, i) => {
    const d = new Date(inicio);
    d.setDate(inicio.getDate() + i * 7);
    return { label: `${d.getDate()}/${d.getMonth() + 1}`, value: 0 };
  });

  for (const p of pontos) {
    const idx = Math.floor((p.date.getTime() - inicio.getTime()) / (7 * 86_400_000));
    if (idx >= 0 && idx < semanas && Number.isFinite(p.value)) {
      buckets[idx].value += p.value;
    }
  }
  return buckets;
}

/**
 * Monta a semana corrente (segunda a domingo) e conta a sequência.
 *
 * A sequência enxerga só o que o mapa contém: quem busca 90 dias de histórico
 * conta no máximo 90 — limite da janela, não do hábito.
 */
export function buildMovementWeek(minutos: Map<string, number>, hoje: Date): MovementWeek {
  const segunda = new Date(hoje);
  segunda.setHours(0, 0, 0, 0);
  segunda.setDate(segunda.getDate() - ((segunda.getDay() + 6) % 7));

  const chaveHoje = dayKey(hoje);
  const dias: MovementDay[] = WEEK_ORDER.map((weekday, i) => {
    const data = new Date(segunda);
    data.setDate(segunda.getDate() + i);
    const chave = dayKey(data);
    const min = minutos.get(chave) ?? 0;
    return {
      weekday,
      minutos: min,
      feito: min > 0,
      ehHoje: chave === chaveHoje,
      futuro: chave > chaveHoje,
    };
  });

  const hojeFeito = (minutos.get(chaveHoje) ?? 0) > 0;

  // Anda para trás a partir de hoje (se feito) ou de ontem (se hoje ainda
  // está em aberto), somando dias consecutivos presentes no mapa.
  let streak = 0;
  const cursor = new Date(hoje);
  cursor.setHours(0, 0, 0, 0);
  if (!hojeFeito) cursor.setDate(cursor.getDate() - 1);
  while ((minutos.get(dayKey(cursor)) ?? 0) > 0) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return { streak, hojeFeito, dias };
}
