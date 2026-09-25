import { adaptarAoTempo, minutosDoTreino } from '../tempoDoTreino';
import type { WorkoutDetail } from '../../services/api.service';

/**
 * Caber o treino no tempo que a pessoa tem hoje, sem prescrever nada novo.
 *
 * A única direção possível é para menos: reduzir volume é sempre mais
 * conservador que o plano original, e é o que permite fazer esta conta no
 * aparelho, sem passar pelas travas clínicas da geração.
 */
const ex = (id: string, series: number, subtype = 'STRENGTH', extra = {}) => ({
  id,
  subtype,
  sets: Array.from({ length: series }, (_, i) => ({ order: i + 1, repetitions: '10', restTime: 60, load: null })),
  duration: null,
  holdTime: null,
  ...extra,
});

const treino = (): WorkoutDetail =>
  ({
    id: 'w1',
    phases: [
      { type: 'ALONGAMENTO', order: 1, exercises: [ex('along-1', 1, 'MOBILITY', { holdTime: 30 })] },
      { type: 'TREINO', order: 2, exercises: [ex('a', 4), ex('b', 4), ex('c', 4), ex('d', 4)] },
    ],
  } as unknown as WorkoutDetail);

describe('adaptar o treino ao tempo disponível', () => {
  it('com tempo de sobra, nada é cortado', () => {
    const r = adaptarAoTempo(treino(), 120);
    expect(r.exerciciosCortados).toBe(0);
    expect(r.seriesCortadas).toBe(0);
    expect(r.exercicios.every((e) => !e.cortado)).toBe(true);
  });

  it('corta SÉRIE antes de cortar exercício', () => {
    // Treino inteiro com menos série de cada é mais perto do prescrito do que
    // metade dos exercícios com todas as séries.
    const r = adaptarAoTempo(treino(), 25);
    expect(r.seriesCortadas).toBeGreaterThan(0);
    expect(r.exerciciosCortados).toBe(0);
  });

  it('o preparo nunca é cortado, por menos tempo que haja', () => {
    const r = adaptarAoTempo(treino(), 5);
    const along = r.exercicios.find((e) => e.id === 'along-1');
    expect(along?.cortado).toBe(false);
    expect(along?.series).toBeGreaterThan(0);
  });

  it('corta do FIM para o começo: o acessório sai antes do principal', () => {
    // Seis minutos: reduzir todo mundo a uma série ainda não cabe (quatro
    // exercícios de uma série, com as trocas, dão perto de oito), então aqui
    // exercício inteiro precisa sair.
    const r = adaptarAoTempo(treino(), 6);
    const cortados = r.exercicios.filter((e) => e.cortado).map((e) => e.id);
    expect(cortados).toContain('d');
    expect(cortados).not.toContain('a');
  });

  it('sempre sobra pelo menos um exercício principal', () => {
    const r = adaptarAoTempo(treino(), 1);
    const principais = r.exercicios.filter((e) => ['a', 'b', 'c', 'd'].includes(e.id));
    expect(principais.some((e) => !e.cortado)).toBe(true);
  });

  it('nenhum exercício mantido fica sem série', () => {
    for (const minutos of [5, 10, 20, 40]) {
      const r = adaptarAoTempo(treino(), minutos);
      for (const e of r.exercicios) {
        if (!e.cortado) expect(e.series).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('a estimativa do treino inteiro é plausível', () => {
    // 4 exercícios de 4 séries, com descanso de 60s, mais preparo e trocas.
    const m = minutosDoTreino(treino());
    expect(m).toBeGreaterThan(25);
    expect(m).toBeLessThan(45);
  });
});
