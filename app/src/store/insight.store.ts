import { create } from 'zustand';

import * as api from '../services/api.service';
import { syncQueue } from '../services/sync.service';

type Status = 'idle' | 'loading' | 'ready' | 'offline';

type InsightState = {
  model: api.EnergyFromModel | null;
  status: Status;
  /** Hora local usada na última consulta, para não repetir dentro da mesma hora. */
  fetchedHour: number | null;
  refresh: (hour: number, opts?: { force?: boolean }) => Promise<void>;
  /** Descarta o cache para a próxima leitura da tela buscar de novo. */
  invalidate: () => void;
};

/**
 * O texto da tela inicial, vindo do modelo.
 *
 * **Complementa o cálculo local, não o substitui.** O app continua computando
 * energia offline em `domain/energy.ts`, e a tela mostra esse resultado
 * enquanto a rede não responde. A diferença entre os dois não é a fórmula — é a
 * ENTRADA: o servidor sabe a água registrada hoje, o sono anotado e a linha de
 * base de 30 dias; o aparelho, sozinho, não sabe nada disso.
 *
 * Falha em silêncio. Sem rede a tela não fica vazia nem mostra erro: ela cai
 * para o texto local, que é pior mas honesto. Um alerta de rede na tela mais
 * vista do app seria ruído diário para quem simplesmente entrou no elevador.
 */
export const useInsightStore = create<InsightState>((set, get) => ({
  model: null,
  status: 'idle',
  fetchedHour: null,

  refresh: async (hour, opts) => {
    if (!api.isAuthenticated()) return;
    // O insight só muda de hora em hora — é essa a granularidade do cálculo.
    // Reconsultar a cada foco da tela gastaria bateria e rede para receber
    // exatamente o mesmo texto. `force` é o botão Atualizar: a pessoa PEDIU a
    // releitura, e o servidor rediz a frase com o dia relido do banco.
    if (!opts?.force && get().status === 'ready' && get().fetchedHour === hour) return;

    set({ status: 'loading' });
    try {
      const model = await api.fetchEnergyInsight(hour, opts?.force ?? false);
      set({ model, status: 'ready', fetchedHour: hour });
    } catch {
      // 'offline' MESMO quando há modelo antigo na tela: é o que permite ao
      // "atualizar" dizer "sem rede — tentar de novo" em vez de falhar mudo.
      // O modelo anterior continua exibido — status é sobre a ÚLTIMA tentativa.
      set({ status: 'offline' });
    }
  },

  /**
   * Limpar o cache não basta: o efeito da tela só dispara quando a HORA muda,
   * então um cache invalidado ficaria parado até a virada da hora. Por isso
   * invalidar já rebusca — e só quando já houve uma busca antes, para não
   * disparar rede em quem nunca abriu a tela inicial.
   */
  invalidate: () => {
    if (get().status === 'idle') return;
    set({ fetchedHour: null });
    void get().refresh(new Date().getHours());
  },
}));

/**
 * Lote sincronizado significa que o servidor passou a enxergar leitura mais nova
 * que a usada no último insight — o cache da hora deixa de valer.
 */
syncQueue.onSynced = () => useInsightStore.getState().invalidate();
