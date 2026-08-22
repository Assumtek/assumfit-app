/**
 * O widget de água precisa refletir a META e o DIA, não só os goles.
 * (Leonardo, 22/08: "widget mostrando o L total errado".)
 */
const mockPublicar = jest.fn();
jest.mock('../../../modules/widgetbridge', () => ({
  publicarAguaDeHoje: (...args: unknown[]) => mockPublicar(...args),
  consumirGolesDoWidget: () => [],
}));
jest.mock('../../services/api.service', () => ({ api: { get: jest.fn(), put: jest.fn(), post: jest.fn() } }));

import { useHabitsStore } from '../habits.store';

describe('widget de água', () => {
  beforeEach(() => mockPublicar.mockClear());

  it('meta nova é publicada na hora, com o total e a data de hoje', () => {
    const antes = useHabitsStore.getState().goalMl;
    useHabitsStore.getState().refreshGoal({ weightKg: 90, sex: 'm', activeMinToday: 60 });
    const depois = useHabitsStore.getState().goalMl;
    expect(depois).not.toBe(antes);
    expect(mockPublicar).toHaveBeenCalledTimes(1);
    expect(mockPublicar.mock.calls[0][0]).toMatchObject({ metaMl: depois, data: useHabitsStore.getState().today.date });
  });

  it('meta igual não republica — o widget não precisa acordar à toa', () => {
    useHabitsStore.getState().refreshGoal({ weightKg: 90, sex: 'm', activeMinToday: 60 });
    mockPublicar.mockClear();
    useHabitsStore.getState().refreshGoal({ weightKg: 90, sex: 'm', activeMinToday: 60 });
    expect(mockPublicar).not.toHaveBeenCalled();
  });
});
