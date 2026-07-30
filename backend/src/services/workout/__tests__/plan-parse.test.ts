import { parsePlan } from '../plan-persistence';

/*
 Rodada de testes 1, jul/2026: o modelo emitiu um set `{"repetitions": null}`
 num exercício de aquecimento por tempo, o avaliador aprovou o plano (7.58) e o
 Zod daqui derrubou tudo com FAILED "qualidade". O parse precisa tolerar a forma
 que o modelo plausivelmente emite — o MUVX aceita reps nula pelo mesmo motivo.
*/

const plano = (sets: unknown) =>
  JSON.stringify({
    status: 'GENERATED',
    days: [
      {
        dayOfWeek: 'MONDAY',
        dayType: 'WORKOUT',
        workout: {
          name: 'Treino A',
          phases: [
            {
              type: 'TREINO',
              exercises: [
                {
                  exerciseId: '7d8e4a52-0000-4000-8000-000000000001',
                  subtype: 'MOBILITY',
                  sets,
                },
              ],
            },
          ],
        },
      },
    ],
  });

describe('parse do plano vindo do modelo', () => {
  it('set com repetição nula não derruba o plano', () => {
    const parsed = parsePlan(plano([{ repetitions: null, restTime: null, load: null }]));
    expect(parsed.status).toBe('GENERATED');
    expect(parsed.days[0].workout?.phases[0].exercises[0].sets?.[0].repetitions).toBeNull();
  });

  it('exercício por tempo com "sets": null não derruba o plano', () => {
    const parsed = parsePlan(plano(null));
    expect(parsed.status).toBe('GENERATED');
    expect(parsed.days[0].workout?.phases[0].exercises[0].sets ?? []).toEqual([]);
  });

  it('repetições numéricas e em faixa continuam virando texto', () => {
    const parsed = parsePlan(plano([{ repetitions: 12 }, { repetitions: '8-12' }]));
    const sets = parsed.days[0].workout?.phases[0].exercises[0].sets ?? [];
    expect(sets.map((s) => s.repetitions)).toEqual(['12', '8-12']);
  });
});
