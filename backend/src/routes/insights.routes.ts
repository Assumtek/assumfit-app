import { Router } from 'express';
import { z } from 'zod';

import { AuthedRequest, requireAuth } from '../middleware/auth';
import { asyncRoute } from '../middleware/error';
import { prisma } from '../lib/prisma';
import { hrvBaseline } from '../services/biometric.service';
import { energyNow } from '../services/scoring.service';

export const insightsRoutes = Router();
insightsRoutes.use(requireAuth);

/**
 * A regra de negócio de score e idade biológica mora num lugar só — o modelo em
 * Python. Estas rotas leem o banco, chamam o modelo e devolvem; quem monta o
 * payload e persiste é `scoring.service`, compartilhado com o job horário.
 * Duplicar a fórmula aqui garantiria divergência entre os dois.
 */

/**
 * O que a tela inicial mostra: score, curva do dia e o texto do insight.
 *
 * `hour` vem do APARELHO. A hora do dia é entrada do modelo — o vale da tarde
 * só existe em relação ao relógio de quem está lendo —, e o servidor roda em
 * UTC. Sem o parâmetro, todo assinante brasileiro receberia um insight três
 * horas adiantado.
 */
insightsRoutes.get(
  '/energy',
  asyncRoute<AuthedRequest>(async (req, res) => {
    const { hour } = z.object({ hour: z.coerce.number().int().min(0).max(23).optional() }).parse(req.query);

    try {
      const result = await energyNow(req.userId, { hour });
      if (!result) return res.status(404).json({ error: 'Sem leitura ainda' });
      return res.json(result);
    } catch {
      const baseline = await hrvBaseline(req.userId).catch(() => null);
      // 503 e não um score improvisado: a tela sabe cair para o cálculo local
      // dela, e um número inventado aqui competiria com o de lá sem que ninguém
      // conseguisse dizer qual está certo.
      return res.status(503).json({ error: 'Serviço de modelo indisponível', calibrating: baseline === null });
    }
  }),
);

insightsRoutes.get(
  '/bioage',
  asyncRoute<AuthedRequest>(async (req, res) => {
    const { days } = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }).parse(req.query);
    const since = new Date(Date.now() - days * 86400000);
    res.json(
      await prisma.bioAgeScore.findMany({
        where: { userId: req.userId, calculatedAt: { gte: since } },
        orderBy: { calculatedAt: 'asc' },
      }),
    );
  }),
);
