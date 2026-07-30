import { create } from 'zustand';

import { api, isAuthenticated } from '../services/api.service';

/** Meta padrão. Vira cálculo por peso corporal quando o cadastro tiver peso. */
const DEFAULT_GOAL_ML = 2500;

type Today = {
  date: string;
  waterMl: number;
  focusSessions: number;
  /** Cada gole registrado, para permitir desfazer o último. */
  pours: number[];
};

type Day = { label: string; waterMl: number; date: string };

type HabitsState = {
  goalMl: number;
  today: Today;
  week: Day[];
  addWater: (ml: number) => void;
  undoLastPour: () => void;
  addFocusSession: () => void;
  /** Recarrega semana e dia do servidor — é o que sobrevive ao app fechar. */
  hydrate: () => Promise<void>;
};

/**
 * Data de HOJE no calendário de quem está segurando o celular.
 *
 * `toISOString().slice(0,10)` parece a forma óbvia e está errada: ele converte
 * para UTC antes de cortar, então às 22h no Brasil já devolve a data de amanhã.
 * Na prática, a água registrada depois das 21h entrava no dia seguinte, e o
 * gráfico da semana mostrava alguém bebendo de madrugada.
 */
const isoToday = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const ROTULO_DIA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

/**
 * Os últimos 7 dias, terminando hoje, todos zerados. É o estado inicial e o
 * molde do `hydrate` — havia uma semana de EXEMPLO aqui, e num app de saúde
 * barra de água inventada é indistinguível de barra medida.
 */
function semanaVazia(): Day[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return { label: ROTULO_DIA[d.getDay()], waterMl: 0, date: isoToday(d) };
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
export const useHabitsStore = create<HabitsState>((set, get) => ({
  goalMl: DEFAULT_GOAL_ML,
  today: { date: isoToday(), waterMl: 0, focusSessions: 0, pours: [] },
  week: semanaVazia(),

  addWater: (ml) => {
    const today = get().today;
    const next = { ...today, waterMl: today.waterMl + ml, pours: [...today.pours, ml] };
    set({ today: next, week: comHoje(get().week, next) });
    void persist(next);
  },

  undoLastPour: () => {
    const today = get().today;
    if (today.pours.length === 0) return;
    const pours = today.pours.slice(0, -1);
    const last = today.pours[today.pours.length - 1];
    const next = { ...today, waterMl: Math.max(0, today.waterMl - last), pours };
    set({ today: next, week: comHoje(get().week, next) });
    void persist(next);
  },

  addFocusSession: () => {
    const today = get().today;
    const next = { ...today, focusSessions: today.focusSessions + 1 };
    set({ today: next });
    void persist(next);
  },

  hydrate: async () => {
    if (!isAuthenticated()) return;
    try {
      // `date` chega como ISO à meia-noite UTC; cortar os 10 primeiros
      // caracteres devolve exatamente o dia gravado, sem passar pelo fuso.
      const { data } = await api.get<{ date: string; waterMl: number; focusSessions: number }[]>(
        '/habits',
        { params: { days: 8 } },
      );
      const porDia = new Map(data.map((h) => [h.date.slice(0, 10), h]));

      const week = semanaVazia().map((d) => ({
        ...d,
        waterMl: porDia.get(d.date)?.waterMl ?? 0,
      }));

      // O dia de hoje volta do servidor — sem isto, fechar o app zerava a
      // água na tela mesmo com o registro salvo. `pours` fica vazio: o
      // desfazer só vale para goles registrados nesta sessão.
      const hoje = porDia.get(isoToday());
      const atual = get().today;
      const today =
        hoje && atual.pours.length === 0
          ? { ...atual, waterMl: hoje.waterMl, focusSessions: hoje.focusSessions }
          : atual;

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
    .put('/habits', { date: today.date, waterMl: today.waterMl, focusSessions: today.focusSessions })
    .catch(() => undefined);
}
