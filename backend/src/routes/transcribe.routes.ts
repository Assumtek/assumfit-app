import { Router } from 'express';
import { z } from 'zod';

import { AuthedRequest, requireAuth } from '../middleware/auth';
import { asyncRoute } from '../middleware/error';
import * as transcribe from '../services/transcribe.service';

/**
 * Ditado por voz para o chat e a anamnese. Três passos, como no MUVX:
 * presign → o app sobe o áudio direto ao S3 → start → polling do texto.
 */
export const transcribeRoutes = Router();
transcribeRoutes.use(requireAuth);

transcribeRoutes.use((_req, res, next) => {
  if (!transcribe.configured) {
    res.status(503).json({ error: 'transcrição indisponível neste ambiente' });
    return;
  }
  next();
});

transcribeRoutes.post(
  '/presign',
  asyncRoute<AuthedRequest>(async (req, res) => {
    const { format } = z.object({ format: z.string().default('m4a') }).parse(req.body ?? {});
    res.json(await transcribe.presignAudioUpload(req.userId, format));
  }),
);

transcribeRoutes.post(
  '/start',
  asyncRoute<AuthedRequest>(async (req, res) => {
    const { key, format } = z
      .object({ key: z.string().min(1), format: z.string().default('m4a') })
      .parse(req.body);
    res.json(await transcribe.startTranscription(req.userId, key, format));
  }),
);

transcribeRoutes.get(
  '/:jobName',
  asyncRoute<AuthedRequest>(async (req, res) => {
    // O nome do job carrega o userId (vem da chave) — conferir evita ler
    // transcrição alheia trocando o nome na URL.
    if (!req.params.jobName.startsWith(`assumfit-audio-${req.userId}`)) {
      res.status(404).json({ error: 'job não encontrado' });
      return;
    }
    res.json(await transcribe.getTranscription(req.params.jobName));
  }),
);
