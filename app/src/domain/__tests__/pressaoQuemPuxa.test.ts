import { quemPuxaAPressao, ratePressure } from '../ratings';

describe('quemPuxaAPressao', () => {
  it('diz que a diastólica puxou, e onde a sistólica está', () => {
    // O caso do relato: 117 é ótima, 85 é elevada, e a tela dizia só "Elevada".
    expect(ratePressure(117, 85).label).toBe('Elevada');
    expect(quemPuxaAPressao(117, 85)).toBe(
      'Quem define a faixa aqui é a diastólica (85); a sistólica, 117, está na faixa ótima.',
    );
  });

  it('diz que a sistólica puxou quando é ela', () => {
    expect(quemPuxaAPressao(145, 78)).toContain('sistólica (145)');
    expect(quemPuxaAPressao(145, 78)).toContain('diastólica, 78');
  });

  it('quando as duas estão na mesma faixa, não há o que desempatar', () => {
    expect(quemPuxaAPressao(115, 75)).toBeNull();
    expect(quemPuxaAPressao(150, 95)).toBeNull();
  });

  it('sem medição, não inventa frase', () => {
    expect(quemPuxaAPressao(null, 80)).toBeNull();
    expect(quemPuxaAPressao(120, null)).toBeNull();
  });
});
