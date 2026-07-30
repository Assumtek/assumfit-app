import { Router } from 'express';
import { z } from 'zod';

import { AuthedRequest, requireAuth } from '../middleware/auth';
import { asyncRoute } from '../middleware/error';
import { prisma } from '../lib/prisma';

export const sessionsRoutes = Router();
sessionsRoutes.use(requireAuth);

/**
 * Duração máxima aceita: cinco horas.
 *
 * Não é um limite de produto — é sanidade de dado. Um bloco de foco de doze
 * horas é relógio esquecido ligado, e uma linha dessas contamina qualquer
 * correlação futura entre produtividade e fisiologia.
 */
const MAX_DURATION_MIN = 300;

const recordSchema = z.object({
  type: z.string().min(1).max(64),
  endedAt: z.string().datetime(),
  durationMin: z.number().int().min(1).max(MAX_DURATION_MIN),
  energyScoreAtStart: z.number().min(0).max(100).nullable().optional(),
});

/**
 * Registra um bloco de foco concluído.
 *
 * O app manda o FIM e a duração; o início é deduzido aqui. Enviar os dois
 * instantes deixaria o relógio do aparelho definir a duração, e um relógio
 * adiantado produziria bloco de 40 minutos onde houve 25 — justamente a
 * variável que o modelo vai correlacionar com HRV depois.
 */
sessionsRoutes.post(
  '/',
  asyncRoute<AuthedRequest>(async (req, res) => {
    const body = recordSchema.parse(req.body);
    const endedAt = new Date(body.endedAt);
    const startedAt = new Date(endedAt.getTime() - body.durationMin * 60_000);

    const session = await prisma.productivitySession.create({
      data: {
        userId: req.userId,
        type: body.type,
        startedAt,
        endedAt,
        durationMin: body.durationMin,
        energyScoreAtStart: body.energyScoreAtStart ?? null,
      },
    });

    // `BigInt` não sobrevive a `JSON.stringify`. O id não interessa ao app,
    // então some da resposta em vez de virar string.
    const { id: _id, ...rest } = session;
    res.status(201).json(rest);
  }),
);

sessionsRoutes.get(
  '/',
  asyncRoute<AuthedRequest>(async (req, res) => {
    const { days } = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }).parse(req.query);
    const since = new Date(Date.now() - days * 86_400_000);

    const sessions = await prisma.productivitySession.findMany({
      where: { userId: req.userId, startedAt: { gte: since } },
      orderBy: { startedAt: 'asc' },
    });

    res.json(sessions.map(({ id: _id, ...rest }) => rest));
  }),
);
