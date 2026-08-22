import {
  activityLevel,
  calcBioAge,
  deepSleepAge,
  estimateVo2max,
  fitnessAge,
  formatYears,
  hrvAge, explicacaoDaIdade } from '../bioAge';

/**
 * O espelho da conta que mora em `ai/models/bio_age.py`.
 *
 * Estes testes travam as ÂNCORAS das fontes — o ponto publicado de cada
 * estudo. O teste de paridade do serviço de IA cuida da outra metade: as duas
 * implementações darem o mesmo número.
 */

const BASE = {
  realAge: 40,
  sex: 'm' as const,
  hrvMs: 40,
  restingHr: 60,
  deepSleepPct: 0.18,
  bmi: 25,
  weeklyActiveMin: 60,
};

describe('VO₂máx estimado (Jurca 2005, Tabela 5 NASA)', () => {
  it('reproduz a equação publicada', () => {
    // 18,07 + 2,77 − 4,0 − 4,25 − 1,8 + 0 = 10,79 MET
    const vo2 = estimateVo2max({ age: 40, sex: 'm', bmi: 25, restingHr: 60, weeklyActiveMin: 0 });
    expect(vo2).toBeCloseTo(10.79 * 3.5, 2);
  });

  it('o termo de sexo vale exatamente 2,77 MET', () => {
    const h = estimateVo2max({ age: 40, sex: 'm', bmi: 25, restingHr: 60, weeklyActiveMin: 0 });
    const m = estimateVo2max({ age: 40, sex: 'f', bmi: 25, restingHr: 60, weeklyActiveMin: 0 });
    expect(h - m).toBeCloseTo(2.77 * 3.5, 2);
  });

  it('cada coeficiente tem o sinal da fisiologia', () => {
    const base = { age: 40, sex: 'm' as const, bmi: 25, restingHr: 60, weeklyActiveMin: 0 };
    expect(estimateVo2max({ ...base, age: 50 })).toBeLessThan(estimateVo2max(base));
    expect(estimateVo2max({ ...base, bmi: 30 })).toBeLessThan(estimateVo2max(base));
    expect(estimateVo2max({ ...base, restingHr: 75 })).toBeLessThan(estimateVo2max(base));
    expect(estimateVo2max({ ...base, weeklyActiveMin: 200 })).toBeGreaterThan(estimateVo2max(base));
  });
});

describe('nível de atividade (Tabela 1 de Jurca, em minutos registrados)', () => {
  it.each([
    [null, 0],
    [0, 0],
    [5, 1],
    [20, 2],
    [60, 3],
    [180, 4],
    [600, 4],
  ])('%s min → nível %i', (min, nivel) => {
    expect(activityLevel(min as number | null)).toBe(nivel);
  });
});

describe('idade da aptidão (FRIEND, Kaminsky 2015)', () => {
  it.each([
    [48.0, 'm', 24.5],
    [37.8, 'm', 44.5],
    [24.4, 'm', 74.5],
    [37.6, 'f', 24.5],
    [18.3, 'f', 74.5],
  ])('VO₂máx %f (%s) devolve a própria idade da mediana', (vo2, sexo, idade) => {
    expect(fitnessAge(vo2 as number, sexo as 'f' | 'm')).toBeCloseTo(idade as number, 1);
  });
});

describe('idade do HRV (Natarajan 2020)', () => {
  it('o RMSSD de referência devolve 30 anos', () => {
    expect(hrvAge(44.8, 'm')).toBeCloseTo(30, 1);
    expect(hrvAge(43.7, 'f')).toBeCloseTo(30, 1);
  });

  it('RMSSD maior significa idade menor', () => {
    expect(hrvAge(70, 'm')).toBeLessThan(hrvAge(44.8, 'm'));
    expect(hrvAge(44.8, 'm')).toBeLessThan(hrvAge(25, 'm'));
  });

  it('valor impossível não quebra', () => {
    expect(hrvAge(0, 'm')).toBe(30);
  });
});

describe('idade do sono profundo (Ohayon 2004)', () => {
  it('20% é a âncora dos 30 anos', () => {
    expect(deepSleepAge(0.2)).toBeCloseTo(30, 1);
  });

  it('16% equivale a 50 anos', () => {
    expect(deepSleepAge(0.16)).toBeCloseTo(50, 1);
  });

  it('não afirma nada além do platô dos 60', () => {
    expect(deepSleepAge(0.14)).toBe(60);
    expect(deepSleepAge(0.01)).toBe(60);
  });
});

