import {
  clampMl,
  DEFAULT_CONTAINERS,
  parseContainers,
  serializeContainers,
} from '../containers';

describe('clampMl', () => {
  it('prende na faixa aceita', () => {
    expect(clampMl(10)).toBe(50);
    expect(clampMl(5000)).toBe(2000);
    expect(clampMl(330)).toBe(330);
  });

  it('valor não finito volta ao copo padrão', () => {
    expect(clampMl(Number.NaN)).toBe(200);
  });

  it('arredonda fração — mililitro quebrado não existe no toque', () => {
    expect(clampMl(333.7)).toBe(334);
  });
});

describe('parseContainers', () => {
  it('sem nada guardado, devolve os padrões', () => {
    expect(parseContainers(null)).toEqual(DEFAULT_CONTAINERS);
  });

  it('lê o volume guardado preservando ordem e rótulo', () => {
    const lido = parseContainers(JSON.stringify([{ key: 'copo', ml: 300 }]));
    expect(lido.map((c) => c.key)).toEqual(['copo', 'garrafa', 'squeeze']);
    expect(lido[0]).toEqual({ key: 'copo', label: 'copo', ml: 300 });
    // O que não foi customizado mantém o padrão.
    expect(lido[1].ml).toBe(500);
  });

  it('volume fora da faixa é preso ao ler, não só ao escrever', () => {
    expect(parseContainers(JSON.stringify([{ key: 'garrafa', ml: 99999 }]))[1].ml).toBe(2000);
  });

  it('lixo guardado degrada para o padrão em vez de quebrar', () => {
    expect(parseContainers('{')).toEqual(DEFAULT_CONTAINERS);
    expect(parseContainers('"texto"')).toEqual(DEFAULT_CONTAINERS);
    expect(parseContainers(JSON.stringify([{ nada: true }]))).toEqual(DEFAULT_CONTAINERS);
  });

  it('ida e volta preserva os volumes', () => {
    const meus = [
      { key: 'copo' as const, label: 'copo', ml: 250 },
      { key: 'garrafa' as const, label: 'garrafa', ml: 600 },
      { key: 'squeeze' as const, label: 'squeeze', ml: 1000 },
    ];
    expect(parseContainers(serializeContainers(meus))).toEqual(meus);
  });
});
