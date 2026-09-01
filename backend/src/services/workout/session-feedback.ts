import axios from 'axios';

import { env } from '../../lib/env';
import { prisma } from '../../lib/prisma';

/**
 * O comentário do treino recém-concluído, redigido pelo modelo.
 *
 * Pedido de testador (Leonardo, 31/08/2026): "ao concluir um treino completo,
 * executar uma IA e dar um feedback do treino com base nos dados coletados".
 *
 * **Rota separada do `finish`, e não parte dele.** Concluir precisa responder
 * rápido, porque a pessoa está parada esperando a tela virar; o comentário
 * depende de uma ida ao modelo, que leva segundos e pode falhar. Juntos, uma
 * indisponibilidade do modelo faria a conclusão do treino falhar, o que é
 * inaceitável: o treino aconteceu, e registrar isso não pode depender de IA.
 *
 * Os números saem todos do banco, e nenhum é estimado aqui: o modelo REDIGE
 * sobre fatos apurados, como no bom dia e na frase da home.
 */

export type ComentarioDaSessao = { headline: string; body: string } | null;

/** A carga total de uma execução: carga vezes repetições das séries feitas. */
async function volumeDaExecucao(executionId: string): Promise<number | null> {
  const series = await prisma.exerciseExecution.findMany({
    where: { executionId, load: { not: null } },
    select: { load: true, repetitions: true },
  });
  const total = series.reduce((soma, s) => soma + (s.load ?? 0) * (s.repetitions ?? 0), 0);
  return total > 0 ? Math.round(total) : null;
}

export async function comentarioDaSessao(
  userId: string,
  executionId: string): Promise<ComentarioDaSessao> {
  const execucao = await prisma.workoutExecution.findFirst({
    where: { id: executionId, userId },
    select: {
      id: true,
      workoutId: true,
      durationSec: true,
      completionPct: true,
      perceivedEffort: true,
      rating: true,
      startedAt: true,
      finishedAt: true,
      workout: { select: { name: true } },
    },
  });
  if (!execucao || !execucao.durationSec) return null;

  const [volume, anterior, exercicios] = await Promise.all([
    volumeDaExecucao(execucao.id),
    /*
     A última vez NESTE mesmo treino, que é a comparação que interessa: dizer
     que a carga subiu em relação a um treino de outro grupo muscular seria
     comparar coisas diferentes.
    */
    prisma.workoutExecution
      .findFirst({
        where: {
          userId,
          workoutId: execucao.workoutId,
          status: 'FINISHED',
          id: { not: execucao.id },
        },
        orderBy: { finishedAt: 'desc' },
        select: { id: true },
      })
      .then((e) => (e ? volumeDaExecucao(e.id) : null)),
    prisma.exerciseExecution.count({ where: { executionId: execucao.id } }),
  ]);

  /*
   Batimento médio da JANELA da sessão. Sem pulseira não há leitura, e o campo
   sai do prompt em vez de virar zero.
  */
  const bpm = await prisma.biometricReading.aggregate({
    where: {
      userId,
      recordedAt: { gte: execucao.startedAt, lte: execucao.finishedAt ?? new Date() },
      heartRate: { not: null },
    },
    _avg: { heartRate: true },
  });

  try {
    const { data } = await axios.post<{ headline: string; body: string }>(
      `${env.AI_SERVICE_URL}/workout/feedback`,
      {
        workout_name: execucao.workout.name,
        duration_min: Math.round(execucao.durationSec / 60),
        completion_pct: execucao.completionPct != null ? Math.round(execucao.completionPct) : null,
        effort: execucao.perceivedEffort,
        rating: execucao.rating,
        volume_kg: volume,
        exercises: exercicios > 0 ? exercicios : null,
        previous_volume_kg: anterior,
        avg_bpm: bpm._avg.heartRate != null ? Math.round(bpm._avg.heartRate) : null,
      },
      { timeout: 20_000 },
    );
    return data;
  } catch (err) {
    /*
     Silêncio é o desfecho certo aqui. Sem crédito, sem modelo ou com o serviço
     fora, a tela de fim de treino simplesmente não mostra o bloco, e a sessão
     concluída continua registrada com todos os seus números.
    */
    console.warn('[workout-feedback] indisponível:', err instanceof Error ? err.message : err);
    return null;
  }
}
