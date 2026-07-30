import type { EnergyLevel } from './energy';

/**
 * Sessão de foco — pomodoro calibrado pela fisiologia.
 *
 * O pomodoro clássico é 25/5 para todo mundo o dia inteiro, e é justamente aí
 * que ele não conversa com este produto. Se o app já sabe que a pessoa está
 * recuperada, mandá-la parar aos 25 minutos interrompe o melhor bloco do dia;
 * se sabe que ela está no vale da tarde, exigir 25 minutos de concentração
 * contínua é receita de sessão abandonada. O protocolo então vem do nível de
 * energia, e o número de ciclos cai junto com ele.
 *
 * Os valores não são invenção: 50/10 é a faixa em que a literatura de trabalho
 * profundo situa um bloco sustentável para quem está bem; 25/5 é o pomodoro
 * original; 15/5 é curto o bastante para ser possível quando o alerta está
 * baixo. Quando o modelo de Python entrar, ele passa a ajustar por pessoa em
 * vez de por faixa.
 */
export type FocusProtocol = {
  focusMin: number;
  breakMin: number;
  cycles: number;
  label: string;
  rationale: string;
};

export const PROTOCOLS: Record<EnergyLevel, FocusProtocol> = {
  high: {
    focusMin: 50,
    breakMin: 10,
    cycles: 3,
    label: 'Trabalho profundo',
    rationale: 'Você está recuperado. Blocos longos aproveitam a janela em vez de interrompê-la.',
  },
  mid: {
    focusMin: 25,
    breakMin: 5,
    cycles: 4,
    label: 'Pomodoro clássico',
    rationale: 'Energia intermediária. Blocos curtos com pausa frequente sustentam melhor a atenção.',
  },
  low: {
    focusMin: 15,
    breakMin: 5,
    cycles: 2,
    label: 'Bloco curto',
    rationale: 'Seu corpo pede pausa. Se for para trabalhar, que seja pouco — e hidrate-se antes.',
  },
};

export type Phase = 'focus' | 'break' | 'done';

export type FocusSession = {
  protocol: FocusProtocol;
  phase: Phase;
  /** Ciclo em curso, começando em 1. */
  cycle: number;
  /** Instante em que a fase atual termina. Ausente quando pausada. */
  endsAt: number | null;
  /** Segundos que faltavam quando pausou. */
  remainingMs: number;
  running: boolean;
  /** Blocos de foco concluídos — é o que vale como sessão registrada. */
  completed: number;
};

const min = (n: number) => n * 60_000;

export function startSession(level: EnergyLevel, now: number): FocusSession {
  const protocol = PROTOCOLS[level];
  return {
    protocol,
    phase: 'focus',
    cycle: 1,
    endsAt: now + min(protocol.focusMin),
    remainingMs: min(protocol.focusMin),
    running: true,
    completed: 0,
  };
}

/**
 * Quanto falta, em milissegundos.
 *
 * Sai de um INSTANTE de término, nunca de um contador que decrementa. Um
 * `setInterval` que subtrai um segundo por disparo para de disparar quando o
 * app vai para segundo plano — e o iOS congela o timer de JS em poucos
 * segundos. A pessoa voltaria depois de vinte minutos e encontraria o relógio
 * onde deixou. Com o instante de término, o relógio está certo assim que a tela
 * volta, mesmo que nenhum tique tenha ocorrido no meio.
 */
export function remaining(session: FocusSession, now: number): number {
  if (!session.running || session.endsAt == null) return session.remainingMs;
  return Math.max(0, session.endsAt - now);
}

/** Fração já percorrida da fase atual, de 0 a 1. */
export function progress(session: FocusSession, now: number): number {
  const total = phaseDurationMs(session);
  if (total === 0) return 1;
  return Math.max(0, Math.min(1, 1 - remaining(session, now) / total));
}

function phaseDurationMs(session: FocusSession): number {
  if (session.phase === 'focus') return min(session.protocol.focusMin);
  if (session.phase === 'break') return min(session.protocol.breakMin);
  return 0;
}

/**
 * Avança a sessão quando a fase atual acaba.
 *
 * Devolve a MESMA referência quando nada mudou, para que a tela só re-renderize
 * na virada de fase e não a cada tique de relógio.
 */
export function advance(session: FocusSession, now: number): FocusSession {
  if (session.phase === 'done' || !session.running) return session;
  if (remaining(session, now) > 0) return session;

  if (session.phase === 'focus') {
    const completed = session.completed + 1;
    // Sem pausa depois do último bloco: a sessão acaba no foco, não no descanso.
    if (completed >= session.protocol.cycles) {
      return { ...session, phase: 'done', running: false, endsAt: null, remainingMs: 0, completed };
    }
    return {
      ...session,
      phase: 'break',
      completed,
      endsAt: now + min(session.protocol.breakMin),
      remainingMs: min(session.protocol.breakMin),
    };
  }

  return {
    ...session,
    phase: 'focus',
    cycle: session.cycle + 1,
    endsAt: now + min(session.protocol.focusMin),
    remainingMs: min(session.protocol.focusMin),
  };
}

export function pause(session: FocusSession, now: number): FocusSession {
  if (!session.running) return session;
  return { ...session, running: false, remainingMs: remaining(session, now), endsAt: null };
}

export function resume(session: FocusSession, now: number): FocusSession {
  if (session.running || session.phase === 'done') return session;
  return { ...session, running: true, endsAt: now + session.remainingMs };
}

/** Pula a fase corrente — usado para encurtar a pausa quando dá vontade de voltar. */
export function skip(session: FocusSession, now: number): FocusSession {
  if (session.phase === 'done') return session;
  return advance({ ...session, running: true, endsAt: now }, now);
}

/** `mm:ss`, sempre com dois dígitos — a largura não pode dançar. */
export function clock(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
