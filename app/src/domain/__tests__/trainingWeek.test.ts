import {
  treinoPendente, diaCorrente, montarSemanaDeTreino } from '../trainingWeek';
import type { DiaDoPlano } from '../trainingWeek';

// Quarta-feira, 12 de agosto de 2026, meio-dia local. A semana desta data vai
// de segunda 10/08 a domingo 16/08.
const QUARTA = new Date(2026, 7, 12, 12, 0, 0);

const treino = (dia: string, nome: string, min: number | null = 50): DiaDoPlano => ({
  id: `pd-${dia}`,
  dayOfWeek: dia,
  dayType: 'WORKOUT',
  workout: {
    id: `w-${dia}`,
    name: nome,
    modality: 'musculacao',
    muscleGroups: ['PEITO'],
    estimatedDuration: min,
    exerciseCount: 6,
  },
});

const descanso = (dia: string): DiaDoPlano => ({
  dayOfWeek: dia,
  dayType: 'OFF',
  workout: null,
});

const plano = (days: DiaDoPlano[], today = 'WEDNESDAY') => ({ days, today });

const mapa = (...pares: [string, number][]) => new Map(pares);

describe('montarSemanaDeTreino', () => {
  it('cruza o PREVISTO do plano com o CUMPRIDO medido, nas sete posições', () => {
    const semana = montarSemanaDeTreino(
      plano([treino('MONDAY', 'Peito e tríceps', 50), treino('WEDNESDAY', 'Costas', 45)]),
      mapa(['2026-08-10', 52]),
      QUARTA);

    expect(semana.dias).toHaveLength(7);

    const segunda = semana.dias[0];
    expect(segunda.previsto).toBe(50);
    expect(segunda.cumprido).toBe(52);
    expect(segunda.planejado?.name).toBe('Peito e tríceps');

    // Quarta é hoje: previsto sem cumprido ainda — e isso não é falta.
    const quarta = semana.dias[2];
    expect(quarta.previsto).toBe(45);
    expect(quarta.cumprido).toBe(0);
    expect(quarta.ehHoje).toBe(true);
    expect(quarta.futuro).toBe(false);
  });

  it('dia de descanso não tem previsto, e o descanso é declarado', () => {
    const semana = montarSemanaDeTreino(
      plano([treino('MONDAY', 'Pernas'), descanso('TUESDAY')]),
      mapa(),
      QUARTA);

    const terca = semana.dias[1];
    expect(terca.descanso).toBe(true);
    expect(terca.planejado).toBeNull();
    expect(terca.previsto).toBeNull();
  });

  it('movimento em dia de descanso CONTA, a régua mede o que houve, não o que foi combinado', () => {
    const semana = montarSemanaDeTreino(
      plano([descanso('TUESDAY')]),
      mapa(['2026-08-11', 30]),
      QUARTA);

    expect(semana.dias[1].descanso).toBe(true);
    expect(semana.dias[1].cumprido).toBe(30);
  });

  it('sem plano nenhum, a semana ainda mede: nada é descanso e nada é previsto', () => {
    const semana = montarSemanaDeTreino(null, mapa(['2026-08-10', 40]), QUARTA);

    expect(semana.previstos).toBe(0);
    expect(semana.dias.every((d) => !d.descanso)).toBe(true);
    expect(semana.dias.every((d) => d.previsto === null)).toBe(true);
    expect(semana.dias[0].cumprido).toBe(40);
    // Sem plano, o "hoje" é o do aparelho.
    expect(semana.dias[2].ehHoje).toBe(true);
  });

  it('o HOJE vem do plano, não do aparelho, perto da meia-noite os dois discordam', () => {
    /*
     O servidor resolve o dia no fuso da pessoa; o aparelho resolve no dele. Uma
     tela com dois "hoje" diferentes é pior que uma tela com o "hoje" do
     servidor, e é ele que decide qual treino a pessoa vai fazer.
    */
    const semana = montarSemanaDeTreino(
      plano([treino('THURSDAY', 'Ombros')], 'THURSDAY'),
      mapa(),
      QUARTA);

    expect(semana.dias[2].ehHoje).toBe(false);
    expect(semana.dias[3].ehHoje).toBe(true);
  });

  it('futuro é marcado pela DATA, e não conta como falta', () => {
    const semana = montarSemanaDeTreino(plano([]), mapa(), QUARTA);

    expect(semana.dias.slice(0, 3).every((d) => !d.futuro)).toBe(true);
    expect(semana.dias.slice(3).every((d) => d.futuro)).toBe(true);
  });

  it('conta previstos, cumpridos e minutos da semana', () => {
    const semana = montarSemanaDeTreino(
      plano([
        treino('MONDAY', 'A', 50),
        treino('TUESDAY', 'B', 50),
        treino('WEDNESDAY', 'C', 50),
      ]),
      mapa(['2026-08-10', 52], ['2026-08-11', 18]),
      QUARTA);

    expect(semana.previstos).toBe(3);
    expect(semana.cumpridos).toBe(2);
    expect(semana.minutos).toBe(70);
  });

  it('cumprido só conta contra dia PREVISTO, treino avulso não infla o placar', () => {
    // Domingo não tinha nada marcado: os 60 minutos entram nos minutos da
    // semana, mas dizer "1 de 1 cumprido" seria inventar um combinado.
    const semana = montarSemanaDeTreino(
      plano([treino('MONDAY', 'A')]),
      mapa(['2026-08-16', 60]),
      QUARTA);

    expect(semana.previstos).toBe(1);
    expect(semana.cumpridos).toBe(0);
    expect(semana.minutos).toBe(60);
  });
});

