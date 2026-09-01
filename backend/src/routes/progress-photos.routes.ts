import { Router } from 'express';
import { z } from 'zod';

import { prisma } from '../lib/prisma';
import { AuthedRequest, requireAuth } from '../middleware/auth';
import { asyncRoute } from '../middleware/error';
import { apagarImagens, chaveEhDoUsuario, presignImageRead } from '../services/media.service';

/**
 * As fotos de evolução: a linha do tempo do corpo.
 *
 * Viviam só no aparelho, com um índice em arquivo, e trocar de celular
 * recomeçava do zero. Desde 01/09/2026 (decisão da fundadora, "todas as
 * imagens precisam ser salvas na S3") a imagem vai para o bucket privado e a
 * ordem fica aqui.
 *
 * **O dado mais sensível que o app guarda.** Foto de corpo descreve saúde e
 * identifica a pessoa sozinha, por isso consentimento próprio
 * (`progress_photos`): quem aceitou que a gente guarde a foto do prato não
 * aceitou necessariamente isto.
 */
export const progressPhotoRoutes = Router();
progressPhotoRoutes.use(requireAuth);

const ANGULOS = ['frente', 'lado', 'costas'] as const;

/**
 * A lista, já com as URLs de leitura prontas.
 *
 * Assinar aqui evita a segunda viagem que a tela faria para cada foto: a grade
 * abre com as imagens, não com uma sequência de espaços que se preenchem.
 */
progressPhotoRoutes.get(
  '/',
  asyncRoute<AuthedRequest>(async (req, res) => {
    const fotos = await prisma.progressPhoto.findMany({
      where: { userId: req.userId },
      orderBy: { takenAt: 'desc' },
      take: 200,
    });
    const comUrl = await Promise.all(
      fotos.map(async (f) => ({
        id: f.id,
        angle: f.angle,
        takenAt: f.takenAt,
        url: await presignImageRead(req.userId, f.imageKey).catch(() => null),
      })),
    );
    res.json({ fotos: comUrl });
  }),
);

progressPhotoRoutes.post(
  '/',
  asyncRoute<AuthedRequest>(async (req, res) => {
    const { imageKey, angle, takenAt } = z
      .object({
        imageKey: z.string().max(300),
        angle: z.enum(ANGULOS).optional(),
        takenAt: z.coerce.date().optional(),
      })
      .parse(req.body ?? {});

    if (!chaveEhDoUsuario(imageKey, req.userId)) {
      res.status(400).json({ error: 'imagem inválida' });
      return;
    }

    const foto = await prisma.progressPhoto.create({
      data: {
        userId: req.userId,
        imageKey,
        angle: angle ?? null,
        takenAt: takenAt ?? new Date(),
      },
    });
    res.status(201).json({
      id: foto.id,
      angle: foto.angle,
      takenAt: foto.takenAt,
      url: await presignImageRead(req.userId, imageKey).catch(() => null),
    });
  }),
);

progressPhotoRoutes.delete(
  '/:id',
  asyncRoute<AuthedRequest>(async (req, res) => {
    const alvo = await prisma.progressPhoto.findFirst({
      where: { id: req.params.id, userId: req.userId },
      select: { imageKey: true },
    });
    if (!alvo) {
      res.status(204).end();
      return;
    }
    await prisma.progressPhoto.deleteMany({ where: { id: req.params.id, userId: req.userId } });
    // A imagem sai junto: foto de corpo que a pessoa mandou apagar não fica
    // num bucket porque a linha do banco já sumiu.
    await apagarImagens([alvo.imageKey]);
    res.status(204).end();
  }),
);
