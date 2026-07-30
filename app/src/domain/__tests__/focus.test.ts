import {
  advance,
  clock,
  pause,
  progress,
  PROTOCOLS,
  remaining,
  resume,
  skip,
  startSession,
} from '../focus';

const T0 = 1_700_000_000_000;
const MIN = 60_000;

describe('protocolo por nível de energia', () => {
  it('encurta o bloco conforme a energia cai', () => {
    expect(PROTOCOLS.high.focusMin).toBeGreaterThan(PROTOCOLS.mid.focusMin);
    expect(PROTOCOLS.mid.focusMin).toBeGreaterThan(PROTOCOLS.low.focusMin);
  });

  it('pede menos ciclos de quem está com energia baixa', () => {
    expect(PROTOCOLS.low.cycles).toBeLessThan(PROTOCOLS.high.cycles);
  });
});

describe('relógio da sessão', () => {
  it('conta a partir do instante de término, não de tiques acumulados', () => {
    const s = startSession('mid', T0);
    // Simula o app congelado em segundo plano por 10 minutos: nenhum tique
    // ocorreu, e mesmo assim o relógio precisa estar certo ao voltar.
    expect(remaining(s, T0 + 10 * MIN)).toBe(15 * MIN);
  });

  it('nunca fica negativo', () => {
    const s = startSession('low', T0);
    expect(remaining(s, T0 + 999 * MIN)).toBe(0);
  });

  it('formata sempre com dois dígitos', () => {
    expect(clock(25 * MIN)).toBe('25:00');
    expect(clock(9_000)).toBe('00:09');
    expect(clock(0)).toBe('00:00');
  });
});

describe('pausa e retomada', () => {
  it('congela o restante e retoma de onde parou', () => {
    const started = startSession('mid', T0);
    const paused = pause(started, T0 + 10 * MIN);
    expect(paused.remainingMs).toBe(15 * MIN);
    // O tempo continua correndo no mundo, mas não na sessão pausada.
    expect(remaining(paused, T0 + 60 * MIN)).toBe(15 * MIN);

    const resumed = resume(paused, T0 + 60 * MIN);
    expect(remaining(resumed, T0 + 60 * MIN)).toBe(15 * MIN);
  });
});

describe('avanço de fase', () => {
  it('não muda nada enquanto a fase não acaba', () => {
    const s = startSession('mid', T0);
    expect(advance(s, T0 + MIN)).toBe(s); // mesma referência: a tela não re-renderiza
  });

  it('vai de foco para pausa e conta o bloco concluído', () => {
    const s = startSession('mid', T0);
    const next = advance(s, T0 + 25 * MIN);
    expect(next.phase).toBe('break');
    expect(next.completed).toBe(1);
    expect(remaining(next, T0 + 25 * MIN)).toBe(5 * MIN);
  });

  it('termina no foco, sem pausa pendurada no fim', () => {
    let s = startSession('low', T0); // 2 ciclos de 15/5
    let now = T0;

    now += 15 * MIN;
    s = advance(s, now); // fim do 1º foco -> pausa
    now += 5 * MIN;
    s = advance(s, now); // fim da pausa -> 2º foco
    expect(s.phase).toBe('focus');
    expect(s.cycle).toBe(2);

    now += 15 * MIN;
    s = advance(s, now);
    expect(s.phase).toBe('done');
    expect(s.completed).toBe(PROTOCOLS.low.cycles);
    expect(s.running).toBe(false);
  });

  it('pular a pausa devolve ao foco imediatamente', () => {
    const s = advance(startSession('mid', T0), T0 + 25 * MIN);
    const skipped = skip(s, T0 + 26 * MIN);
    expect(skipped.phase).toBe('focus');
    expect(remaining(skipped, T0 + 26 * MIN)).toBe(25 * MIN);
  });
});

describe('progresso da fase', () => {
  it('vai de 0 a 1 dentro da fase', () => {
    const s = startSession('mid', T0);
    expect(progress(s, T0)).toBe(0);
    expect(progress(s, T0 + 12.5 * MIN)).toBeCloseTo(0.5, 5);
    expect(progress(s, T0 + 25 * MIN)).toBe(1);
  });
});
