import { api, isAuthenticated } from './api.service';

export type FocusRecord = {
  type: string;
  durationMin: number;
  energyScoreAtStart: number | null;
};

/**
 * Registra um bloco de foco concluído.
 *
 * Falha em silêncio, e de propósito. O valor da sessão para a pessoa é o bloco
 * que ela acabou de cumprir; o registro serve para o modelo correlacionar
 * produtividade com fisiologia mais tarde. Interromper a tela com um erro de
 * rede no meio de uma sessão de concentração inverteria exatamente a prioridade
 * — e o contador local já subiu.
 */
export async function recordFocusSession(record: FocusRecord): Promise<void> {
  if (!isAuthenticated()) return;
  await api
    .post('/sessions', {
      type: record.type,
      // O fim é agora; o início se deduz da duração. Enviar os dois instantes
      // deixaria o servidor confiar no relógio do aparelho para os dois lados.
      endedAt: new Date().toISOString(),
      durationMin: record.durationMin,
      energyScoreAtStart: record.energyScoreAtStart,
    })
    .catch(() => undefined);
}

export type FocusHistoryItem = {
  type: string;
  startedAt: string;
  endedAt: string;
  durationMin: number;
  energyScoreAtStart: number | null;
};

/** Sessões recentes, para o histórico da tela. Vazio em erro — lista é enfeite. */
export async function fetchFocusSessions(): Promise<FocusHistoryItem[]> {
  if (!isAuthenticated()) return [];
  try {
    const { data } = await api.get<FocusHistoryItem[]>('/sessions', { params: { days: 14 } });
    // O servidor devolve do mais antigo ao mais novo; a tela lê ao contrário.
    return [...data].reverse();
  } catch {
    return [];
  }
}
