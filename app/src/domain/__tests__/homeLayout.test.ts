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
    // Os três anéis voltaram ao padrão por decisão da fundadora (23/08/2026).
    expect(ligados).toContain('aneis');
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

  it('preserva a ordem escolhida pela pessoa, e o que ela desligou', () => {
    const meu = [
      { chave: 'hrv', ligado: true },
      { chave: 'resumo', ligado: false },
    ];
    const n = normalizarLayout(meu);
    // A ordem entre os blocos que ela já tinha continua a mesma, mesmo com os
    // novos encaixados no meio.
    expect(n.findIndex((b) => b.chave === 'hrv')).toBeLessThan(
      n.findIndex((b) => b.chave === 'resumo'),
    );
    expect(n.find((b) => b.chave === 'resumo')).toEqual({ chave: 'resumo', ligado: false });
  });

  it('bloco novo entra no estado de fábrica, sem mexer no que a pessoa escolheu', () => {
    const antigo = [{ chave: 'resumo', ligado: true }];
    const n = normalizarLayout(antigo);
    expect(n).toHaveLength(BLOCOS.length);
    expect(n[0].chave).toBe('resumo');
    const semana = n.find((b) => b.chave === 'semana');
    expect(semana?.ligado).toBe(true);
    const tendencias = n.find((b) => b.chave === 'tendencias');
    expect(tendencias?.ligado).toBe(false);
  });


  it('bloco novo entra ao lado do vizinho que tem na ordem de fábrica', () => {
    /*
     O caso real: quem personalizou antes de os três anéis existirem. O bloco
     vem logo depois do resumo, como na fábrica, e não no fim da lista, que o
     jogaria para o rodapé da home.
    */
    const meu = [
      { chave: 'resumo', ligado: true },
      { chave: 'indicadores', ligado: true },
      { chave: 'atalhos', ligado: true },
    ];
    const n = normalizarLayout(meu);
    const posAneis = n.findIndex((b) => b.chave === 'aneis');
    const posResumo = n.findIndex((b) => b.chave === 'resumo');
    const posIndicadores = n.findIndex((b) => b.chave === 'indicadores');
    expect(posAneis).toBe(posResumo + 1);
    expect(posAneis).toBeLessThan(posIndicadores);
    // A ordem que a pessoa escolheu continua a mesma entre si.
    expect(posResumo).toBeLessThan(posIndicadores);
    expect(posIndicadores).toBeLessThan(n.findIndex((b) => b.chave === 'atalhos'));
  });

  it('sem vizinho anterior conhecido, o bloco novo vai para o fim', () => {
    const n = normalizarLayout([{ chave: 'atalhos', ligado: true }]);
    expect(n[0].chave).toBe('atalhos');
    expect(n).toHaveLength(BLOCOS.length);
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
    const p = layoutPadrao();
    const segundo = p[1].chave;
    const primeiro = p[0].chave;
    const b = moverBloco(p, segundo, -1);
    expect(b[0].chave).toBe(segundo);
    expect(b[1].chave).toBe(primeiro);
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
