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

/**
 * Depois disto, sessão aberta é entulho, não treino em andamento.
 *
 * Doze horas é o mesmo limite que o cronômetro de esporte usa para decidir se
 * vale retomar uma sessão interrompida. Ninguém treina doze horas; o que passa
 * disso é app que morreu, tela fechada no meio ou toque que ficou esquecido.
 */
const LIMITE_SESSAO_ABERTA_MS = 12 * 60 * 60 * 1000;

/**
 * Fecha o que ficou aberto tempo demais, ANTES de responder qualquer pergunta
 * sobre "treino em andamento".
 *
 * Sem isto, uma sessão esquecida bloqueia a pessoa para sempre: `startExecution`
 * recusa começar outra enquanto houver uma em andamento, e não havia nada que
 * fechasse a primeira. Visto em produção (ago/2026) — uma testadora ficou com
 * uma sessão aberta de um dia para o outro e não conseguia iniciar o treino
 * seguinte, sem nenhuma mensagem que explicasse o motivo.
 *
 * **O desfecho depende do que foi REGISTRADO**, e essa distinção é a parte que
 * importa. `AUTO_CLOSED` conta como treino feito no painel e no contexto de
 * saúde; usá-lo para uma sessão vazia inflaria aderência com um treino que
 * ninguém fez — o mesmo erro que o `completionPct` de 100 cometia. Então:
 *
 * - com série registrada, houve treino: `AUTO_CLOSED`, e conta.
 * - sem nada registrado, não houve: `CANCELLED`, e não conta.
 */
export async function expirarSessoesEsquecidas(userId: string, agora = new Date()) {
  const limite = new Date(agora.getTime() - LIMITE_SESSAO_ABERTA_MS);
  const esquecidas = await prisma.workoutExecution.findMany({
    where: { userId, status: WorkoutExecutionStatus.IN_PROGRESS, startedAt: { lt: limite } },
    select: { id: true, _count: { select: { exercises: true } } },
  });
  if (esquecidas.length === 0) return 0;

  const comRegistro = esquecidas.filter((e) => e._count.exercises > 0).map((e) => e.id);
  const vazias = esquecidas.filter((e) => e._count.exercises === 0).map((e) => e.id);

  await Promise.all([
    comRegistro.length
      ? prisma.workoutExecution.updateMany({
          where: { id: { in: comRegistro } },
          data: { status: WorkoutExecutionStatus.AUTO_CLOSED, finishedAt: agora },
        })
      : null,
    vazias.length
      ? prisma.workoutExecution.updateMany({
          where: { id: { in: vazias } },
          data: { status: WorkoutExecutionStatus.CANCELLED, finishedAt: agora },
        })
      : null,
  ]);
  return esquecidas.length;
}

/** Fonte única do estado "treino em andamento". Home, plano e check-in leem daqui. */
export async function currentExecution(userId: string) {
  // A limpeza mora AQUI, e não numa tarefa agendada, porque este é o ponto por
  // onde todo mundo passa: home, plano e check-in. Uma tarefa noturna deixaria
  // a pessoa travada até a madrugada seguinte.
  await expirarSessoesEsquecidas(userId);
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

/**
 * Quanto da sessão foi CUMPRIDO. `null` quando não há como medir.
 *
 * A versão anterior devolvia 100 sempre que o treino não tinha série prescrita,
 * para evitar uma divisão por zero virando NaN na tela. A intenção era certa e o
 * efeito foi grave: dia de ESPORTE não tem série — ele é feito de blocos por
 * tempo —, então toda sessão de esporte nascia "100% completa" no instante em
 * que fosse encerrada, tivesse durado uma hora ou um minuto.
 *
 * Visto em produção (ago/2026): um treino de quadra encerrado com 65 segundos e
 * zero séries foi gravado como 100%. É pior que perder o treino — treino
 * perdido a pessoa percebe; treino que se dá por feito sozinho ninguém
 * questiona, e ele entra na constância como se tivesse acontecido.
 *
 * Sem série, a medida é o TEMPO: quanto do bloco previsto foi cumprido. Sem
 * nenhuma das duas, `null` — que é como o app já mostra ausência de medição
 * (`rateCompletion` devolve traço). Um número inventado aqui contamina
 * constância, aderência e o contexto que vai para o modelo.
 */
export function completude(params: {
  prescribed: number;
  done: number;
  durationSec: number;
  estimatedDuration: number | null;
}): number | null {
  const { prescribed, done, durationSec, estimatedDuration } = params;
  if (prescribed > 0) return Math.min(100, (done / prescribed) * 100);
  if (estimatedDuration && estimatedDuration > 0) {
    return Math.min(100, (durationSec / (estimatedDuration * 60)) * 100);
  }
  return null;
}

/** Conclui a sessão e calcula quanto do prescrito foi efetivamente feito. */
export async function finishExecution(userId: string, executionId: string, params: FinishParams) {
  const execution = await ownedExecution(userId, executionId);
  if (execution.status !== WorkoutExecutionStatus.IN_PROGRESS) {
    throw conflict('Esta sessão já foi encerrada.');
  }

  const [prescribed, done, treino] = await Promise.all([
    prisma.workoutExerciseSet.count({
      where: { workoutExercise: { workoutId: execution.workoutId } },
    }),
    prisma.exerciseExecution.count({ where: { executionId, completed: true } }),
    prisma.workout.findUnique({
      where: { id: execution.workoutId },
      select: { estimatedDuration: true },
    }),
  ]);

  const finishedAt = new Date();
  const durationSec = Math.round((finishedAt.getTime() - execution.startedAt.getTime()) / 1000);
  return prisma.workoutExecution.update({
    where: { id: executionId },
    data: {
      status: WorkoutExecutionStatus.FINISHED,
      finishedAt,
      durationSec,
      completionPct: completude({
        prescribed,
        done,
        durationSec,
        estimatedDuration: treino?.estimatedDuration ?? null,
      }),
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
