import { create } from 'zustand';

import * as api from '../services/api.service';
import { KeychainSaveError } from '../services/tokenStorage';
import { useUserStore } from './user.store';

type AuthState = {
  /** `unknown` enquanto o Keychain ainda não respondeu. */
  status: 'unknown' | 'signedOut' | 'signedIn';
  loading: boolean;
  error: string | null;

  restore: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<boolean>;
  signUp: (input: api.RegisterInput) => Promise<boolean>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  clearError: () => void;
};

/** Traduz falha de rede/HTTP em mensagem que cabe na tela. */
function message(err: unknown): string {
  // O servidor aceitou; foi o APARELHO que recusou guardar a sessão. Dizer
  // "sem conexão" aqui manda a pessoa investigar a rede errada.
  if (err instanceof KeychainSaveError) {
    return 'Não foi possível guardar a sessão com segurança neste aparelho';
  }
  const status = (err as { response?: { status?: number; data?: { error?: string } } })?.response?.status;
  const serverMessage = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
  if (status === 401) return 'E-mail ou senha incorretos';
  if (status === 409) return 'Este e-mail já está cadastrado';
  if (status === 400) return serverMessage ?? 'Confira os dados informados';
  if (!status) return 'Sem conexão com o servidor';
  return serverMessage ?? 'Não foi possível concluir';
}

export const useAuthStore = create<AuthState>((set) => ({
  status: 'unknown',
  loading: false,
  error: null,

  restore: async () => {
    const ok = await api.restoreSession();
    set({ status: ok ? 'signedIn' : 'signedOut' });
    if (ok) void useUserStore.getState().load();
  },

  signIn: async (email, password) => {
    set({ loading: true, error: null });
    try {
      // O teclado do iOS capitaliza e o autofill acrescenta espaço — e-mail é
      // insensível a caixa por definição. O servidor também normaliza; aqui é
      // o cinto que evita a viagem de rede para receber um 401 de maiúscula.
      await api.login(email.trim().toLowerCase(), password);
      set({ status: 'signedIn', loading: false });
      void useUserStore.getState().load();
      return true;
    } catch (err) {
      set({ error: message(err), loading: false });
      return false;
    }
  },

  signUp: async (input) => {
    set({ loading: true, error: null });
    try {
      await api.register({ ...input, email: input.email.trim().toLowerCase() });
      set({ status: 'signedIn', loading: false });
      void useUserStore.getState().load();
      return true;
    } catch (err) {
      set({ error: message(err), loading: false });
      return false;
    }
  },

  signOut: async () => {
    await api.logout();
    set({ status: 'signedOut' });
  },

  deleteAccount: async () => {
    await api.deleteAccount();
    set({ status: 'signedOut' });
  },

  clearError: () => set({ error: null }),
}));