describe('resultado', () => {
  it('mais apto é biologicamente mais jovem', () => {
    const sedentario = calcBioAge({
      ...BASE,
      hrvMs: 35,
      restingHr: 72,
      deepSleepPct: 0.15,
      bmi: 28,
      weeklyActiveMin: 0,
    });
    const ativo = calcBioAge({
      ...BASE,
      hrvMs: 55,
      restingHr: 56,
      deepSleepPct: 0.2,
      bmi: 23,
      weeklyActiveMin: 200,
    });
    expect(ativo.bioAge).toBeLessThan(sedentario.bioAge);
  });

  it('sinal ausente sai da média em vez de valer zero', () => {
    const com = calcBioAge(BASE);
    const sem = calcBioAge({ ...BASE, deepSleepPct: null });
    expect(Math.abs(com.bioAge - sem.bioAge)).toBeLessThanOrEqual(3);
  });

  it('dado absurdo não produz idade absurda', () => {
    const r = calcBioAge({ ...BASE, hrvMs: 400, restingHr: 25, deepSleepPct: 1 });
    expect(r.bioAge).toBeGreaterThanOrEqual(18);
    expect(Math.abs(r.delta)).toBeLessThanOrEqual(15);
  });

  it('devolve os quatro fatores com valor e referência preenchidos', () => {
    const r = calcBioAge(BASE);
    expect(r.factors.map((f) => f.key)).toEqual(['fitness', 'hrv', 'sleep', 'activity']);
    for (const f of r.factors) {
      expect(f.value.length).toBeGreaterThan(0);
      expect(f.reference.length).toBeGreaterThan(0);
    }
  });

  it('a atividade aparece, mas não conta duas vezes', () => {
    const r = calcBioAge({ ...BASE, weeklyActiveMin: 200 });
    const atividade = r.factors.find((f) => f.key === 'activity')!;
    expect(atividade.years).toBe(0);
    expect(atividade.value).toContain('200 min');
  });

  it('expõe o VO₂máx que explica o número', () => {
    const r = calcBioAge(BASE);
    expect(r.vo2max).toBeGreaterThan(20);
    expect(r.vo2max).toBeLessThan(70);
  });

  it('sem IMC declarado, usa o padrão sem quebrar', () => {
    const r = calcBioAge({ ...BASE, bmi: null, weeklyActiveMin: null, deepSleepPct: null });
    expect(r.bioAge).toBeGreaterThanOrEqual(18);
  });
});

describe('formatYears', () => {
  it('usa sinal e vírgula decimal', () => {
    expect(formatYears(-2.4)).toBe('−2,4a');
    // 3,25 e não 3,15: este último é 3,1499… em binário, e o teste estaria
    // travando a imprecisão do float, não a formatação.
    expect(formatYears(3.25)).toBe('+3,3a');
    expect(formatYears(0)).toBe('−0,0a');
  });
});

describe('composição fecha com o total', () => {
  it('as contribuições somam o desvio antes do teto e do arredondamento', () => {
    // O caso real (ago/2026): um testador somou os anos de cada marcador
    // (+0,9 +2,6 +4,3 = 7,8) contra um título que dizia +2. A idade é MÉDIA
    // ponderada; o que soma é a contribuição (anos × peso).
    const bio = calcBioAge({ realAge: 29, sex: 'm', hrvMs: 32, restingHr: 72, deepSleepPct: 0.1, bmi: 27, weeklyActiveMin: 30 });
    const soma = bio.factors.reduce((s, f) => s + f.contribution, 0);
    const pesos = bio.factors.reduce((s, f) => s + f.weight, 0);
    expect(pesos).toBeCloseTo(1, 6);
    // bioAge = round(realAge + clamp(soma)); sem clamp atuando, a diferença é só arredondamento.
    expect(Math.abs(bio.bioAge - bio.realAge - soma)).toBeLessThanOrEqual(0.5 + 1e-9);
  });

  it('marcador ausente tem peso zero e o resto redistribui', () => {
    const bio = calcBioAge({ realAge: 40, sex: 'f', hrvMs: null, restingHr: 60, deepSleepPct: null });
    const hrv = bio.factors.find((f) => f.key === 'hrv')!;
    const apt = bio.factors.find((f) => f.key === 'fitness')!;
    expect(hrv.weight).toBe(0);
    expect(apt.weight).toBeCloseTo(1, 6);
  });
});

describe('explicacaoDaIdade', () => {
  const base = { realAge: 28, bioAge: 34, delta: -6, vo2max: 41.9 };
  it('nomeia o fator que mais puxa, de onde vem, e avisa que passos não entram', () => {
    const frase = explicacaoDaIdade(
      {
        ...base,
        factors: [
          { key: 'fitness', label: 'Aptidão cardiorrespiratória', weight: 0.8, contribution: 6 },
          { key: 'hrv', label: 'HRV', weight: 0, contribution: 0 },
          { key: 'sleep', label: 'Sono profundo', weight: 0.2, contribution: 0.2 },
        ],
      } as never,
      175);
    expect(frase).toContain('envelhece');
    expect(frase).toContain('aptidão cardiorrespiratória');
    expect(frase).toContain('41,9');
    expect(frase).toContain('175 min');
    expect(frase).toContain('passos não entram');
    expect(frase).toContain('Sem HRV suficiente');
  });
  it('igual à idade real não inventa culpado', () => {
    expect(explicacaoDaIdade({ ...base, delta: 0, factors: [] } as never, 0)).toContain('somam zero');
  });
});
