import { deepSleepContinuity, nightFrom, sleepScore } from '../sleep';
import type { SleepSegment } from '../types';

/**
 * O score de sono passou a existir porque o HealthKit entrega estágios e não
 * score — e porque o valor que estava no lugar era um literal escrito à mão.
 *
 * O que estes testes travam é a propriedade, não o número exato: dormir mais e
 * melhor não pode piorar o score, e tempo acordado não conta como sono.
 */
describe('sleepScore', () => {
  const noite = (deep: number, rem: number, light: number, awake = 0) => ({ deep, rem, light, awake });

  it('noite sem sono nenhum devolve zero', () => {
    expect(sleepScore(noite(0, 0, 0, 30))).toBe(0);
  });

  it('noite curta pontua menos que noite completa', () => {
    const curta = sleepScore(noite(40, 50, 150));
    const completa = sleepScore(noite(80, 100, 300));
    expect(curta).toBeLessThan(completa);
  });

  it('mais sono profundo, na mesma duração, pontua mais', () => {
    // Mesmo total dormido: 480 min. Só muda a distribuição.
    const pouco = sleepScore(noite(20, 100, 360));
    const bom = sleepScore(noite(90, 100, 290));
    expect(bom).toBeGreaterThan(pouco);
  });

  it('despertar noturno reduz, mas não zera a noite', () => {
    const seguida = sleepScore(noite(80, 100, 300));
    const fragmentada = sleepScore(noite(80, 100, 300, 45));
    expect(fragmentada).toBeLessThan(seguida);
    expect(fragmentada).toBeGreaterThan(50);
  });

  it('nunca passa de 100 nem fica negativo', () => {
    expect(sleepScore(noite(600, 600, 600))).toBeLessThanOrEqual(100);
    expect(sleepScore(noite(0, 0, 1, 999))).toBeGreaterThanOrEqual(0);
  });
});

describe('nightFrom', () => {
  const segmentos: SleepSegment[] = [
    { phase: 'light', minutes: 30 },
    { phase: 'deep', minutes: 60 },
    { phase: 'awake', minutes: 15 },
    { phase: 'rem', minutes: 45 },
  ];

  it('soma cada fase e preserva a ordem dos segmentos', () => {
    const n = nightFrom('2026-07-28', segmentos);
    expect(n.phases).toEqual({ light: 30, deep: 60, awake: 15, rem: 45 });
    // A ordem é o que revela a arquitetura da noite no hipnograma.
    expect(n.segments.map((s) => s.phase)).toEqual(['light', 'deep', 'awake', 'rem']);
  });

  it('tempo acordado NÃO entra no total dormido', () => {
    // "8h na cama" com 1h acordado são 7h de sono — é o número que a pessoa
    // reconhece como o que dormiu.
    const n = nightFrom('2026-07-28', segmentos);
    expect(n.totalMin).toBe(135);
  });
});

describe('deepSleepContinuity', () => {
  it('não avalia noite sem sono profundo', () => {
    expect(deepSleepContinuity([{ phase: 'light', minutes: 300 }])).toBeNull();
  });

  it('dá nota cheia a um bloco único de um ciclo inteiro', () => {
    expect(deepSleepContinuity([{ phase: 'deep', minutes: 20 }])).toBe(100);
  });

  /*
   O caso que justifica a métrica existir: mesmo TOTAL de sono profundo, noites
   muito diferentes. Somar 90 minutos em pedaços de 15 não restaura como um
   bloco de 90 — e `phases.deep`, sozinho, não distingue as duas.
  */
  it('separa noites de mesmo total mas fragmentação diferente', () => {
    const inteiro = deepSleepContinuity([{ phase: 'deep', minutes: 90 }]);
    const picado = deepSleepContinuity(
      Array.from({ length: 6 }, () => ({ phase: 'deep' as const, minutes: 15 })),
    );
    expect(inteiro).toBe(100);
    // 63 = consolidação 0,75 (bloco de 15 contra o ciclo de 20) × fragmentação
    // 0,83 (6 blocos onde 5 bastariam). O número exato fica travado aqui de
    // propósito: é a diferença que a métrica existe para mostrar.
    expect(picado).toBe(63);
    expect(inteiro!).toBeGreaterThan(picado!);
  });

  it('não pune quem dividiu o profundo em ciclos de tamanho normal', () => {
    // 60 min em 3 blocos de 20 é a arquitetura esperada, não fragmentação.
    const nota = deepSleepContinuity(
      Array.from({ length: 3 }, () => ({ phase: 'deep' as const, minutes: 20 })),
    );
    expect(nota).toBe(100);
  });

  it('penaliza bloco curto mesmo quando é o único', () => {
    expect(deepSleepContinuity([{ phase: 'deep', minutes: 5 }])).toBe(25);
  });

  it('ignora fases que não são profundo', () => {
    const comRuido = deepSleepContinuity([
      { phase: 'light', minutes: 200 },
      { phase: 'deep', minutes: 20 },
      { phase: 'awake', minutes: 10 },
    ]);
    expect(comRuido).toBe(100);
  });
});
