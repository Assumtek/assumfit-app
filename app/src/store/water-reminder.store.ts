import { File, Paths } from 'expo-file-system';
import { create } from 'zustand';

import { QCBand } from '../../modules/qcband';
import { horariosPorIntervalo } from '../domain/water';
import { useHabitsStore } from './habits.store';
import {
  cancelWaterNotifications,
  scheduleWaterNotifications,
  waterNotificationsScheduled,
} from '../services/notifications.service';

/**
 * O lembrete de água — horários escolhidos pela pessoa, dois canais de entrega.
 *
 * O CELULAR é o dono do estado: notificação local existe com e sem pulseira, e
 * é dela que o interruptor lê a verdade. A PULSEIRA é espelho: o firmware tem
 * quatro slots de despertador para água (índices 0–3), então os quatro
 * primeiros horários vibram no pulso também — os demais ficam só no celular.
 *
 * Escritas na pulseira sempre EM SÉRIE: o canal é serial, e duas escritas
 * simultâneas é a colisão que já derrubou a leitura de histórico uma vez.
 */

const ARQUIVO = 'lembrete-agua.v1.json';
const PADRAO = ['10:00', '13:00', '16:00', '19:00'];
const TODOS_OS_DIAS = [1, 1, 1, 1, 1, 1, 1];

/** Slots de despertador de água no firmware. */
export const SLOTS_PULSEIRA = 4;
/** Teto do celular — além disso vira ruído, não hábito. */
export const MAX_HORARIOS = 8;

export type ModoDoLembrete = 'horarios' | 'intervalo';

type WaterReminderState = {
  ligado: boolean;
  /** A lista escolhida à mão — vale no modo `horarios`. */
  horarios: string[];
  /**
   * Modo por INTERVALO: "a cada 30 min das 8h às 21h" (pedido de um testador,
   * ago/2026). A lista efetiva é gerada da janela; a pulseira continua
   * espelhando só os quatro primeiros.
   */
  modo: ModoDoLembrete;
  intervaloMin: number;
  janela: { inicio: string; fim: string };
  /** O que está de fato agendado, em qualquer modo. */
  horariosEfetivos: () => string[];
  /** A pulseira aceitou a última escrita? Decide o texto honesto da tela. */
  pulseiraOk: boolean;
  carregado: boolean;
  salvando: boolean;
  carregar: () => Promise<void>;
  aplicar: (ligado: boolean, horarios?: string[]) => Promise<void>;
  aplicarIntervalo: (config: { intervaloMin: number; janela: { inicio: string; fim: string } }) => Promise<void>;
  setModo: (modo: ModoDoLembrete) => Promise<void>;
};

type Gravado = {
  ligado: boolean;
  horarios: string[];
  modo?: ModoDoLembrete;
  intervaloMin?: number;
  janela?: { inicio: string; fim: string };
};

function gravar(estado: Gravado) {
  try {
    new File(Paths.document, ARQUIVO).write(JSON.stringify(estado));
  } catch {
    // Perder a preferência não pode derrubar o agendamento.
  }
}

export const useWaterReminderStore = create<WaterReminderState>((set, get) => ({
  ligado: false,
  horarios: PADRAO,
  modo: 'horarios',
  intervaloMin: 60,
  janela: { inicio: '08:00', fim: '21:00' },
  pulseiraOk: false,
  carregado: false,
  salvando: false,

  horariosEfetivos: () => {
    const { modo, horarios, intervaloMin, janela } = get();
    return modo === 'intervalo' ? horariosPorIntervalo(janela.inicio, janela.fim, intervaloMin) : horarios;
  },

  carregar: async () => {
    if (get().carregado) return;
    let horarios = PADRAO;
    let ligado = false;
    let modo: ModoDoLembrete = 'horarios';
    let intervaloMin = 60;
    let janela = { inicio: '08:00', fim: '21:00' };
    try {
      const f = new File(Paths.document, ARQUIVO);
      if (f.exists) {
        const salvo = JSON.parse(await f.text()) as Gravado;
        horarios = salvo.horarios?.length ? salvo.horarios : PADRAO;
        ligado = salvo.ligado;
        modo = salvo.modo ?? 'horarios';
        intervaloMin = salvo.intervaloMin ?? 60;
        janela = salvo.janela ?? janela;
      } else {
        // Primeira vez: herda o que já estiver agendado no celular — o
        // interruptor antigo gravava direto, sem este arquivo.
        ligado = await waterNotificationsScheduled();
      }
    } catch {
      // Arquivo corrompido = começa do padrão.
    }
    set({ ligado, horarios, modo, intervaloMin, janela, carregado: true });
  },

  aplicarIntervalo: async ({ intervaloMin, janela }) => {
    set({ intervaloMin, janela, modo: 'intervalo' });
    await get().aplicar(true);
  },

  setModo: async (modo) => {
    set({ modo });
    await get().aplicar(get().ligado);
  },

  aplicar: async (ligado, horarios) => {
    if (get().salvando) return;
    // Lista passada à mão é escolha do modo `horarios`.
    if (horarios) set({ horarios: ordenar(horarios), modo: 'horarios' });
    const { modo, intervaloMin, janela } = get();
    const lista = get().horariosEfetivos();
    set({ salvando: true, ligado });
    gravar({ ligado, horarios: get().horarios, modo, intervaloMin, janela });

    try {
      // Celular primeiro — é o canal que sempre existe. O consumo de hoje
      // viaja junto: é ele que faz o texto dizer quanto falta.
      if (ligado && lista.length) await scheduleWaterNotifications(lista, consumoDeHoje());
      else await cancelWaterNotifications();

      // Pulseira em série. Falha aqui NÃO desfaz o celular.
      if (QCBand) {
        try {
          for (let i = 0; i < SLOTS_PULSEIRA; i++) {
            const hora = lista[i];
            await QCBand.setWaterReminder(i, hora ?? '00:00', TODOS_OS_DIAS, ligado && hora != null);
          }
          set({ pulseiraOk: true });
        } catch {
          set({ pulseiraOk: false });
        }
      }
    } finally {
      set({ salvando: false });
    }
  },
}));

const ordenar = (horarios: string[]) => [...horarios].sort();

/**
 * O estado de hoje que o texto do lembrete precisa.
 *
 * Vira o dia antes de ler: os lembretes de amanhã são agendados hoje, e um
 * total de ontem vazando para cá produziria "faltam 0,5 L" às 8h da manhã
 * sobre uma meta que ainda não começou.
 */
function consumoDeHoje() {
  useHabitsStore.getState().rolarDia();
  const { today, goalMl, containers } = useHabitsStore.getState();
  return { waterMl: today.waterMl, goalMl, copoMl: containers[0].ml };
}

/**
 * Reagenda os lembretes de HOJE com o texto novo — chamado a cada gole.
 *
 * Sem isto o texto envelhece dentro da fila do sistema: a pessoa bebe dois
 * litros e às 19h ainda ouve "você não bebeu água hoje", que é pior que
 * lembrete genérico.
 */
export async function reagendarLembreteDeAgua() {
  const estado = useWaterReminderStore.getState();
  const lista = estado.horariosEfetivos();
  if (!estado.ligado || lista.length === 0) return;
  await scheduleWaterNotifications(lista, consumoDeHoje()).catch(() => undefined);
}
