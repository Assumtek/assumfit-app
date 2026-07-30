import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';

import { env } from '../lib/env';
import { unauthorized } from '../lib/errors';
import { isRevoked } from '../lib/redis';

export type AuthedRequest = Request & { userId: string };

/**
 * Toda rota de dado biométrico passa por aqui. O `userId` vem SEMPRE do token,
 * nunca do corpo ou da URL — aceitar user_id do cliente permitiria ler a
 * biometria de qualquer pessoa trocando um parâmetro.
 */
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next(unauthorized('Token ausente'));

  let userId: string;
  try {
    const payload = jwt.verify(header.slice(7), env.JWT_SECRET) as { sub?: string };
    if (!payload.sub) return next(unauthorized('Token inválido'));
    userId = payload.sub;
  } catch {
    return next(unauthorized('Token inválido ou expirado'));
  }

  /**
   * O JWT é autocontido: nada dentro dele sabe que a conta foi apagada.
   *
   * `deleteAccount` remove a linha e as sessões, mas o access token já emitido
   * continuava abrindo a API pelos 15 minutos restantes — contra uma conta que
   * não existe mais. A consulta é a uma chave de Redis com TTL, não ao banco:
   * um SELECT por requisição custaria caro em todas as chamadas para cobrir um
   * caso raro.
   */
  void isRevoked(userId).then((revoked) => {
    if (revoked) return next(unauthorized('Sessão encerrada'));
    (req as AuthedRequest).userId = userId;
    next();
  });
}
