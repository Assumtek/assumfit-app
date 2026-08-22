import {
  CICLO_MIN,
  LATENCIA_MIN,
  bedOptions,
  cycleLabel,
  formatHours,
  formatMinutes,
  parseMinutes,
  wakeOptions,
} from '../sleepCycles';

describe('formatMinutes / parseMinutes', () => {
  it('formata com dois dígitos', () => {
    expect(formatMinutes(0)).toBe('00:00');
    expect(formatMinutes(9 * 60 + 5)).toBe('09:05');
    expect(formatMinutes(22 * 60 + 45)).toBe('22:45');
  });

  it('atravessa a meia-noite sem estourar', () => {
    expect(formatMinutes(24 * 60 + 30)).toBe('00:30');
    expect(formatMinutes(-30)).toBe('23:30');
  });

  it('lê o que a tela escreve', () => {
    expect(parseMinutes('06:30')).toBe(390);
    expect(parseMinutes('6:30')).toBe(390);
    expect(parseMinutes(' 23:15 ')).toBe(1395);
  });

  it('recusa entrada inválida em vez de devolver NaN', () => {
    expect(parseMinutes('25:00')).toBeNull();
    expect(parseMinutes('12:60')).toBeNull();
    expect(parseMinutes('abc')).toBeNull();
    expect(parseMinutes('')).toBeNull();
  });
});

describe('wakeOptions, deitar agora, acordar quando?', () => {
  it('conta a latência de pegar no sono', () => {
    // Deitar 23h + 15 min para dormir + 6 ciclos (9h) = 08:15.
    const [seis] = wakeOptions(23 * 60);
    expect(seis.label).toBe('08:15');
    expect(seis.cycles).toBe(6);
    expect(seis.hours).toBe(9);
  });

  it('ordena da noite mais completa para a mais curta', () => {
    const opcoes = wakeOptions(22 * 60);
    expect(opcoes.map((o) => o.cycles)).toEqual([6, 5, 4]);
    expect(opcoes[0].hours).toBeGreaterThan(opcoes[2].hours);
  });

  it('atravessa a meia-noite corretamente', () => {
    // 01:00 + 15 min + 4 ciclos (6h) = 07:15.
    const quatro = wakeOptions(60).find((o) => o.cycles === 4)!;
    expect(quatro.label).toBe('07:15');
  });
});

describe('bedOptions, acordar às X, deitar quando?', () => {
  it('volta no tempo a partir da hora de acordar', () => {
    // 06:30 − 15 min − 6 ciclos (9h) = 21:15 do dia anterior.
    const seis = bedOptions(6 * 60 + 30).find((o) => o.cycles === 6)!;
    expect(seis.label).toBe('21:15');
  });

  it('é o inverso exato de wakeOptions', () => {
    const acordar = 7 * 60;
    for (const opcao of bedOptions(acordar)) {
      const volta = wakeOptions(opcao.minutes).find((o) => o.cycles === opcao.cycles)!;
      expect(volta.minutes).toBe(acordar);
    }
  });

  it('acordar de madrugada não produz horário negativo', () => {
    const opcoes = bedOptions(30);
    for (const o of opcoes) {
      expect(o.minutes).toBeGreaterThanOrEqual(0);
      expect(o.minutes).toBeLessThan(24 * 60);
    }
  });
});

describe('as constantes são a fisiologia declarada, não número mágico', () => {
  it('ciclo de 90 minutos e 15 de latência', () => {
    expect(CICLO_MIN).toBe(90);
    expect(LATENCIA_MIN).toBe(15);
  });
});

describe('linguagem humana', () => {
  it('formata horas sem decimal solto', () => {
    expect(formatHours(7.5)).toBe('7h30');
    expect(formatHours(6)).toBe('6h');
    expect(formatHours(9)).toBe('9h');
  });

  it('a avaliação vem antes do número, e nunca alarma', () => {
    expect(cycleLabel(6)).toBe('noite completa');
    expect(cycleLabel(5)).toBe('boa noite');
    expect(cycleLabel(4)).toBe('mínimo aceitável');
    // Nada de "ruim", "insuficiente" ou linguagem clínica.
    for (const c of [4, 5, 6]) expect(cycleLabel(c)).not.toMatch(/ruim|insuficiente|risco/i);
  });
});
