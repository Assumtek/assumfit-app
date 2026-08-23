import {
  alternarBloco,
  BLOCOS,
  blocosLigados,
  ehPadrao,
  layoutPadrao,
  moverBloco,
  normalizarLayout,
} from '../homeLayout';

describe('layoutPadrao', () => {
  it('a Home de fábrica traz os blocos que funcionam no primeiro dia', () => {
    const ligados = blocosLigados(layoutPadrao());
    expect(ligados).toContain('resumo');
    expect(ligados).toContain('indicadores');
    // Tendência precisa de semanas de série; conquista, de treino feito.
    expect(ligados).not.toContain('tendencias');
    expect(ligados).not.toContain('conquistas');
  });
});

describe('normalizarLayout', () => {
  it('sem nada gravado, é a Home de fábrica', () => {
    expect(normalizarLayout(null)).toEqual(layoutPadrao());
    expect(normalizarLayout('lixo')).toEqual(layoutPadrao());
    expect(normalizarLayout([])).toEqual(layoutPadrao());
  });

  it('preserva a ordem escolhida pela pessoa', () => {
    const meu = [
      { chave: 'hrv', ligado: true },
      { chave: 'resumo', ligado: false },
    ];
    const n = normalizarLayout(meu);
    expect(n[0].chave).toBe('hrv');
    expect(n[1]).toEqual({ chave: 'resumo', ligado: false });
  });

  it('bloco novo de uma versão futura entra no fim, no estado de fábrica', () => {
    const antigo = [{ chave: 'resumo', ligado: true }];
    const n = normalizarLayout(antigo);
    expect(n).toHaveLength(BLOCOS.length);
    expect(n[0].chave).toBe('resumo');
    const semana = n.find((b) => b.chave === 'semana');
    expect(semana?.ligado).toBe(true);
    const tendencias = n.find((b) => b.chave === 'tendencias');
    expect(tendencias?.ligado).toBe(false);
  });

  it('bloco que não existe mais é descartado, e repetido não duplica', () => {
    const n = normalizarLayout([
      { chave: 'carrossel', ligado: true },
      { chave: 'resumo', ligado: true },
      { chave: 'resumo', ligado: false },
    ]);
    expect(n.filter((b) => b.chave === 'resumo')).toHaveLength(1);
    expect(n.some((b) => (b.chave as string) === 'carrossel')).toBe(false);
  });
});

describe('alternarBloco e moverBloco', () => {
  it('desligar tira o bloco da lista de ligados sem perder a posição', () => {
    const b = alternarBloco(layoutPadrao(), 'hrv');
    expect(blocosLigados(b)).not.toContain('hrv');
    expect(b.map((x) => x.chave)).toEqual(layoutPadrao().map((x) => x.chave));
  });

  it('mover troca com o vizinho', () => {
    const b = moverBloco(layoutPadrao(), 'indicadores', -1);
    expect(b[0].chave).toBe('indicadores');
    expect(b[1].chave).toBe('resumo');
  });

  it('nas pontas, mover não faz nada', () => {
    const p = layoutPadrao();
    expect(moverBloco(p, p[0].chave, -1)).toEqual(p);
    expect(moverBloco(p, p[p.length - 1].chave, 1)).toEqual(p);
  });

  it('chave desconhecida não altera a lista', () => {
    const p = layoutPadrao();
    expect(moverBloco(p, 'nada' as never, 1)).toEqual(p);
    expect(alternarBloco(p, 'nada' as never)).toEqual(p);
  });
});

describe('ehPadrao', () => {
  it('sabe dizer se a pessoa mexeu', () => {
    expect(ehPadrao(layoutPadrao())).toBe(true);
    expect(ehPadrao(alternarBloco(layoutPadrao(), 'hrv'))).toBe(false);
    expect(ehPadrao(moverBloco(layoutPadrao(), 'hrv', -1))).toBe(false);
  });
});
