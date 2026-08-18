import { create } from 'zustand';

import { isAuthenticated, fetchSeries, type HourlyPoint } from '../services/api.service';

/**
 * O histórico horário dos últimos trinta dias, carregado UMA vez por sessão.
 *
 * Fica num store próprio, e não no `biometric.store`, porque as naturezas são
 * opostas: aquele guarda o que a pulseira está medindo agora e muda a cada
 * segundo; este é um retrato do passado, que não muda enquanto o app estiver
 * aberto. Misturá-los faria toda tela de detalhe re-renderizar a cada batimento
 * por causa de um dado que não mudou.
 *
 * Uma requisição serve todas as telas de saúde: cada uma fatia a mesma série
 * pela grandeza que exibe.
 */

const HORAS = 720; // trinta dias — o teto que o servidor aceita

type HistoryState = {
  serie: HourlyPoint[];
  carregando: boolean;
  /** Já tentou nesta sessão? Distingue "vazio" de "ainda não perguntei". */
  carregado: boolean;
  load: (force?: boolean) => Promise<void>;
};

export const useHistoryStore = create<HistoryState>((set, get) => ({
  serie: [],
  carregando: false,
  carregado: false,

  load: async (force = false) => {
    if (get().carregando) return;
    if (get().carregado && !force) return;
    if (!isAuthenticated()) return;

    set({ carregando: true });
    try {
      set({ serie: await fetchSeries(HORAS), carregado: true });
    } catch {
      // Sem rede o seletor mostra só hoje, que vem da pulseira. Silencioso de
      // propósito: histórico é complemento, e um alerta aqui interromperia a
      // leitura do dia por algo que não impede nada.
      set({ carregado: true });
    } finally {
      set({ carregando: false });
    }
  },
}));
