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
 * A CONSOLIDAÇÃO das duas fontes mora aqui e é uma só: agenda, histórico e
 * progresso leem a mesma linha do tempo. Duas implementações da regra do
 * vínculo (sessão de esporte que cumpre uma execução do plano) divergiriam em
 * silêncio, e o sintoma seria a mesma corrida contando uma vez numa tela e
 * duas em outra.
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

/** O mínimo que uma execução de treino do plano precisa ter para ser contada. */
type ExecutionLike = {
  id?: string;
  status: string;
  startedAt: string;
  durationSec: number | null;
  /** Fração de séries concluídas (0–100), quando o servidor informa. */
  completionPct?: number | null;
};

/** O mínimo de uma sessão do cronômetro de esporte. */
type SportLike = {
  startedAt: string;
  durationS: number;
  /** Estimativa por MET — só o esporte cronometrado produz caloria. */
  kcal?: number;
  workoutExecutionId?: string | null;
};

/**
 * Uma atividade da linha do tempo consolidada, com a origem preservada: quem
 * consome precisa saber se abre o detalhe da execução ou o da sessão, e quais
 * números aquela natureza tem para dar.
 */
export type MovementEntry<T extends ExecutionLike, S extends SportLike> =
  | { tipo: 'treino'; quando: number; treino: T }
  | { tipo: 'esporte'; quando: number; esporte: S };

/**
 * Treino guiado e sessão de esporte na MESMA linha do tempo, do mais recente
 * para o mais antigo.
 *
 * Sessão VINCULADA a uma execução (dia de esporte do plano registrado pelo
 * cronômetro) é o MESMO ato contado por dois sistemas: a execução vinculada
 * sai e vale a sessão, que carrega GPS, caloria e batimento.
 *
 * Não filtra por estado: quem lista histórico quer ver o interrompido, quem
 * soma totais não quer. A decisão é de quem chama.
 */
export function consolidateMovement<T extends ExecutionLike, S extends SportLike>(
  executions: T[],
  sportSessions: S[],
): MovementEntry<T, S>[] {
  const vinculadas = new Set(
    sportSessions.map((s) => s.workoutExecutionId).filter((id): id is string => !!id),
  );
  const entries: MovementEntry<T, S>[] = [
    ...executions
      .filter((treino) => !(treino.id && vinculadas.has(treino.id)))
      .map((treino) => ({ tipo: 'treino' as const, quando: Date.parse(treino.startedAt), treino })),
    ...sportSessions.map((esporte) => ({
      tipo: 'esporte' as const,
      quando: Date.parse(esporte.startedAt),
      esporte,
    })),
  ];
  return entries.sort((a, b) => b.quando - a.quando);
}

/**
 * Treino do plano que CONTA como movimento.
 *
 * Concluído conta. Cancelado não. E o que ficou aberto — esquecido, ou
 * derrubado pelo app antes do "concluir" — conta se houve série feita: um
 * testador (22/08) treinou três dias, o app caiu ao concluir nos três, e o
 * gráfico dizia que ele não tinha se mexido. Série marcada é prova de treino;
 * a conclusão é só o carimbo.
 */
export function treinoConta(treino: ExecutionLike): boolean {
  if (treino.status === 'FINISHED') return true;
  if (treino.status === 'CANCELLED') return false;
  return (treino.completionPct ?? 0) > 0;
}

/** Esporte registrado sempre conta; treino do plano pelas regras de `treinoConta`. */
function counts<T extends ExecutionLike, S extends SportLike>(entry: MovementEntry<T, S>): boolean {
  return entry.tipo === 'esporte' || treinoConta(entry.treino);
}

function entryMinutes<T extends ExecutionLike, S extends SportLike>(
  entry: MovementEntry<T, S>,
): number {
  const segundos = entry.tipo === 'esporte' ? entry.esporte.durationS : (entry.treino.durationSec ?? 0);
  // Concluído sem duração registrada ainda é um treino feito: vale 1 min para
  // acender o dia, em vez de sumir por falta de metadado.
  return Math.max(1, Math.round(segundos / 60));
}

/**
 * Minutos por dia a partir da linha consolidada. Instantes convertidos no fuso
 * local, que é onde a pessoa treinou.
 */
