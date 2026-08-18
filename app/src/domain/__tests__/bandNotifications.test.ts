import {
  assumfitVibra,
  BALDES_DE_OUTROS,
  comAssumfit,
  nomeadasLigadas,
} from '../bandNotifications';

const filtro = (entradas: [number, boolean][]) =>
  entradas.map(([type, enabled]) => ({ type, enabled }));

describe('comAssumfit', () => {
  it('liga os baldes de "outros" e não toca no resto', () => {
    const atual = filtro([
      [0, true], // telefone
      [5, false], // WhatsApp
      [15, false],
      [16, false],
      [17, false],
    ]);
    const novo = comAssumfit(atual, true);
    expect(novo.filter((c) => BALDES_DE_OUTROS.includes(c.type)).every((c) => c.enabled)).toBe(true);
    // O que a pessoa já configurava no app do fabricante sobrevive: o comando
    // substitui o conjunto INTEIRO, e perder isso seria dano invisível.
    expect(novo.find((c) => c.type === 0)?.enabled).toBe(true);
    expect(novo.find((c) => c.type === 5)?.enabled).toBe(false);
  });

  it('desligar volta os baldes ao estado apagado', () => {
    const atual = filtro([
      [0, true],
      [15, true],
      [17, true],
    ]);
    const novo = comAssumfit(atual, false);
    expect(assumfitVibra(novo)).toBe(false);
    expect(novo.find((c) => c.type === 0)?.enabled).toBe(true);
  });

  it('não inventa categoria que a pulseira não reportou', () => {
    // Firmware que só conhece telefone e SMS não recebe um balde de "outros"
    // fabricado por nós — mandar categoria desconhecida é ruído no canal serial.
    const atual = filtro([
      [0, false],
      [1, false],
    ]);
    expect(comAssumfit(atual, true)).toHaveLength(2);
    expect(assumfitVibra(comAssumfit(atual, true))).toBe(false);
  });

  it('filtro vazio continua vazio', () => {
    expect(comAssumfit([], true)).toEqual([]);
  });
});

describe('assumfitVibra', () => {
  it('basta UM balde ligado — não se sabe qual o firmware usa', () => {
    expect(assumfitVibra(filtro([[15, false], [16, true], [17, false]]))).toBe(true);
    expect(assumfitVibra(filtro([[15, false], [16, false]]))).toBe(false);
  });

  it('categoria nomeada ligada não significa que o AssumFit vibra', () => {
    expect(assumfitVibra(filtro([[5, true]]))).toBe(false);
  });
});

describe('nomeadasLigadas', () => {
  it('lista o que a pessoa vai sentir junto, pelo nome', () => {
    const atual = filtro([
      [5, true],
      [12, true],
      [23, false],
      [17, true],
    ]);
    expect(nomeadasLigadas(atual)).toEqual(['WhatsApp', 'Instagram']);
  });

  it('categoria fora do vocabulário conhecido não vira texto vazio na tela', () => {
    expect(nomeadasLigadas(filtro([[99, true]]))).toEqual([]);
  });
});
