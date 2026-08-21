import { create } from 'zustand';

import * as api from '../services/api.service';
import { KeychainSaveError } from '../services/tokenStorage';
import { useHabitsStore } from './habits.store';
import { useUserStore } from './user.store';

type AuthState = {
  /** `unknown` enquanto o Keychain ainda não respondeu. */
  status: 'unknown' | 'signedOut' | 'signedIn';
  loading: boolean;
  error: string | null;

  restore: (tentativa?: number) => Promise<void>;
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

export const useAuthStore = create<AuthState>((set, get) => ({
  status: 'unknown',
  loading: false,
  error: null,

  /*
   `null` significa Keychain indisponível, não ausência de sessão.

   A chave é gravada como acessível só com o aparelho DESBLOQUEADO, e o app sobe
   sozinho com ele bloqueado — tarefa de fundo do rastreio, toque em
   notificação. Tratar essa falha como "não está logado" derrubava a sessão de
   quem nunca saiu, e era uma das causas do "às vezes desloga" (ago/2026).

   Ficando em `unknown`, a navegação segue na tela de carregamento e a próxima
   tentativa — com o aparelho já desbloqueado — resolve.
  */
  restore: async (tentativa = 0) => {
    const ok = await api.restoreSession();

    if (ok === null) {
      /*
       Keychain indisponível — quase sempre aparelho BLOQUEADO, e some assim que
       ele for desbloqueado. Esperar resolve; desistir na hora derruba a sessão
       de quem nunca saiu.

       Mas não pode esperar para sempre: `unknown` mantém a tela de
       carregamento, e app preso no spinner é pior que app pedindo login. Cinco
       tentativas em intervalos crescentes cobrem o desbloqueio; depois disso,
       trata como sem sessão.
      */
      if (tentativa < 5) {
        set({ status: 'unknown' });
        setTimeout(() => void get().restore(tentativa + 1), 800 * (tentativa + 1));
        return;
      }
      set({ status: 'signedOut' });
      return;
    }

    set({ status: ok ? 'signedIn' : 'signedOut' });
    if (ok) {
      void useUserStore.getState().load();
      // A água de hoje vem do servidor; a tela de Água só pedia ao montar, e
      // antes da sessão o pedido era ignorado — ficava 0 com registro feito.
      void useHabitsStore.getState().hydrate();
    }
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
      void useHabitsStore.getState().hydrate();
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
    // O perfil da conta que saiu não fica para a próxima que entrar.
    useUserStore.getState().clear();
    set({ status: 'signedOut' });
  },

  deleteAccount: async () => {
    await api.deleteAccount();
    useUserStore.getState().clear();
    set({ status: 'signedOut' });
  },

  clearError: () => set({ error: null }),
}));

/*
 O servidor recusou a renovação → a sessão acabou → tela de login.

 Até aqui só o interceptor sabia; o store continuava `signedIn`, o perfil não
 carregava e a home mostrava o placeholder com cara de outra pessoa.
*/
api.onSessionLost(() => {
  useUserStore.getState().clear();
  useAuthStore.setState({ status: 'signedOut' });
});
