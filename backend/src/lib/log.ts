/**
 * Log que não vaza biometria.
 *
 * A regra do projeto é explícita: **nunca logar valor biométrico junto do
 * `user_id`**. O modo de violá-la sem perceber é logar um erro inteiro — um
 * erro do axios carrega `config.data`, que numa chamada ao serviço de modelo é
 * exatamente `{"hrv_ms": 72, "resting_hr": 56, ...}`. Um `console.error(userId,
 * err)` aparentemente inocente escreve a leitura da pessoa identificada no
 * arquivo de log, que costuma ter retenção e acesso muito mais frouxos que o
 * banco.
 *
 * Por isso nada de erro é logado direto. Passa por aqui, que extrai só o que
 * serve para diagnosticar: mensagem, status e código.
 */

type Sanitized = {
  message: string;
  status?: number;
  code?: string;
  /** URL sem query string — parâmetro pode carregar coordenada. */
  url?: string;
};

const stripQuery = (url: unknown): string | undefined =>
  typeof url === 'string' ? url.split('?')[0] : undefined;

export function sanitizeError(err: unknown): Sanitized {
  if (typeof err === 'object' && err !== null) {
    const e = err as {
      message?: unknown;
      code?: unknown;
      response?: { status?: number };
      config?: { url?: unknown; method?: unknown };
    };
    return {
      message: typeof e.message === 'string' ? e.message : 'erro sem mensagem',
      status: e.response?.status,
      code: typeof e.code === 'string' ? e.code : undefined,
      url: stripQuery(e.config?.url),
    };
  }
  return { message: String(err) };
}

/**
 * Registra um erro. Em produção também — o comportamento anterior era silenciar
 * fora de desenvolvimento, o que deixava um 500 em produção sem rastro nenhum e
 * tornava qualquer investigação impossível.
 */
export function logError(context: string, err: unknown): void {
  console.error(`[${context}]`, JSON.stringify(sanitizeError(err)));
}
