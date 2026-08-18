import { falhaDeMedicao, textoDaFalha } from '../bandErrors';

describe('falhaDeMedicao', () => {
  it('a recusa de medição cobre as DUAS causas medidas em campo', () => {
    /*
     A tradução literal é "não está sendo usada corretamente", e ela engana: o
     firmware devolve esta mesma mensagem com o sensor OCUPADO. Visto com a
     pulseira firme no pulso e medindo no app do fabricante.
    */
    const f = falhaDeMedicao('未正确佩戴手环');
    expect(f?.corpo).toContain('app do fabricante');
    expect(f?.corpo).toContain('contato com a pele');
    // Não basta dizer o que houve: a frase precisa caber numa ação.
    expect(f?.corpo).toContain('tente de novo');
  });

  it('casa por conteúdo, não por igualdade — o SDK varia o prefixo', () => {
    expect(falhaDeMedicao('手环未正确佩戴')?.titulo).toBe(falhaDeMedicao('未正确佩戴手环')?.titulo);
  });

  it('bateria e medição em curso têm saídas diferentes', () => {
    expect(falhaDeMedicao('电量低')?.titulo).toContain('bateria');
    expect(falhaDeMedicao('正在测量中')?.automatico).toBe(true);
  });

  it('mensagem desconhecida devolve null, para o texto genérico assumir', () => {
    expect(falhaDeMedicao('The operation couldn’t be completed.')).toBeNull();
    expect(falhaDeMedicao('')).toBeNull();
    expect(falhaDeMedicao(null)).toBeNull();
    expect(falhaDeMedicao(undefined)).toBeNull();
  });

  it('nunca vaza o texto do firmware para a tela', () => {
    const f = falhaDeMedicao('未正确佩戴手环');
    expect(`${f?.titulo}${f?.corpo}`).not.toMatch(/[一-鿿]/);
  });
});

describe('textoDaFalha', () => {
  it('junta título e ação numa frase só', () => {
    expect(textoDaFalha('未正确佩戴手环')).toMatch(/^A pulseira não aceitou medir agora\. /);
  });

  it('sem tradução conhecida, não inventa frase', () => {
    expect(textoDaFalha('erro qualquer')).toBeNull();
  });
});
