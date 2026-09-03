import { pressureZones, quemPuxaAPressao, ratePressure } from '../ratings';

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

describe('o texto das faixas descreve a conta que a tela faz', () => {
  it('basta UM dos dois números entrar na faixa, e o texto diz "ou"', () => {
    // O relato: 117 por 85 cai em "Elevada" pela diastólica, e o texto da
    // faixa dizia "130–139 / 85–89". Quem procurava o próprio 117 naquele
    // intervalo não achava, e concluía que a tela tinha errado.
    const elevada = pressureZones.find((z) => z.label === 'Elevada')!;
    expect(elevada.range).toContain('ou');
    expect(elevada.matches(117, 85)).toBe(true);
    expect(elevada.matches(135, 75)).toBe(true);
  });

  it('a faixa saudável exige os DOIS, e o texto diz "e"', () => {
    const otima = pressureZones.find((z) => z.label === 'Ótima')!;
    expect(otima.range).toContain('e');
    expect(otima.matches(117, 79)).toBe(true);
    expect(otima.matches(117, 85)).toBe(false);
  });

  it('a classificação continua sendo a pior das duas', () => {
    expect(ratePressure(117, 85).label).toBe('Elevada');
    expect(ratePressure(138, 70).label).toBe('Elevada');
    expect(ratePressure(117, 79).label).toBe('Ótima');
  });
});
