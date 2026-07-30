import { kcalFor, paceMinPerKm, sportClock, trackDistanceM } from '../sport';

describe('esporte', () => {
  it('distância acumulada descarta salto de GPS', () => {
    const base = { lat: -23.55, lon: -46.63, at: 0 };
    const perto = { lat: -23.5501, lon: -46.63, at: 3000 }; // ~11 m
    const salto = { lat: -23.56, lon: -46.63, at: 6000 }; // ~1,1 km — ruído
    const d = trackDistanceM([base, perto, salto]);
    expect(d).toBeGreaterThan(9);
    expect(d).toBeLessThan(20);
  });

  it('caloria é MET × peso × horas, arredondada', () => {
    // Corrida (9.8) × 70 kg × 0,5 h = 343.
    expect(kcalFor(9.8, 70, 30 * 60_000)).toBe(343);
  });

  it('ritmo formata min/km e some sem distância', () => {
    expect(paceMinPerKm(5000, 25 * 60_000)).toBe(`5'00"/km`);
    expect(paceMinPerKm(50, 60_000)).toBeNull();
  });

  it('relógio muda de forma com hora cheia', () => {
    expect(sportClock(95_000)).toBe('1:35');
    expect(sportClock(3_695_000)).toBe('1:01:35');
  });
});
