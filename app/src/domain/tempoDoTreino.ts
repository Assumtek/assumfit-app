import type { WorkoutDetail, WorkoutExercise, WorkoutPhase } from '../services/api.service';

/**
 * Caber o treino no tempo que a pessoa tem hoje.
 *
 * Pedido de testador: "tenho 30 min hoje para treinar" e o app adaptar. O plano
 * é prescrito para uma duração típica, e quem tem metade do tempo hoje ou faz
 * pela metade sem critério, ou não treina.
 *
 * **Isto NÃO prescreve.** Não escolhe exercício novo, não muda carga, não
 * inventa substituto: só decide o que do que já foi prescrito cabe no tempo, e
 * a única direção possível é para MENOS. Reduzir volume é sempre mais
 * conservador que o plano original, e é o que permite fazer esta conta no
 * aparelho, sem passar pelas travas clínicas que a geração exige.
 *
 * A ordem do corte é a ordem inversa da prescrição, e isso não é arbitrário: o
 * gerador põe o que mais importa primeiro, dentro de cada fase, e os
 * acessórios no fim.
 */

/** Quanto tempo uma série leva, fora o descanso. */
const SEGUNDOS_POR_SERIE = 45;
/** Descanso presumido quando a prescrição não diz. */
const DESCANSO_PADRAO_S = 60;
/** Transição entre exercícios: buscar o aparelho, ajustar a carga. */
const TROCA_DE_EXERCICIO_S = 60;

export type ExercicioAdaptado = {
  id: string;
  /** Quantas séries fazer hoje. Igual ao prescrito quando o tempo permite. */
  series: number;
  /** `true` quando ele saiu por falta de tempo. */
  cortado: boolean;
};

export type TreinoAdaptado = {
  exercicios: ExercicioAdaptado[];
  minutosEstimados: number;
  /** Quantos exercícios saíram inteiros, e quantos perderam séries. */
  exerciciosCortados: number;
  seriesCortadas: number;
};

/** Quanto tempo UM exercício leva, com o número de séries dado. */
export function minutosDoExercicio(ex: WorkoutExercise, series?: number): number {
  if (ex.subtype === 'CARDIO') return ex.duration ?? 0;
  if (ex.subtype === 'MOBILITY') {
    // Mobilidade é sustentação, e o tempo está em segundos por repetição.
    const total = (ex.holdTime ?? 30) * Math.max(1, ex.sets?.length ?? 1);
    return total / 60;
  }
  const quantas = series ?? Math.max(1, ex.sets?.length ?? 1);
  const descanso = ex.sets?.[0]?.restTime ?? DESCANSO_PADRAO_S;
  // A última série não tem descanso depois: quem termina vai para o próximo.
  const segundos = quantas * SEGUNDOS_POR_SERIE + Math.max(0, quantas - 1) * descanso;
  return segundos / 60;
}

/** A duração do treino como ele foi prescrito. */
export function minutosDoTreino(workout: WorkoutDetail): number {
  let total = 0;
  for (const fase of workout.phases) {
    for (const ex of fase.exercises) total += minutosDoExercicio(ex) + TROCA_DE_EXERCICIO_S / 60;
  }
  return Math.round(total);
}

/**
 * O preparo NÃO é cortado.
 *
 * Alongamento e aquecimento são o que protege quem vai levantar carga, e são
 * justamente a parte barata em tempo. Cortar o preparo para ganhar cinco
 * minutos é economizar na única parte que existe para evitar lesão.
 */
function ehPreparo(fase: WorkoutPhase): boolean {
  return fase.type === 'ALONGAMENTO';
}

export function adaptarAoTempo(workout: WorkoutDetail, minutosDisponiveis: number): TreinoAdaptado {
  const todos = workout.phases.flatMap((f) =>
    f.exercises.map((ex) => ({ ex, preparo: ehPreparo(f) })));

  // Todo mundo entra com o prescrito, e o corte acontece depois: é mais fácil
  // de ler e de testar que montar a lista já reduzida.
  const plano = new Map<string, number>(
    todos.map(({ ex }) => [ex.id, Math.max(1, ex.sets?.length ?? 1)]));
  const fora = new Set<string>();

  const estimar = () => {
    let total = 0;
    for (const { ex } of todos) {
      if (fora.has(ex.id)) continue;
      total += minutosDoExercicio(ex, plano.get(ex.id)) + TROCA_DE_EXERCICIO_S / 60;
    }
    return total;
  };

  /*
   Duas passadas, nesta ordem: primeiro tira SÉRIES dos exercícios (mantendo
   pelo menos uma de cada), depois tira exercícios inteiros. Fazer treino
   inteiro com menos série de cada é mais perto do que foi prescrito do que
   fazer metade dos exercícios com todas as séries.
  */
  const cortaveis = todos.filter(({ preparo }) => !preparo).reverse();

  for (const { ex } of cortaveis) {
    while (estimar() > minutosDisponiveis && (plano.get(ex.id) ?? 1) > 1) {
      plano.set(ex.id, (plano.get(ex.id) ?? 1) - 1);
    }
    if (estimar() <= minutosDisponiveis) break;
  }

  for (const { ex } of cortaveis) {
    if (estimar() <= minutosDisponiveis) break;
    // O ÚLTIMO exercício da parte principal não sai: um treino sem nenhum
    // exercício principal não é um treino curto, é outra coisa.
    if (cortaveis.filter(({ ex: e }) => !fora.has(e.id)).length <= 1) break;
    fora.add(ex.id);
  }

  const prescritas = (ex: WorkoutExercise) => Math.max(1, ex.sets?.length ?? 1);
  return {
    exercicios: todos.map(({ ex }) => ({
      id: ex.id,
      series: fora.has(ex.id) ? 0 : (plano.get(ex.id) ?? 1),
      cortado: fora.has(ex.id),
    })),
    minutosEstimados: Math.round(estimar()),
    exerciciosCortados: fora.size,
    seriesCortadas: todos
      .filter(({ ex }) => !fora.has(ex.id))
      .reduce((s, { ex }) => s + (prescritas(ex) - (plano.get(ex.id) ?? 0)), 0),
  };
}
