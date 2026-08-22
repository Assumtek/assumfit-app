import { chegaramHoje, entregasDaPulseira, faltamHoje, type SeriesDaPulseira } from '../bandLedger';
import { nightFrom } from '../sleep';

const hoje = new Date(2026, 7, 22, 14, 45).getTime();
const h = (hora: number, min = 0) => new Date(2026, 7, 22, hora, min).getTime();
const ontem = (hora: number) => new Date(2026, 7, 21, hora).getTime();

const vazio: SeriesDaPulseira = {
  hrHistory: [],
  hrvHistory: [],
  stressHistory: [],
  spo2History: [],
  pressureHistory: [],
  stepsToday: 0,
  sleep: null,
  syncedAt: null,
};

describe('entregasDaPulseira', () => {
  it('sem nada, sete linhas com traço, medido ou traço, nunca inventado', () => {
    const e = entregasDaPulseira(vazio, hoje);
    expect(e).toHaveLength(7);
    expect(e.every((x) => x.lastAt === null && x.resumo === null)).toBe(true);
    expect(chegaramHoje(e)).toBe(0);
  });

  it('a hora é a da ÚLTIMA amostra de hoje; ontem não conta', () => {
    const e = entregasDaPulseira(
      { ...vazio, hrHistory: [{ at: ontem(23), value: 60 }, { at: h(9), value: 62 }, { at: h(14, 30), value: 70 }] },
      hoje);
    const bat = e.find((x) => x.step === 'heartRate')!;
    expect(bat.lastAt).toBe(h(14, 30));
    expect(bat.resumo).toBe('2 amostras');
  });

  it('pressão usa o carimbo ISO da aferição', () => {
    const e = entregasDaPulseira(
      { ...vazio, pressureHistory: [{ systolic: 120, diastolic: 80, at: new Date(h(8)).toISOString() }] },
      hoje);
    expect(e.find((x) => x.step === 'pressure')!.lastAt).toBe(h(8));
  });

  it('passos resumem o total e datam pela última leitura ao vivo', () => {
    const e = entregasDaPulseira({ ...vazio, stepsToday: 1700, syncedAt: h(14, 40) }, hoje);
    const p = e.find((x) => x.step === 'steps')!;
    expect(p.lastAt).toBe(h(14, 40));
    // Sem sincronização ainda: total sim, hora não — e conta como chegado.
    const semHora = entregasDaPulseira({ ...vazio, stepsToday: 1700 }, hoje).find((x) => x.step === 'steps')!;
    expect(semHora.lastAt).toBeNull();
    expect(semHora.resumo).toBe('1.700 até agora');
    expect(chegaramHoje([semHora])).toBe(1);
    expect(p.resumo).toBe('1.700 até agora');
  });

  it('a noite que sustenta o dia é a de ontem à tarde', () => {
    const noite = nightFrom('2026-08-21', [{ phase: 'deep', minutes: 450 }], [], { startAt: ontem(23), endAt: h(6, 30) });
    const e = entregasDaPulseira({ ...vazio, sleep: noite }, hoje);
    const s = e.find((x) => x.step === 'sleep')!;
    expect(s.lastAt).toBe(h(6, 30));
    expect(s.resumo).toBe('7h 30m');
  });

  it('noite velha não passa por noite de hoje', () => {
    const noite = nightFrom('2026-08-17', [{ phase: 'deep', minutes: 400 }]);
    expect(entregasDaPulseira({ ...vazio, sleep: noite }, hoje).find((x) => x.step === 'sleep')!.lastAt).toBeNull();
  });

  it('chegaramHoje conta só o que tem hora', () => {
    const e = entregasDaPulseira({ ...vazio, hrvHistory: [{ at: h(10), value: 50 }], stressHistory: [{ at: h(11), value: 30 }] }, hoje);
    expect(chegaramHoje(e)).toBe(2);
  });
});

describe('faltamHoje', () => {
  it('nomeia só o que não chegou', () => {
    const e = entregasDaPulseira({ ...vazio, hrHistory: [{ at: h(10), value: 60 }], stepsToday: 300 }, hoje);
    expect(faltamHoje(e)).toEqual(['Variabilidade cardíaca', 'Estresse', 'Oxigenação', 'Pressão', 'Sono da noite']);
  });
});
