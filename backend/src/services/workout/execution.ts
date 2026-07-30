import { DayOfWeek, TrainingPlanStatus, WorkoutExecutionStatus } from '@prisma/client';

import { conflict, notFound } from '../../lib/errors';
import { prisma } from '../../lib/prisma';

/**
 * A sessão de treino: check-in, séries concluídas, encerramento.
 *
 * A regra que organiza este arquivo é **uma sessão em andamento por pessoa**.
 * Sem ela, o app precisa decidir qual das duas mostrar, e a resposta muda por
 * tela — que é exatamente como o estado de "treino em andamento" diverge entre
 * a home e o check-in.
 */

const DAY_INDEX: DayOfWeek[] = [
  DayOfWeek.SUNDAY,
  DayOfWeek.MONDAY,
  DayOfWeek.TUESDAY,
  DayOfWeek.WEDNESDAY,
  DayOfWeek.THURSDAY,
  DayOfWeek.FRIDAY,
  DayOfWeek.SATURDAY,
];

/**
 * Dia da semana no fuso da pessoa.
 *
 * O servidor roda em UTC. Sem o deslocamento, quem treina às 22h de Brasília
 * receberia o treino de amanhã — e descobriria isso já na academia.
 */
export function localDayOfWeek(tzOffsetMin: number, now = new Date()): DayOfWeek {
  const local = new Date(now.getTime() + tzOffsetMin * 60_000);
  return DAY_INDEX[local.getUTCDay()];
}

const workoutInclude = {
  phases: {
    orderBy: { order: 'asc' },
    include: {
      exercises: {
        orderBy: { order: 'asc' },
        include: {
          exercise: true,
          sets: { orderBy: { order: 'asc' } },
        },
      },
    },
  },
} as const;

export async function activePlan(userId: string) {
  return prisma.trainingPlan.findFirst({
    where: { userId, status: TrainingPlanStatus.ACTIVE },
    orderBy: { createdAt: 'desc' },
    include: {
      days: {
        include: {
          workout: {
            include: {
              exercises: { select: { id: true } },
            },
          },
        },
      },
    },
  });
}

export async function workoutDetail(userId: string, workoutId: string) {
  const workout = await prisma.workout.findFirst({
    where: {
      id: workoutId,
      // O treino só é visível através de um dia de um plano DESTA pessoa. Sem
      // este filtro, um id vazado abriria o treino de qualquer assinante.
      planDays: { some: { plan: { userId } } },
    },
    include: workoutInclude,
  });
  if (!workout) throw notFound('Treino não encontrado');
  return workout;
}

/** Fonte única do estado "treino em andamento". Home, plano e check-in leem daqui. */
export async function currentExecution(userId: string) {
  return prisma.workoutExecution.findFirst({
    where: { userId, status: WorkoutExecutionStatus.IN_PROGRESS },
    orderBy: { startedAt: 'desc' },
    include: { workout: { select: { id: true, name: true, estimatedDuration: true } } },
  });
}

export async function startExecution(userId: string, workoutId: string, planDayId?: string) {
  const existing = await currentExecution(userId);
  if (existing) {
    // Não é erro do usuário: é o app e o servidor discordando sobre o estado.
    // O 409 carrega o id da sessão viva para o app se realinhar sem recarregar.
    throw conflict(
      'Você já tem um treino em andamento.',
      `execucao_em_andamento:${existing.id}`,
    );
  }

  await workoutDetail(userId, workoutId);

  return prisma.workoutExecution.create({
    data: { userId, workoutId, trainingPlanDayId: planDayId ?? null },
    include: { workout: { select: { id: true, name: true, estimatedDuration: true } } },
  });
}

async function ownedExecution(userId: string, executionId: string) {
  const execution = await prisma.workoutExecution.findFirst({
    where: { id: executionId, userId },
  });
  if (!execution) throw notFound('Sessão não encontrada');
  return execution;
}

export type SetProgress = {
  workoutExerciseId: string;
  setOrder: number;
  load?: number | null;
  repetitions?: number | null;
  completed: boolean;
};

