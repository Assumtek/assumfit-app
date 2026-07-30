import jwt from 'jsonwebtoken';

import { decrypt, encrypt } from '../../lib/crypto';
import { calendarEnabled, env } from '../../lib/env';
import { badRequest, forbidden, notFound } from '../../lib/errors';
import { logError } from '../../lib/log';
import { prisma } from '../../lib/prisma';
import { providers, type CalendarEvent, type Provider } from './providers';

export type { CalendarEvent, Provider };

/** O `redirect_uri` precisa bater EXATAMENTE com o registrado no provedor. */
export const redirectUri = (provider: Provider) => `${env.PUBLIC_URL}/calendar/${provider}/callback`;

/**
 * `state` assinado, com validade curta.
 *
 * É a proteção contra CSRF do fluxo OAuth: sem ele, um atacante consegue fazer
 * a vítima conectar a agenda DELE à conta dela, e passa a ver tudo que o app
 * mostrar. Assinado com o segredo do servidor e amarrado ao usuário, um `state`
 * forjado não sobrevive à verificação.
 */
const STATE_TTL = '10m';

export function signState(userId: string, provider: Provider): string {
  return jwt.sign({ sub: userId, provider }, env.JWT_SECRET, { expiresIn: STATE_TTL });
}

export function verifyState(state: string): { userId: string; provider: Provider } {
  try {
    const payload = jwt.verify(state, env.JWT_SECRET) as { sub?: string; provider?: string };
    if (!payload.sub || (payload.provider !== 'google' && payload.provider !== 'microsoft')) {
      throw new Error('state sem conteúdo esperado');
    }
    return { userId: payload.sub, provider: payload.provider };
  } catch {
    throw badRequest('Autorização inválida ou expirada. Tente conectar novamente.');
  }
}

function ensureEnabled(provider: Provider) {
  if (!calendarEnabled[provider]) {
    throw notFound(`Integração com ${provider} não está configurada neste ambiente`);
  }
}

export function authorizeUrl(userId: string, provider: Provider): string {
  ensureEnabled(provider);
  return providers[provider].authorizeUrl(signState(userId, provider), redirectUri(provider));
}

/**
 * Conclui a conexão.
 *
 * Exige consentimento `calendar_read` ATIVO. Não é formalidade: o calendário
 * traz nome e horário de reunião de gente que não é assinante, e a base legal
 * para tocar nesse dado é o consentimento específico de quem autorizou o acesso.
 * Sem o registro, a conexão é recusada mesmo que o provedor já tenha dito sim.
 */
export async function completeConnection(userId: string, provider: Provider, code: string) {
  ensureEnabled(provider);

  const consent = await prisma.consent.findFirst({
    where: { userId, purpose: 'calendar_read', revokedAt: null },
  });
  if (!consent) throw forbidden('Consentimento de leitura de agenda não registrado');

  const tokens = await providers[provider].exchangeCode(code, redirectUri(provider));
  if (!tokens.refreshToken) {
    throw badRequest('O provedor não devolveu credencial de longa duração. Refaça a conexão concedendo acesso offline.');
  }

  await prisma.calendarAccount.upsert({
    where: { userId_provider: { userId, provider } },
    create: {
      userId,
      provider,
      accountEmail: tokens.email,
      accessToken: encrypt(tokens.accessToken),
      refreshToken: encrypt(tokens.refreshToken),
      expiresAt: tokens.expiresAt,
      scope: tokens.scope,
    },
    update: {
      accountEmail: tokens.email,
      accessToken: encrypt(tokens.accessToken),
      refreshToken: encrypt(tokens.refreshToken),
      expiresAt: tokens.expiresAt,
      scope: tokens.scope,
      connectedAt: new Date(),
    },
  });

  return { provider, email: tokens.email };
}

/** Margem antes do vencimento. Renovar em cima da hora perde a corrida. */
const REFRESH_MARGIN_MS = 60_000;

async function accessTokenFor(userId: string, provider: Provider): Promise<string | null> {
  const account = await prisma.calendarAccount.findUnique({
    where: { userId_provider: { userId, provider } },
  });
  if (!account) return null;

  if (account.expiresAt.getTime() - REFRESH_MARGIN_MS > Date.now()) {
    return decrypt(account.accessToken);
  }

  try {
    const renewed = await providers[provider].refresh(decrypt(account.refreshToken));
    await prisma.calendarAccount.update({
      where: { id: account.id },
      data: {
        accessToken: encrypt(renewed.accessToken),
        refreshToken: encrypt(renewed.refreshToken),
        expiresAt: renewed.expiresAt,
      },
    });
    return renewed.accessToken;
  } catch (err) {
    // Refresh recusado quase sempre significa acesso revogado do lado de lá.
    // Apagar a conexão é a resposta certa: manter uma credencial morta faria a
    // tela mostrar "conectado" para sempre sem nunca trazer evento.
    logError(`calendar:refresh:${provider}`, err);
    await prisma.calendarAccount.delete({ where: { id: account.id } }).catch(() => undefined);
    return null;
  }
}

export async function listConnections(userId: string) {
  const accounts = await prisma.calendarAccount.findMany({
    where: { userId },
    select: { provider: true, accountEmail: true, connectedAt: true, lastSyncAt: true },
  });
  return {
    available: (Object.keys(calendarEnabled) as Provider[]).filter((p) => calendarEnabled[p]),
    connected: accounts,
  };
}

export async function disconnect(userId: string, provider: Provider): Promise<void> {
  await prisma.calendarAccount
    .delete({ where: { userId_provider: { userId, provider } } })
    .catch(() => undefined);
}

/**
 * Eventos de todas as contas conectadas, no intervalo pedido.
 *
 * Nada é persistido — busca, normaliza e devolve. Guardar os compromissos
 * significaria manter, no nosso banco, o nome e o horário das reuniões de
 * pessoas que nunca aceitaram termo algum conosco. A mesma escolha vale para a
 * coordenada do clima.
 *
 * Um provedor fora do ar não derruba o outro: a agenda com metade dos eventos é
 * melhor que uma tela de erro.
 */
export async function fetchEvents(userId: string, from: Date, to: Date): Promise<CalendarEvent[]> {
  const accounts = await prisma.calendarAccount.findMany({
    where: { userId },
    select: { provider: true },
  });

  const results = await Promise.all(
    accounts.map(async ({ provider }) => {
      try {
        const token = await accessTokenFor(userId, provider);
        if (!token) return [];
        const events = await providers[provider].listEvents(token, from, to);
        await prisma.calendarAccount
          .update({ where: { userId_provider: { userId, provider } }, data: { lastSyncAt: new Date() } })
          .catch(() => undefined);
        return events;
      } catch (err) {
        logError(`calendar:list:${provider}`, err);
        return [];
      }
    }),
  );

  return results.flat().sort((a, b) => a.start.localeCompare(b.start));
}
