import { GRANDEZAS, desligadas, linhasDoAgendamento, resumoDoAgendamento } from '../agendamento';

const tudo = (ligado: boolean) =>
  Object.fromEntries(GRANDEZAS.map((g) => [g.chave, ligado])) as Record<string, boolean>;

describe('agendamento da pulseira', () => {
  it('sem estado lido, não afirma nada', () => {
    // O erro que isto impede: dizer "tudo certo" porque a conferência ainda
    // não aconteceu, que é tratar ausência como confirmação.
    expect(linhasDoAgendamento(null)).toEqual([]);
    expect(resumoDoAgendamento(null)).toMatch(/ainda não conferimos/i);
  });

  it('tudo ligado é uma frase só', () => {
    expect(resumoDoAgendamento(tudo(true))).toMatch(/registrando todas/i);
    expect(desligadas(tudo(true))).toEqual([]);
  });

  it('nada ligado explica o traço nas telas', () => {
    expect(resumoDoAgendamento(tudo(false))).toMatch(/não está registrando nada/i);
  });

  it('lista as desligadas pelo nome, com "e" antes da última', () => {
    const estado = { ...tudo(true), stress: false, spo2: false };
    expect(resumoDoAgendamento(estado)).toBe(
      'A pulseira parou de registrar estresse e oxigenação. Enquanto estiver assim, esses dados não entram no app.',
    );
  });

  it('uma só desligada não ganha conjunção', () => {
    const estado = { ...tudo(true), hrv: false };
    expect(resumoDoAgendamento(estado)).toContain('registrar variabilidade (hrv).');
  });

  it('chave ausente conta como desligada, não como ligada', () => {
    // O firmware pode simplesmente não devolver a chave. Assumir ligado ali
    // esconderia exatamente o caso que esta tela existe para mostrar.
    expect(desligadas({ heartRate: true }).map((l) => l.chave)).toEqual([
      'hrv',
      'stress',
      'spo2',
      'bloodPressure',
    ]);
  });

  it('o batimento carrega a consequência do sono, que não tem interruptor próprio', () => {
    const batimento = GRANDEZAS.find((g) => g.chave === 'heartRate')!;
    expect(batimento.consequencia).toMatch(/sono/i);
  });
});
