import axios from 'axios';
import { Router } from 'express';
import { z } from 'zod';

import { AuthedRequest, requireAuth } from '../middleware/auth';
import { asyncRoute } from '../middleware/error';
import { env } from '../lib/env';
import { prisma } from '../lib/prisma';

/**
 * Contagem de calorias por foto — o desenho do MUVX no nosso serviço de IA.
 *
 * A FOTO não é armazenada em lugar nenhum: sobe, é analisada e morre no
 * caminho — mesmo contrato dos eventos de agenda. O que persiste é o
 * resultado: alimentos, porções e a faixa de calorias, que é o que a tela de
 * histórico precisa.
 */
export const nutritionRoutes = Router();
nutritionRoutes.use(requireAuth);

const client = axios.create({ baseURL: env.AI_SERVICE_URL, timeout: 60_000 });

const analyzeSchema = z.object({
  /** Sem prefixo data URI. O limite global de corpo (2 MB) segura o excesso. */
  imageBase64: z.string().min(1),
  mediaType: z.enum(['image/jpeg', 'image/png', 'image/webp']).default('image/jpeg'),
  description: z.string().max(500).optional(),
});

nutritionRoutes.post(
  '/meal',
  asyncRoute<AuthedRequest>(async (req, res) => {
    const body = analyzeSchema.parse(req.body);

    const { data } = await client.post('/nutrition/analyze', {
      image_b64: body.imageBase64,
      media_type: body.mediaType,
      description: body.description,
      request_id: req.userId,
    });

    // Foto sem comida é resposta válida: devolve sem persistir — não existe
    // refeição de paisagem, e registrá-la sujaria o total do dia.
    if (!data.is_food) {
      res.json({ record: null, analysis: data });
      return;
    }

    const record = await prisma.mealRecord.create({
      data: {
        userId: req.userId,
        foods: data.foods,
        kcalMin: data.kcal_total_min,
        kcalMax: data.kcal_total_max,
        confidence: data.confidence,
        notes: data.notes || null,
      },
    });
    res.status(201).json({ record, analysis: data });
  }),
);

nutritionRoutes.get(
  '/meals',
  asyncRoute<AuthedRequest>(async (req, res) => {
    const { days } = z.object({ days: z.coerce.number().int().min(1).max(90).default(7) }).parse(req.query);
    const since = new Date(Date.now() - days * 86_400_000);
    res.json(
      await prisma.mealRecord.findMany({
        where: { userId: req.userId, at: { gte: since } },
        orderBy: { at: 'desc' },
      }),
    );
  }),
);

// Registro errado sai na hora — análise de foto erra, e o total do dia não
// pode ficar refém do erro.
nutritionRoutes.delete(
  '/meal/:id',
  asyncRoute<AuthedRequest>(async (req, res) => {
    await prisma.mealRecord.deleteMany({ where: { id: req.params.id, userId: req.userId } });
    res.status(204).end();
  }),
);
