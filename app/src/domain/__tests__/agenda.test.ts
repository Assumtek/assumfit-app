import { blocksFrom, formatHour, nextBest, projectDay, type Slot } from '../agenda';
import { energyState } from '../energy';
import type { Reading, SleepNight } from '../types';

const reading: Reading = {
  recordedAt: Date.now(),
  hrvMs: 60,
  heartRate: 60,
  spo2Pct: 98,
  temperatureC: 36.6,
  steps: 5000,
  bpSystolic: 118,
  bpDiastolic: 76,
  stressScore: 30,
  respRate: 14,
  source: 'mock',
};

const sleep: SleepNight = {
  date: 'hoje',
  score: 80,
  deepContinuity: null,
  totalMin: 420,
  phases: { rem: 90, deep: 170, light: 130, awake: 30 },
  segments: [{ phase: 'deep', minutes: 420 }],
  spo2Night: [97],
};

const slot = (hour: number, score: number, level: Slot['level']): Slot => ({ hour, score, level });

describe('projeção do dia', () => {
  it('produz uma hora por posição do intervalo', () => {
    const slots = projectDay({ reading, sleep }, 6, 23);
    expect(slots).toHaveLength(17);
    expect(slots[0].hour).toBe(6);
    expect(slots[16].hour).toBe(22);
  });

  it('concorda com a home na mesma hora — é a MESMA função', () => {
    // Este é o contrato que importa: se a agenda passasse a ter curva própria,
    // ela recomendaria trabalho profundo numa hora em que a home diz "baixo".
    const slots = projectDay({ reading, sleep }, 6, 23);
    for (const s of slots) {
      expect(s.score).toBe(energyState({ reading, sleep, hour: s.hour }).score);
    }
  });

  it('reflete o vale da tarde', () => {
    const slots = projectDay({ reading, sleep }, 6, 23);
    const manha = slots.find((s) => s.hour === 9)!;
    const vale = slots.find((s) => s.hour === 14)!;
    expect(vale.score).toBeLessThan(manha.score);
  });
});

describe('agrupamento em blocos', () => {
  it('funde horas vizinhas de mesmo nível', () => {
    const blocks = blocksFrom([
      slot(8, 70, 'high'),
      slot(9, 72, 'high'),
      slot(10, 68, 'high'),
      slot(11, 50, 'mid'),
    ]);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({ startHour: 8, endHour: 11, level: 'high', peak: 72 });
    expect(blocks[1]).toMatchObject({ startHour: 11, endHour: 12, level: 'mid' });
  });

  it('não funde horas do mesmo nível separadas por outro', () => {
    const blocks = blocksFrom([slot(8, 70, 'high'), slot(9, 40, 'mid'), slot(10, 70, 'high')]);
    expect(blocks).toHaveLength(3);
  });

  it('não funde horas não adjacentes', () => {
    const blocks = blocksFrom([slot(8, 70, 'high'), slot(14, 70, 'high')]);
    expect(blocks).toHaveLength(2);
  });
});

describe('melhor janela restante', () => {
  const blocks = blocksFrom([
    slot(8, 80, 'high'),
    slot(9, 82, 'high'),
    slot(14, 40, 'mid'),
    slot(16, 70, 'high'),
  ]);

  it('ignora o que já passou', () => {
    expect(nextBest(blocks, 12)?.startHour).toBe(16);
  });

  it('considera o bloco em curso, não só os futuros', () => {
    expect(nextBest(blocks, 8)?.startHour).toBe(8);
  });

  it('devolve nulo quando o dia acabou', () => {
    expect(nextBest(blocks, 23)).toBeNull();
  });
});

it('formata a hora sem zero à esquerda', () => {
  expect(formatHour(8)).toBe('8h');
  expect(formatHour(16)).toBe('16h');
});
