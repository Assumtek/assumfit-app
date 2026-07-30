import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

import { HttpError } from '../lib/errors';
import { logError } from '../lib/log';

/**
 * Handler global. Nunca vaza stack em produção, e nunca ecoa o corpo da
 * requisição de volta — em ingest de biometria o corpo É o dado sensível.
 */
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Requisição inválida',
      issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }

  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, code: err.code });
  }

  // Loga SEMPRE, inclusive em produção. Silenciar fora de desenvolvimento
  // deixava todo 500 em produção sem rastro nenhum — nem para investigar
  // incidente, nem para perceber que existe um.
  logError('http', err);
  return res.status(500).json({ error: 'Erro interno' });
}

/** Envolve handler async para que rejeição vire `next(err)`. */
export function asyncRoute<T extends Request>(fn: (req: T, res: Response) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req as T, res).catch(next);
  };
}
