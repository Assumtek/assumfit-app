import { Router } from 'express';
import { z } from 'zod';

import { AuthedRequest, requireAuth } from '../middleware/auth';
import { asyncRoute } from '../middleware/error';
import * as biometric from '../services/biometric.service';

export const biometricRoutes = Router();
biometricRoutes.use(requireAuth);

const readingSchema = z.object({
  recordedAt: z.string().datetime(),
  hrvMs: z.number().min(0).max(400).nullish(),
  heartRate: z.number().int().min(20).max(240).nullish(),
  spo2Pct: z.number().min(50).max(100).nullish(),
  temperature: z.number().min(25).max(45).nullish(),
  steps: z.number().int().min(0).nullish(),
  bpSystolic: z.number().int().min(50).max(260).nullish(),
  bpDiastolic: z.number().int().min(30).max(200).nullish(),
  stressScore: z.number().min(0).max(100).nullish(),
  respRate: z.number().min(2).max(60).nullish(),
  source: z.enum(['staranb', 'healthkit', 'health-connect', 'mock']).optional(),
  clientId: z.string().max(64).nullish(),
});

/**
 * Lote limitado a 1000: o wearable acumula offline, mas um corpo ilimitado
 * vira vetor de exaustão de memória.
 */
const ingestSchema = z.object({ readings: z.array(readingSchema).min(1).max(1000) });

biometricRoutes.post(
  '/ingest',
  asyncRoute<AuthedRequest>(async (req, res) => {
    const { readings } = ingestSchema.parse(req.body);
    const result = await biometric.ingestReadings(req.userId, readings);
    res.status(202).json({ received: readings.length, ...result });
  }),
);

biometricRoutes.get(
  '/latest',
  asyncRoute<AuthedRequest>(async (req, res) => {
    const reading = await biometric.latestReading(req.userId);
    res.json(reading ?? null);
  }),
);

biometricRoutes.get(
  '/series',
  asyncRoute<AuthedRequest>(async (req, res) => {
    const { hours } = z.object({ hours: z.coerce.number().int().min(1).max(720).default(24) }).parse(req.query);
    res.json(await biometric.hourlySeries(req.userId, hours));
  }),
);

/**
 * Resumo por dia, para a faixa de histórico.
 *
 * `tzOffset` em MINUTOS vem do aparelho: o servidor roda em UTC, e sem ele a
 * medição feita às 22h no Brasil cairia no dia seguinte.
 */
biometricRoutes.get(
  '/daily',
  asyncRoute<AuthedRequest>(async (req, res) => {
    const { days, tzOffset } = z
      .object({
        days: z.coerce.number().int().min(1).max(365).default(30),
        // O limite cobre o intervalo real de fusos, de -12h a +14h.
        tzOffset: z.coerce.number().int().min(-840).max(840).default(0),
      })
      .parse(req.query);
    res.json(await biometric.dailySummary(req.userId, days, tzOffset));
  }),
);

biometricRoutes.get(
  '/baseline',
  asyncRoute<AuthedRequest>(async (req, res) => {
    const hrv = await biometric.hrvBaseline(req.userId);
    res.json({ hrvMs: hrv, calibrating: hrv === null });
  }),
);
