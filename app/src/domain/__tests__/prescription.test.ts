import { ordenarSubstitutos, segundosDaPrescricao, semOsQueJaEstaoNoTreino } from '../prescription';

describe('segundosDaPrescricao', () => {
  it('a prancha do relato: "30-45s", é tempo, e o alvo é o teto', () => {
    expect(segundosDaPrescricao('30-45s')).toBe(45);
  });
  it('formas que o modelo escreve', () => {
    expect(segundosDaPrescricao('45s')).toBe(45);
    expect(segundosDaPrescricao('30 seg')).toBe(30);
    expect(segundosDaPrescricao('20 segundos')).toBe(20);
    expect(segundosDaPrescricao('1 min')).toBe(60);
    expect(segundosDaPrescricao('30–45 s')).toBe(45);
  });
  it('repetições não viram relógio', () => {
    expect(segundosDaPrescricao('12')).toBeNull();
    expect(segundosDaPrescricao('8-12')).toBeNull();
    expect(segundosDaPrescricao('até a falha')).toBeNull();
    expect(segundosDaPrescricao('')).toBeNull();
    expect(segundosDaPrescricao(null)).toBeNull();
  });
});

describe('ordenarSubstitutos', () => {
  const opcoes = [
    { id: 'a', equipment: 'Halteres', level: 'AVANCADO' },
    { id: 'b', equipment: 'Halteres', level: 'INICIANTE' },
    { id: 'c', equipment: 'Máquina', level: 'INTERMEDIARIO' },
    { id: 'd', equipment: 'Cabo', level: 'INICIANTE' },
  ];
  it('aparelho ocupado: outro equipamento primeiro, ordem original dentro de cada grupo', () => {
    expect(ordenarSubstitutos(opcoes, 'equipamento', 'Halteres').map((o) => o.id)).toEqual(['c', 'd', 'a', 'b']);
  });
  it('não sei executar: nível mais simples primeiro', () => {
    expect(ordenarSubstitutos(opcoes, 'execucao', 'Halteres').map((o) => o.id)).toEqual(['b', 'd', 'c', 'a']);
  });
  it('sem motivo, a ordem que veio; ninguém é removido', () => {
    expect(ordenarSubstitutos(opcoes, null, 'Halteres')).toBe(opcoes);
    expect(ordenarSubstitutos(opcoes, 'equipamento', 'Halteres')).toHaveLength(4);
  });
});

describe('substitutos que o treino já tem', () => {
  const lista = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

  it('não sugere um exercício que já está adiante no treino', () => {
    const treino = [{ exerciseId: 'x' }, { exerciseId: 'b' }];
    expect(semOsQueJaEstaoNoTreino(lista, treino, 'x').map((e) => e.id)).toEqual(['a', 'c']);
  });

  it('o exercício sendo trocado não se remove a si mesmo duas vezes', () => {
    const treino = [{ exerciseId: 'a' }];
    expect(semOsQueJaEstaoNoTreino(lista, treino, 'a').map((e) => e.id)).toEqual(['a', 'b', 'c']);
  });

  it('treino sem repetição devolve a lista inteira', () => {
    expect(semOsQueJaEstaoNoTreino(lista, [{ exerciseId: 'z' }], 'z')).toHaveLength(3);
  });
});
