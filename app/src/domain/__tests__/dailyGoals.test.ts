import { aneisDoCalendario, caloriasAtivas, diasFechados, metaEfetiva, repousoAteAgora } from '../dailyGoals';

describe('metaEfetiva', () => {
  it('só para hoje vale hoje; amanhã volta ao padrão', () => {
    expect(metaEfetiva(400, { date: '2026-08-23', kcal: 250 }, '2026-08-23')).toBe(250);
    expect(metaEfetiva(400, { date: '2026-08-23', kcal: 250 }, '2026-08-24')).toBe(400);
    expect(metaEfetiva(400, null, '2026-08-23')).toBe(400);
  });
});

describe('caloriasAtivas e repouso', () => {
  it('passos e sessões somam; sem passos só a sessão', () => {
    expect(caloriasAtivas(8000, null, 300)).toBeGreaterThan(300);
    expect(caloriasAtivas(null, null, 300)).toBe(300);
    expect(caloriasAtivas(0, null, 0)).toBe(0);
  });
  it('repouso prorrateado pela hora; sem BMR, null', () => {
    expect(repousoAteAgora(1800, 12)).toBe(900);
    expect(repousoAteAgora(null, 12)).toBeNull();
  });
});

describe('aneisDoCalendario', () => {
  it('28 dias do mais antigo para hoje, com fração pela meta e futuro marcado', () => {
    const hoje = new Date(2026, 7, 23, 15);
    const aneis = aneisDoCalendario(
      [{ day: '2026-08-23', steps: 10000 }, { day: '2026-08-22', steps: 0 }],
      [{ startedAt: new Date(2026, 7, 22, 18).toISOString(), kcal: 500 }],
      400,
      hoje,
    );
    expect(aneis).toHaveLength(28);
    expect(aneis[27].day).toBe('2026-08-23');
    expect(aneis[26]).toMatchObject({ day: '2026-08-22', ativas: 500, fraction: 1 });
    expect(aneis[0].fraction).toBe(0);
    expect(aneis.every((a) => !a.futuro)).toBe(true);
    expect(diasFechados(aneis)).toBeGreaterThanOrEqual(1);
  });
});
