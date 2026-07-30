import axios from 'axios';

import { env } from '../../lib/env';

/**
 * Google Agenda e Outlook atrás de uma interface só.
 *
 * O fluxo é OAuth do lado do SERVIDOR, não do aplicativo. A diferença importa:
 * com PKCE no app, o refresh token do Google ficaria guardado no aparelho, e
 * qualquer comprometimento do dispositivo entregaria acesso permanente à agenda
 * mesmo depois de a pessoa sair do AssumFit. Aqui o segredo do cliente nunca
 * sai do servidor e o token nunca chega ao celular — o app só recebe o
 * resultado já normalizado.
 *
 * Escopo mínimo, e só leitura. Não pedimos permissão de escrita porque o
 * produto não marca compromisso; pedir mais do que se usa é o erro clássico de
 * integração de calendário, e é o que faz a tela de permissão assustar.
 */

export type Provider = 'google' | 'microsoft';

export type OAuthTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scope: string;
};

/** Evento já normalizado. É só o que a tela precisa — nada além disso entra. */
export type CalendarEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  /** Quantas pessoas — não QUEM. Ver a nota sobre participantes abaixo. */
  attendeeCount: number;
  provider: Provider;
};

export interface CalendarProvider {
  readonly id: Provider;
  authorizeUrl(state: string, redirectUri: string): string;
  exchangeCode(code: string, redirectUri: string): Promise<OAuthTokens & { email: string }>;
  refresh(refreshToken: string): Promise<OAuthTokens>;
  listEvents(accessToken: string, from: Date, to: Date): Promise<CalendarEvent[]>;
}

const expiresAt = (seconds: unknown): Date =>
  new Date(Date.now() + (typeof seconds === 'number' ? seconds : 3600) * 1000);

/**
 * Participantes viram CONTAGEM, não lista.
 *
 * Uma reunião carrega nome e e-mail de gente que nunca aceitou termo nenhum
 * conosco. O produto precisa saber se o compromisso é individual ou uma reunião
 * de oito pessoas — isso muda a recomendação de energia. Não precisa saber quem
 * são, então o nome nem chega a sair da função.
 */
const countAttendees = (list: unknown): number => (Array.isArray(list) ? list.length : 0);

class GoogleProvider implements CalendarProvider {
  readonly id = 'google' as const;

  authorizeUrl(state: string, redirectUri: string): string {
    const params = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID ?? '',
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/calendar.readonly openid email',
      // `offline` é o que faz o Google devolver refresh token; `consent` força a
      // tela mesmo em reconexão, porque sem ela o refresh token só vem UMA vez
      // na vida da autorização e uma reconexão silenciosa ficaria sem ele.
      access_type: 'offline',
      prompt: 'consent',
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }

  async exchangeCode(code: string, redirectUri: string) {
    const { data } = await axios.post(
      'https://oauth2.googleapis.com/token',
      new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID ?? '',
        client_secret: env.GOOGLE_CLIENT_SECRET ?? '',
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
      { timeout: 10_000 },
    );

    // O e-mail vem no `id_token`, que é um JWT do próprio Google. Só decodifica
    // a carga: a assinatura não precisa ser verificada porque o token acabou de
    // chegar por canal TLS direto do emissor, e não do cliente.
    const email = emailFromIdToken(data.id_token);

    return {
      accessToken: String(data.access_token),
      refreshToken: String(data.refresh_token ?? ''),
      expiresAt: expiresAt(data.expires_in),
      scope: String(data.scope ?? ''),
      email,
    };
  }

  async refresh(refreshToken: string): Promise<OAuthTokens> {
    const { data } = await axios.post(
      'https://oauth2.googleapis.com/token',
      new URLSearchParams({
        refresh_token: refreshToken,
        client_id: env.GOOGLE_CLIENT_ID ?? '',
        client_secret: env.GOOGLE_CLIENT_SECRET ?? '',
        grant_type: 'refresh_token',
      }),
      { timeout: 10_000 },
    );
    return {
      accessToken: String(data.access_token),
      // O Google não reemite refresh token na renovação; mantém-se o anterior.
      refreshToken,
      expiresAt: expiresAt(data.expires_in),
      scope: String(data.scope ?? ''),
    };
  }

  async listEvents(accessToken: string, from: Date, to: Date): Promise<CalendarEvent[]> {
    const { data } = await axios.get('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: {
        timeMin: from.toISOString(),
        timeMax: to.toISOString(),
        // Expande recorrências: sem isto, uma reunião semanal chega como UMA
        // regra e some da grade do dia.
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: 100,
      },
      timeout: 10_000,
    });

    return (data.items ?? [])
      .filter((item: { status?: string }) => item.status !== 'cancelled')
      .map((item: Record<string, never>): CalendarEvent => {
        const start = item.start as { dateTime?: string; date?: string } | undefined;
        const end = item.end as { dateTime?: string; date?: string } | undefined;
        const allDay = Boolean(start?.date);
        return {
          id: String(item.id),
          title: String(item.summary ?? 'Sem título'),
          start: String(start?.dateTime ?? start?.date ?? ''),
          end: String(end?.dateTime ?? end?.date ?? ''),
          allDay,
          attendeeCount: countAttendees(item.attendees),
          provider: 'google',
        };
      })
      .filter((e: CalendarEvent) => e.start && e.end);
  }
}

