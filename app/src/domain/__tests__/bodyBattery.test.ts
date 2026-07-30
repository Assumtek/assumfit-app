import { calcBodyBattery, morningLevel, recoveryEfficiency } from '../bodyBattery';
import type { SleepNight } from '../types';

const noite = (score: number): SleepNight => ({
  date: '2026-07-29',
  score,
  totalMin: 420,
  deepContinuity: 80,
  phases: { rem: 90, deep: 80, light: 250, awake: 20 },
  segments: [{ phase: 'deep', minutes: 80 }],
  spo2Night: [],
});

/** `h` horas depois da meia-noite, em epoch. */
const as = (h: number) => new Date('2026-07-29T00:00:00').getTime() + h * 3600_000;

describe('morningLevel', () => {
  it('acorda mais cheio depois de noite melhor', () => {
    expect(morningLevel(noite(90))).toBeGreaterThan(morningLevel(noite(50)));
  });

  it('nunca acorda em zero — ninguém acorda sem reserva nenhuma', () => {
    expect(morningLevel(noite(0))).toBe(25);
  });

  it('noite perfeita chega a 100', () => {
    expect(morningLevel(noite(100))).toBe(100);
  });
});

describe('calcBodyBattery', () => {
  it('não inventa curva sem noite medida', () => {
    expect(calcBodyBattery(null, [{ at: as(8), value: 40 }])).toBeNull();
  });

  it('sem amostra de estresse fica no nível de quem acabou de acordar', () => {
    const b = calcBodyBattery(noite(80), [])!;
    expect(b.current).toBe(b.morning);
    expect(b.used).toBe(0);
    expect(b.curve).toHaveLength(0);
  });

  it('descarrega ao longo de um dia estressante, e o gasto soma positivo', () => {
    const amostras = Array.from({ length: 10 }, (_, i) => ({ at: as(8 + i), value: 85 }));
    const b = calcBodyBattery(noite(90), amostras)!;
    expect(b.current).toBeLessThan(b.morning);
    expect(b.used).toBeGreaterThan(0);
    expect(b.used).toBe(b.morning - b.current);
  });

  it('carrega em repouso prolongado', () => {
    const amostras = Array.from({ length: 5 }, (_, i) => ({ at: as(1 + i), value: 15 }));
    const b = calcBodyBattery(noite(40), amostras)!;
    expect(b.current).toBeGreaterThan(b.morning);
  });

  /*
   O caso que a assimetria existe para produzir: a mesma quantidade de tempo em
   tensão custa mais do que o repouso equivalente devolve. Simétrico, a curva
   ficaria plana e a métrica não diria nada.
  */
  it('gasta mais rápido do que recupera', () => {
    const tenso = calcBodyBattery(noite(60), [
      { at: as(8), value: 90 },
      { at: as(10), value: 90 },
    ])!;
    const calmo = calcBodyBattery(noite(60), [
      { at: as(8), value: 10 },
      { at: as(10), value: 10 },
    ])!;
    const gasto = tenso.morning - tenso.current;
    const ganho = calmo.current - calmo.morning;
    expect(gasto).toBeGreaterThan(ganho);
  });

  it('não passa de 100 nem cai abaixo de zero', () => {
    const cheio = calcBodyBattery(
      noite(100),
      Array.from({ length: 20 }, (_, i) => ({ at: as(i), value: 5 })),
    )!;
    const vazio = calcBodyBattery(
      noite(0),
      Array.from({ length: 20 }, (_, i) => ({ at: as(i), value: 100 })),
    )!;
    expect(cheio.current).toBeLessThanOrEqual(100);
    expect(vazio.current).toBeGreaterThanOrEqual(0);
  });

  /*
   Pulso descalço ou aparelho carregando produz buraco de horas na série. Sem
   teto, a última taxa conhecida seria aplicada ao buraco inteiro e inventaria
   gasto que ninguém observou.
  */
  it('não extrapola buraco longo na medição', () => {
    const comBuraco = calcBodyBattery(noite(80), [
      { at: as(8), value: 90 },
      { at: as(20), value: 90 },
    ])!;
    const dozeHorasDeGasto = 12 * 60 * 0.28;
    expect(comBuraco.morning - comBuraco.current).toBeLessThan(dozeHorasDeGasto);
  });

  it('não reporta ganho sem saber o nível de véspera', () => {
    expect(calcBodyBattery(noite(80), [])!.gain).toBeNull();
    expect(calcBodyBattery(noite(80), [], 30)!.gain).toBe(morningLevel(noite(80)) - 30);
  });

  it('dia só de calma recarrega sem inventar gasto', () => {
    const b = calcBodyBattery(noite(30), [
      { at: as(8), value: 10 },
      { at: as(12), value: 10 },
    ])!;
    expect(b.current).toBeGreaterThan(b.morning);
    expect(b.used).toBe(0);
    expect(b.recharged).toBeGreaterThan(0);
  });

  it('cair e recuperar no mesmo dia É gasto — não some no saldo', () => {
    // Manhã tensa (85) drena; tarde calma (10) devolve. O saldo fecha perto do
    // teto, mas o dia GASTOU — era o caso que travava o número em zero.
    const b = calcBodyBattery(noite(70), [
      { at: as(8), value: 85 },
      { at: as(10), value: 85 },
      { at: as(12), value: 10 },
      { at: as(16), value: 10 },
    ])!;
    expect(b.used).toBeGreaterThan(0);
    expect(b.recharged).toBeGreaterThan(0);
  });
});

describe('recoveryEfficiency', () => {
  it('não avalia sem o nível de véspera', () => {
    expect(recoveryEfficiency(80, null)).toBeNull();
  });

  /*
   O mesmo ganho vale mais para quem chegou mais cansado — é por isso que a
   métrica é razão, e não diferença.
  */
  it('premia quem fechou mais da lacuna, não quem ganhou mais pontos', () => {
    const cansado = recoveryEfficiency(80, 20)!; // ganhou 60 de 80 possíveis
    const descansado = recoveryEfficiency(90, 70)!; // ganhou 20 de 30 possíveis
    expect(cansado).toBe(75);
    expect(descansado).toBe(67);
  });

  it('quem foi dormir cheio não é punido por não ter o que recuperar', () => {
    expect(recoveryEfficiency(100, 100)).toBe(100);
  });
});
