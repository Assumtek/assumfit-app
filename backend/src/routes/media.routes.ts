import { Router } from 'express';
import { z } from 'zod';

import { AuthedRequest, requireAuth } from '../middleware/auth';
import { asyncRoute } from '../middleware/error';
import * as media from '../services/media.service';

/**
 * As imagens do app: subir e ler, sempre por URL pré-assinada.
 *
 * O arquivo nunca passa por aqui, o que dobraria o tráfego sem ganhar nada. O
 * servidor decide QUEM pode subir onde e QUEM pode ler o quê, e assina; o
 * aparelho fala direto com o S3.
 */
export const mediaRoutes = Router();
mediaRoutes.use(requireAuth);

mediaRoutes.use((_req, res, next) => {
  if (!media.configured) {
    res.status(503).json({ error: 'armazenamento de imagem indisponível neste ambiente' });
    return;
  }
  next();
});

mediaRoutes.post(
  '/presign',
  asyncRoute<AuthedRequest>(async (req, res) => {
    const { escopo, ext } = z
      .object({
        escopo: z.enum(media.ESCOPOS),
        ext: z.enum(['jpg', 'png']).default('jpg'),
      })
      .parse(req.body ?? {});
    res.json(await media.presignImageUpload(req.userId, escopo, ext));
  }),
);

/**
 * A URL de leitura de UMA imagem.
 *
 * A chave vai por query e é conferida contra o dono antes de assinar: sem
 * isso, quem descobrisse a chave de outra pessoa leria a foto dela.
 */
mediaRoutes.get(
  '/url',
  asyncRoute<AuthedRequest>(async (req, res) => {
    const { key } = z.object({ key: z.string().max(300) }).parse(req.query ?? {});
    if (!media.chaveEhDoUsuario(key, req.userId)) {
      res.status(404).json({ error: 'imagem não encontrada' });
      return;
    }
    res.json({ url: await media.presignImageRead(req.userId, key) });
  }),
);

/**
 * VÁRIAS de uma vez, que é como as telas precisam: uma lista de refeições ou a
 * grade de fotos de evolução pediria uma requisição por imagem.
 *
 * Chave de outra conta não é erro, é ausência: ela some do resultado, e a tela
 * mostra o espaço vazio daquele item em vez de falhar inteira.
 */
mediaRoutes.post(
  '/urls',
  asyncRoute<AuthedRequest>(async (req, res) => {
    const { keys } = z
      .object({ keys: z.array(z.string().max(300)).max(100) })
      .parse(req.body ?? {});
    const proprias = keys.filter((k) => media.chaveEhDoUsuario(k, req.userId));
    const urls: Record<string, string> = {};
    await Promise.all(
      proprias.map(async (k) => {
        urls[k] = await media.presignImageRead(req.userId, k);
      }),
    );
    res.json({ urls });
  }),
);
