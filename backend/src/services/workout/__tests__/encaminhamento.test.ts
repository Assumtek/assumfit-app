import { messageFor, motivoDoEncaminhamento } from '../orchestrator';

/**
 * A tela precisa dizer POR QUE encaminhou.
 *
 * "Pelo seu perfil de saúde" é verdadeiro e inútil: quem lê não sabe qual
 * resposta causou aquilo, não tem como perceber que marcou algo por engano, e
 * não sabe o que levar ao profissional. As flags que encaminham são poucas,
 * conhecidas e já ficam gravadas na requisição.
 */
describe('motivoDoEncaminhamento', () => {
  it('nomeia a condição que a pessoa declarou', () => {
    expect(motivoDoEncaminhamento(['cardiopata'])).toBe(
      'Você indicou uma condição cardíaca na anamnese.',
    );
    expect(motivoDoEncaminhamento(['gestante'])).toBe('Você indicou gestação na anamnese.');
  });

  it('junta mais de uma causa em português corrente', () => {
    expect(motivoDoEncaminhamento(['cardiopata', 'gestante'])).toBe(
      'Você indicou uma condição cardíaca e gestação na anamnese.',
    );
  });

  it('IGNORA flags que não encaminham', () => {
    /*
     `obeso`, `idoso` e `glp1` geram plano conservador, não encaminhamento.
     Listá-las numa tela de encaminhamento sugeriria que impediram o treino —
     acusando a pessoa de algo que o produto não decidiu.
    */
    expect(motivoDoEncaminhamento(['obeso', 'idoso', 'glp1', 'hipertensao'])).toBeNull();
  });

  it('mistura: só a causa real aparece', () => {
    expect(motivoDoEncaminhamento(['obeso', 'gestante', 'asma'])).toBe(
      'Você indicou gestação na anamnese.',
    );
  });

  it('sem flag nenhuma não inventa causa', () => {
    expect(motivoDoEncaminhamento([])).toBeNull();
  });
});

describe('messageFor', () => {
  it('encaminhamento vem com a causa na frente', () => {
    const m = messageFor('encaminhamento_clinico', ['cardiopata']);
    expect(m.startsWith('Você indicou uma condição cardíaca na anamnese.')).toBe(true);
    // E continua dizendo o que fazer.
    expect(m).toContain('educador físico');
  });

  it('encaminhamento decidido pelo modelo, sem flag nossa, usa o texto genérico', () => {
    // O modelo pode encaminhar num perfil que a tabela de tiers não cobre.
    // Inventar a causa ali seria afirmar sobre algo que este código não sabe.
    const m = messageFor('encaminhamento_clinico', []);
    expect(m.startsWith('Você indicou')).toBe(false);
    expect(m).toContain('não geramos um treino automático');
  });

  it('os outros desfechos não ganham causa clínica', () => {
    expect(messageFor('timeout', ['cardiopata'])).not.toContain('anamnese');
    expect(messageFor('formato', ['gestante'])).not.toContain('anamnese');
  });

  it('motivo desconhecido cai na mensagem de qualidade', () => {
    expect(messageFor('coisa-que-nao-existe')).toContain('Não conseguimos gerar');
  });
});
