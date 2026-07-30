import { TrainingPlanStatus } from '@prisma/client';

import { prisma } from '../../lib/prisma';
import { badRequest, forbidden } from '../../lib/errors';
import { adjust, type AgentAdjustResult } from './agent.client';
import { allowedExercises } from './catalog';
import { buildContext, parseAnamnesis, type UserForContext } from './context-builder';
import { buildHealthContext } from './health-context';
import { classify, isReferral } from './risk-tier';

/**
 * Conversa com o agente sobre o plano ativo — o "Personal" do app.
 *
 * É a única forma de mudar o treino sem regerar tudo. Regerar descarta o plano
 * inteiro e devolve outro; aqui a pessoa pergunta, o agente responde, e as
 * mudanças vêm como OPERAÇÕES sobre o plano que já existe.
 *
 * ## O que este arquivo protege
 *
 * As mesmas travas clínicas da geração, e pelo mesmo motivo. Um chat parece
 * inofensivo e não é: "trocar agachamento por leg press" é prescrição, e quem
 * está no TIER de encaminhamento não pode receber prescrição por texto livre
 * mais do que pode recebê-la por geração automática.
 *
 * A verificação acontece ANTES de gastar uma chamada de modelo, e não confia no
 * prompt para fazê-la. O prompt também instrui o modelo a encaminhar — mas
 * depender disso seria entregar a regra de segurança a quem pode alucinar.
 */

export type ChatTurn = { role: 'user' | 'assistant'; content: string };

/** Quantos turnos anteriores viajam junto. */
const HISTORY_LIMIT = 12;

export async function chatWithAgent(
  userId: string,
  message: string,
  history: ChatTurn[],
): Promise<AgentAdjustResult> {
  const consent = await prisma.consent.findFirst({
    where: { userId, purpose: 'workout_generation', revokedAt: null },
  });
  if (!consent) throw forbidden('Consentimento de geração de treino não concedido');

  const anamnesis = await prisma.healthAnamnesis.findUnique({ where: { userId } });
  if (!anamnesis) throw badRequest('Responda a anamnese antes de conversar sobre o plano');

  const plan = await carregarPlano(userId);
  if (!plan) throw badRequest('Nenhum plano ativo para ajustar');

  const [user, lifestyle] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { sex: true, birthDate: true } }),
    prisma.lifestyleProfile.findUnique({ where: { userId } }),
  ]);

  const forContext: UserForContext = {
    sex: user.sex,
    birthDate: user.birthDate,
    activities: lifestyle?.activities ?? [],
    trainDays: lifestyle?.trainDays ?? [],
    trainPlace: lifestyle?.trainPlace ?? null,
    goal: lifestyle?.goal ?? null,
    exercises: lifestyle?.exercises ?? null,
  };

  const health = await buildHealthContext(userId);
  const context = buildContext(parseAnamnesis(anamnesis.answers), forContext, health.biometrics);

  /*
   Encaminhamento decidido aqui, sem chamar o modelo.

   Devolve `blocked` em vez de erro: do ponto de vista de quem está no chat,
   isto não é falha — é a resposta. E ela precisa chegar como texto que a pessoa
   leia, não como um 500 que a tela traduz em "algo deu errado".
  */
  const tier = classify(context.flags);
  if (isReferral(tier)) {
    return {
      reply:
        'Pelo que você respondeu na anamnese, ajustes no seu treino precisam passar por um ' +
        'profissional de educação física ou de saúde. Posso continuar acompanhando suas ' +
        'sessões, mas não vou alterar a prescrição por aqui.',
      operations: [],
      blocked: true,
      blockReason: 'encaminhamento_clinico',
      traceId: 'local',
    };
  }

  const catalog = await allowedExercises();
  if (catalog.length === 0) throw badRequest('Catálogo de exercícios indisponível');

  return adjust({
    message,
    // Os mais RECENTES, e não os primeiros: a conversa que importa é a que
    // acabou de acontecer, e mandar o histórico inteiro estoura a janela.
    history: history.slice(-HISTORY_LIMIT),
    current_plan: serializePlan(plan),
    profile: context.profile,
    flags: context.flags,
    constraints: context.constraints,
    allowed_exercises: catalog,
  });
}

/** O plano ativo com dias, fases, exercícios e séries. */
function carregarPlano(userId: string) {
  return prisma.trainingPlan.findFirst({
    where: { userId, status: TrainingPlanStatus.ACTIVE },
    orderBy: { createdAt: 'desc' },
    include: {
      days: {
        orderBy: { dayOfWeek: 'asc' },
        include: {
          workout: {
            include: {
              phases: {
                orderBy: { order: 'asc' },
                include: {
                  exercises: {
                    orderBy: { order: 'asc' },
                    include: {
                      exercise: { select: { name: true } },
                      sets: { orderBy: { order: 'asc' } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
}

/**
 * O plano no mesmo formato JSON que a geração produz.
 *
 * O agente foi treinado com essa forma no prompt de ajuste; entregar o objeto
 * do Prisma cru faria o modelo lidar com nomes de coluna e relações, que não é
 * o que ele espera ver.
 *
 * O tipo sai da PRÓPRIA consulta, e não de uma interface escrita à mão: uma
 * descrição paralela do shape do Prisma diverge silenciosamente na primeira
 * mudança de schema, e o compilador não tem como avisar.
 */
type PlanoComDias = Awaited<ReturnType<typeof carregarPlano>>;

function serializePlan(plan: NonNullable<PlanoComDias>) {
  return {
    days: plan.days.map((day) => ({
      dayOfWeek: day.dayOfWeek,
      dayType: day.dayType,
      workout: day.workout
        ? {
            name: day.workout.name,
            muscleGroups: day.workout.muscleGroups,
            phases: day.workout.phases.map((phase) => ({
              type: phase.type,
              exercises: phase.exercises.map((item) => ({
                name: item.exercise.name,
                subtype: item.subtype,
                notes: item.notes,
                sets: item.sets.map((s) => ({
                  repetitions: s.repetitions,
                  restTime: s.restTime,
                  load: s.load,
                })),
              })),
            })),
          }
        : null,
    })),
  };
}
