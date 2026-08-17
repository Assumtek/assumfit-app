import { Router } from 'express';
import { z } from 'zod';

import { AuthedRequest, requireAuth } from '../middleware/auth';
import { asyncRoute } from '../middleware/error';
import { prisma } from '../lib/prisma';

export const habitsRoutes = Router();
habitsRoutes.use(requireAuth);

const upsertSchema = z.object({
  date: z.string().date(),
  waterMl: z.number().int().min(0).max(10000).optional(),
  sleepScore: z.number().min(0).max(100).optional(),
  sleepMinutes: z.number().int().min(0).max(1440).optional(),
  mood: z.enum(['great', 'ok', 'tired', 'bad']).optional(),
});

/** Upsert por (usuário, dia): o app reenvia o dia inteiro a cada alteração. */
habitsRoutes.put(
  '/',
  asyncRoute<AuthedRequest>(async (req, res) => {
    const { date: dateStr, ...fields } = upsertSchema.parse(req.body);
    const date = new Date(dateStr);
    const habit = await prisma.dailyHabit.upsert({
      where: { userId_date: { userId: req.userId, date } },
      create: { userId: req.userId, date, ...fields },
      update: fields,
    });
    res.json(habit);
  }),
);

habitsRoutes.get(
  '/',
  asyncRoute<AuthedRequest>(async (req, res) => {
    const { days } = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }).parse(req.query);
    const since = new Date(Date.now() - days * 86400000);
    res.json(
      await prisma.dailyHabit.findMany({
        where: { userId: req.userId, date: { gte: since } },
        orderBy: { date: 'asc' },
      }),
    );
  }),
);
