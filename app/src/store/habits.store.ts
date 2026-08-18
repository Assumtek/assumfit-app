import { create } from 'zustand';

import { api, isAuthenticated } from '../services/api.service';
import { diaCorrente, isoHoje } from '../domain/water';
import { waterGoalMl } from '../domain/waterGoal';
import type { Sex } from '../domain/types';
import {
  DEFAULT_CONTAINERS,
  clampMl,
  parseContainers,
  serializeContainers,
  type Container,
  type ContainerKey,
} from '../domain/containers';

/** Meta padrão. Vira cálculo por peso corporal quando o cadastro tiver peso. */
const DEFAULT_GOAL_ML = 2500;

type Today = {
  date: string;
  waterMl: number;
  /** Cada gole registrado, para permitir desfazer o último. */
  pours: number[];
};

type Day = { label: string; waterMl: number; date: string };

type HabitsState = {
  goalMl: number;
  /** Os recipientes com o volume que a PESSOA usa — preferência do aparelho. */
  containers: Container[];
  /** A conta que produziu a meta, para a tela poder mostrá-la. */
  goalReason: string | null;
  /** Recalcula a meta a partir do peso da anamnese e do treino de hoje. */
  refreshGoal: (input: { weightKg: number | null; sex: Sex; activeMinToday: number }) => void;
  setContainerMl: (key: ContainerKey, ml: number) => void;
  today: Today;
  week: Day[];
  addWater: (ml: number) => void;
  undoLastPour: () => void;
  /**
   * Vira o dia se o relógio passou da meia-noite desde o último registro.
   *
   * Chamado na volta ao primeiro plano: a sessão dura dias no iOS, e sem isto
   * a tela abre mostrando o total de ontem até alguém remontá-la.
   */
  rolarDia: () => void;
  /** Recarrega semana e dia do servidor — é o que sobrevive ao app fechar. */
  hydrate: () => Promise<void>;
};

const ROTULO_DIA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

/**
 * Pede ao lembrete de água que se reescreva com o consumo novo.
 *
 * O `require` é TARDIO de propósito: `water-reminder.store` lê o consumo
 * daqui, e um import estático nos dois sentidos deixaria uma das metades
 * `undefined` no momento em que o módulo é avaliado.
 */
function reagendarLembrete() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('./water-reminder.store') as {
      reagendarLembreteDeAgua?: () => Promise<void>;
    };
    return mod.reagendarLembreteDeAgua?.();
  } catch {
    // Sem lembrete configurado, não há o que reagendar.
    return undefined;
  }
}

/**
 * Os últimos 7 dias, terminando hoje, todos zerados. É o estado inicial e o
 * molde do `hydrate` — havia uma semana de EXEMPLO aqui, e num app de saúde
 * barra de água inventada é indistinguível de barra medida.
 */
function semanaVazia(): Day[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return { label: ROTULO_DIA[d.getDay()], waterMl: 0, date: isoHoje(d) };
  });
}

/**
 * Hábitos do dia.
 *
 * A escrita é otimista: o número na tela muda no toque e a sincronização vai
 * atrás. Registrar água é gesto repetido e trivial — travar a interface
 * esperando a rede faria a pessoa parar de registrar, e um registro perdido
 * custa menos que o hábito abandonado.
 */
/**
 * O volume dos recipientes mora no APARELHO, não no servidor: é preferência
 * de uso, muda com o copo que a pessoa comprou, e não vale uma tabela nem uma
 * rodada de rede. Mesmo padrão da preferência de tema.
 */
const CHAVE_RECIPIENTES = 'assumfit.recipientes';

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

