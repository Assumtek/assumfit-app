import { fracaoDoValor, marcasDaEscala, valorDaPosicao } from '../escala';

const rpe = { minimo: 1, maximo: 10 };

describe('slider de escala', () => {
  it('o começo da trilha é o mínimo e o fim é o máximo', () => {
    expect(valorDaPosicao(0, 300, rpe)).toBe(1);
    expect(valorDaPosicao(300, 300, rpe)).toBe(10);
  });

  it('o meio da trilha cai no meio da escala', () => {
    expect(valorDaPosicao(150, 300, rpe)).toBe(6);
  });

  it('o dedo além da trilha não inventa valor fora da faixa', () => {
    // O erro clássico de slider: um pixel a mais vira 11.
    expect(valorDaPosicao(400, 300, rpe)).toBe(10);
    expect(valorDaPosicao(-40, 300, rpe)).toBe(1);
  });

  it('largura ainda não medida devolve o mínimo, não NaN', () => {
    expect(valorDaPosicao(10, 0, rpe)).toBe(1);
  });

  it('todo inteiro da faixa é alcançável', () => {
    const alcancados = new Set(
      Array.from({ length: 301 }, (_, x) => valorDaPosicao(x, 300, rpe)));
    expect([...alcancados].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('desenhar e ler são inversos', () => {
    for (let v = rpe.minimo; v <= rpe.maximo; v++) {
      expect(valorDaPosicao(fracaoDoValor(v, rpe) * 300, 300, rpe)).toBe(v);
    }
  });

  it('valor fora da faixa não empurra o marcador para fora da trilha', () => {
    expect(fracaoDoValor(99, rpe)).toBe(1);
    expect(fracaoDoValor(-3, rpe)).toBe(0);
  });

  it('as marcas são igualmente espaçadas e incluem as duas pontas', () => {
    // O defeito: 1,3,5,7,9 mais um 10 colado no 9, desenhados com espaçamento
    // igual. A régua mentia sobre onde cada valor fica, e o 8 caía sobre o 9.
    expect(marcasDaEscala(rpe)).toEqual([1, 4, 7, 10]);
    expect(marcasDaEscala({ minimo: 1, maximo: 5 })).toEqual([1, 2, 3, 4, 5]);
  });

  it('todo intervalo entre marcas tem o mesmo tamanho', () => {
    for (const faixa of [rpe, { minimo: 0, maximo: 10 }, { minimo: 1, maximo: 7 }]) {
      const m = marcasDaEscala(faixa);
      const saltos = m.slice(1).map((v, i) => v - m[i]);
      expect(new Set(saltos).size).toBe(1);
      expect(m[0]).toBe(faixa.minimo);
      expect(m[m.length - 1]).toBe(faixa.maximo);
    }
  });
});
