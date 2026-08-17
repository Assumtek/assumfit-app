import { ExperienceLevel, GenerationStatus, RiskTier, TrainingGoal, TrainingLocation } from '@prisma/client';

import { badRequest } from '../../lib/errors';
import { logError } from '../../lib/log';
import { prisma } from '../../lib/prisma';
import { AgentUnavailable, generate } from './agent.client';
import { allowedExercises } from './catalog';
import { buildContext, parseAnamnesis, type UserForContext } from './context-builder';
import { buildHealthContext } from './health-context';
import { parsePlan, persistPlan } from './plan-persistence';
import { classify, isReferral } from './risk-tier';

/**
 * O pipeline inteiro: anamnese → flags → risco → catálogo → geração → gate →
 * persistência.
 *
 * Roda FORA do ciclo da requisição. A geração leva de 50 a 120 segundos, e uma
 * rota que segurasse isso estouraria qualquer proxy no caminho. O app abre a
 * requisição, recebe um id e consulta o status.
 */

/**
 * Mensagens por motivo, para a tela mostrar.
 *
 * Cada uma descreve o motivo que o backend REALMENTE conhece — o gate devolve
 * um código (`seguranca_clinica`), não o detalhe. Inventar o detalhe aqui
 * ("seu histórico de pressão alta impediu...") seria afirmar sobre algo que
 * este código não sabe.
 */
const REASON_MESSAGES: Record<string, string> = {
  encaminhamento_clinico:
    'Pelo seu perfil de saúde, o ideal é passar por um profissional antes de começar a treinar. ' +
    'Por segurança, não geramos um treino automático — procure um educador físico ou um médico.',
  seguranca_clinica:
    'Por segurança, não conseguimos montar um treino adequado ao seu perfil de saúde agora. ' +
    'Você pode tentar de novo; se a recomendação se mantiver, o caminho é a avaliação de um profissional.',
  catalogo:
    'Não foi possível montar um treino com os exercícios disponíveis para o seu perfil. ' +
    'Tente novamente em instantes.',
  qualidade:
    'Não conseguimos gerar um treino adequado desta vez. Você pode tentar novamente em instantes.',
  timeout: 'A geração demorou mais que o esperado e não foi concluída. Tente gerar o treino de novo.',
};

export function messageFor(reason: string | null): string {
  return (reason && REASON_MESSAGES[reason]) || REASON_MESSAGES.qualidade;
}

/**
 * Abre a requisição de geração e devolve o id imediatamente.
 *
 * NÃO há gate de assinatura aqui, e a ausência é deliberada. Existiu um
 * `assertEligible` que exigia assinatura `active` ou `trialing` — mas nada no
 * produto cria essa linha: `prisma.subscription.create` só aparece no seed, que
 * se recusa a rodar em produção. O gate então reprovava TODO usuário real, e o
 * recurso ficava inacessível para quem quer que instalasse o app. Quando houver
 * cobrança de verdade, o gate volta com quem cria a assinatura junto.
 *
 * Recusa abrir uma segunda enquanto houver uma em andamento: duas gerações
 * concorrentes produziriam dois planos ativos, e a última a terminar venceria
 * por acidente de ordem.
 */
export async function requestGeneration(userId: string, feedback?: string): Promise<string> {
  const anamnesis = await prisma.healthAnamnesis.findUnique({ where: { userId } });
  if (!anamnesis) {
    throw badRequest('Responda a anamnese antes de gerar o treino.', 'anamnese_ausente');
  }

  const running = await prisma.planGenerationRequest.findFirst({
    where: { userId, status: { in: [GenerationStatus.PENDING, GenerationStatus.RUNNING] } },
  });
  if (running) return running.id;

  const created = await prisma.planGenerationRequest.create({
    data: { userId, status: GenerationStatus.PENDING, feedback: feedback ?? null },
  });

  // Deliberadamente não aguardado: quem chamou já tem o id e vai consultar o
  // status. Um `await` aqui devolveria o pipeline inteiro para a requisição
  // HTTP, que é justamente o que este desenho evita.
  void runGeneration(created.id).catch((err) => logError('workout.generation', err));

  return created.id;
}

const GOAL_TO_ENUM: Record<string, TrainingGoal> = {
  emagrecimento: TrainingGoal.emagrecimento,
  hipertrofia: TrainingGoal.hipertrofia,
  performance: TrainingGoal.performance,
  mobilidade: TrainingGoal.mobilidade,
  saude: TrainingGoal.saude,
  reabilitacao: TrainingGoal.reabilitacao,
};

const LEVEL_TO_ENUM: Record<string, ExperienceLevel> = {
  iniciante: ExperienceLevel.INICIANTE,
  intermediario: ExperienceLevel.INTERMEDIARIO,
  avancado: ExperienceLevel.AVANCADO,
};

