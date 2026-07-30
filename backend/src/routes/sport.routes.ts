import { Router } from 'express';
import { z } from 'zod';

import { AuthedRequest, requireAuth } from '../middleware/auth';
import { asyncRoute } from '../middleware/error';
import { prisma } from '../lib/prisma';

/**
 * Sessões de esporte — o registro do que o cronômetro mediu.
 *
 * A TRILHA de GPS não sobe: rota de corrida é padrão de vida (onde a pessoa
 * mora, treina, a que horas) e o produto só precisa dos agregados — distância,
 * duração, batimento. Mesma régua da agenda, que joga fora os eventos.
 */
export const sportRoutes = Router();
sportRoutes.use(requireAuth);

const sessionSchema = z.object({
  sport: z.string().min(2).max(30),
  startedAt: z.string().datetime(),
  durationS: z.number().int().min(10).max(24 * 3600),
  distanceM: z.number().int().min(0).max(500_000).nullish(),
  kcal: z.number().int().min(0).max(20_000),
  avgHr: z.number().int().min(20).max(240).nullish(),
  maxHr: z.number().int().min(20).max(240).nullish(),
});

sportRoutes.post(
  '/session',
  asyncRoute<AuthedRequest>(async (req, res) => {
    const body = sessionSchema.parse(req.body);
    const session = await prisma.sportSession.create({
      data: {
        userId: req.userId,
        sport: body.sport,
        startedAt: new Date(body.startedAt),
        durationS: body.durationS,
        distanceM: body.distanceM ?? null,
        kcal: body.kcal,
        avgHr: body.avgHr ?? null,
        maxHr: body.maxHr ?? null,
      },
    });
    res.status(201).json(session);
  }),
);

sportRoutes.get(
  '/sessions',
  asyncRoute<AuthedRequest>(async (req, res) => {
    const { days } = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }).parse(req.query);
    res.json(
      await prisma.sportSession.findMany({
        where: { userId: req.userId, startedAt: { gte: new Date(Date.now() - days * 86_400_000) } },
        orderBy: { startedAt: 'desc' },
      }),
    );
  }),
);
