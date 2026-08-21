import { File, Paths } from 'expo-file-system';
import { create } from 'zustand';

import {
  cancelMealNotifications,
  MAX_HORARIOS_REFEICAO,
  scheduleMealNotifications,
} from '../services/notifications.service';

/**
 * Lembrete de REFEIÇÃO — o loop do hábito.
 *
 * Pedido de um testador (ago/2026): "horários comuns das refeições e uma
 * notificação para lembrar de registrar". O desenho é o do lembrete de água,
 * sem a pulseira: é o celular que avisa, e o aviso abre a tela de Refeições.
 * A preferência fica em disco; o agendamento se refaz a cada volta ao
 * primeiro plano, porque notificações de data fixa cobrem só três dias.
 */
const ARQUIVO = 'lembrete-refeicao.v1.json';
const PADRAO = ['08:00', '12:30', '19:30'];
export { MAX_HORARIOS_REFEICAO };

type MealReminderState = {
  ligado: boolean;
  horarios: string[];
  carregado: boolean;
  salvando: boolean;
  carregar: () => Promise<void>;
  aplicar: (ligado: boolean, horarios?: string[]) => Promise<void>;
};

function gravar(estado: { ligado: boolean; horarios: string[] }) {
  try {
    new File(Paths.document, ARQUIVO).write(JSON.stringify(estado));
  } catch {
    // Perder a preferência não pode derrubar o agendamento.
  }
}

const ordenar = (horarios: string[]) => [...horarios].sort();

export const useMealReminderStore = create<MealReminderState>((set, get) => ({
  ligado: false,
  horarios: PADRAO,
  carregado: false,
  salvando: false,

  carregar: async () => {
    if (get().carregado) return;
    let horarios = PADRAO;
    let ligado = false;
    try {
      const f = new File(Paths.document, ARQUIVO);
      if (f.exists) {
        const salvo = JSON.parse(await f.text()) as { ligado: boolean; horarios: string[] };
        horarios = salvo.horarios?.length ? salvo.horarios : PADRAO;
        ligado = salvo.ligado;
      }
    } catch {
      // Arquivo corrompido = começa do padrão.
    }
    set({ ligado, horarios, carregado: true });
  },

  aplicar: async (ligado, horarios) => {
    if (get().salvando) return;
    const lista = ordenar(horarios ?? get().horarios).slice(0, MAX_HORARIOS_REFEICAO);
    set({ salvando: true, ligado, horarios: lista });
    gravar({ ligado, horarios: lista });
    try {
      if (ligado && lista.length) await scheduleMealNotifications(lista);
      else await cancelMealNotifications();
    } finally {
      set({ salvando: false });
    }
  },
}));

/** Reescreve o agendamento dos próximos dias. Barato; chame ao voltar ao primeiro plano. */
export async function reagendarLembreteDeRefeicao() {
  const { ligado, horarios, carregado, carregar } = useMealReminderStore.getState();
  if (!carregado) await carregar();
  const estado = useMealReminderStore.getState();
  if (!(estado.ligado || ligado) || estado.horarios.length === 0) return;
  await scheduleMealNotifications(estado.horarios).catch(() => undefined);
}
