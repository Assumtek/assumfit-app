import { createClient, type RedisClientType } from 'redis';

import { env } from './env';
import { logError } from './log';

/**
 * Redis — opcional em desenvolvimento, obrigatório em produção.
 *
 * Existe para duas coisas que **quebram silenciosamente com mais de uma
 * réplica**, e por isso não podiam continuar em memória:
 *
 * 1. **Limite de taxa.** Contador em memória é por processo. Com duas réplicas
 *    atrás de um balanceador, o limite efetivo dobra — e um atacante que
 *    percebe isso só precisa insistir para que o round-robin lhe dê o dobro de
 *    tentativas. Pior: o comportamento parece correto em teste local.
 * 2. **Revogação de access token.** O JWT é autocontido e vale 15 minutos. Sem
 *    um lugar compartilhado para dizer "esta conta acabou de ser apagada", uma
 *    réplica bloqueia e a outra deixa passar.
 *
 * Sem `REDIS_URL` o servidor sobe e cai para memória, com aviso. É legítimo em
 * desenvolvimento e recusado em produção por `env.ts`.
 */

let client: RedisClientType | null = null;
let ready = false;
/** Trava para não repetir o mesmo erro a cada tentativa de reconexão. */
let reportedDown = false;

export function initRedis(): void {
  if (!env.REDIS_URL) {
    console.warn('[redis] REDIS_URL ausente: limite de taxa e revogação ficam por processo (só desenvolvimento)');
    return;
  }

  client = createClient({
    url: env.REDIS_URL,
    /**
     * Sem isto, comando enviado com o Redis fora fica na FILA e a promessa nunca
     * resolve — a requisição HTTP inteira pendura até o cliente desistir.
     *
     * Foi exatamente o que aconteceu: com o Redis removido, `/health` seguia
     * respondendo (está montado antes dos limitadores) e todo o resto travava
     * sem status nenhum. O app mostrava "sem conexão com o servidor" com o
     * servidor de pé. Falhar rápido é o que permite ao limitador degradar.
     */
    disableOfflineQueue: true,
  });

  // Sem este handler, um erro de conexão vira `unhandledRejection` e derruba o
  // processo — o cliente do node-redis emite 'error' de forma assíncrona.
  //
  // O log sai UMA vez por queda, não a cada tentativa de reconexão: o cliente
  // reconecta em laço, e sem a trava um Redis fora enche o arquivo de log com
  // milhares de linhas idênticas por minuto — justamente quando alguém vai
  // precisar ler esse arquivo.
  client.on('error', (err) => {
    if (ready || !reportedDown) {
      logError('redis', err);
      reportedDown = true;
    }
    ready = false;
  });
  client.on('ready', () => {
    if (!ready) console.log('[redis] conectado');
    ready = true;
    reportedDown = false;
  });

  void client.connect().catch((err: unknown) => logError('redis:connect', err));
}

export const redisClient = () => (ready ? client : null);
export const redisReady = () => ready;

export async function closeRedis(): Promise<void> {
  await client?.quit().catch(() => undefined);
  client = null;
  ready = false;
}

/**
 * Lista de contas cujo access token deixou de valer antes de expirar.
 *
 * O `deleteAccount` apaga a linha e as sessões, mas o access token já emitido é
 * autocontido: ele continua abrindo a API pelos 15 minutos restantes, contra
 * uma conta que não existe mais. A chave expira sozinha ao fim da vida do
 * token, então a lista nunca cresce.
 *
 * Em memória quando não há Redis. É o comportamento correto para um processo
 * só, e explicitamente insuficiente para vários — daí a exigência em produção.
 */
const localRevoked = new Map<string, number>();

/** Segundos. Precisa cobrir a validade do access token com folga. */
const REVOKE_TTL_S = 20 * 60;

export async function revokeUser(userId: string): Promise<void> {
  const redis = redisClient();
  if (redis) {
    await redis.set(`revoked:${userId}`, '1', { EX: REVOKE_TTL_S }).catch((err: unknown) => {
      logError('redis:revoke', err);
    });
    return;
  }
  localRevoked.set(userId, Date.now() + REVOKE_TTL_S * 1000);
}

export async function isRevoked(userId: string): Promise<boolean> {
  const redis = redisClient();
  if (redis) {
    // Falha de Redis não pode bloquear a API inteira. Deixar passar é o menor
    // mal: a janela é de 15 minutos e a alternativa seria negar todo tráfego
    // autenticado sempre que o Redis piscar.
    return await redis
      .exists(`revoked:${userId}`)
      .then((n) => n > 0)
      .catch(() => false);
  }

  const until = localRevoked.get(userId);
  if (until === undefined) return false;
  if (until < Date.now()) {
    localRevoked.delete(userId);
    return false;
  }
  return true;
}
