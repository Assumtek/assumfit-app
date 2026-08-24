import { atencaoSustentada, CRITERIOS } from '../alertaSustentado';

const AGORA = Date.parse('2026-08-24T13:00:00-03:00');
const min = (n: number) => n * 60_000;

describe('atencaoSustentada', () => {
  it('uma medição fora da faixa não avisa', () => {
    const medicoes = [{ at: AGORA, alerta: true }];
    expect(atencaoSustentada(medicoes, CRITERIOS.pressao, AGORA)).toBe(false);
  });

  it('três seguidas na janela avisam', () => {
    const medicoes = [
      { at: AGORA, alerta: true },
      { at: AGORA - min(30), alerta: true },
      { at: AGORA - min(60), alerta: true },
    ];
    expect(atencaoSustentada(medicoes, CRITERIOS.pressao, AGORA)).toBe(true);
  });

  it('uma medição normal no meio quebra a sequência', () => {
    // É justamente ela que diz que o sinal não se manteve.
    const medicoes = [
      { at: AGORA, alerta: true },
      { at: AGORA - min(30), alerta: false },
      { at: AGORA - min(60), alerta: true },
    ];
    expect(atencaoSustentada(medicoes, CRITERIOS.pressao, AGORA)).toBe(false);
  });

  it('medições antigas não sustentam aviso de agora', () => {
    const medicoes = [
      { at: AGORA, alerta: true },
      { at: AGORA - min(180), alerta: true },
      { at: AGORA - min(240), alerta: true },
    ];
    expect(atencaoSustentada(medicoes, CRITERIOS.pressao, AGORA)).toBe(false);
  });

  it('o oxigênio tem régua própria: duas em vinte minutos', () => {
    const duas = [
      { at: AGORA, alerta: true },
      { at: AGORA - min(10), alerta: true },
    ];
    expect(atencaoSustentada(duas, CRITERIOS.spo2, AGORA)).toBe(true);
    const espacadas = [
      { at: AGORA, alerta: true },
      { at: AGORA - min(40), alerta: true },
    ];
    expect(atencaoSustentada(espacadas, CRITERIOS.spo2, AGORA)).toBe(false);
  });

  it('sem medição nenhuma, não avisa', () => {
    expect(atencaoSustentada([], CRITERIOS.pressao, AGORA)).toBe(false);
  });

  it('carimbo inválido é descartado em vez de contar', () => {
    const medicoes = [
      { at: AGORA, alerta: true },
      { at: Number.NaN, alerta: true },
      { at: AGORA - min(20), alerta: true },
    ];
    expect(atencaoSustentada(medicoes, CRITERIOS.pressao, AGORA)).toBe(false);
  });
});
