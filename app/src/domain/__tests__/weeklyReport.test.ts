import { resumoDaSemana } from '../weeklyReport';

const dia = (h: number) => new Date(2026, 7, 17 + h, 18).toISOString();

describe('resumoDaSemana', () => {
  it('consolida treino, esporte, notas, sono, passos e água', () => {
    const r = resumoDaSemana(
      [
        { id: 'a', status: 'FINISHED', startedAt: dia(0), durationSec: 2400, rating: 4 },
        { id: 'b', status: 'IN_PROGRESS', startedAt: dia(2), durationSec: 1800, completionPct: 50, rating: null },
        { id: 'c', status: 'CANCELLED', startedAt: dia(3), durationSec: 100, rating: 1 },
      ],
      [{ startedAt: dia(4), durationS: 1800, kcal: 300, rating: 5 }],
      [{ sleep_score: 80, sleep_minutes: 420, steps: 8000 }, { sleep_score: 60, sleep_minutes: 360, steps: 4000 }, { sleep_score: null, sleep_minutes: null, steps: null }],
      [2000, 0, 1500],
    );
    expect(r.atividades).toBe(3);
    expect(r.minutos).toBe(40 + 30 + 30);
    expect(r.esportes).toBe(1);
    expect(r.kcal).toBe(300);
    // Cancelado não conta nem para a nota.
    expect(r.notaMedia).toBe(5);
    expect(r.sonoMedio).toBe(70);
    expect(r.sonoMinutosMedio).toBe(390);
    expect(r.passosMedio).toBe(6000);
    expect(r.aguaMediaMl).toBe(1750);
    expect(r.diasComAgua).toBe(2);
  });
  it('semana vazia não inventa número', () => {
    const r = resumoDaSemana([], [], [], []);
    expect(r).toMatchObject({ atividades: 0, minutos: 0, notaMedia: null, sonoMedio: null, passosMedio: null, aguaMediaMl: null });
  });
});
