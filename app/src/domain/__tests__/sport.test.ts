import {
  kcalFor,
  kcalRange,
  kcalRangeLabel,
  paceMinPerKm,
  simplifyTrack,
  sportClock,
  trackDistanceM,
  type GeoPoint,
} from '../sport';

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

  it('faixa de caloria abre o peso desconhecido em intervalo', () => {
    // Corrida (9.8) × 0,5 h: 60 kg → 294, 85 kg → 417. O 70 kg pontual (343)
    // cai DENTRO da faixa — a faixa não muda a conta, declara a incerteza.
    expect(kcalRange(9.8, 30 * 60_000)).toEqual([294, 417]);
    expect(kcalRangeLabel(9.8, 30 * 60_000)).toBe('294–417');
    const [min, max] = kcalRange(9.8, 30 * 60_000);
    expect(kcalFor(9.8, 70, 30 * 60_000)).toBeGreaterThan(min);
    expect(kcalFor(9.8, 70, 30 * 60_000)).toBeLessThan(max);
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

const ponto = (i: number): GeoPoint => ({
  lat: -25.4 + i * 0.0001,
  lon: -49.2 + i * 0.0001,
  at: i * 1000,
});

describe('simplifyTrack', () => {
  it('menos de 2 pontos não é percurso', () => {
    expect(simplifyTrack([])).toEqual([]);
    expect(simplifyTrack([ponto(0)])).toEqual([]);
  });

  it('trilha curta passa inteira, sem o instante e com 5 casas', () => {
    const saida = simplifyTrack([ponto(0), ponto(1)]);
    expect(saida).toEqual([
      { lat: -25.4, lon: -49.2 },
      { lat: -25.3999, lon: -49.1999 },
    ]);
    expect(Object.keys(saida[0])).toEqual(['lat', 'lon']);
  });

  it('trilha longa é reduzida ao teto, preservando o último ponto', () => {
    const pontos = Array.from({ length: 5000 }, (_, i) => ponto(i));
    const saida = simplifyTrack(pontos, 300);
    expect(saida.length).toBeLessThanOrEqual(301);
    expect(saida[saida.length - 1]).toEqual({
      lat: Math.round(pontos[4999].lat * 1e5) / 1e5,
      lon: Math.round(pontos[4999].lon * 1e5) / 1e5,
    });
  });
});
