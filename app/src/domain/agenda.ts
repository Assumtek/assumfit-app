import { ENERGY_BANDS, energyState, type EnergyInput, type EnergyLevel } from './energy';

/**
 * Agenda do dia — o que fazer em cada hora, a partir da energia projetada.
 *
 * A projeção reutiliza `energyState` hora a hora em vez de reimplementar a
 * curva. É de propósito: a home mostra UM ponto dessa mesma curva, e se os dois
 * lados calculassem separado a agenda acabaria recomendando "trabalho profundo"
 * numa hora em que a home diz "nível baixo". Uma fonte, dois recortes.
 *
 * O que a agenda NÃO é: um calendário. Ela não lê compromissos do aparelho nem
 * agenda nada — descreve as janelas do dia e deixa a pessoa encaixar o que já
 * tem. Ler o calendário do sistema é dado de terceiros e mudaria a conversa de
 * consentimento inteira; não entra sem decisão explícita.
 */
export type Slot = {
  /** Hora cheia de início, 0–23. */
  hour: number;
  score: number;
  level: EnergyLevel;
};

export type Block = {
  startHour: number;
  /** Hora de término, exclusiva. */
  endHour: number;
  level: EnergyLevel;
  /** Melhor score dentro do bloco — é ele que a tela mostra. */
  peak: number;
  title: string;
  detail: string;
};

const COPY: Record<EnergyLevel, { title: string; detail: string }> = {
  high: {
    title: 'Trabalho profundo',
    detail: 'Janela de maior alerta. Reserve para o que exige concentração contínua e decisões difíceis.',
  },
  mid: {
    title: 'Reuniões e revisões',
    detail: 'Alerta suficiente para interação e revisão, não para o problema mais difícil do dia.',
  },
  low: {
    title: 'Recuperação',
    detail: 'Vale de alerta. Tarefas mecânicas, pausa ou hidratação — não é hora de decidir nada.',
  },
};

/** Projeta a energia em cada hora do intervalo, mantendo o resto do input fixo. */
export function projectDay(input: Omit<EnergyInput, 'hour'>, from = 6, to = 23): Slot[] {
  const slots: Slot[] = [];
  for (let hour = from; hour < to; hour++) {
    const { score, level } = energyState({ ...input, hour });
    slots.push({ hour, score, level });
  }
  return slots;
}

/**
 * Agrupa horas vizinhas de mesmo nível num bloco.
 *
 * Sem o agrupamento a tela viraria dezessete linhas quase idênticas, e o que a
 * pessoa precisa ler é "das 8h às 12h você está no seu melhor" — a duração da
 * janela É a informação.
 */
export function blocksFrom(slots: Slot[]): Block[] {
  const blocks: Block[] = [];

  for (const slot of slots) {
    const last = blocks[blocks.length - 1];
    if (last && last.level === slot.level && last.endHour === slot.hour) {
      last.endHour = slot.hour + 1;
      last.peak = Math.max(last.peak, slot.score);
      continue;
    }
    blocks.push({
      startHour: slot.hour,
      endHour: slot.hour + 1,
      level: slot.level,
      peak: slot.score,
      ...COPY[slot.level],
    });
  }

  return blocks;
}

/** A melhor janela do dia que ainda não passou. Ausente quando o dia acabou. */
export function nextBest(blocks: Block[], hour: number): Block | null {
  const ahead = blocks.filter((b) => b.endHour > hour);
  if (ahead.length === 0) return null;
  return ahead.reduce((best, b) => (b.peak > best.peak ? b : best));
}

/** `8h` — sem zero à esquerda, que aqui só polui. */
export const formatHour = (hour: number): string => `${hour}h`;

export { ENERGY_BANDS };
