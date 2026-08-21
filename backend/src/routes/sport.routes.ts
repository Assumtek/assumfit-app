import { Router } from 'express';
import { z } from 'zod';

import { AuthedRequest, requireAuth } from '../middleware/auth';
import { asyncRoute } from '../middleware/error';
import { prisma } from '../lib/prisma';

/**
 * Sessões de esporte — o registro do que o cronômetro mediu.
 *
 * A trilha de GPS sobe SIMPLIFICADA (decisão da fundadora, ago/2026 — o
 * histórico mostra o mapa como o Strava, em qualquer aparelho). Rota de
 * corrida é padrão de vida (onde a pessoa mora, treina, a que horas), então a
 * régua de minimização vale dobrada: o aparelho reduz a ≤300 pontos e ~1 m de
 * precisão antes de enviar, a listagem NÃO carrega trilha (só o detalhe), e o
 * cascade da conta a apaga junto. Dado sensível: nunca logar com user_id.
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
  /** Execução do plano que esta sessão cumpriu — o vínculo anti-dupla-contagem. */
  workoutExecutionId: z.string().uuid().nullish(),
  /**
   * O percurso, já SIMPLIFICADO pelo aparelho (o teto de 500 é o dobro do que
   * o app envia — folga, não convite). Menos de 2 pontos não é percurso.
   */
  track: z
    .array(z.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) }))
    .max(500)
    .nullish(),
});

sportRoutes.post(
  '/session',
  asyncRoute<AuthedRequest>(async (req, res) => {
    const body = sessionSchema.parse(req.body);

    // O vínculo só vale se a execução existe E é da própria pessoa. Vínculo
    // inválido não derruba o registro: a sessão vale sozinha, sem ele.
    let executionId: string | null = null;
    if (body.workoutExecutionId) {
      const execution = await prisma.workoutExecution.findFirst({
        where: { id: body.workoutExecutionId, userId: req.userId },
        select: { id: true },
      });
      executionId = execution?.id ?? null;
    }

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
        workoutExecutionId: executionId,
        track: body.track && body.track.length >= 2 ? body.track : undefined,
      },
    });
    res.status(201).json(session);
  }),
);

const feedbackSchema = z.object({
  perceivedEffort: z.number().int().min(1).max(10).nullish(),
  rating: z.number().int().min(1).max(5).nullish(),
  comment: z.string().max(500).nullish(),
});

/**
 * O "como foi" da sessão avulsa — mesma pergunta do fim de treino guiado.
 * Sessão vinculada a uma execução guarda a resposta NA execução; esta rota é
 * o lar da resposta quando não há execução nenhuma.
 */
sportRoutes.patch(
  '/session/:id',
  asyncRoute<AuthedRequest>(async (req, res) => {
    const body = feedbackSchema.parse(req.body);
    const updated = await prisma.sportSession.updateMany({
      // O `userId` no where é o que impede editar sessão dos outros.
      where: { id: req.params.id, userId: req.userId },
      data: {
        perceivedEffort: body.perceivedEffort ?? null,
        rating: body.rating ?? null,
        comment: body.comment ?? null,
      },
    });
    if (updated.count === 0) {
      res.status(404).json({ error: 'sessão não encontrada' });
      return;
    }
    res.status(204).end();
  }),
);

sportRoutes.get(
  '/sessions',
  asyncRoute<AuthedRequest>(async (req, res) => {
    const { days, from, to } = z
      .object({
        days: z.coerce.number().int().min(1).max(365).default(30),
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      })
      .parse(req.query);
    // Intervalo explícito (calendário) tem precedência sobre `days`.
    const inicio = from || to ? new Date(`${from ?? to}T00:00:00`) : new Date(Date.now() - days * 86_400_000);
    const fim = from || to ? new Date(`${to ?? from}T23:59:59.999`) : undefined;
    res.json(
      await prisma.sportSession.findMany({
        where: { userId: req.userId, startedAt: fim ? { gte: inicio, lte: fim } : { gte: inicio } },
        orderBy: { startedAt: 'desc' },
        // A trilha fica FORA da listagem de propósito: 90 dias de sessões com
        // percurso passariam de meio megabyte, e a home só quer datas e somas.
        // Quem abre o detalhe busca a trilha em /session/:id.
        omit: { track: true },
      }),
    );
  }),
);

/** Uma sessão com o percurso — o detalhe que desenha o mapa do histórico. */
sportRoutes.get(
  '/session/:id',
  asyncRoute<AuthedRequest>(async (req, res) => {
    const session = await prisma.sportSession.findFirst({
      where: { id: req.params.id, userId: req.userId },
    });
    if (!session) {
      res.status(404).json({ error: 'sessão não encontrada' });
      return;
    }
    res.json(session);
  }),
);
