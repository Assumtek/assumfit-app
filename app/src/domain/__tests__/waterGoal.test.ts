import {
  META_MAXIMA_ML,
  META_MINIMA_ML,
  waterGoalMl,
  waterGoalReason,
} from '../waterGoal';

describe('waterGoalMl', () => {
  it('escala com o peso: quem pesa mais bebe mais', () => {
    const leve = waterGoalMl({ weightKg: 55, sex: 'f' });
    const pesado = waterGoalMl({ weightKg: 95, sex: 'f' });
    expect(pesado).toBeGreaterThan(leve);
  });

  it('70 kg dá ~2,0 L de bebida (70 × 35 ml menos a água da comida)', () => {
    // 70 × 35 = 2450 ml totais; 80% disso = 1960 → 2000 arredondado.
    expect(waterGoalMl({ weightKg: 70, sex: 'm' })).toBe(2000);
  });

  it('sem peso declarado, usa a referência do sexo', () => {
    // EFSA: 2,0 L (f) e 2,5 L (m) de água TOTAL; 80% vira bebida.
    expect(waterGoalMl({ weightKg: null, sex: 'f' })).toBe(1600);
    expect(waterGoalMl({ weightKg: null, sex: 'm' })).toBe(2000);
  });

  it('pessoa leve não desce abaixo da referência populacional', () => {
    // 45 kg × 35 = 1575 → 1260 de bebida, abaixo do piso da EFSA para mulher.
    expect(waterGoalMl({ weightKg: 45, sex: 'f' })).toBe(1600);
  });

  it('treino de hoje aumenta a meta', () => {
    const parado = waterGoalMl({ weightKg: 70, sex: 'm' });
    const treinou = waterGoalMl({ weightKg: 70, sex: 'm', activeMinToday: 60 });
    expect(treinou).toBeGreaterThan(parado);
    // +350 ml por hora, mas a meta sai arredondada à centena: a diferença cai
    // na centena vizinha, e travar um valor exato aqui testaria o
    // arredondamento, não a regra.
    expect(treinou - parado).toBeGreaterThanOrEqual(300);
    expect(treinou - parado).toBeLessThanOrEqual(400);
  });

  it('duas horas de treino pedem mais que uma', () => {
    const uma = waterGoalMl({ weightKg: 80, sex: 'm', activeMinToday: 60 });
    const duas = waterGoalMl({ weightKg: 80, sex: 'm', activeMinToday: 120 });
    expect(duas).toBeGreaterThan(uma);
  });

  it('respeita o teto de segurança', () => {
    expect(waterGoalMl({ weightKg: 200, sex: 'm', activeMinToday: 600 })).toBe(META_MAXIMA_ML);
  });

  it('respeita o piso mesmo com dados estranhos', () => {
    expect(waterGoalMl({ weightKg: 1, sex: 'f' })).toBeGreaterThanOrEqual(META_MINIMA_ML);
    expect(waterGoalMl({ weightKg: 0, sex: 'f' })).toBeGreaterThanOrEqual(META_MINIMA_ML);
  });

  it('sempre devolve centena redonda — copo não tem precisão de mililitro', () => {
    for (const kg of [52, 63, 71, 88, 97]) {
      expect(waterGoalMl({ weightKg: kg, sex: 'f' }) % 100).toBe(0);
    }
  });
});

describe('waterGoalReason', () => {
  it('mostra a conta de quem tem peso', () => {
    expect(waterGoalReason({ weightKg: 72, sex: 'm' })).toBe('72 kg × 35 ml');
  });

  it('sem peso, diz que é referência', () => {
    expect(waterGoalReason({ weightKg: null, sex: 'f' })).toContain('mulheres');
  });

  it('cita o treino do dia quando existe', () => {
    const r = waterGoalReason({ weightKg: 72, sex: 'm', activeMinToday: 45 });
    expect(r).toContain('45 min');
  });
});
