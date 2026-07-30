import axios, { AxiosError } from 'axios';

import { env } from '../../lib/env';
import { logError } from '../../lib/log';
import type { CatalogExercise } from './catalog';

/**
 * Cliente do agente de treino (serviço Python).
 *
 * O que este arquivo protege é a distinção entre DOIS fracassos que se parecem:
 * o serviço caiu (reprocessa) e o plano foi reprovado no gate (não reprocessa,
 * a resposta é falar com a pessoa). O serviço devolve 502 para o primeiro e 200
 * com `blocked: true` para o segundo — e é por isso que `blocked` não é erro.
 */

export type AgentGenerationInput = {
  profile: Record<string, unknown>;
  flags: string[];
  history_summary: string;
  allowed_exercises: CatalogExercise[];
  constraints: Record<string, unknown>;
};

export type AgentGenerationResult = {
  plan: string;
  score: number;
  blocked: boolean;
  deterministicErrors: string[];
  hardFailures: unknown[];
  traceId: string;
};

export type AdjustOperation = Record<string, unknown>;

export type AgentAdjustResult = {
  reply: string;
  operations: AdjustOperation[];
  blocked: boolean;
  blockReason: string | null;
  traceId: string;
};

/**
 * Uma geração faz DUAS chamadas de modelo sobre o catálogo inteiro e leva de 50
 * a 120 segundos. O tempo limite é folgado de propósito: abortar aos 30 mataria
 * gerações válidas em curso e ainda cobraria por elas.
 */
const TIMEOUT_MS = 180_000;

const client = axios.create({ baseURL: env.AI_SERVICE_URL, timeout: TIMEOUT_MS });

/** Erro de infraestrutura do agente. Reprocessável, ao contrário de um plano reprovado. */
export class AgentUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AgentUnavailable';
  }
}

export async function generate(input: AgentGenerationInput): Promise<AgentGenerationResult> {
  const startedAt = Date.now();
  try {
    const { data } = await client.post('/agent/generate', input);
    console.log(
      `[agent.generate] ok durationMs=${Date.now() - startedAt} score=${data.score} ` +
        `blocked=${data.blocked} traceId=${data.trace_id}`,
    );
    return {
      plan: data.plan,
      score: data.score,
      blocked: data.blocked,
      deterministicErrors: data.deterministic_errors ?? [],
      hardFailures: data.grader_breakdown?.hard_failures ?? [],
      traceId: data.trace_id,
    };
  } catch (err) {
    // O log passa pelo sanitizador: um erro do axios carrega `config.data`, que
    // aqui é o perfil clínico da pessoa. Um `console.error(err)` cru gravaria
    // "cardiopata" ao lado do id no arquivo de log.
    logError('agent.generate', err);
    throw new AgentUnavailable(describeFailure(err));
  }
}

/**
 * Extrai respostas do roteiro a partir da fala livre da abertura.
 *
 * Nunca lança: extração é acelerador, não portão. Se o serviço caiu, a
 * entrevista simplesmente pergunta tudo — que é o comportamento sem IA.
 */
export async function extract(
  text: string,
  questions: { id: string; label: string; options: string[] | null }[],
): Promise<Record<string, string>> {
  try {
    const { data } = await client.post('/agent/extract', { text, questions }, { timeout: 30_000 });
    return data.answers ?? {};
  } catch (err) {
    logError('agent.extract', err);
    return {};
  }
}

export async function adjust(input: Record<string, unknown>): Promise<AgentAdjustResult> {
  try {
    const { data } = await client.post('/agent/adjust', input);
    return {
      reply: data.reply,
      operations: data.operations ?? [],
      blocked: data.blocked ?? false,
      blockReason: data.block_reason ?? null,
      traceId: data.trace_id,
    };
  } catch (err) {
    logError('agent.adjust', err);
    throw new AgentUnavailable(describeFailure(err));
  }
}

function describeFailure(err: unknown): string {
  const axiosErr = err as AxiosError<{ detail?: string; error?: string }>;
  if (axiosErr.code === 'ECONNABORTED') return 'tempo limite na geração';
  const status = axiosErr.response?.status;
  if (status) return `serviço de modelo respondeu ${status}`;
  return 'serviço de modelo indisponível';
}