const PLACE_TO_ENUM: Record<string, TrainingLocation> = {
  academia: TrainingLocation.academia,
  casa: TrainingLocation.casa,
  'ar livre': TrainingLocation.ar_livre,
  ar_livre: TrainingLocation.ar_livre,
};

async function finish(
  requestId: string,
  status: GenerationStatus,
  extra: Record<string, unknown> = {},
): Promise<void> {
  await prisma.planGenerationRequest.update({
    where: { id: requestId },
    data: { status, finishedAt: new Date(), ...extra },
  });
}

/** O pipeline. Cada saída possível grava o próprio desfecho na requisição. */
export async function runGeneration(requestId: string): Promise<void> {
  const request = await prisma.planGenerationRequest.findUnique({ where: { id: requestId } });
  if (!request) return;

  await prisma.planGenerationRequest.update({
    where: { id: requestId },
    data: { status: GenerationStatus.RUNNING },
  });

  const { userId } = request;

  try {
    const [user, anamnesis, lifestyle] = await Promise.all([
      prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { sex: true, birthDate: true },
      }),
      prisma.healthAnamnesis.findUniqueOrThrow({ where: { userId } }),
      prisma.lifestyleProfile.findUnique({ where: { userId } }),
    ]);

    const answers = parseAnamnesis(anamnesis.answers);
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
    const context = buildContext(answers, forContext, health.biometrics);
    const tier = classify(context.flags);

    await prisma.planGenerationRequest.update({
      where: { id: requestId },
      data: { flags: context.flags, riskTier: tier },
    });

    // Encaminhamento decidido AQUI, antes de gastar uma chamada de modelo. O
    // prompt também instrui o modelo a encaminhar nesses casos, mas depender
    // disso seria confiar a regra de segurança a quem pode alucinar.
    if (isReferral(tier)) {
      await finish(requestId, GenerationStatus.REFERRAL, { blockReason: 'encaminhamento_clinico' });
      return;
    }

    const catalog = await allowedExercises();
    if (catalog.length === 0) {
      await finish(requestId, GenerationStatus.FAILED, { blockReason: 'catalogo' });
      return;
    }

    // Regeração pedida pela pessoa: o texto dela entra como restrição, não como
    // instrução solta — "achei pesado demais" precisa mudar a prescrição.
    const constraints = request.feedback
      ? { ...context.constraints, ajuste_pedido: request.feedback }
      : context.constraints;

    const result = await generate({
      profile: {
        ...context.profile,
        /*
         O juiz de segurança clínica reprovava por "triagem pré-participação
         ausente" — e a triagem ACONTECE: o PAR-Q é aplicado na anamnese e o
         tier de risco sai determinístico dele (`classify`, logo acima). O
         juiz só não era informado, e avaliava o perfil como se ninguém
         tivesse perguntado. Visto em produção (ago/2026): TIER_0 legítimo
         bloqueado com "omite triagem obrigatória", 2 votos a 0.
        */
        triagem_pre_participacao: {
          parq_aplicado_na_anamnese: true,
          risk_tier: tier,
          sinalizacoes_clinicas: context.flags,
        },
      },
      flags: context.flags,
      history_summary: health.historySummary,
      allowed_exercises: catalog,
      constraints,
    });

    if (result.blocked) {
      const reason = result.deterministicErrors.length > 0 ? 'catalogo' : 'seguranca_clinica';
      await finish(requestId, GenerationStatus.BLOCKED, {
        blockReason: reason,
        score: result.score,
        traceId: result.traceId,
      });
      return;
    }

    const plan = parsePlan(result.plan);

    // O modelo também pode concluir pelo encaminhamento por conta própria, num
    // perfil que a nossa tabela de tiers ainda não cobre.
    if (plan.status === 'REFERRAL') {
      await finish(requestId, GenerationStatus.REFERRAL, {
        blockReason: 'encaminhamento_clinico',
        score: result.score,
        traceId: result.traceId,
      });
      return;
    }

    const goal = String(context.profile.objetivo ?? '');
    const level = String(context.profile.experiencia ?? '');
    const place = String(context.constraints.local ?? '');

    const planId = await persistPlan({
      userId,
      plan,
      goal: GOAL_TO_ENUM[goal] ?? null,
      level: LEVEL_TO_ENUM[level] ?? null,
      frequencyPerWeek: Number(context.profile.frequencia_semanal) || null,
      location: PLACE_TO_ENUM[place] ?? null,
    });

    await finish(requestId, GenerationStatus.DONE, {
      trainingPlanId: planId,
      score: result.score,
      traceId: result.traceId,
    });
  } catch (err) {
    logError('workout.generation', err);
    const reason = err instanceof AgentUnavailable ? 'timeout' : 'qualidade';
    await finish(requestId, GenerationStatus.FAILED, { blockReason: reason });
  }
}