class MicrosoftProvider implements CalendarProvider {
  readonly id = 'microsoft' as const;

  authorizeUrl(state: string, redirectUri: string): string {
    const params = new URLSearchParams({
      client_id: env.MICROSOFT_CLIENT_ID ?? '',
      redirect_uri: redirectUri,
      response_type: 'code',
      // `offline_access` é o equivalente do `access_type=offline` do Google.
      scope: 'openid email offline_access Calendars.Read',
      response_mode: 'query',
      state,
    });
    return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params}`;
  }

  async exchangeCode(code: string, redirectUri: string) {
    const { data } = await axios.post(
      'https://login.microsoftonline.com/common/oauth2/v2.0/token',
      new URLSearchParams({
        code,
        client_id: env.MICROSOFT_CLIENT_ID ?? '',
        client_secret: env.MICROSOFT_CLIENT_SECRET ?? '',
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
      { timeout: 10_000 },
    );

    return {
      accessToken: String(data.access_token),
      refreshToken: String(data.refresh_token ?? ''),
      expiresAt: expiresAt(data.expires_in),
      scope: String(data.scope ?? ''),
      email: emailFromIdToken(data.id_token),
    };
  }

  async refresh(refreshToken: string): Promise<OAuthTokens> {
    const { data } = await axios.post(
      'https://login.microsoftonline.com/common/oauth2/v2.0/token',
      new URLSearchParams({
        refresh_token: refreshToken,
        client_id: env.MICROSOFT_CLIENT_ID ?? '',
        client_secret: env.MICROSOFT_CLIENT_SECRET ?? '',
        grant_type: 'refresh_token',
      }),
      { timeout: 10_000 },
    );
    return {
      accessToken: String(data.access_token),
      // A Microsoft ROTACIONA o refresh token; ignorar o novo faria a conexão
      // morrer sozinha quando o antigo vencesse.
      refreshToken: String(data.refresh_token ?? refreshToken),
      expiresAt: expiresAt(data.expires_in),
      scope: String(data.scope ?? ''),
    };
  }

  async listEvents(accessToken: string, from: Date, to: Date): Promise<CalendarEvent[]> {
    const { data } = await axios.get('https://graph.microsoft.com/v1.0/me/calendarView', {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: {
        startDateTime: from.toISOString(),
        endDateTime: to.toISOString(),
        $orderby: 'start/dateTime',
        $top: 100,
        // `calendarView` já expande recorrência, ao contrário de `/events`.
        $select: 'id,subject,start,end,isAllDay,attendees,isCancelled',
      },
      timeout: 10_000,
    });

    return (data.value ?? [])
      .filter((item: { isCancelled?: boolean }) => !item.isCancelled)
      .map((item: Record<string, never>): CalendarEvent => {
        const start = item.start as { dateTime?: string; timeZone?: string } | undefined;
        const end = item.end as { dateTime?: string } | undefined;
        return {
          id: String(item.id),
          title: String(item.subject ?? 'Sem título'),
          // O Graph devolve sem sufixo de fuso quando `timeZone` é UTC. Sem o
          // `Z`, o `new Date()` do outro lado interpretaria como hora local e a
          // reunião apareceria deslocada.
          start: withZone(start?.dateTime),
          end: withZone(end?.dateTime),
          allDay: Boolean(item.isAllDay),
          attendeeCount: countAttendees(item.attendees),
          provider: 'microsoft',
        };
      })
      .filter((e: CalendarEvent) => e.start && e.end);
  }
}

const withZone = (value: unknown): string => {
  if (typeof value !== 'string' || !value) return '';
  return /[Z+]|-\d{2}:\d{2}$/.test(value) ? value : `${value}Z`;
};

/** Extrai o e-mail da carga do `id_token`, sem verificar assinatura. */
function emailFromIdToken(idToken: unknown): string {
  if (typeof idToken !== 'string') return '';
  const payload = idToken.split('.')[1];
  if (!payload) return '';
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      email?: string;
      preferred_username?: string;
    };
    return claims.email ?? claims.preferred_username ?? '';
  } catch {
    return '';
  }
}

export const providers: Record<Provider, CalendarProvider> = {
  google: new GoogleProvider(),
  microsoft: new MicrosoftProvider(),
};
