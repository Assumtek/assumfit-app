import { consolidateMovement, movementTotals, treinoConta } from './movement';

/**
 * Os números da semana, calculados no aparelho: o que aconteceu, antes de
 * qualquer interpretação. O texto com as ações vem do modelo (rota de
 * insights); sem modelo, a tela mostra só estes números.
 *
 * Pedido de testador (Leonardo, 22/08): todo domingo, um resumo da semana com
 * visão consolidada e ações, levando em conta os feedbacks das atividades.
 */
export type ResumoDaSemana = {
  atividades: number;
  minutos: number;
  esportes: number;
  kcal: number;
  /** Média das notas dadas ao concluir (1 a 5), quando houve. */
  notaMedia: number | null;
  sonoMedio: number | null;
  sonoMinutosMedio: number | null;
  passosMedio: number | null;
  aguaMediaMl: number | null;
  diasComAgua: number;
};

type Execucao = { id?: string; status: string; startedAt: string; durationSec: number | null; completionPct?: number | null; rating?: number | null };
type Sessao = { startedAt: string; durationS: number; kcal?: number; workoutExecutionId?: string | null; rating?: number | null };
type Dia = { sleep_score: number | null; sleep_minutes: number | null; steps: number | null };

function media(valores: (number | null | undefined)[]): number | null {
  const v = valores.filter((x): x is number => typeof x === 'number' && Number.isFinite(x));
  return v.length ? Math.round(v.reduce((s, x) => s + x, 0) / v.length) : null;
}

export function resumoDaSemana(execucoes: Execucao[], sessoes: Sessao[], dias: Dia[], aguaPorDia: number[]): ResumoDaSemana {
  const linha = consolidateMovement(execucoes, sessoes);
  const t = movementTotals(linha);
  const notas = [...execucoes.filter(treinoConta).map((e) => e.rating), ...sessoes.map((s) => s.rating)];
  const agua = aguaPorDia.filter((ml) => ml > 0);
  return {
    atividades: t.atividades,
    minutos: t.minutos,
    esportes: t.esportes,
    kcal: t.kcal,
    notaMedia: media(notas),
    sonoMedio: media(dias.map((d) => d.sleep_score)),
    sonoMinutosMedio: media(dias.map((d) => d.sleep_minutes)),
    passosMedio: media(dias.map((d) => d.steps)),
    aguaMediaMl: agua.length ? Math.round(agua.reduce((s, x) => s + x, 0) / agua.length) : null,
    diasComAgua: agua.length,
  };
}