export const useHabitsStore = create<HabitsState>((set, get) => ({
  goalMl: DEFAULT_GOAL_ML,
  goalReason: null,
  containers: DEFAULT_CONTAINERS,

  /*
   A meta é do CORPO da pessoa (ago/2026): 2,5 L fixos era muito para quem tem
   50 kg e pouco para quem tem 100. Quem chama é a tela, que tem o peso da
   anamnese e os minutos de treino do dia — o store não busca nada sozinho,
   para a meta não depender de uma rodada de rede a mais.
  */
  refreshGoal: ({ weightKg, sex, activeMinToday }) => {
    set({
      goalMl: waterGoalMl({ weightKg, sex, activeMinToday }),
      goalReason: weightKg ? `${Math.round(weightKg)} kg` : null,
    });
  },

  setContainerMl: (key, ml) => {
    const containers = get().containers.map((c) =>
      c.key === key ? { ...c, ml: clampMl(ml) } : c,
    );
    // Aplica antes de gravar: o ajuste precisa responder no mesmo quadro, e a
    // escrita é assíncrona. Falhou? Vale para esta sessão.
    set({ containers });
    prefs?.setItemAsync(CHAVE_RECIPIENTES, serializeContainers(containers)).catch(() => undefined);
  },
  today: { date: isoHoje(), waterMl: 0, pours: [] },
  week: semanaVazia(),

  rolarDia: () => {
    const today = diaCorrente(get().today);
    if (today === get().today) return;
    // A semana também é remontada: ontem saiu de "hoje" e virou uma coluna do
    // histórico, e o molde de sete dias termina noutro dia.
    set({ today, week: comHoje(semanaVazia(), today) });
  },

  addWater: (ml) => {
    /*
     O dia é conferido a cada gole, não só na abertura da tela.

     Sem isto, um gole registrado depois da meia-noite ia para a data de ONTEM
     — o número na tela seguia somando ao total do dia anterior e o `persist`
     gravava no registro errado. Errar a data corrompe o histórico, que é pior
     que mostrar o número errado.
    */
    get().rolarDia();
    const today = get().today;
    const next = { ...today, waterMl: today.waterMl + ml, pours: [...today.pours, ml] };
    set({ today: next, week: comHoje(get().week, next) });
    void persist(next);
    void reagendarLembrete();
  },

  undoLastPour: () => {
    get().rolarDia();
    const today = get().today;
    if (today.pours.length === 0) return;
    const pours = today.pours.slice(0, -1);
    const last = today.pours[today.pours.length - 1];
    const next = { ...today, waterMl: Math.max(0, today.waterMl - last), pours };
    set({ today: next, week: comHoje(get().week, next) });
    void persist(next);
    void reagendarLembrete();
  },


  hydrate: async () => {
    /*
     A virada do dia vem PRIMEIRO, e sem depender de nada.

     Abaixo há duas saídas antes de qualquer `set` — sem sessão e falha de rede
     — e nas duas o total de ontem sobreviveria na tela. A data é uma conta de
     relógio local; ela não tem por que esperar o servidor.
    */
    get().rolarDia();

    prefs
      ?.getItemAsync(CHAVE_RECIPIENTES)
      .then((raw) => set({ containers: parseContainers(raw) }))
      .catch(() => undefined);

    if (!isAuthenticated()) return;
    try {
      // `date` chega como ISO à meia-noite UTC; cortar os 10 primeiros
      // caracteres devolve exatamente o dia gravado, sem passar pelo fuso.
      const { data } = await api.get<{ date: string; waterMl: number }[]>(
        '/habits',
        { params: { days: 8 } },
      );
      const porDia = new Map(data.map((h) => [h.date.slice(0, 10), h]));

      const week = semanaVazia().map((d) => ({
        ...d,
        waterMl: porDia.get(d.date)?.waterMl ?? 0,
      }));

      /*
       O dia de hoje volta do servidor — sem isto, fechar o app zerava a água
       na tela mesmo com o registro salvo. `pours` fica vazio: o desfazer só
       vale para goles registrados nesta sessão.

       O `rolarDia` no topo é o que conserta a manhã: sem registro para hoje,
       o ramo de baixo devolve `atual`, e um `atual` de ontem faria o total do
       dia anterior sobreviver à virada — que era exatamente o defeito.
      */
      const hoje = porDia.get(isoHoje());
      const atual = diaCorrente(get().today);
      const today =
        hoje && atual.pours.length === 0 ? { ...atual, waterMl: hoje.waterMl } : atual;

      set({ week, today });
    } catch {
      // Sem servidor a semana fica zerada — vazio honesto, não exemplo.
    }
  },
}));

/** A barra de hoje acompanha o número grande — a semana não espera o refresh. */
function comHoje(week: Day[], today: Today): Day[] {
  return week.map((d) => (d.date === today.date ? { ...d, waterMl: today.waterMl } : d));
}

/** Envia o dia inteiro; o backend faz upsert por (usuário, data). */
async function persist(today: Today): Promise<void> {
  if (!isAuthenticated()) return;
  await api
    .put('/habits', { date: today.date, waterMl: today.waterMl })
    .catch(() => undefined);
}