describe('diaCorrente', () => {
  it('devolve o dia de hoje', () => {
    const semana = montarSemanaDeTreino(plano([treino('WEDNESDAY', 'Costas')]), mapa(), QUARTA);
    expect(diaCorrente(semana).weekday).toBe('WEDNESDAY');
  });
});


/**
 * O id do dia do plano precisa chegar à tela.
 *
 * É ele que a sessão de esporte cita ao cumprir o dia — sem ele, a corrida
 * registrada no cronômetro não se liga ao treino previsto, e o mesmo ato conta
 * duas vezes na agenda de movimento.
 */
describe('planDayId', () => {
  it('viaja do plano para o dia da régua', () => {
    const semana = montarSemanaDeTreino(plano([treino('MONDAY', 'Pernas')]), mapa(), QUARTA);
    expect(semana.dias[0].planDayId).toBe('pd-MONDAY');
  });

  it('dia que o plano não cobre não inventa id', () => {
    const semana = montarSemanaDeTreino(plano([treino('MONDAY', 'Pernas')]), mapa(), QUARTA);
    expect(semana.dias[1].planDayId).toBeNull();
    expect(montarSemanaDeTreino(null, mapa(), QUARTA).dias[0].planDayId).toBeNull();
  });
});

describe('treinoPendente', () => {
  // Quarta-feira 2026-08-19 como hoje; plano treina seg/qua/sex.
  const plano = {
    today: 'WEDNESDAY',
    days: [treino('MONDAY', 'Peito'), treino('WEDNESDAY', 'Costas'), treino('FRIDAY', 'Pernas')],
  };
  const hoje = new Date(2026, 7, 19, 10);

  it('o treino de um dia passado sem registro é pendente; hoje e futuro não', () => {
    const semana = montarSemanaDeTreino(plano, new Map(), hoje);
    const porDia = Object.fromEntries(semana.dias.map((d) => [d.weekday, d.pendente]));
    expect(porDia.MONDAY).toBe(true);
    expect(porDia.WEDNESDAY).toBe(false);
    expect(porDia.FRIDAY).toBe(false);
    expect(treinoPendente(semana)?.weekday).toBe('MONDAY');
  });

  it('registro no dia tira a pendência', () => {
    const semana = montarSemanaDeTreino(plano, new Map([['2026-08-17', 40]]), hoje);
    expect(treinoPendente(semana)).toBeNull();
  });

  it('com dois pendentes, devolve o mais recente', () => {
    const doisDias = { ...plano, today: 'FRIDAY', days: [...plano.days] };
    const semana = montarSemanaDeTreino(doisDias, new Map(), new Date(2026, 7, 21, 10));
    expect(treinoPendente(semana)?.weekday).toBe('WEDNESDAY');
  });

  it('dia de descanso passado nunca é pendente', () => {
    const semana = montarSemanaDeTreino(plano, new Map(), hoje);
    expect(semana.dias.find((d) => d.weekday === 'TUESDAY')?.pendente).toBe(false);
  });
});
