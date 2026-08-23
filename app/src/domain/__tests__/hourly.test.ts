import {
  acumuladoAteAgora,
  barrasDoDia,
  comDeltaNaHora,
  comFatiasDaMemoria,
  comoAcumulado,
  comoDeltas,
  deltaDoAcumulado,
  fatiasVazias,
  horaMaisAtiva,
  modoDaSerie,
  normalizar,
  rotulosDoAcumulado,
  totalDoDia,
  totalDoDiaComAncora,
} from '../hourly';

/** Instante local de hoje, na hora pedida. */
function hoje(hora: number, minuto = 0): number {
  const d = new Date();
  d.setHours(hora, minuto, 0, 0);
  return d.getTime();
}

describe('comFatiasDaMemoria', () => {
  it('agrupa as amostras do firmware por hora, somando passos e calorias', () => {
    const f = comFatiasDaMemoria(fatiasVazias(), [
      { at: hoje(8, 10), steps: 300, kcal: 12 },
      { at: hoje(8, 40), steps: 200, kcal: 8 },
      { at: hoje(9, 5), steps: 100, kcal: 4 },
    ]);
    expect(f[8]).toEqual({ hora: 8, passos: 500, kcal: 20 });
    expect(f[9]).toEqual({ hora: 9, passos: 100, kcal: 4 });
    expect(f[10].passos).toBe(0);
  });

  it('memória atrasada não apaga o que passou ao vivo depois dela', () => {
    const comAoVivo = comDeltaNaHora(fatiasVazias(), 8, 900, 40);
    const f = comFatiasDaMemoria(comAoVivo, [{ at: hoje(8, 10), steps: 300, kcal: 12 }]);
    expect(f[8].passos).toBe(900);
    expect(f[8].kcal).toBe(40);
  });

  it('amostra sem carimbo válido é descartada', () => {
    const f = comFatiasDaMemoria(fatiasVazias(), [{ at: 0, steps: 999, kcal: 99 }]);
    expect(totalDoDia(f)).toEqual({ passos: 0, kcal: 0 });
  });

  it('fatia sem calorias no firmware não vira NaN', () => {
    const f = comFatiasDaMemoria(fatiasVazias(), [{ at: hoje(7), steps: 100 }]);
    expect(f[7]).toEqual({ hora: 7, passos: 100, kcal: 0 });
  });
});

describe('deltaDoAcumulado', () => {
  it('o primeiro evento da sessão não vira barra', () => {
    // Sem referência anterior, o acumulado de 6.412 passos é o DIA inteiro, e
    // somá-lo à hora corrente desenharia o dia dentro de uma barra só.
    expect(deltaDoAcumulado(null, 6412)).toBe(0);
  });

  it('a diferença entre duas leituras é o que a hora ganhou', () => {
    expect(deltaDoAcumulado(6412, 6500)).toBe(88);
  });

  it('contador que anda para trás vale zero, não passo negativo', () => {
    expect(deltaDoAcumulado(6412, 12)).toBe(0);
  });

  it('leitura sem passos não mexe em nada', () => {
    expect(deltaDoAcumulado(6412, null)).toBe(0);
  });
});

describe('acumuladoAteAgora', () => {
  it('soma as fatias e para na hora atual', () => {
    let f = comDeltaNaHora(fatiasVazias(), 7, 1000, 40);
    f = comDeltaNaHora(f, 8, 500, 20);
    f = comDeltaNaHora(f, 20, 3000, 120);
    const curva = acumuladoAteAgora(f, 9);
    expect(curva).toHaveLength(10);
    expect(curva[9]).toBe(1500);
    // A curva só cresce: é o que a tela promete ao chamá-la de acúmulo.
    expect(curva.every((v, i) => i === 0 || v >= curva[i - 1])).toBe(true);
  });
});

describe('barrasDoDia', () => {
  it('começa na primeira hora com movimento e termina agora', () => {
    let f = comDeltaNaHora(fatiasVazias(), 6, 800, 32);
    f = comDeltaNaHora(f, 9, 400, 16);
    const barras = barrasDoDia(f, 10);
    expect(barras[0].label).toBe('06h');
    expect(barras[barras.length - 1].label).toBe('10h');
    expect(barras.map((b) => b.value)).toEqual([32, 0, 0, 16, 0]);
  });

  it('dia sem nenhum movimento não desenha barra nenhuma', () => {
    expect(barrasDoDia(fatiasVazias(), 15)).toEqual([]);
  });

  it('sabe desenhar passos também', () => {
    const f = comDeltaNaHora(fatiasVazias(), 6, 800, 32);
    expect(barrasDoDia(f, 6, 'passos')).toEqual([{ label: '06h', value: 800 }]);
  });
});

