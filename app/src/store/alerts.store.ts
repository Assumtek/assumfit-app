import { File, Paths } from 'expo-file-system';
import * as Notifications from 'expo-notifications';
import { create } from 'zustand';

/**
 * Histórico das notificações locais que o app já entregou.
 *
 * A tela de Avisos mostra condições verificáveis do estado atual — pulseira
 * desconectada, perfil incompleto. Este feed cobre o que aquelas condições não
 * cobrem: a notificação que apareceu na tela de bloqueio e foi dispensada sem
 * leitura. Sem registro, "que aviso era aquele?" não tem resposta dentro do app.
 *
 * Três portas de entrada, todas com o MESMO id da notificação (é o dedupe):
 * envio imediato (registrado na hora), entrega com o app aberto (listener) e
 * as que ficaram na central enquanto o app estava fechado (sincronização na
 * subida). Disparo agendado com o app morto e já dispensado antes de abrir o
 * app é invisível para nós — limitação do iOS, não escolha.
 */
export type NotificacaoRecebida = {
  id: string;
  /** ISO de quando registramos — aproxima o momento da entrega. */
  at: string;
  titulo: string;
  corpo: string;
  rota: string | null;
};

const ARQUIVO = 'notificacoes-recebidas.v1.json';
const LIMITE = 30;

type AlertsState = {
  feed: NotificacaoRecebida[];
  carregado: boolean;
  registrar: (n: { id: string; titulo: string; corpo: string; rota?: string | null }) => void;
  /** Puxa da central do sistema o que foi entregue com o app fechado. */
  sincronizarEntregues: () => Promise<void>;
  carregar: () => Promise<void>;
};

function gravar(feed: NotificacaoRecebida[]) {
  try {
    new File(Paths.document, ARQUIVO).write(JSON.stringify(feed));
  } catch {
    // Perder o histórico de avisos não pode derrubar o envio deles.
  }
}

export const useAlertsStore = create<AlertsState>((set, get) => ({
  feed: [],
  carregado: false,

  carregar: async () => {
    if (get().carregado) return;
    try {
      const f = new File(Paths.document, ARQUIVO);
      const feed = f.exists ? (JSON.parse(await f.text()) as NotificacaoRecebida[]) : [];
      set({ feed, carregado: true });
    } catch {
      set({ carregado: true });
    }
  },

  registrar: ({ id, titulo, corpo, rota }) => {
    const atual = get().feed;
    if (atual.some((n) => n.id === id)) return;
    const feed = [
      { id, at: new Date().toISOString(), titulo, corpo, rota: rota ?? null }, ...atual,
    ].slice(0, LIMITE);
    set({ feed });
    gravar(feed);
  },

  sincronizarEntregues: async () => {
    await get().carregar();
    try {
      const entregues = await Notifications.getPresentedNotificationsAsync();
      for (const n of entregues) {
        const rota = n.request.content.data?.route;
        get().registrar({
          id: n.request.identifier,
          titulo: n.request.content.title ?? 'Aviso',
          corpo: n.request.content.body ?? '',
          rota: typeof rota === 'string' ? rota : null,
        });
      }
    } catch {
      // Central indisponível (permissão negada, por exemplo) não é erro nosso.
    }
  },
}));
