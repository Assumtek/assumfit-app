import { Router } from 'express';
import { z } from 'zod';

import { prisma } from '../lib/prisma';
import { AuthedRequest, requireAuth } from '../middleware/auth';
import { asyncRoute } from '../middleware/error';

export const lifestyleRoutes = Router();
lifestyleRoutes.use(requireAuth);

/**
 * Perfil de rotina.
 *
 * Todo campo é opcional, e isso é a regra do onboarding e não descuido: as
 * perguntas se ramificam, então quem não pratica atividade nunca chega às
 * perguntas de dia e local, e quem trabalha em horário comercial não responde
 * a hora de dormir. Exigir campo faria o schema recusar exatamente os caminhos
 * curtos que o fluxo foi desenhado para permitir.
 */
const lifestyleSchema = z.object({
  occupation: z.string().min(2).max(80).nullish(),
  workPosture: z.enum(['sitting', 'standing', 'alternating', 'moving']).nullish(),
  postureHours: z.number().int().min(0).max(24).nullish(),
  workSchedule: z.enum(['business', 'shifts', 'night', 'flexible']).nullish(),
  bedtime: z.number().min(0).max(23.99).nullish(),
  exercises: z.enum(['regular', 'sometimes', 'none']).nullish(),
  blocker: z.string().max(40).nullish(),
  activities: z.array(z.string().max(40)).max(10).optional(),
  // 0 = domingo. Sete posições no máximo, sem repetição.
  trainDays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  trainPeriod: z.string().max(20).nullish(),
  trainPlace: z.string().max(20).nullish(),
  goal: z.string().max(40).nullish(),
  /** Marcado pela tela ao chegar no fim do fluxo. */
  completed: z.boolean().optional(),
});

lifestyleRoutes.get(
  '/',
  asyncRoute<AuthedRequest>(async (req, res) => {
    const profile = await prisma.lifestyleProfile.findUnique({ where: { userId: req.userId } });
    res.json(profile);
  }),
);

/**
 * Grava o que foi respondido até aqui.
 *
 * O app envia a cada resposta, não só no fim. Onboarding é onde mais se
 * abandona, e quem parou na quarta pergunta e voltou depois não pode ser
 * obrigado a recomeçar — o progresso parcial já vale, porque cada campo
 * respondido já melhora uma sugestão sozinho.
 */
lifestyleRoutes.put(
  '/',
  asyncRoute<AuthedRequest>(async (req, res) => {
    const { completed, trainDays, ...rest } = lifestyleSchema.parse(req.body);

    const data = {
      ...rest,
      ...(trainDays ? { trainDays: [...new Set(trainDays)].sort((a, b) => a - b) } : {}),
      ...(completed ? { completedAt: new Date() } : {}),
      /**
       * Trocar para horário comercial APAGA a hora de dormir declarada.
       *
       * A escrita é parcial, então um campo pode sobreviver a uma mudança de
       * ramo do fluxo: quem respondeu "turno noturno / durmo às 9h" e depois
       * corrigiu para "comercial" ficava com a curva circadiana deslocada dez
       * horas por causa de um valor que nem é mais perguntado. O sintoma era
       * mudo — a pessoa via um cronótipo "vespertino" sem nada na tela
       * explicando de onde ele veio.
       */
      ...(rest.workSchedule === 'business' ? { bedtime: null } : {}),
    };

    const profile = await prisma.lifestyleProfile.upsert({
      where: { userId: req.userId },
      create: { userId: req.userId, ...data },
      update: data,
    });

    res.json(profile);
  }),
);