describe('normalizar', () => {
  it('estado gravado por uma versão antiga do app não quebra a tela', () => {
    expect(normalizar(undefined)).toHaveLength(24);
    expect(normalizar([{ hora: 99, passos: 10, kcal: 1 }] as never)).toEqual(fatiasVazias());
  });
});

describe('horaMaisAtiva', () => {
  it('encontra a hora de mais movimento', () => {
    let f = comDeltaNaHora(fatiasVazias(), 7, 1000, 40);
    f = comDeltaNaHora(f, 18, 3200, 130);
    expect(horaMaisAtiva(f)?.hora).toBe(18);
  });

  it('sem movimento, não existe hora mais ativa', () => {
    expect(horaMaisAtiva(fatiasVazias())).toBeNull();
  });
});

describe('rotulosDoAcumulado', () => {
  it('o último rótulo é a hora atual, não o fim do dia', () => {
    expect(rotulosDoAcumulado(14)).toEqual(['00h', '05h', '09h', '14h']);
    expect(rotulosDoAcumulado(23).at(-1)).toBe('23h');
  });

  it('à meia-noite existe um rótulo só', () => {
    expect(rotulosDoAcumulado(0)).toEqual(['00h']);
  });
});

describe('modoDaSerie', () => {
  it('série que sobe e desce é delta, é assim que passo real se comporta', () => {
    expect(modoDaSerie([{ steps: 300 }, { steps: 80 }, { steps: 640 }])).toBe('delta');
  });

  it('série sempre crescente cuja soma passa do último é acumulado', () => {
    // O caso do relato: fatias com o total do dia até ali.
    expect(
      modoDaSerie([{ steps: 210 }, { steps: 640 }, { steps: 980 }, { steps: 2147 }]),
    ).toBe('acumulado');
  });

  it('série crescente curta, com soma próxima do último, continua delta', () => {
    // Duas fatias pequenas em ordem crescente por acaso não provam acúmulo.
    expect(modoDaSerie([{ steps: 100 }, { steps: 900 }])).toBe('delta');
  });

  it('um ponto só não decide nada, e o padrão nunca infla', () => {
    expect(modoDaSerie([{ steps: 2147 }])).toBe('delta');
    expect(modoDaSerie([])).toBe('delta');
  });
});

describe('comoDeltas', () => {
  it('converte acumulado em diferença entre pontos, preservando o total', () => {
    const bruto = [
      { at: 1, steps: 210, kcal: 8 },
      { at: 2, steps: 640, kcal: 25 },
      { at: 3, steps: 2147, kcal: 84 },
    ];
    const deltas = comoDeltas(bruto);
    expect(deltas.map((d) => d.steps)).toEqual([210, 430, 1507]);
    expect(deltas.reduce((s, d) => s + d.steps, 0)).toBe(2147);
    expect(deltas.map((d) => d.kcal)).toEqual([8, 17, 59]);
  });

  it('série que já é delta passa intacta', () => {
    const bruto = [
      { at: 1, steps: 300, kcal: 12 },
      { at: 2, steps: 80, kcal: 3 },
      { at: 3, steps: 640, kcal: 26 },
    ];
    expect(comoDeltas(bruto)).toEqual(bruto);
  });

  it('queda no contador acumulado não vira passo negativo', () => {
    const deltas = comoDeltas([
      { at: 1, steps: 500, kcal: 20 },
      { at: 2, steps: 1200, kcal: 48 },
      { at: 3, steps: 1200, kcal: 48 },
    ]);
    expect(deltas.map((d) => d.steps)).toEqual([500, 700, 0]);
  });
});

describe('totalDoDiaComAncora', () => {
  it('o contador do aparelho manda, é o número que o app do fabricante mostra', () => {
    let f = comDeltaNaHora(fatiasVazias(), 8, 5000, 200);
    f = comDeltaNaHora(f, 9, 5000, 200);
    expect(totalDoDiaComAncora(f, 2147)).toBe(2147);
  });

  it('sem contador, o total vem da memória, que é o que existe de manhã', () => {
    const f = comDeltaNaHora(fatiasVazias(), 7, 830, 33);
    expect(totalDoDiaComAncora(f, null)).toBe(830);
    expect(totalDoDiaComAncora(f, 0)).toBe(830);
  });
});

describe('comoAcumulado', () => {
  it('deltas viram contador crescente, e o último ponto é o dia', () => {
    const acc = comoAcumulado([{ steps: 300 }, { steps: 80 }, { steps: 640 }]);
    expect(acc.map((a) => a.steps)).toEqual([300, 380, 1020]);
  });

  it('série que já é acumulada continua a mesma', () => {
    const bruto = [{ steps: 210 }, { steps: 640 }, { steps: 2147 }];
    expect(comoAcumulado(bruto).map((a) => a.steps)).toEqual([210, 640, 2147]);
  });
});
