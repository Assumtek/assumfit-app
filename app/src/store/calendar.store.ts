import { Linking } from 'react-native';
import { create } from 'zustand';

import * as api from '../services/api.service';

type CalendarState = {
  connections: api.CalendarConnections | null;
  events: api.CalendarEvent[];
  /** Dia carregado, em ISO local, para não rebuscar o mesmo. */
  loadedDay: string | null;
  loading: boolean;
  consented: boolean;

  load: () => Promise<void>;
  loadDay: (day: Date) => Promise<void>;
  grantConsent: (granted: boolean) => Promise<void>;
  connect: (provider: api.CalendarProvider) => Promise<void>;
  disconnect: (provider: api.CalendarProvider) => Promise<void>;
};

const isoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const useCalendarStore = create<CalendarState>((set, get) => ({
  connections: null,
  events: [],
  loadedDay: null,
  loading: false,
  consented: false,

  load: async () => {
    if (!api.isAuthenticated()) return;
    try {
      const connections = await api.fetchCalendarConnections();
      set({ connections, consented: connections.connected.length > 0 || get().consented });
    } catch {
      set({ connections: null });
    }
  },

  loadDay: async (day) => {
    if (!api.isAuthenticated()) return;
    const key = isoDay(day);
    if (get().loadedDay === key && get().events.length > 0) return;
    // Sem nenhuma conta conectada não há o que buscar, e uma requisição por
    // abertura de tela para receber lista vazia é desperdício puro.
    if (!get().connections?.connected.length) return set({ events: [], loadedDay: key });

    set({ loading: true });
    try {
      const start = new Date(day);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
      set({ events: await api.fetchCalendarEvents(start, end), loadedDay: key, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  grantConsent: async (granted) => {
    await api.setCalendarConsent(granted);
    set({ consented: granted });
    // Revogar apaga as conexões no servidor; recarregar reflete isso na tela.
    if (!granted) set({ events: [], loadedDay: null });
    await get().load();
  },

  /**
   * Abre o consentimento do provedor no navegador do SISTEMA.
   *
   * Não numa WebView embutida: o Google recusa autenticação em WebView desde
   * 2021 justamente porque o app hospedeiro consegue ler o que a pessoa digita
   * ali. O retorno chega pelo deep link `assumfit://configuracoes`, que o
   * servidor emite no fim do fluxo.
   */
  connect: async (provider) => {
    const url = await api.calendarAuthUrl(provider);
    await Linking.openURL(url);
  },

  disconnect: async (provider) => {
    await api.disconnectCalendar(provider);
    set({ events: [], loadedDay: null });
    await get().load();
  },
}));
