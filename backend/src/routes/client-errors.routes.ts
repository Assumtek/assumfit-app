import { Router } from 'express';
import { z } from 'zod';

import { requireAuth } from '../middleware/auth';
import { asyncRoute } from '../middleware/error';

/**
 * Erros de JavaScript do app, com mensagem e pilha.
 *
 * Existe por um crash que chegou pelo TestFlight (22/08/2026) sem a mensagem:
 * o log nativo só diz "RCTFatal — Unhandled JS Exception", e a linha que
 * derrubou o app fica para sempre desconhecida. O app passa a mandar o que o
 * iOS não manda: mensagem, pilha (já limitada), se foi fatal, versão e build.
 *
 * Só log, de propósito — sem tabela. Não carrega dado biométrico nem
 * identifica além do `userId` da sessão, que o log do backend já tem para
 * tudo. Se virar volume, vira tabela com retenção; hoje o que falta é UMA
 * mensagem por crash.
 */
export const clientErrorsRoutes = Router();
clientErrorsRoutes.use(requireAuth);

const schema = z.object({
  message: z.string().max(2000),
  stack: z.string().max(8000).optional(),
  fatal: z.boolean().default(false),
  version: z.string().max(40).optional(),
  build: z.string().max(20).optional(),
  platform: z.string().max(20).optional(),
  screen: z.string().max(120).optional(),
  at: z.string().datetime().optional(),
});

clientErrorsRoutes.post(
  '/',
  asyncRoute(async (req, res) => {
    const body = schema.parse(req.body);
    console.error(
      `[client-error] ${body.fatal ? 'FATAL' : 'soft'} ${body.platform ?? '?'} ${body.version ?? '?'} (${body.build ?? '?'})` +
        `${body.screen ? ` em ${body.screen}` : ''}: ${body.message}\n${body.stack ?? ''}`,
    );
    res.status(204).end();
  }),
);
