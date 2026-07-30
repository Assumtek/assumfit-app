import { Router } from 'express';
import { z } from 'zod';

import { prisma } from '../lib/prisma';
import { AuthedRequest, requireAuth } from '../middleware/auth';
import { asyncRoute } from '../middleware/error';
import * as calendar from '../services/calendar';

export const calendarRoutes = Router();

const providerSchema = z.object({ provider: z.enum(['google', 'microsoft']) });

/**
 * O callback do OAuth NÃO passa por `requireAuth`.
 *
 * Quem chama é o navegador voltando do Google, e ele não carrega o nosso token
 * — a identidade vem do `state` assinado. Por isso o middleware é aplicado rota
 * a rota aqui, em vez de no roteador inteiro: um `router.use(requireAuth)` no
 * topo quebraria o fluxo inteiro com um 401 no último passo.
 */

calendarRoutes.get(
  '/',
  requireAuth,
  asyncRoute<AuthedRequest>(async (req, res) => {
    res.json(await calendar.listConnections(req.userId));
  }),
);

/**
 * Devolve a URL de autorização em JSON em vez de redirecionar.
 *
 * O app precisa abrir essa URL numa sessão de navegador do sistema, e um 302
 * seria seguido pelo cliente HTTP dele — que não tem cookie do Google nem sabe
 * desenhar tela de login. Quem redireciona é o navegador, não a nossa API.
 */
calendarRoutes.get(
  '/:provider/connect',
  requireAuth,
  asyncRoute<AuthedRequest>(async (req, res) => {
    const { provider } = providerSchema.parse(req.params);
    res.json({ url: calendar.authorizeUrl(req.userId, provider) });
  }),
);

/**
 * Retorno do provedor.
 *
 * Termina redirecionando para o deep link do app, com o resultado no parâmetro.
 * Nunca devolve HTML com o erro cru: a mensagem do provedor pode conter e-mail e
 * identificador da conta, e esta resposta passa pelo navegador do sistema.
 */
calendarRoutes.get(
  '/:provider/callback',
  asyncRoute(async (req, res) => {
    const { provider } = providerSchema.parse(req.params);
    const query = z
      .object({ code: z.string().optional(), state: z.string().optional(), error: z.string().optional() })
      .parse(req.query);

    const back = (status: string) => `assumfit://configuracoes?calendario=${status}&provedor=${provider}`;

    if (query.error || !query.code || !query.state) return res.redirect(back('cancelado'));

    try {
      const { userId, provider: fromState } = calendar.verifyState(query.state);
      // O provedor da URL e o do `state` têm de ser o mesmo: sem esta checagem,
      // um `state` legítimo do Google serviria para conectar a Microsoft.
      if (fromState !== provider) return res.redirect(back('invalido'));

      await calendar.completeConnection(userId, provider, query.code);
      return res.redirect(back('ok'));
    } catch {
      return res.redirect(back('falhou'));
    }
  }),
);

calendarRoutes.delete(
  '/:provider',
  requireAuth,
  asyncRoute<AuthedRequest>(async (req, res) => {
    const { provider } = providerSchema.parse(req.params);
    await calendar.disconnect(req.userId, provider);
    res.status(204).end();
  }),
);

/**
 * Eventos do intervalo. Padrão: o dia de hoje.
 *
 * A janela é limitada a 7 dias porque a tela mostra um dia por vez — um
 * intervalo aberto viraria um jeito de puxar a agenda inteira do ano numa
 * requisição, tanto pelo custo quanto pelo volume de dado de terceiros que
 * trafegaria de uma vez.
 */
const MAX_RANGE_MS = 7 * 24 * 60 * 60 * 1000;

calendarRoutes.get(
  '/events',
  requireAuth,
  asyncRoute<AuthedRequest>(async (req, res) => {
    const { from, to } = z
      .object({ from: z.string().datetime().optional(), to: z.string().datetime().optional() })
      .parse(req.query);

    const start = from ? new Date(from) : startOfToday();
    const end = to ? new Date(to) : new Date(start.getTime() + 24 * 60 * 60 * 1000);

    if (end <= start || end.getTime() - start.getTime() > MAX_RANGE_MS) {
      return res.status(400).json({ error: 'Intervalo inválido (máximo de 7 dias)' });
    }

    res.json({ events: await calendar.fetchEvents(req.userId, start, end) });
  }),
);

function startOfToday(): Date {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
}

/**
 * Consentimento de leitura de agenda.
 *
 * Fica separado do consentimento de biometria de propósito, e é revogável a
 * qualquer momento. Revogar APAGA as conexões junto: manter a credencial ativa
 * depois do "não" transformaria o consentimento em formalidade.
 */
calendarRoutes.put(
  '/consent',
  requireAuth,
  asyncRoute<AuthedRequest>(async (req, res) => {
    const { granted, version } = z
      .object({ granted: z.boolean(), version: z.string().min(1).max(32) })
      .parse(req.body);

    if (!granted) {
      await prisma.consent.updateMany({
        where: { userId: req.userId, purpose: 'calendar_read', revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await prisma.calendarAccount.deleteMany({ where: { userId: req.userId } });
      return res.json({ granted: false });
    }

    const existing = await prisma.consent.findFirst({
      where: { userId: req.userId, purpose: 'calendar_read', revokedAt: null },
    });
    if (!existing) {
      await prisma.consent.create({
        data: { userId: req.userId, purpose: 'calendar_read', version },
      });
    }
    return res.json({ granted: true });
  }),
);
