import { elapsedSeconds } from '../workout.store';

/**
 * O cronômetro da sessão.
 *
 * A conta é derivada de instantes, não incrementada por tique. É isso que faz
 * o tempo sobreviver ao app em segundo plano — e é isso que precisa continuar
 * verdadeiro quando alguém "otimizar" a store.
 */
describe('tempo decorrido', () => {
  const T0 = 1_700_000_000_000;

  it('rodando, conta desde o início do trecho', () => {
    expect(elapsedSeconds(0, T0, T0 + 95_000)).toBe(95);
  });

  it('pausado, devolve só o acumulado, não anda', () => {
    expect(elapsedSeconds(140, null, T0)).toBe(140);
    expect(elapsedSeconds(140, null, T0 + 600_000)).toBe(140);
  });

  it('retomado, soma o acumulado ao trecho novo', () => {
    // 140s antes da pausa + 20s depois de retomar.
    expect(elapsedSeconds(140, T0, T0 + 20_000)).toBe(160);
  });

  it('sobrevive ao app em segundo plano', () => {
    // Dez minutos sem nenhum tique: um contador teria perdido tudo; a conta
    // derivada de instante não perde nada.
    expect(elapsedSeconds(0, T0, T0 + 600_000)).toBe(600);
  });

  it('relógio para trás não produz tempo negativo', () => {
    // Ajuste de fuso ou de NTP pode recuar o relógio no meio da sessão.
    expect(elapsedSeconds(30, T0, T0 - 5_000)).toBe(30);
  });

  it('arredonda para o segundo mais próximo', () => {
    expect(elapsedSeconds(0, T0, T0 + 1_400)).toBe(1);
    expect(elapsedSeconds(0, T0, T0 + 1_600)).toBe(2);
  });
});
