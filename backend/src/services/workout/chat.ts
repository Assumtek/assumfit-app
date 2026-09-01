import { PlanAdjustmentStatus, TrainingPlanStatus } from '@prisma/client';

import { prisma } from '../../lib/prisma';
import { badRequest, forbidden } from '../../lib/errors';
import { adjust, type AgentAdjustResult } from './agent.client';
import { allowedExercises } from './catalog';
import { buildContext, parseAnamnesis, type UserForContext } from './context-builder';
import { buildHealthContext } from './health-context';
import { weekFeedback } from './week-feedback';
import { aplicarOperacoes, PropostaVencida, type AdjustOperation } from './plan-adjust';
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

export type ChatTurn = {
  role: 'user' | 'assistant';
  content: string;
  /**
   * A CHAVE da foto no S3, quando a mensagem teve uma.
   *
   * A imagem não passa por aqui: ela sobe do aparelho direto para o bucket, e
   * o que guardamos é o ponteiro. É ele que devolve a foto à bolha certa ao
   * reabrir a conversa, em qualquer aparelho.
   */
  imageRef?: string;
};

/** O que a rota devolve: a resposta do agente mais o id da proposta guardada. */
export type ChatResult = AgentAdjustResult & {
  /** `null` quando não há o que confirmar — recusa ou pergunta conversacional. */
  adjustmentId: string | null;
};

/**
 * Quantos turnos anteriores viajam junto no prompt.
 *
 * A conversa INTEIRA fica guardada; o que entra no prompt é uma janela. Mandar
 * tudo estouraria o contexto numa conversa longa, e as mensagens de semanas
 * atrás dizem menos sobre o plano de hoje que as últimas.
 */
const HISTORY_LIMIT = 12;

/** A conversa desta pessoa, do mais antigo para o mais novo. */
export async function historicoDoChat(userId: string, limite = 60): Promise<ChatTurn[]> {
  const linhas = await prisma.planChatMessage.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limite,
    select: { role: true, content: true, imageRef: true },
  });
  return linhas.reverse().map((l) => ({
    role: l.role === 'assistant' ? 'assistant' : 'user',
    content: l.content,
    ...(l.imageRef ? { imageRef: l.imageRef } : {}),
  }));
}

export async function chatWithAgent(
  userId: string,
  message: string,
  /**
   * A foto que a pessoa mandou junto (Leonardo, 31/08/2026: "enviando foto
   * para perguntar do aparelho"). Base64 puro, sem o prefixo do data URI.
   *
   * Ela NÃO é gravada: a conversa guarda o texto, e a imagem vive só o tempo
   * da resposta. Foto de academia mostra o rosto de quem está em volta, e uma
   * biblioteca de imagens de terceiros é um passivo de privacidade que este
   * recurso não precisa criar para funcionar.
   */
  foto?: {
    base64: string;
    mediaType: 'image/jpeg' | 'image/png' | 'image/webp';
    /** A chave no S3, o ponteiro que volta no histórico. */
    ref?: string;
  },
): Promise<ChatResult> {
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
      adjustmentId: null,
    };
  }

  const catalog = await allowedExercises();
  if (catalog.length === 0) throw badRequest('Catálogo de exercícios indisponível');

  /*
   O que aconteceu NESTA semana vai junto: sem isso, "revise com base no que eu
   senti nos treinos" não tinha com o que ser respondido (Leonardo, 24/08).
  */
  const semana = await weekFeedback(userId);

  /*
   O DIA DE HOJE vai explícito.

   O agente é sem estado e não tem relógio: pedimos "uma recomendação pontual
   para hoje" e ele respondeu "qual dia é hoje?" para a pessoa (Leonardo,
   24/08/2026). Quem sabe o fuso dela é o servidor, e o plano é organizado por
   dia da semana, então mandamos os dois: a data e o nome do dia.
  */
  const usuario = await prisma.user.findUnique({
    where: { id: userId },
    select: { tzOffsetMin: true },
  });
  const agoraLocal = new Date(Date.now() + (usuario?.tzOffsetMin ?? -180) * 60_000);
  const DIAS_PT = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  const hoje = {
    data: agoraLocal.toISOString().slice(0, 10),
    dia_da_semana: DIAS_PT[agoraLocal.getUTCDay()],
  };

  /*
   O histórico vem do BANCO, não do aparelho.

   Antes o cliente devolvia a conversa a cada pedido: fechou o app, o personal
   esquecia tudo, e o contexto que chegava ao modelo era o que o aparelho
   dissesse que era. Agora a conversa segue a conta, e quem a monta é quem
   também guarda as travas clínicas.
  */
  const history = await historicoDoChat(userId);

  const resultado = await adjust({
    message,
    today: hoje,
    week_feedback: semana,
    // Os mais RECENTES, e não os primeiros: a conversa que importa é a que
    // acabou de acontecer, e mandar o histórico inteiro estoura a janela.
    /*
     Para o modelo vai só o TEXTO. O ponteiro da foto é assunto da tela: o
     arquivo está no aparelho, e mandar o nome dele ao modelo seria dar a ler
     um caminho que não leva a lugar nenhum.
    */
    history: history.slice(-HISTORY_LIMIT).map((t) => ({ role: t.role, content: t.content })),
    current_plan: serializePlan(plan),
    profile: context.profile,
    flags: context.flags,
    constraints: context.constraints,
    allowed_exercises: catalog,
    ...(foto ? { image_b64: foto.base64, media_type: foto.mediaType } : {}),
  });

  const adjustmentId = await guardarProposta(userId, plan.id, message, resultado);

  /*
   A conversa é gravada DEPOIS da resposta, as duas de uma vez: gravar a
   pergunta antes deixaria uma mensagem órfã na tela quando o modelo falhasse,
   e a pessoa veria a própria fala sem resposta nenhuma ao reabrir.
  */
  await prisma.planChatMessage.createMany({
    data: [
      /*
       O PONTEIRO da foto, não a foto: a imagem vive no S3, e a coluna guarda a
       chave para ela voltar à bolha certa ao reabrir a conversa.
      */
      { userId, role: 'user', content: message, imageRef: foto?.ref ?? null },
      { userId, role: 'assistant', content: resultado.reply, adjustmentId },
    ],
  });

  return { ...resultado, adjustmentId };
}