/**
 * Registra uma série. Idempotente por (sessão, exercício, ordem) — o app
 * reenvia ao reconectar, e reenviar não pode duplicar nem desfazer.
 */
export async function recordSet(userId: string, executionId: string, progress: SetProgress) {
  const execution = await ownedExecution(userId, executionId);
  if (execution.status !== WorkoutExecutionStatus.IN_PROGRESS) {
    throw conflict('Esta sessão já foi encerrada.');
  }

  const data = {
    load: progress.load ?? null,
    repetitions: progress.repetitions ?? null,
    completed: progress.completed,
  };

  return prisma.exerciseExecution.upsert({
    where: {
      executionId_workoutExerciseId_setOrder: {
        executionId,
        workoutExerciseId: progress.workoutExerciseId,
        setOrder: progress.setOrder,
      },
    },
    create: {
      executionId,
      workoutExerciseId: progress.workoutExerciseId,
      setOrder: progress.setOrder,
      ...data,
    },
    update: data,
  });
}

export type FinishParams = {
  perceivedEffort?: number | null;
  rating?: number | null;
  comment?: string | null;
};

/** Conclui a sessão e calcula quanto do prescrito foi efetivamente feito. */
export async function finishExecution(userId: string, executionId: string, params: FinishParams) {
  const execution = await ownedExecution(userId, executionId);
  if (execution.status !== WorkoutExecutionStatus.IN_PROGRESS) {
    throw conflict('Esta sessão já foi encerrada.');
  }

  const [prescribed, done] = await Promise.all([
    prisma.workoutExerciseSet.count({
      where: { workoutExercise: { workoutId: execution.workoutId } },
    }),
    prisma.exerciseExecution.count({ where: { executionId, completed: true } }),
  ]);

  const finishedAt = new Date();
  return prisma.workoutExecution.update({
    where: { id: executionId },
    data: {
      status: WorkoutExecutionStatus.FINISHED,
      finishedAt,
      durationSec: Math.round((finishedAt.getTime() - execution.startedAt.getTime()) / 1000),
      // Sessão só de cardio não tem série prescrita: 100% é o certo, e não uma
      // divisão por zero virando NaN na tela de resumo.
      completionPct: prescribed > 0 ? Math.min(100, (done / prescribed) * 100) : 100,
      perceivedEffort: params.perceivedEffort ?? null,
      rating: params.rating ?? null,
      comment: params.comment ?? null,
    },
    include: { workout: { select: { id: true, name: true } } },
  });
}

export async function cancelExecution(userId: string, executionId: string) {
  const execution = await ownedExecution(userId, executionId);
  if (execution.status !== WorkoutExecutionStatus.IN_PROGRESS) {
    throw conflict('Esta sessão já foi encerrada.');
  }
  return prisma.workoutExecution.update({
    where: { id: executionId },
    data: { status: WorkoutExecutionStatus.CANCELLED, finishedAt: new Date() },
  });
}

/**
 * Última carga usada em cada exercício do treino, para o auto-preenchimento.
 *
 * O que a pessoa levantou da última vez é a melhor estimativa do que ela vai
 * levantar hoje — muito melhor que o campo vazio, e muito melhor que a carga
 * sugerida por quem nunca a viu treinar.
 */
export async function lastLoads(userId: string, workoutId: string): Promise<Record<string, number>> {
  const rows = await prisma.exerciseExecution.findMany({
    where: {
      execution: { userId, status: WorkoutExecutionStatus.FINISHED },
      workoutExercise: { workoutId },
      load: { not: null },
    },
    orderBy: { completedAt: 'desc' },
    select: { workoutExerciseId: true, load: true },
  });

  const byExercise: Record<string, number> = {};
  for (const row of rows) {
    // Ordenado do mais recente para o mais antigo: o primeiro que aparece vence.
    if (byExercise[row.workoutExerciseId] === undefined && row.load !== null) {
      byExercise[row.workoutExerciseId] = row.load;
    }
  }
  return byExercise;
}
