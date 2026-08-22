import { BRAND_MARKS } from '../../assets/brandMarks';
import {
  assumfitVibra,
  MARCA_DA_CATEGORIA,
  NOME_DA_CATEGORIA,
  BALDES_DE_OUTROS,
  comAssumfit,
  comCategoria,
  comTodas,
  linhasParaTela,
  nomeadasLigadas,
  todasLigadas,
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

describe('MARCA_DA_CATEGORIA', () => {
  it('toda categoria do vocabulário tem ícone, e toda marca citada existe no arquivo gerado', () => {
    for (const type of Object.keys(NOME_DA_CATEGORIA).map(Number)) {
      const m = MARCA_DA_CATEGORIA[type];
      expect(m).toBeTruthy();
      if (m.kind === 'brand') expect(BRAND_MARKS[m.mark]).toBeTruthy();
    }
  });
});

describe('linhasParaTela', () => {
  it('uma linha por categoria nomeada, na ordem do firmware, e os baldes viram uma só', () => {
    const atual = filtro([
      [0, true],
      [5, false],
      [15, false],
      [16, true],
      [17, false],
    ]);
    expect(linhasParaTela(atual)).toEqual([
      { key: 'cat:0', nome: 'Telefone', marca: MARCA_DA_CATEGORIA[0], enabled: true, outros: false },
      { key: 'cat:5', nome: 'WhatsApp', marca: MARCA_DA_CATEGORIA[5], enabled: false, outros: false },
      { key: 'outros', nome: 'Outros apps', marca: { kind: 'glyph', hex: '#8E8E93', icon: 'grid' }, enabled: true, outros: true },
    ]);
  });

  it('categoria que o vocabulário não nomeia não vira interruptor', () => {
    expect(linhasParaTela(filtro([[99, true]]))).toEqual([]);
  });

  it('sem balde reportado, não há linha de "outros"', () => {
    expect(linhasParaTela(filtro([[0, true]])).some((l) => l.outros)).toBe(false);
  });
});

describe('comCategoria / comTodas / todasLigadas', () => {
  it('muda só a categoria pedida', () => {
    const novo = comCategoria(filtro([[0, false], [5, false]]), 5, true);
    expect(novo).toEqual(filtro([[0, false], [5, true]]));
  });

  it('"todas" liga inclusive os baldes, e desliga tudo de volta', () => {
    const atual = filtro([[0, false], [15, false], [17, false]]);
    expect(todasLigadas(comTodas(atual, true))).toBe(true);
    expect(assumfitVibra(comTodas(atual, true))).toBe(true);
    expect(comTodas(atual, false).some((c) => c.enabled)).toBe(false);
  });

  it('filtro vazio nunca conta como "todas ligadas"', () => {
    expect(todasLigadas([])).toBe(false);
  });
});
