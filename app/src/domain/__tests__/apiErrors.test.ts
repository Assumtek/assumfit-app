import { causaDaFalha, mensagemDaFalha } from '../apiErrors';

/**
 * A mensagem tem que apontar a causa CERTA.
 *
 * Oito telas culpavam a conexão em qualquer falha. Em produção (ago/2026),
 * cinco análises de refeição falharam com 401 — sessão derrubada — e a tela
 * mandou conferir o Wi-Fi. Mensagem que aponta a causa errada manda a pessoa
 * consertar o que não está quebrado e esconde o que está.
 */
describe('causaDaFalha', () => {
  it('401 é sessão, não conexão — o caso do relato', () => {
    expect(causaDaFalha({ response: { status: 401 } })).toBe('sessao');
  });

  it('403 é permissão: consentimento revogado não se resolve tentando de novo', () => {
    expect(causaDaFalha({ response: { status: 403 } })).toBe('permissao');
  });

  it('5xx é do servidor, e a tela diz que não é problema de quem lê', () => {
    expect(causaDaFalha({ response: { status: 500 } })).toBe('servidor');
    expect(causaDaFalha({ response: { status: 503 } })).toBe('servidor');
  });

  it('tempo esgotado é próprio: a análise de foto leva quase um minuto', () => {
    expect(causaDaFalha({ code: 'ECONNABORTED', message: 'timeout' })).toBe('tempo');
  });

  it('sem resposta nenhuma, aí sim é conexão', () => {
    expect(causaDaFalha({ code: 'ERR_NETWORK', message: 'Network Error' })).toBe('conexao');
  });

  it('erro sem forma conhecida não inventa causa', () => {
    expect(causaDaFalha(new Error('qualquer coisa'))).toBe('desconhecida');
    expect(causaDaFalha(undefined)).toBe('desconhecida');
  });
});

describe('mensagemDaFalha', () => {
  it('nomeia o que falhou e a ação que resolve', () => {
    const m = mensagemDaFalha({ response: { status: 401 } }, 'A análise');
    expect(m).toContain('A análise');
    expect(m).toContain('sessão expirou');
    expect(m).toContain('Entre novamente');
    // E não culpa a conexão.
    expect(m).not.toContain('conexão');
  });

  it('só fala em conexão quando o pedido não chegou', () => {
    expect(mensagemDaFalha({ code: 'ERR_NETWORK' }, 'A edição')).toContain('Confira a conexão');
  });
});
