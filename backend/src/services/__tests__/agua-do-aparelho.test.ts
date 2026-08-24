import { aguaEfetiva } from '../scoring.service';

/**
 * A água que o aparelho informa, contra a que o banco tem.
 *
 * A regra é uma linha e vale a pena travá-la: vence o MAIOR. Água não diminui
 * ao longo do dia, então um app com estado velho não pode apagar o que o
 * servidor já sabe, e o servidor não pode ignorar o copo que a pessoa acabou
 * de registrar (Leonardo, 24/08/2026).
 */
describe('água do aparelho', () => {
  it('o aparelho está à frente: vence o aparelho', () => {
    expect(aguaEfetiva(200, 325)).toBe(325);
  });

  it('o aparelho está atrasado: o banco não retrocede', () => {
    expect(aguaEfetiva(800, 200)).toBe(800);
  });

  it('sem informação do aparelho, fica o banco, inclusive o desconhecido', () => {
    expect(aguaEfetiva(200)).toBe(200);
    expect(aguaEfetiva(null)).toBeNull();
  });

  it('primeiro registro do dia, com o banco ainda sem linha', () => {
    // `null` é "não sei", e o aparelho sabe: 200 ml.
    expect(aguaEfetiva(null, 200)).toBe(200);
  });

  it('valor quebrado é arredondado, não truncado', () => {
    expect(aguaEfetiva(0, 249.6)).toBe(250);
  });
});
