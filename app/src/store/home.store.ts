import { create } from 'zustand';

import {
  alternarBloco,
  layoutPadrao,
  moverBloco,
  normalizarLayout,
  type Bloco,
  type ChaveDeBloco,
} from '../domain/homeLayout';

/**
 * O que a pessoa escolheu ver na Home.
 *
 * Preferência pequena e sem servidor: mora no aparelho, como o tema e a meta
 * de calorias. Se a gravação falhar, vale para esta sessão, e a Home volta ao
 * padrão na próxima, degradação aceitável para uma escolha de layout.
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

const CHAVE = 'assumfit.home.v1';

function gravar(blocos: Bloco[]) {
  prefs?.setItemAsync(CHAVE, JSON.stringify(blocos)).catch(() => undefined);
}

type HomeState = {
  blocos: Bloco[];
  carregada: boolean;
  carregar: () => Promise<void>;
  alternar: (chave: ChaveDeBloco) => void;
  mover: (chave: ChaveDeBloco, direcao: -1 | 1) => void;
  restaurar: () => void;
};

export const useHomeStore = create<HomeState>((set, get) => ({
  blocos: layoutPadrao(),
  carregada: false,

  carregar: async () => {
    if (get().carregada) return;
    try {
      const cru = await prefs?.getItemAsync(CHAVE);
      set({ blocos: normalizarLayout(cru ? JSON.parse(cru) : null) });
    } catch {
      set({ blocos: layoutPadrao() });
    }
    set({ carregada: true });
  },

  // A tela responde no mesmo quadro; a gravação vai atrás.
  alternar: (chave) => {
    const blocos = alternarBloco(get().blocos, chave);
    set({ blocos });
    gravar(blocos);
  },

  mover: (chave, direcao) => {
    const blocos = moverBloco(get().blocos, chave, direcao);
    set({ blocos });
    gravar(blocos);
  },

  restaurar: () => {
    const blocos = layoutPadrao();
    set({ blocos });
    gravar(blocos);
  },
}));
