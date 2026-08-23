import {
  acumuladoAteAgora,
  barrasDoDia,
  comDeltaNaHora,
  comFatiasDaMemoria,
  deltaDoAcumulado,
  fatiasVazias,
  horaMaisAtiva,
  normalizar,
  rotulosDoAcumulado,
  totalDoDia,
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
