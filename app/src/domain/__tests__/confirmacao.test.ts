import { ehConfirmacao } from '../confirmacao';

describe('confirmar a proposta por texto', () => {
  it('aceita as formas curtas de dizer sim', () => {
    for (const t of ['sim', 'Sim!', 'ok', 'isso', 'claro', 'beleza', 'certo', 'perfeito']) {
      expect(ehConfirmacao(t)).toBe(true);
    }
  });

  it('aceita o jeito como as pessoas confirmam de verdade', () => {
    // As frases do relato: ele respondeu à pergunta do agente e nada acontecia.
    for (const t of ['quero fazer esse treino hoje', 'pode trocar', 'confirmo', 'pode aplicar', 'manda ver']) {
      expect(ehConfirmacao(t)).toBe(true);
    }
  });

  it('NUNCA confunde negativa com confirmação', () => {
    // Falso positivo aqui aplica no plano da pessoa algo que ela recusou.
    for (const t of ['não', 'nao', 'não quero', 'nao pode', 'melhor não', 'cancela', 'deixa pra lá', 'não confirmo']) {
      expect(ehConfirmacao(t)).toBe(false);
    }
  });

  it('pergunta não é confirmação', () => {
    expect(ehConfirmacao('posso trocar o agachamento?')).toBe(false);
    expect(ehConfirmacao('e se eu quiser treinar amanhã?')).toBe(false);
  });

  it('texto longo vai para o agente, não vira confirmação', () => {
    const longo = 'sim, mas antes eu queria entender melhor por que você sugeriu mover o treino de quinta para terça e o que isso muda no resto da semana';
    expect(ehConfirmacao(longo)).toBe(false);
  });

  it('vazio não confirma nada', () => {
    expect(ehConfirmacao('')).toBe(false);
    expect(ehConfirmacao('   ')).toBe(false);
  });
});
