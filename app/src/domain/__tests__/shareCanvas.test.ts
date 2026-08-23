import { sobreALixeira } from '../shareCanvas';

const zona = { x: 160, y: 700, largura: 72, altura: 72 };

describe('sobreALixeira', () => {
  it('reconhece o dedo dentro da zona', () => {
    expect(sobreALixeira({ x: 190, y: 730 }, zona)).toBe(true);
  });

  it('aceita uma folga em volta, porque o dedo cobre o alvo', () => {
    expect(sobreALixeira({ x: 145, y: 690 }, zona)).toBe(true);
  });

  it('longe é longe: soltar no meio do canvas não apaga bloco', () => {
    expect(sobreALixeira({ x: 190, y: 300 }, zona)).toBe(false);
    expect(sobreALixeira({ x: 20, y: 730 }, zona)).toBe(false);
  });

  it('sem ponto ou sem zona medida, não remove nada', () => {
    expect(sobreALixeira(null, zona)).toBe(false);
    expect(sobreALixeira({ x: 190, y: 730 }, null)).toBe(false);
    expect(sobreALixeira({ x: 190, y: 730 }, { x: 0, y: 0, largura: 0, altura: 0 })).toBe(false);
  });
});