export function dailyMinutes<T extends ExecutionLike, S extends SportLike>(
  entries: MovementEntry<T, S>[],
): Map<string, number> {
  const minutos = new Map<string, number>();
  for (const entry of entries) {
    if (!counts(entry)) continue;
    const chave = dayKey(new Date(entry.quando));
    minutos.set(chave, (minutos.get(chave) ?? 0) + entryMinutes(entry));
  }
  return minutos;
}

/** Minutos de movimento por dia, das duas fontes. */
export function movementMinutes(
  executions: ExecutionLike[],
  sportSessions: SportLike[],
): Map<string, number> {
  return dailyMinutes(consolidateMovement(executions, sportSessions));
}

export type MovementTotals = {
  /** Atividades que contam: treino concluído e sessão de esporte, sem repetir o ato vinculado. */
  atividades: number;
  minutos: number;
  /** Quantas vieram do cronômetro — é o que dá sentido à caloria. */
  esportes: number;
  /** Soma das estimativas por MET. Musculação não produz caloria neste app. */
  kcal: number;
};

/**
 * Os totais do período.
 *
 * Minuto e caloria somam as duas naturezas; volume load (kg × reps) NÃO entra
 * aqui de propósito — uma corrida soma zero carga, e o total misturado diria
 * que a semana de corrida foi uma semana fraca.
 */
export function movementTotals<T extends ExecutionLike, S extends SportLike>(
  entries: MovementEntry<T, S>[],
): MovementTotals {
  const totais: MovementTotals = { atividades: 0, minutos: 0, esportes: 0, kcal: 0 };
  for (const entry of entries) {
    if (!counts(entry)) continue;
    totais.atividades += 1;
    totais.minutos += entryMinutes(entry);
    if (entry.tipo === 'esporte') {
      totais.esportes += 1;
      totais.kcal += entry.esporte.kcal ?? 0;
    }
  }
  return totais;
}

export type SportTally = {
  sport: string;
  sessoes: number;
  minutos: number;
  kcal: number;
  /** Só modalidade com GPS acumula distância; as demais ficam em zero. */
  metros: number;
};

/** O inventário do lado do esporte, da modalidade mais praticada para a menos. */
export function sportBreakdown(
  sessions: { sport: string; durationS: number; kcal?: number; distanceM?: number | null }[],
): SportTally[] {
  const porModalidade = new Map<string, SportTally>();
  for (const s of sessions) {
    const tally = porModalidade.get(s.sport) ?? {
      sport: s.sport,
      sessoes: 0,
      minutos: 0,
      kcal: 0,
      metros: 0,
    };
    tally.sessoes += 1;
    tally.minutos += Math.max(1, Math.round(s.durationS / 60));
    tally.kcal += s.kcal ?? 0;
    tally.metros += s.distanceM ?? 0;
    porModalidade.set(s.sport, tally);
  }
  return [...porModalidade.values()].sort((a, b) => b.minutos - a.minutos);
}

/** Atividades por dia da SEMANA, domingo na posição 0 — a ordem de `Date.getDay`. */
export function weekdayTally<T extends ExecutionLike, S extends SportLike>(
  entries: MovementEntry<T, S>[],
): number[] {
  const dias = new Array(7).fill(0) as number[];
  for (const entry of entries) {
    if (!counts(entry)) continue;
    dias[new Date(entry.quando).getDay()] += 1;
  }
  return dias;
}

export type SeriesPoint = {
  /** Rótulo do balde no eixo do gráfico. */
  label: string;
  value: number;
};

/** Ponto de série semanal — o rótulo é o dia/mês da segunda-feira ("4/8"). */
export type WeekPoint = SeriesPoint;

/**
 * Minutos de movimento por DIA do período, do mais antigo até hoje. Rótulo é o
 * dia do mês, como o eixo do volume por dia.
 */
export function movementSeries<T extends ExecutionLike, S extends SportLike>(
  entries: MovementEntry<T, S>[],
  dias: number,
  hoje: Date,
): SeriesPoint[] {
  const minutos = dailyMinutes(entries);
  const inicio = new Date(hoje);
  inicio.setHours(0, 0, 0, 0);
  inicio.setDate(inicio.getDate() - (dias - 1));

  return Array.from({ length: dias }, (_, i) => {
    const data = new Date(inicio);
    data.setDate(inicio.getDate() + i);
    return {
      label: String(data.getDate()).padStart(2, '0'),
      value: minutos.get(dayKey(data)) ?? 0,
    };
  });
}

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
