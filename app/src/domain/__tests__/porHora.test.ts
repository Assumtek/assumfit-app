import { porHoraCronologico } from '../series';

/** Instante de um dia e hora locais. */
function em(dia: number, hora: number, minuto = 0): number {
  return new Date(2026, 7, dia, hora, minuto, 0, 0).getTime();
}

describe('porHoraCronologico', () => {
  it('devolve as barras em ordem de relógio, mesmo com a memória embaralhada', () => {
    const barras = porHoraCronologico([
      { at: em(24, 14), value: 50 },
      { at: em(24, 6), value: 30 },
      { at: em(24, 20), value: 62 },
      { at: em(24, 7), value: 35 },
    ]);
    expect(barras.map((b) => b.hour)).toEqual(['6h', '7h', '14h', '20h']);
  });

  it('guarda a última medição de cada hora', () => {
    const barras = porHoraCronologico([
      { at: em(24, 9, 5), value: 20 },
      { at: em(24, 9, 50), value: 44 },
    ]);
    expect(barras).toEqual([{ hour: '9h', value: 44 }]);
  });

  it('a mesma hora de dias diferentes são barras diferentes, na ordem certa', () => {
    const barras = porHoraCronologico([
      { at: em(24, 8), value: 40 },
      { at: em(23, 8), value: 70 },
    ]);
    expect(barras).toEqual([
      { hour: '8h', value: 70 },
      { hour: '8h', value: 40 },
    ]);
  });

  it('corta pelas mais RECENTES, não pelas primeiras que chegaram', () => {
    const amostras = Array.from({ length: 20 }, (_, i) => ({ at: em(24, i % 24), value: i }));
    const barras = porHoraCronologico(amostras, 3);
    expect(barras.map((b) => b.hour)).toEqual(['17h', '18h', '19h']);
  });

  it('amostra sem carimbo válido não entra', () => {
    expect(porHoraCronologico([{ at: 0, value: 50 }, { at: Number.NaN, value: 10 }])).toEqual([]);
  });
});
