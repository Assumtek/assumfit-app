import {
  DayOfWeek,
  ExerciseSubtype,
  MuscleGroup,
  Prisma,
  TrainingPlanDayType,
  TrainingPlanStatus,
  WorkoutPhaseType,
} from '@prisma/client';
import { z } from 'zod';

import { prisma } from '../../lib/prisma';

/**
 * Materializa o JSON do plano em `TrainingPlan` / `Workout` / `WorkoutExercise`.
 *
 * Reparseia com Zod em vez de confiar no que o serviço de modelo já validou.
 * Não é desconfiança do serviço: é que o formato tem DUAS verdades possíveis
 * (o schema Python e este schema Prisma), e a única forma de elas não
 * divergirem em silêncio é cada lado validar contra a sua.
 */

/** Validade do plano. Treinar o mesmo estímulo por meses é o caminho da estagnação. */
export const PLAN_VALIDITY_DAYS = 30;

const DAYS = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
] as const;

const SetParse = z.object({
  /*
   Nula é como o modelo diz "por tempo" — o MUVX aceita reps nula pelo mesmo
   motivo. Aqui o tempo mora no exercício (`duration`/`holdTime`), então um set
   sem repetição não prescreve nada e é descartado na persistência. Rejeitar o
   plano inteiro por isso custou uma geração que o avaliador aprovou com 7.58.
  */
  repetitions: z
    .union([z.string(), z.number()])
    .nullish()
    .transform((v) => (v == null ? null : String(v))),
  restTime: z.number().int().nullish(),
  load: z.number().nullish(),
});

const ExerciseParse = z.object({
  exerciseId: z.string().uuid(),
  subtype: z.nativeEnum(ExerciseSubtype),
  // `nullish`, não `optional`: exercício por tempo vem como `"sets": null`.
  sets: z.array(SetParse).nullish(),
  notes: z.string().nullish(),
  duration: z.number().int().nullish(),
  intensity: z.string().nullish(),
  holdTime: z.number().int().nullish(),
});

const PhaseParse = z.object({
  type: z.nativeEnum(WorkoutPhaseType),
  exercises: z.array(ExerciseParse).default([]),
});

const DayParse = z.object({
  dayOfWeek: z.enum(DAYS),
  dayType: z.nativeEnum(TrainingPlanDayType),
  workout: z
    .object({
      name: z.string().min(1),
      // Slug livre de propósito: modalidade nova não pode quebrar o parse de
      // um plano que o juiz já aprovou. Normalizada ao persistir.
      modality: z.string().nullish(),
      muscleGroups: z.array(z.nativeEnum(MuscleGroup)).default([]),
      estimatedDuration: z.number().int().nullish(),
      phases: z.array(PhaseParse).default([]),
    })
    .nullish(),
});

const PlanParse = z
  .object({
    status: z.enum(['GENERATED', 'REFERRAL']),
    referral_reason: z.string().nullish(),
    rationale: z.string().nullish(),
    days: z.array(DayParse).default([]),
  })
  .passthrough();

export type ParsedPlan = z.infer<typeof PlanParse>;

export function parsePlan(planJson: string): ParsedPlan {
  return PlanParse.parse(JSON.parse(planJson));
}

/** Nome do plano, a partir do objetivo. O usuário vê isto na lista. */
function planName(goal: string | null): string {
  const byGoal: Record<string, string> = {
    emagrecimento: 'Plano de emagrecimento',
    hipertrofia: 'Plano de hipertrofia',
    performance: 'Plano de performance',
    mobilidade: 'Plano de mobilidade',
    reabilitacao: 'Plano de reabilitação',
    saude: 'Plano de saúde e bem-estar',
  };
  return (goal && byGoal[goal]) || 'Seu plano de treino';
}

export type PersistParams = {
  userId: string;
  plan: ParsedPlan;
  goal: Prisma.TrainingPlanCreateInput['goal'];
  level: Prisma.TrainingPlanCreateInput['level'];
  frequencyPerWeek: number | null;
  location: Prisma.TrainingPlanCreateInput['location'];
  /** Ressalvas do avaliador que a tela do plano precisa mostrar. */
  revisionNotes?: string[];
};

/**
 * Grava o plano inteiro numa transação, e aposenta o anterior no mesmo ato.
 *
 * A transação não é só higiene: um plano meio gravado — dias sem treino, treino
 * sem exercício — é pior que nenhum plano, porque a tela de check-in mostra um
 * treino vazio e a pessoa descobre isso na academia.
 */
