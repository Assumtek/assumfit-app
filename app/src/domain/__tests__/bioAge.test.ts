import { calcBioAge, formatYears, type BioAgeInput } from '../bioAge';

/**
 * A idade biológica é o número mais exposto do produto e o mais fácil de
 * quebrar em silêncio: uma inversão de sinal mostra idade errada para todo
 * mundo sem nada acusar. Estes testes travam o CONTRATO — direção do sinal,
 * limites, sensibilidade à faixa etária — e não os valores exatos, que ainda
 * vão mudar quando as curvas de referência reais entrarem na Fase 2.
 */

const base: BioAgeInput = {
  realAge: 32,
  sex: 'm',
  hrvMs: 54, // p50 da faixa 30–39
  restingHr: 68, // p50
  spo2Pct: 96, // p50
  deepSleepPct: 0.2, // média da faixa
  tempRangeC: 0.7, // média
};

describe('calcBioAge', () => {
  it('devolve a idade real quando todos os fatores estão na mediana', () => {
    const result = calcBioAge(base);
    expect(result.bioAge).toBe(32);
    expect(result.delta).toBe(0);
  });

  it('rejuvenesce com HRV acima da mediana e envelhece abaixo', () => {
    const melhor = calcBioAge({ ...base, hrvMs: 74 });
    const pior = calcBioAge({ ...base, hrvMs: 38 });

    expect(melhor.bioAge).toBeLessThan(32);
    expect(pior.bioAge).toBeGreaterThan(32);
    // delta positivo = mais jovem que a idade cronológica
    expect(melhor.delta).toBeGreaterThan(0);
    expect(pior.delta).toBeLessThan(0);
  });

  it('trata FC de repouso na direção certa — mais baixa rejuvenesce', () => {
    const baixa = calcBioAge({ ...base, restingHr: 52 });
    const alta = calcBioAge({ ...base, restingHr: 82 });

    expect(baixa.bioAge).toBeLessThan(alta.bioAge);
  });

  it('rejuvenesce com mais sono profundo', () => {
    expect(calcBioAge({ ...base, deepSleepPct: 0.45 }).bioAge).toBeLessThan(
      calcBioAge({ ...base, deepSleepPct: 0.1 }).bioAge,
    );
  });

  it('compara contra a faixa etária, não contra uma tabela única', () => {
    // 58 anos com HRV de 37 está NA mediana da faixa dele, então a idade
    // biológica deve bater a real. Com a tabela fixa de 30–35 da spec
    // original, esse mesmo valor seria punido como se ele tivesse 32.
    const cinquentao = calcBioAge({ ...base, realAge: 58, hrvMs: 37, restingHr: 70, spo2Pct: 95, deepSleepPct: 0.15 });
    expect(Math.abs(cinquentao.delta)).toBeLessThanOrEqual(1);
  });

  it('desloca a referência por sexo', () => {
    // O ajuste é pequeno (±2 ms de HRV, ±3 bpm), então testar a idade final
    // arredondada esconderia o efeito. O contrato está na contribuição de cada
    // fator: o MESMO valor medido vale coisas diferentes conforme a referência.
    const mesmoDado = { ...base, hrvMs: 56, restingHr: 71 };
    const feminino = calcBioAge({ ...mesmoDado, sex: 'f' }).factors;
    const masculino = calcBioAge({ ...mesmoDado, sex: 'm' }).factors;

    const hrvF = feminino.find((f) => f.key === 'hrv')!;
    const hrvM = masculino.find((f) => f.key === 'hrv')!;
    expect(hrvF.years).not.toBeCloseTo(hrvM.years, 3);
    expect(hrvF.reference).not.toBe(hrvM.reference);
  });

  describe('limites', () => {
    it('não deixa dado absurdo produzir idade absurda', () => {
      // HRV de 3 ms é artefato de movimento, não fisiologia.
      const lixo = calcBioAge({ ...base, hrvMs: 3, restingHr: 190, spo2Pct: 60, deepSleepPct: 0, tempRangeC: 6 });
      expect(lixo.bioAge).toBeLessThanOrEqual(base.realAge + 15);
      expect(lixo.bioAge).toBeGreaterThanOrEqual(18);
    });

    it('nunca desce abaixo de 18 anos', () => {
      const jovem = calcBioAge({ ...base, realAge: 19, hrvMs: 200, restingHr: 35, spo2Pct: 100, deepSleepPct: 0.9 });
      expect(jovem.bioAge).toBeGreaterThanOrEqual(18);
    });

    it('limita o total a ±15 anos', () => {
      const extremo = calcBioAge({ ...base, realAge: 60, hrvMs: 300, restingHr: 30, spo2Pct: 100, deepSleepPct: 1 });
      expect(60 - extremo.bioAge).toBeLessThanOrEqual(15);
    });
  });

  describe('fatores', () => {
    it('devolve os cinco fatores com valor e referência preenchidos', () => {
      const { factors } = calcBioAge(base);
      expect(factors.map((f) => f.key)).toEqual(['hrv', 'sleep', 'hr', 'spo2', 'temp']);
      factors.forEach((f) => {
        expect(f.value).toBeTruthy();
        expect(f.reference).toBeTruthy();
      });
    });

    it('a soma dos fatores explica o delta', () => {
      const result = calcBioAge({ ...base, hrvMs: 70, deepSleepPct: 0.35 });
      const soma = result.factors.reduce((acc, f) => acc + f.years, 0);
      // `years` é negativo quando rejuvenesce; o delta é o inverso arredondado.
      expect(Math.abs(-soma - result.delta)).toBeLessThanOrEqual(1);
    });
  });
});

describe('formatYears', () => {
  it('usa sinal de menos para rejuvenescimento e mais para envelhecimento', () => {
    expect(formatYears(-3.24)).toBe('−3,2a');
    expect(formatYears(0.14)).toBe('+0,1a');
    expect(formatYears(0)).toBe('−0,0a');
  });
});
