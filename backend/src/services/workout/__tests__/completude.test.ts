import { completude } from '../execution';

/**
 * Quanto da sessão foi cumprido.
 *
 * A versão anterior devolvia 100 sempre que não havia série prescrita — para
 * evitar uma divisão por zero na tela. Dia de esporte não tem série (é feito de
 * blocos por tempo), então TODA sessão de esporte nascia "100% completa" no
 * instante em que fosse encerrada.
 *
 * Visto em produção (ago/2026): treino de quadra encerrado com 65 segundos e
 * zero séries, gravado como 100%. É pior que perder o treino — treino perdido a
 * pessoa percebe; treino que se dá por feito sozinho ninguém questiona, e entra
 * na constância como se tivesse acontecido.
 */
describe('completude', () => {
  it('com série prescrita, é a fração das séries feitas', () => {
    expect(completude({ prescribed: 20, done: 10, durationSec: 0, estimatedDuration: null })).toBe(50);
    expect(completude({ prescribed: 20, done: 20, durationSec: 0, estimatedDuration: null })).toBe(100);
  });

  it('nunca passa de 100, mesmo com série a mais que o prescrito', () => {
    expect(completude({ prescribed: 10, done: 25, durationSec: 0, estimatedDuration: null })).toBe(100);
  });

  it('O CASO DO RELATO: 65 s de um bloco de 40 min não é 100%', () => {
    const pct = completude({ prescribed: 0, done: 0, durationSec: 65, estimatedDuration: 40 });
    expect(pct).toBeCloseTo(2.7, 1);
    expect(pct).not.toBe(100);
  });

  it('dia de esporte cumprido de verdade chega a 100', () => {
    expect(completude({ prescribed: 0, done: 0, durationSec: 45 * 60, estimatedDuration: 40 })).toBe(100);
  });

  it('sem série E sem duração prevista, não há como medir: null', () => {
    // `null` é como o app já mostra ausência — `rateCompletion` devolve traço.
    // Um número inventado aqui contamina constância, aderência e o contexto que
    // vai para o modelo.
    expect(completude({ prescribed: 0, done: 0, durationSec: 600, estimatedDuration: null })).toBeNull();
    expect(completude({ prescribed: 0, done: 0, durationSec: 600, estimatedDuration: 0 })).toBeNull();
  });
});
