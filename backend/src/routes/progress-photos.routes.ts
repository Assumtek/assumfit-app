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

/** Há consentimento ativo para guardar foto de corpo na nuvem? */
async function consentiu(userId: string): Promise<boolean> {
  const c = await prisma.consent.findFirst({
    where: { userId, purpose: 'progress_photos', revokedAt: null },
    select: { id: true },
  });
  return !!c;
}

/**
 * Consentimento das fotos de evolução, no mesmo desenho do registro de ciclo:
 * separado, revogável, e **revogar apaga as imagens**.
 *
 * Manter foto de corpo depois do "não" transformaria o consentimento em
 * formalidade, e este é exatamente o dado que alguém mais pode querer que suma.
 */
progressPhotoRoutes.put(
  '/consent',
  asyncRoute<AuthedRequest>(async (req, res) => {
    const { granted, version } = z
      .object({ granted: z.boolean(), version: z.string().min(1).max(32) })
      .parse(req.body);

    if (!granted) {
      await prisma.consent.updateMany({
        where: { userId: req.userId, purpose: 'progress_photos', revokedAt: null },
        data: { revokedAt: new Date() },
      });
      const fotos = await prisma.progressPhoto.findMany({
        where: { userId: req.userId },
        select: { imageKey: true },
      });
      await prisma.progressPhoto.deleteMany({ where: { userId: req.userId } });
      await apagarImagens(fotos.map((f) => f.imageKey)).catch(() => undefined);
      return res.json({ granted: false });
    }

    const existente = await prisma.consent.findFirst({
      where: { userId: req.userId, purpose: 'progress_photos', revokedAt: null },
    });
    if (!existente) {
      await prisma.consent.create({
        data: { userId: req.userId, purpose: 'progress_photos', version },
      });
    }
    return res.json({ granted: true });
  }),
);

progressPhotoRoutes.get(
  '/consent',
  asyncRoute<AuthedRequest>(async (req, res) => {
    res.json({ granted: await consentiu(req.userId) });
  }),
);

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

    /*
     Sem consentimento a foto NÃO fica. E o objeto já subiu, então ele é
     apagado aqui: deixar no bucket a imagem de corpo de quem não consentiu é
     precisamente o que a finalidade própria existe para evitar.
    */
    if (!(await consentiu(req.userId))) {
      await apagarImagens([imageKey]).catch(() => undefined);
      res.status(403).json({ error: 'consentimento necessário', consent: 'progress_photos' });
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
