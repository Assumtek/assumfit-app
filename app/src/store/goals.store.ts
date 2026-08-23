import { create } from 'zustand';

import { META_PADRAO_KCAL, type MetaDeHoje } from '../domain/dailyGoals';

/**
 * As metas do dia: a padrão de calorias ativas e a de hoje, quando a pessoa
 * mudou só para hoje. Persistidas no aparelho; não existe servidor para isto.
 */
type Store = {
  getItemAsync: (key: string) => Promise<string | null>;
  setItemAsync: (key: string, value: string) => Promise<void>;
};
const prefs: Store | null = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('expo-secure-store') as Store;
    return typeof mod?.getItemAsync === 'function' ? mod : null;
  } catch {
    return null;
  }
})();
const CHAVE = 'assumfit.metas.v1';

type GoalsState = {
  metaPadraoKcal: number;
  metaDeHoje: MetaDeHoje;
  carregada: boolean;
  carregar: () => Promise<void>;
  definirPadrao: (kcal: number) => void;
  definirSoHoje: (kcal: number, hojeIso: string) => void;
  limparSoHoje: () => void;
};

function gravar(s: { metaPadraoKcal: number; metaDeHoje: MetaDeHoje }) {
  prefs?.setItemAsync(CHAVE, JSON.stringify(s)).catch(() => undefined);
}

export const useGoalsStore = create<GoalsState>((set, get) => ({
  metaPadraoKcal: META_PADRAO_KCAL,
  metaDeHoje: null,
  carregada: false,
  carregar: async () => {
    if (get().carregada) return;
    try {
      const raw = await prefs?.getItemAsync(CHAVE);
      if (raw) {
        const s = JSON.parse(raw) as { metaPadraoKcal?: number; metaDeHoje?: MetaDeHoje };
        set({
          metaPadraoKcal: typeof s.metaPadraoKcal === 'number' && s.metaPadraoKcal > 0 ? s.metaPadraoKcal : META_PADRAO_KCAL,
          metaDeHoje: s.metaDeHoje ?? null,
        });
      }
    } catch {
      // preferência ilegível vale como ausente
    }
    set({ carregada: true });
  },
  definirPadrao: (kcal) => {
    const metaPadraoKcal = Math.max(50, Math.round(kcal));
    set({ metaPadraoKcal });
    gravar({ metaPadraoKcal, metaDeHoje: get().metaDeHoje });
  },
  definirSoHoje: (kcal, hojeIso) => {
    const metaDeHoje = { date: hojeIso, kcal: Math.max(50, Math.round(kcal)) };
    set({ metaDeHoje });
    gravar({ metaPadraoKcal: get().metaPadraoKcal, metaDeHoje });
  },
  limparSoHoje: () => {
    set({ metaDeHoje: null });
    gravar({ metaPadraoKcal: get().metaPadraoKcal, metaDeHoje: null });
  },
}));
