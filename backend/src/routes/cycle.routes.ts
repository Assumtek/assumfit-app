import { Router } from 'express';
import { z } from 'zod';

import { AuthedRequest, requireAuth } from '../middleware/auth';
import { asyncRoute } from '../middleware/error';
import { prisma } from '../lib/prisma';

/**
 * Ciclo menstrual.
 *
 * Duas decisões que valem estar aqui e não só no schema:
 *
 * **Só para quem tem sexo biológico feminino no cadastro.** Não é filtro de
 * interface — é filtro de servidor. Uma tela escondida no app continua
 * alcançável por quem chamar a API direto, e a rota precisa recusar sozinha.
 *
 * **Consentimento próprio.** `menstrual_tracking` é separado do de biometria
 * porque descreve a vida reprodutiva, e quem aceita compartilhar batimento não
 * necessariamente aceita isto. Sem consentimento ativo, a escrita é recusada.
 */
export const cycleRoutes = Router();
cycleRoutes.use(requireAuth);

/** Recusa antes de tocar no dado. Devolve `null` quando pode seguir. */
async function bloqueio(userId: string, precisaConsentimento: boolean): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { sex: true } });
  if (user?.sex !== 'f') return 'Recurso indisponível para este perfil.';
  if (!precisaConsentimento) return null;

  const consent = await prisma.consent.findFirst({
    where: { userId, purpose: 'menstrual_tracking', revokedAt: null },
    select: { id: true },
  });
  return consent ? null : 'É preciso consentir com o registro de ciclo antes de gravar.';
}

/**
 * Consentimento do registro de ciclo.
 *
 * Consentimento separado, revogável e com efeito real ao revogar. Aqui revogar APAGA os ciclos registrados — manter o dado depois do
 * "não" transformaria o consentimento em formalidade, e este é justamente o
 * dado que alguém mais pode querer que suma.
 */
cycleRoutes.put(
  '/consent',
  asyncRoute<AuthedRequest>(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { sex: true } });
    if (user?.sex !== 'f') return res.status(403).json({ error: 'Recurso indisponível para este perfil.' });

    const { granted, version } = z
      .object({ granted: z.boolean(), version: z.string().min(1).max(32) })
      .parse(req.body);

    if (!granted) {
      await prisma.consent.updateMany({
        where: { userId: req.userId, purpose: 'menstrual_tracking', revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await prisma.menstrualCycle.deleteMany({ where: { userId: req.userId } });
      return res.json({ granted: false });
    }

    const existing = await prisma.consent.findFirst({
      where: { userId: req.userId, purpose: 'menstrual_tracking', revokedAt: null },
    });
    if (!existing) {
      await prisma.consent.create({
        data: { userId: req.userId, purpose: 'menstrual_tracking', version },
      });
    }
    return res.json({ granted: true });
  }),
);

/** Se já há consentimento ativo — a tela precisa saber antes de deixar registrar. */
cycleRoutes.get(
  '/consent',
  asyncRoute<AuthedRequest>(async (req, res) => {
    const consent = await prisma.consent.findFirst({
      where: { userId: req.userId, purpose: 'menstrual_tracking', revokedAt: null },
      select: { grantedAt: true },
    });
    res.json({ granted: Boolean(consent) });
  }),
);

cycleRoutes.get(
  '/',
  asyncRoute<AuthedRequest>(async (req, res) => {
    // Leitura não exige consentimento: se há dado gravado, ele já foi
    // consentido uma vez, e negar a leitura depois de revogar impediria a
    // pessoa de ver o que precisa apagar.
    const erro = await bloqueio(req.userId, false);
    if (erro) return res.status(403).json({ error: erro });

    const { months } = z
      .object({ months: z.coerce.number().int().min(1).max(24).default(12) })
      .parse(req.query);

    const desde = new Date();
    desde.setMonth(desde.getMonth() - months);

    const cycles = await prisma.menstrualCycle.findMany({
      where: { userId: req.userId, startedAt: { gte: desde } },
      orderBy: { startedAt: 'desc' },
      select: { startedAt: true, durationDays: true },
    });

    res.json(
      cycles.map((c) => ({
        // `YYYY-MM-DD`: o app trabalha em data local, e devolver ISO com hora
        // faria o dia virar no fuso de quem está a leste.
        startedAt: c.startedAt.toISOString().slice(0, 10),
        durationDays: c.durationDays,
      })),
    );
  }),
);

cycleRoutes.post(
  '/',
  asyncRoute<AuthedRequest>(async (req, res) => {
    const erro = await bloqueio(req.userId, true);
    if (erro) return res.status(403).json({ error: erro });

    const { startedAt, durationDays } = z
      .object({
        startedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        durationDays: z.number().int().min(1).max(14).nullable().default(null),
      })
      .parse(req.body);

    // Data futura é erro de digitação, não registro. Aceitar criaria um ciclo
    // que ainda não começou e jogaria a previsão inteira para frente.
    if (new Date(`${startedAt}T12:00:00`) > new Date()) {
      return res.status(400).json({ error: 'A data não pode ser no futuro.' });
    }

    const saved = await prisma.menstrualCycle.upsert({
      where: { userId_startedAt: { userId: req.userId, startedAt: new Date(startedAt) } },
      create: { userId: req.userId, startedAt: new Date(startedAt), durationDays },
      update: { durationDays },
      select: { startedAt: true, durationDays: true },
    });

    res.status(201).json({
      startedAt: saved.startedAt.toISOString().slice(0, 10),
      durationDays: saved.durationDays,
    });
  }),
);

cycleRoutes.delete(
  '/:startedAt',
  asyncRoute<AuthedRequest>(async (req, res) => {
    const erro = await bloqueio(req.userId, false);
    if (erro) return res.status(403).json({ error: erro });

    const startedAt = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(req.params.startedAt);
    // Apagar não exige consentimento ativo — é o oposto: negar isso a quem
    // revogou prenderia a pessoa ao dado que ela quer remover.
    await prisma.menstrualCycle
      .delete({ where: { userId_startedAt: { userId: req.userId, startedAt: new Date(startedAt) } } })
      .catch(() => undefined);
    res.status(204).end();
  }),
);
