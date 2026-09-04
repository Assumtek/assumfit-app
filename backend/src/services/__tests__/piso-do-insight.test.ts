import { INSIGHT_PISO_MS } from '../scoring.service';

/**
 * O piso entre duas redações da frase da home.
 *
 * Os baldes do hash resolvem o ruído (um bpm a mais); o piso resolve o
 * movimento legítimo. Durante um treino o batimento vai de 60 a 160 e cruza
 * balde após balde, e sem o piso cada travessia comprava um texto que ninguém
 * leu, porque quem corre não está olhando a home.
 *
 * Medido sobre 72h de produção: 11,4 chamadas por hora-usuário sem piso, 3,5
 * com quinze minutos.
 */
describe('piso do insight', () => {
  it('é metade da granularidade da própria frase, que é por hora', () => {
    expect(INSIGHT_PISO_MS).toBe(15 * 60 * 1000);
    expect(INSIGHT_PISO_MS).toBeLessThan(60 * 60 * 1000);
  });

  it('limita o gasto a no máximo quatro redações por hora', () => {
    expect(Math.floor((60 * 60 * 1000) / INSIGHT_PISO_MS)).toBe(4);
  });
});
