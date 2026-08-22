import { caloriasDoDia, distanciaDoDia } from '../activityEstimates';

describe('distanciaDoDia', () => {
  it('o caso do relato: 1.253 passos não são 3,2 km, cai na estimativa', () => {
    const d = distanciaDoDia(1253, 3200);
    expect(d.fonte).toBe('estimada');
    expect(d.valor).toBeCloseTo(0.877, 2);
  });

  it('distância plausível da pulseira é aceita como está', () => {
    const d = distanciaDoDia(5628, 4100);
    expect(d.fonte).toBe('pulseira');
    expect(d.valor).toBeCloseTo(4.1, 3);
  });

  it('sem passos, zero, e nunca inventa distância', () => {
    expect(distanciaDoDia(0, 900)).toEqual({ valor: 0, fonte: 'estimada' });
  });

  it('sem leitura da pulseira, estima por passo', () => {
    expect(distanciaDoDia(1000, null)).toEqual({ valor: 0.7, fonte: 'estimada' });
  });
});

describe('caloriasDoDia', () => {
  it('o caso do relato: 886.149 para 1.253 passos não cabe em unidade nenhuma, estimativa', () => {
    const c = caloriasDoDia(1253, 886149);
    expect(c.fonte).toBe('estimada');
    expect(c.valor).toBe(50);
  });

  it('kcal plausível é aceita como kcal', () => {
    expect(caloriasDoDia(5000, 210)).toEqual({ valor: 210, fonte: 'pulseira' });
  });

  it('valor em "cal" (mil vezes maior) é lido dividindo por mil', () => {
    expect(caloriasDoDia(5000, 210_000)).toEqual({ valor: 210, fonte: 'pulseira' });
  });

  it('sem leitura, estima por passo', () => {
    expect(caloriasDoDia(2500, null)).toEqual({ valor: 100, fonte: 'estimada' });
  });
});
