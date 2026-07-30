import rateLimit, { ipKeyGenerator, type Store } from 'express-rate-limit';
import type { Request } from 'express';
import RedisStore from 'rate-limit-redis';

import { env } from '../lib/env';
import { redisClient } from '../lib/redis';
import type { AuthedRequest } from './auth';

/**
 * Limites de taxa.
 *
 * A ausência disto era o buraco mais sério da API: doze tentativas de senha
 * errada em sequência recebiam doze `401` sem qualquer atrito. Com argon2 cada
 * verificação custa caro no servidor, então o mesmo endpoint servia para
 * adivinhar senha E para derrubar a máquina.
 *
 * O contador vive no Redis quando ele existe. Em memória, o contador é POR
 * PROCESSO: com duas réplicas atrás de um balanceador o limite efetivo dobra, e
 * quem percebe isso só precisa insistir para que o round-robin conceda o dobro
 * de tentativas. O pior do modo em memória não é ser frouxo — é parecer correto
 * em teste local e afrouxar exatamente quando se escala.
 */

/**
 * A store é resolvida na CONSTRUÇÃO do limitador, e os limitadores são
 * construídos depois de o Redis conectar — ver `createLimiters` e o bootstrap
 * em `server.ts`.
 *
 * O detalhe não é decorativo: este módulo é carregado na fase de import, muito
 * antes de qualquer conexão existir. Resolver a store ali prenderia o processo
 * no modo em memória para sempre, com o Redis no ar e ninguém percebendo — o
 * limite pareceria configurado e continuaria por processo.
 */
function store(prefix: string): Store | undefined {
  const client = redisClient();
  if (!client) return undefined;
  return new RedisStore({
    prefix: `rl:${prefix}:`,
    sendCommand: (...args: string[]) => client.sendCommand(args),
  }) as unknown as Store;
}

/** Sem `trust proxy` configurado, todo mundo vira o IP do balanceador. */
export const TRUST_PROXY_HOPS = 1;

const isProd = env.NODE_ENV === 'production';

/**
 * Login e cadastro: o alvo de credential stuffing.
 *
 * Conta só as tentativas que FALHARAM. Quem acerta a senha não gasta cota, então
 * o limite baixo não atrapalha quem digita errado uma vez e acerta na segunda.
 */
const makeAuthLimiter = () => rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: isProd ? 10 : 100,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  // Redis fora não pode virar indisponibilidade da API inteira. Sem isto, um
  // erro da store vira 500 em TODA rota — trocar um limite mais frouxo por um
  // apagão é o pior negócio possível para um serviço de apoio.
  passOnStoreError: true,
  store: store('auth'),
  message: { error: 'Muitas tentativas. Tente de novo em alguns minutos.' },
});

/**
 * Ingest de biometria: alto de propósito.
 *
 * O wearable acumula offline e despeja lotes na reconexão — um limite apertado
 * transformaria uma volta de viagem em perda de dado. O teto real do abuso aqui
 * é o tamanho do corpo, que já está limitado a 2 MB e 1000 leituras por lote.
 */
const makeIngestLimiter = () => rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  // Redis fora não pode virar indisponibilidade da API inteira. Sem isto, um
  // erro da store vira 500 em TODA rota — trocar um limite mais frouxo por um
  // apagão é o pior negócio possível para um serviço de apoio.
  passOnStoreError: true,
  store: store('ingest'),
  keyGenerator: userOrIp,
  message: { error: 'Muitas requisições' },
});

/** Teto geral, para nenhuma rota ficar descoberta por esquecimento. */
const makeApiLimiter = () => rateLimit({
  windowMs: 60 * 1000,
  limit: isProd ? 120 : 1000,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  // Redis fora não pode virar indisponibilidade da API inteira. Sem isto, um
  // erro da store vira 500 em TODA rota — trocar um limite mais frouxo por um
  // apagão é o pior negócio possível para um serviço de apoio.
  passOnStoreError: true,
  store: store('api'),
  keyGenerator: userOrIp,
  message: { error: 'Muitas requisições' },
});

/**
 * Chaveia por usuário quando há token, por IP quando não há.
 *
 * Por IP apenas, uma família atrás do mesmo NAT dividiria a cota; por usuário
 * apenas, quem ainda não autenticou ficaria sem limite algum. `ipKeyGenerator`
 * é da própria biblioteca e normaliza IPv6 para o prefixo /64 — sem isso, um
 * atacante com um bloco IPv6 troca de endereço a cada requisição.
 */
function userOrIp(req: Request): string {
  const userId = (req as AuthedRequest).userId;
  return userId ? `u:${userId}` : ipKeyGenerator(req.ip ?? '');
}

/**
 * Constrói os três limitadores. Chamar SÓ depois de `initRedis()` resolver.
 */
export function createLimiters() {
  return {
    auth: makeAuthLimiter(),
    ingest: makeIngestLimiter(),
    api: makeApiLimiter(),
  };
}