export async function persistPlan(params: PersistParams): Promise<string> {
  const { userId, plan } = params;
  const startDate = new Date();
  const endDate = new Date(startDate.getTime() + PLAN_VALIDITY_DAYS * 86_400_000);

  return prisma.$transaction(async (tx) => {
    /*
     O plano nasce em RASCUNHO, e o anterior continua valendo.

     Antes ele nascia ativo e aposentava o anterior na mesma transação: a
     pessoa descobria o que tinha sido prescrito com o plano já em vigor, sem
     chance de olhar antes. "Antes de aprovar o treino, o usuário deve poder
     revisar e editar o plano" (22/09/2026).

     Quem aposenta o anterior agora é a APROVAÇÃO. Enquanto ninguém aprovou,
     trocar o plano que está valendo seria decidir por quem não decidiu.

     Rascunho anterior não aprovado sai: gerar de novo substitui a proposta,
     não empilha duas esperando resposta.
    */
    await tx.trainingPlan.deleteMany({
      where: { userId, status: TrainingPlanStatus.DRAFT },
    });

    const created = await tx.trainingPlan.create({
      data: {
        userId,
        status: TrainingPlanStatus.DRAFT,
        name: planName(params.goal ?? null),
        goal: params.goal,
        level: params.level,
        frequencyPerWeek: params.frequencyPerWeek,
        location: params.location,
        rationale: plan.rationale ?? null,
        revisionNotes: params.revisionNotes ?? [],
        startDate,
        endDate,
      },
    });

    for (const day of plan.days) {
      if (day.dayType === TrainingPlanDayType.OFF || !day.workout) {
        await tx.trainingPlanDay.create({
          data: {
            planId: created.id,
            dayOfWeek: day.dayOfWeek as DayOfWeek,
            dayType: TrainingPlanDayType.OFF,
          },
        });
        continue;
      }

      const workout = await tx.workout.create({
        data: {
          name: day.workout.name,
          modality: day.workout.modality?.trim().toLowerCase() || null,
          muscleGroups: day.workout.muscleGroups,
          estimatedDuration: day.workout.estimatedDuration ?? null,
        },
      });

      let order = 0;
      for (const [phaseIndex, phase] of day.workout.phases.entries()) {
        const createdPhase = await tx.workoutPhase.create({
          data: { workoutId: workout.id, type: phase.type, order: phaseIndex + 1 },
        });

        for (const exercise of phase.exercises) {
          order += 1;
          const createdExercise = await tx.workoutExercise.create({
            data: {
              workoutId: workout.id,
              phaseId: createdPhase.id,
              exerciseId: exercise.exerciseId,
              order,
              subtype: exercise.subtype,
              notes: exercise.notes ?? null,
              duration: exercise.duration ?? null,
              intensity: exercise.intensity ?? null,
              holdTime: exercise.holdTime ?? null,
            },
          });

          // Set sem repetição é "por tempo": a prescrição está no exercício.
          const sets = (exercise.sets ?? []).filter(
            (s): s is (typeof s) & { repetitions: string } => s.repetitions !== null,
          );
          if (sets.length > 0) {
            await tx.workoutExerciseSet.createMany({
              data: sets.map((set, index) => ({
                workoutExerciseId: createdExercise.id,
                order: index + 1,
                repetitions: set.repetitions,
                restTime: set.restTime ?? null,
                load: set.load ?? null,
              })),
            });
          }
        }
      }

      await tx.trainingPlanDay.create({
        data: {
          planId: created.id,
          dayOfWeek: day.dayOfWeek as DayOfWeek,
          dayType: TrainingPlanDayType.WORKOUT,
          workoutId: workout.id,
        },
      });
    }

    return created.id;
  });
}


/**
 * Aprovar o rascunho: é aqui que o plano passa a valer.
 *
 * A troca acontece numa transação só, porque o meio do caminho (dois planos
 * ativos, ou nenhum) é estado que a home e o check-in leem e não sabem
 * interpretar.
 *
 * Idempotente por natureza: sem rascunho, não há o que aprovar, e quem tocou
 * duas vezes no botão recebe o mesmo plano já ativo em vez de um erro.
 */
export async function aprovarRascunho(userId: string): Promise<string | null> {
  return prisma.$transaction(async (tx) => {
    const rascunho = await tx.trainingPlan.findFirst({
      where: { userId, status: TrainingPlanStatus.DRAFT },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (!rascunho) return null;

    await tx.trainingPlan.updateMany({
      where: { userId, status: TrainingPlanStatus.ACTIVE },
      data: { status: TrainingPlanStatus.REPLACED },
    });
    await tx.trainingPlan.update({
      where: { id: rascunho.id },
      data: { status: TrainingPlanStatus.ACTIVE },
    });
    return rascunho.id;
  });
}

/** Descartar a proposta: quem não quis o plano volta a ter só o que tinha. */
export async function descartarRascunho(userId: string): Promise<void> {
  await prisma.trainingPlan.deleteMany({
    where: { userId, status: TrainingPlanStatus.DRAFT },
  });
}
