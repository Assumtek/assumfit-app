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
