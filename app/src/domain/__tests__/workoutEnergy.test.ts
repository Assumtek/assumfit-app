import { acumularKcal, INTERVALO_MAXIMO_MS, kcalPorMinuto } from '../workoutEnergy';

const homem = { sex: 'm' as const, age: 35, weightKg: 80 };
const mulher = { sex: 'f' as const, age: 30, weightKg: 60 };

describe('kcalPorMinuto', () => {
  it('homem de 80 kg a 140 bpm: ~13 kcal/min, a ordem de grandeza de um treino intenso', () => {
    const v = kcalPorMinuto(140, homem);
    expect(v).toBeGreaterThan(11);
    expect(v).toBeLessThan(15);
  });

  it('mulher de 60 kg a 140 bpm gasta menos que o homem de 80 kg', () => {
    expect(kcalPorMinuto(140, mulher)).toBeLessThan(kcalPorMinuto(140, homem));
    expect(kcalPorMinuto(140, mulher)).toBeGreaterThan(5);
  });

  it('batimento mais alto, mais gasto', () => {
    expect(kcalPorMinuto(160, homem)).toBeGreaterThan(kcalPorMinuto(120, homem));
  });

  it('nunca negativo — repouso não "desqueima"', () => {
    expect(kcalPorMinuto(40, mulher)).toBe(0);
  });

  it('sem peso ou idade, zero: não há conta honesta', () => {
    expect(kcalPorMinuto(140, { ...homem, weightKg: 0 })).toBe(0);
    expect(kcalPorMinuto(140, { ...homem, age: 0 })).toBe(0);
  });
});

describe('acumularKcal', () => {
  it('soma o gasto do intervalo', () => {
    const porMin = kcalPorMinuto(140, homem);
    expect(acumularKcal(0, 140, 30_000, homem)).toBeCloseTo(porMin / 2, 5);
    expect(acumularKcal(10, 140, 60_000, homem)).toBeCloseTo(10 + porMin, 5);
  });

  it('intervalo absurdo é cortado no teto — app suspenso não cobra uma hora', () => {
    const teto = acumularKcal(0, 140, INTERVALO_MAXIMO_MS, homem);
    expect(acumularKcal(0, 140, 3_600_000, homem)).toBeCloseTo(teto, 5);
  });

  it('intervalo negativo não desconta', () => {
    expect(acumularKcal(5, 140, -1000, homem)).toBe(5);
  });
});
