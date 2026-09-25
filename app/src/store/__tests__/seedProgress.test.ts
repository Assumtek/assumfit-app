/**
 * O pré-preenchido dita QUANTAS séries existem; o que foi feito dita o
 * conteúdo de cada uma.
 *
 * O caso que trouxe isto: a correção de 21/09 passou a trazer as séries do
 * servidor de volta, e `existing[id] ?? initialSets(exercise)` escolhia um dos
 * dois. Com uma série feita, o exercício voltava com UMA série e as outras
 * prescritas sumiam: "esperava que ele salvasse a série que eu fiz mas ficasse
 * disponível para salvar as demais" (Bruno, 23/09/2026), com a tela mostrando
 * "Séries (1/1)" num exercício de três.
 */
import { comSeriesDoServidor, seedProgress } from '../workout.store';
import type { WorkoutDetail } from '../../services/api.service';

const treino = (series: number): WorkoutDetail =>
  ({
    id: 'w1',
    phases: [
      {
        type: 'MAIN',
        exercises: [
          {
            id: 'ex-1',
            lastLoad: null,
            sets: Array.from({ length: series }, (_, i) => ({ order: i + 1, load: 50, repetitions: 10 })),
          },
        ],
      },
    ],
  } as unknown as WorkoutDetail);

describe('remontar sem encolher o exercício', () => {
  it('uma série feita não apaga as outras prescritas', () => {
    const doServidor = comSeriesDoServidor({}, [
      { workoutExerciseId: 'ex-1', setOrder: 1, load: 55, repetitions: 12, completed: true },
    ]);
    const r = seedProgress(treino(3), doServidor);
    expect(r['ex-1']).toHaveLength(3);
    expect(r['ex-1'][0]).toEqual({ load: '55', reps: '12', completed: true });
    expect(r['ex-1'][1].completed).toBe(false);
    expect(r['ex-1'][2].completed).toBe(false);
  });

  it('sem nada feito, o exercício vem inteiro e vazio', () => {
    const r = seedProgress(treino(4), {});
    expect(r['ex-1']).toHaveLength(4);
    expect(r['ex-1'].every((s) => !s.completed)).toBe(true);
  });

  it('série feita ALÉM do prescrito não se perde', () => {
    // A pessoa acrescentou uma quarta série num exercício de três.
    const feitas = {
      'ex-1': [
        { load: '50', reps: '10', completed: true },
        { load: '50', reps: '10', completed: true },
        { load: '50', reps: '8', completed: true },
        { load: '45', reps: '8', completed: true },
      ],
    };
    expect(seedProgress(treino(3), feitas)['ex-1']).toHaveLength(4);
  });

  it('posição vazia no meio volta ao pré-preenchido, não some', () => {
    const feitas = {
      'ex-1': [
        { load: '55', reps: '12', completed: true },
        { load: '', reps: '', completed: false },
      ],
    };
    const r = seedProgress(treino(3), feitas);
    expect(r['ex-1']).toHaveLength(3);
    expect(r['ex-1'][0].load).toBe('55');
  });
});