/**
 * Guarda a proposta para o botão de confirmar ter o que aplicar.
 *
 * A proposta mora no SERVIDOR e o app recebe só o id. Se o aplicar aceitasse as
 * operações vindas do cliente, qualquer requisição escreveria um diff arbitrário
 * no plano, por fora das travas clínicas que decidem quem pode receber
 * prescrição automática — e essas travas são a razão de este módulo existir.
 *
 * A proposta anterior vira SUPERSEDED: quem pediu outra coisa sem confirmar a
 * primeira não deveria conseguir aplicar as duas depois, em ordem nenhuma.
 */
async function guardarProposta(
  userId: string,
  planId: string,
  message: string,
  resultado: AgentAdjustResult,
): Promise<string | null> {
  if (resultado.blocked || resultado.operations.length === 0) return null;

  await prisma.planAdjustment.updateMany({
    where: { userId, status: PlanAdjustmentStatus.PENDING },
    data: { status: PlanAdjustmentStatus.SUPERSEDED },
  });

  const criada = await prisma.planAdjustment.create({
    data: {
      userId,
      planId,
      message,
      reply: resultado.reply,
      operations: resultado.operations as never,
      traceId: resultado.traceId,
    },
    select: { id: true },
  });
  return criada.id;
}

export type AplicacaoResult = {
  applied: number;
  /** O que falhou, em português, quando a proposta já não vale. */
  failReason: string | null;
};

/**
 * Aplica a proposta que a pessoa confirmou.
 *
 * Tudo num commit só — operações e a marca de aplicada. Fora disso existe o
 * instante em que o plano já mudou e a proposta ainda diz "pendente", e um
 * segundo toque no botão aplicaria o lote inteiro de novo.
 */
export async function applyAdjustment(
  userId: string,
  adjustmentId: string,
): Promise<AplicacaoResult> {
  const proposta = await prisma.planAdjustment.findFirst({
    where: { id: adjustmentId, userId },
  });
  if (!proposta) throw badRequest('Proposta não encontrada');
  if (proposta.status === PlanAdjustmentStatus.APPLIED) {
    // Toque duplo no botão não é erro: é a mesma intenção, já cumprida.
    return { applied: 0, failReason: null };
  }
  if (proposta.status !== PlanAdjustmentStatus.PENDING) {
    throw badRequest('Essa sugestão não vale mais. Peça de novo no chat.');
  }

  /*
   O plano ATIVO manda, não o que a proposta cita.

   Entre propor e confirmar, uma geração nova pode ter substituído o plano —
   e aplicar um diff calculado sobre o plano anterior escreveria mudança em
   exercício que ninguém pediu.
  */
  const ativo = await prisma.trainingPlan.findFirst({
    where: { userId, status: TrainingPlanStatus.ACTIVE },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });
  if (!ativo || ativo.id !== proposta.planId) {
    await marcarVencida(adjustmentId, 'o plano mudou desde a sugestão');
    return { applied: 0, failReason: 'Seu plano mudou desde essa sugestão. Peça de novo no chat.' };
  }

  const operations = proposta.operations as unknown as AdjustOperation[];
  try {
    const aplicadas = await prisma.$transaction(async (tx) => {
      const total = await aplicarOperacoes(tx, proposta.planId, operations, userId);
      await tx.planAdjustment.update({
        where: { id: adjustmentId },
        data: { status: PlanAdjustmentStatus.APPLIED, appliedAt: new Date() },
      });
      return total;
    });
    return { applied: aplicadas, failReason: null };
  } catch (erro) {
    if (erro instanceof PropostaVencida) {
      await marcarVencida(adjustmentId, erro.motivo);
      return {
        applied: 0,
        failReason: 'Essa sugestão não vale mais para o seu plano atual. Peça de novo no chat.',
      };
    }
    throw erro;
  }
}

async function marcarVencida(id: string, motivo: string) {
  await prisma.planAdjustment.update({
    where: { id },
    data: { status: PlanAdjustmentStatus.STALE, failReason: motivo },
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
