import { ageFromBirthDate, calorieGoal, toMeasure } from '../nutritionGoal';

describe('toMeasure', () => {
  it('aceita número, string e string com unidade/vírgula', () => {
    expect(toMeasure(82)).toBe(82);
    expect(toMeasure('82')).toBe(82);
    expect(toMeasure('82kg')).toBe(82);
    expect(toMeasure('1,75')).toBe(1.75);
  });

  it('rejeita o que não é medida', () => {
    expect(toMeasure(null)).toBeNull();
    expect(toMeasure(undefined)).toBeNull();
    expect(toMeasure('não sei')).toBeNull();
    expect(toMeasure(NaN)).toBeNull();
  });
});

describe('ageFromBirthDate', () => {
  it('conta aniversário que já passou e que ainda não veio', () => {
    const hoje = new Date('2026-07-30T15:00:00Z');
    expect(ageFromBirthDate('1990-01-01', hoje)).toBe(36);
    expect(ageFromBirthDate('1990-12-25', hoje)).toBe(35);
  });

  it('devolve null para data inválida', () => {
    expect(ageFromBirthDate('quando nasci', new Date('2026-07-30T15:00:00Z'))).toBeNull();
  });
});

describe('calorieGoal', () => {
  const base = {
    weightKg: 82,
    heightCm: 175,
    ageYears: 36,
    sex: 'm' as const,
    goalAnswer: null,
    trainDaysPerWeek: null,
  };

  it('Mifflin-St Jeor: homem 82 kg / 175 cm / 36 anos, fator padrão 1.45', () => {
    // BMR = 10*82 + 6.25*175 − 5*36 + 5 = 1738.75 → TDEE 2521.2 → 2500
    const r = calorieGoal(base);
    expect(r).not.toBeNull();
    expect(r!.tdee).toBe(2500);
    expect(r!.goal).toBe(2500);
    expect(r!.adjustment).toBe('maintain');
  });

  it('mulher usa a constante própria (−161)', () => {
    // BMR = 10*60 + 6.25*165 − 5*30 − 161 = 1320.25 → ×1.45 = 1914.4 → 1900
    const r = calorieGoal({ ...base, weightKg: 60, heightCm: 165, ageYears: 30, sex: 'f' });
    expect(r!.tdee).toBe(1900);
  });

  it('perder peso corta 20% sem descer abaixo do repouso', () => {
    const r = calorieGoal({ ...base, goalAnswer: 'Perder peso' });
    expect(r!.adjustment).toBe('deficit');
    // TDEE 2521.2 ×0.8 = 2017 → 2000, acima do BMR 1738.75 — corte pleno.
    expect(r!.goal).toBe(2000);
    expect(r!.goal).toBeLessThan(r!.tdee);
  });

  it('ganhar massa acrescenta 12%', () => {
    const r = calorieGoal({ ...base, goalAnswer: 'Ganhar massa' });
    expect(r!.adjustment).toBe('surplus');
    expect(r!.goal).toBeGreaterThan(r!.tdee);
  });

  it('objetivo que não fala de peso mantém o gasto', () => {
    for (const resposta of ['Mais energia no dia', 'Saúde e manutenção', 'Melhorar o sono']) {
      expect(calorieGoal({ ...base, goalAnswer: resposta })!.adjustment).toBe('maintain');
    }
  });

  it('dias de treino movem o fator de atividade', () => {
    const sedentario = calorieGoal({ ...base, trainDaysPerWeek: 0 })!;
    const moderado = calorieGoal({ ...base, trainDaysPerWeek: 4 })!;
    const intenso = calorieGoal({ ...base, trainDaysPerWeek: 6 })!;
    expect(sedentario.tdee).toBeLessThan(moderado.tdee);
    expect(moderado.tdee).toBeLessThan(intenso.tdee);
  });

  it('recusa medida trocada de unidade em vez de inventar meta', () => {
    expect(calorieGoal({ ...base, weightKg: 180.7, heightCm: 1.75 })).toBeNull(); // altura em metros
    expect(calorieGoal({ ...base, weightKg: 25 })).toBeNull();
    expect(calorieGoal({ ...base, ageYears: null })).toBeNull();
    expect(calorieGoal({ ...base, sex: null })).toBeNull();
  });

  it('meta sai arredondada a 50 kcal', () => {
    const r = calorieGoal({ ...base, weightKg: 71, heightCm: 168, ageYears: 41 })!;
    expect(r.goal % 50).toBe(0);
    expect(r.tdee % 50).toBe(0);
  });
});

describe('objetivo em outros vocabulários', () => {
  const base = { weightKg: 80, heightCm: 178, ageYears: 35, sex: 'm' as const, trainDaysPerWeek: 3 };

  it('lê o objetivo do PLANO quando a anamnese não tem a pergunta', () => {
    // Caso real (ago/2026): peso, altura e plano de emagrecimento, e a meta
    // saía de manutenção — a tela só lia a anamnese de uma versão sem `goal`.
    expect(calorieGoal({ ...base, goalAnswer: 'emagrecimento' })?.adjustment).toBe('deficit');
    expect(calorieGoal({ ...base, goalAnswer: 'hipertrofia' })?.adjustment).toBe('surplus');
  });

  it('continua lendo a resposta da anamnese', () => {
    expect(calorieGoal({ ...base, goalAnswer: 'Perder peso' })?.adjustment).toBe('deficit');
    expect(calorieGoal({ ...base, goalAnswer: 'Ganhar massa' })?.adjustment).toBe('surplus');
    expect(calorieGoal({ ...base, goalAnswer: 'Saúde e manutenção' })?.adjustment).toBe('maintain');
  });
});
