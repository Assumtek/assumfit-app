import { Router } from 'express';
import { z } from 'zod';

import { AuthedRequest, requireAuth } from '../middleware/auth';
import { asyncRoute } from '../middleware/error';
import { prisma } from '../lib/prisma';
import { camposParaGravar } from '../services/habits.service';

export const habitsRoutes = Router();
habitsRoutes.use(requireAuth);

const upsertSchema = z.object({
  date: z.string().date(),
  waterMl: z.number().int().min(0).max(10000).optional(),
  /**
   * Quando o APARELHO produziu este total de água. Opcional: app antigo não
   * manda, e sem carimbo a escrita continua valendo como antes.
   */
  at: z.string().datetime().optional(),
  sleepScore: z.number().min(0).max(100).optional(),
  sleepMinutes: z.number().int().min(0).max(1440).optional(),
  mood: z.enum(['great', 'ok', 'tired', 'bad']).optional(),
});

/**
 * Upsert por (usuário, dia): o app reenvia o dia inteiro a cada alteração.
 *
 * **Escrita de água atrasada é descartada.** O app manda o total do dia, não o
 * gole, e uma rajada de goles produzia uma escrita por gole: cinco PUT no
 * mesmo segundo em produção (24/08/2026). Escritas concorrentes do mesmo campo
 * chegam em qualquer ordem, e sem esta guarda a última a ser processada vencia,
 * mesmo carregando um total MENOR. O resultado era água sumindo do dia sozinha,
 * e um testador viu o total cair para o primeiro copo.
 *
 * O carimbo é do aparelho porque é lá que a ordem existe: o instante em que a
 * requisição chega ao servidor é justamente o que a rede embaralha. Sono e
 * humor não passam por isto, eles não são contador e não chegam em rajada.
 */
habitsRoutes.put(
  '/',
  asyncRoute<AuthedRequest>(async (req, res) => {
    const { date: dateStr, at, ...fields } = upsertSchema.parse(req.body);
    const date = new Date(dateStr);
    const waterAt = at ? new Date(at) : null;

    const atual = await prisma.dailyHabit.findUnique({
      where: { userId_date: { userId: req.userId, date } },
    });

    // A regra mora no serviço, testada sem banco. Ver `habits.service.ts`.
    const update = camposParaGravar(atual, fields, waterAt);

    const habit = await prisma.dailyHabit.upsert({
      where: { userId_date: { userId: req.userId, date } },
      create: { userId: req.userId, date, ...camposParaGravar(null, fields, waterAt) },
      update,
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
