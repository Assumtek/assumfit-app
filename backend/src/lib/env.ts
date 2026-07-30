import 'dotenv/config';
import { z } from 'zod';

/**
 * Validação de ambiente na subida do processo. Um segredo de JWT ausente tem de
 * derrubar o boot com mensagem clara, não virar `undefined` e produzir tokens
 * assinados com string vazia.
 */
const schema = z.object({
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(24, 'JWT_SECRET precisa de pelo menos 24 caracteres'),
  JWT_REFRESH_SECRET: z.string().min(24, 'JWT_REFRESH_SECRET precisa de pelo menos 24 caracteres'),
  JWT_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),
  AI_SERVICE_URL: z.string().url().default('http://localhost:8000'),
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  /**
   * Redis para limite de taxa e revogação de token.
   *
   * Opcional em desenvolvimento — o servidor cai para memória. Em produção é
   * exigido, porque contador por processo com mais de uma réplica multiplica o
   * limite pelo número de réplicas sem que nada acuse o problema.
   */
  REDIS_URL: z.string().url().optional(),

  /** Origens de navegador liberadas, separadas por vírgula. */
  CORS_ORIGINS: z.string().default(''),

  /** URL pública desta API. Compõe o `redirect_uri` do OAuth. */
  PUBLIC_URL: z.string().url().default('http://localhost:3001'),

  /**
   * Chave de 32 bytes em hexadecimal para cifrar credencial de terceiros.
   *
   * Token de calendário é credencial de OUTRO serviço: com ele, quem obtiver o
   * banco lê a agenda das pessoas fora do nosso sistema, e revogar a nossa
   * sessão não resolve. Por isso vai cifrado, com chave que não mora no banco.
   */
  CALENDAR_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, 'CALENDAR_ENCRYPTION_KEY precisa ser 32 bytes em hexadecimal')
    .optional(),

  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  MICROSOFT_CLIENT_ID: z.string().optional(),
  MICROSOFT_CLIENT_SECRET: z.string().optional(),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(`Ambiente inválido:\n${issues}`);
}

export const env = parsed.data;

/**
 * Verificações que só valem em produção.
 *
 * Ficam fora do schema porque em desenvolvimento é legítimo rodar sem
 * calendário e com segredo fraco. O que não pode é subir em produção com o
 * segredo de exemplo do `docker-compose` — e é exatamente o tipo de coisa que
 * passa despercebida num primeiro deploy e só aparece depois do incidente.
 */
const WEAK_SECRETS = ['dev_secret_change_in_prod', 'dev_refresh_secret_change_in_prod', 'changeme', 'secret'];

if (env.NODE_ENV === 'production') {
  const problems: string[] = [];

  for (const [name, value] of [
    ['JWT_SECRET', env.JWT_SECRET],
    ['JWT_REFRESH_SECRET', env.JWT_REFRESH_SECRET],
  ] as const) {
    if (WEAK_SECRETS.some((weak) => value.toLowerCase().includes(weak))) {
      problems.push(`${name} ainda é o valor de exemplo`);
    }
  }

  if (env.JWT_SECRET === env.JWT_REFRESH_SECRET) {
    problems.push('JWT_SECRET e JWT_REFRESH_SECRET precisam ser diferentes');
  }

  if (env.PUBLIC_URL.startsWith('http://')) {
    problems.push('PUBLIC_URL precisa ser https em produção');
  }

  if (!env.REDIS_URL) {
    problems.push('REDIS_URL ausente: limite de taxa e revogação seriam por processo');
  }

  if (problems.length > 0) {
    throw new Error(`Configuração inadequada para produção:\n${problems.map((p) => `  ${p}`).join('\n')}`);
  }
}

/** Um provedor de calendário só existe se as credenciais dele existirem. */
export const calendarEnabled = {
  google: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.CALENDAR_ENCRYPTION_KEY),
  microsoft: Boolean(env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET && env.CALENDAR_ENCRYPTION_KEY),
};
