import {
  aneisDoCalendario,
  caloriasAtivas,
  detalheDoDia,
  diasFechados,
  fitaDaSemana,
  metaEfetiva,
  repousoAteAgora,
} from '../dailyGoals';

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

describe('fitaDaSemana', () => {
  const meta = 400;
  // 26/08/2026 é uma quarta-feira.
  const quarta = new Date(2026, 7, 26, 15, 0, 0);

  it('devolve domingo a sábado, com as letras na ordem', () => {
    const fita = fitaDaSemana([], [], meta, quarta);
    expect(fita).toHaveLength(7);
    expect(fita.map((d) => d.letra)).toEqual(['D', 'S', 'T', 'Q', 'Q', 'S', 'S']);
    expect(fita[0].day).toBe('2026-08-23');
    expect(fita[6].day).toBe('2026-08-29');
  });

  it('marca o dia de hoje e trata o resto da semana como futuro', () => {
    const fita = fitaDaSemana([], [], meta, quarta);
    expect(fita.filter((d) => d.hoje).map((d) => d.day)).toEqual(['2026-08-26']);
    expect(fita.map((d) => d.futuro)).toEqual([false, false, false, false, true, true, true]);
  });

  it('usa a mesma conta do calendário para o quanto se moveu', () => {
    const dias = [{ day: '2026-08-24', steps: 12000 }];
    const fita = fitaDaSemana(dias, [], meta, quarta);
    const calendario = aneisDoCalendario(dias, [], meta, quarta, 28);
    const segunda = fita.find((d) => d.day === '2026-08-24');
    expect(segunda?.ativas).toBe(calendario.find((d) => d.day === '2026-08-24')?.ativas);
    expect(segunda?.fraction).toBeGreaterThan(0);
  });

  it('no domingo, a semana inteira ainda está por vir', () => {
    const domingo = new Date(2026, 7, 23, 9, 0, 0);
    const fita = fitaDaSemana([], [], meta, domingo);
    expect(fita[0].hoje).toBe(true);
    expect(fita.slice(1).every((d) => d.futuro)).toBe(true);
  });
});

describe('detalheDoDia', () => {
  const HOJE = '2026-08-23';
  const anel = (day: string, ativas: number, fraction: number, futuro = false) => ({
    day, ativas, fraction, futuro,
  });

  it('nomeia o dia por extenso, e hoje é "hoje"', () => {
    expect(detalheDoDia(anel(HOJE, 420, 1.05), 9800, 400, HOJE).titulo).toBe('hoje');
    // 21/08/2026 é uma sexta-feira.
    expect(detalheDoDia(anel('2026-08-21', 300, 0.75), 7000, 400, HOJE).titulo).toBe(
      'sexta-feira, 21 de agosto',
    );
  });

  it('dia sem leitura não vira zero, que seria uma afirmação sobre o corpo', () => {
    const d = detalheDoDia(anel('2026-08-19', 0, 0), null, 400, HOJE);
    expect(d.vazio).toBe(true);
    expect(d.kcal).toBe('–');
    expect(d.situacao).toBe('Sem leitura da pulseira neste dia.');
  });

  it('dia futuro diz que ainda não chegou', () => {
    const d = detalheDoDia(anel('2026-08-29', 0, 0, true), null, 400, HOJE);
    expect(d.situacao).toBe('Dia que ainda não chegou.');
  });

  it('meta fechada e meta perdida têm frases diferentes, e hoje ainda dá tempo', () => {
    expect(detalheDoDia(anel('2026-08-22', 500, 1.25), 12000, 400, HOJE).situacao).toBe('Meta fechada.');
    expect(detalheDoDia(anel('2026-08-22', 300, 0.75), 7000, 400, HOJE).situacao).toBe(
      'Ficou a 100 kcal da meta.',
    );
    expect(detalheDoDia(anel(HOJE, 300, 0.75), 7000, 400, HOJE).situacao).toBe(
      'Faltam 100 kcal para fechar.',
    );
  });

  it('formata passos com separador de milhar', () => {
    expect(detalheDoDia(anel(HOJE, 420, 1.05), 9837, 400, HOJE).passos).toBe('9.837 passos');
  });
});

describe('aneisDoCalendario com o valor de hoje medido no aparelho', () => {
  const hoje = new Date(2026, 7, 23, 15, 0, 0);
  const chaveHoje = '2026-08-23';

  it('hoje usa o número do aparelho, não o parcial do servidor', () => {
    const aneis = aneisDoCalendario([{ day: chaveHoje, steps: 37841 }], [], 400, hoje, 28, 774);
    expect(aneis.find((a) => a.day === chaveHoje)?.ativas).toBe(774);
  });

  it('os dias anteriores continuam vindo do servidor', () => {
    const aneis = aneisDoCalendario([{ day: '2026-08-22', steps: 10000 }], [], 400, hoje, 28, 774);
    const ontem = aneis.find((a) => a.day === '2026-08-22');
    expect(ontem?.ativas).toBeGreaterThan(0);
    expect(ontem?.ativas).not.toBe(774);
  });

  it('sem o valor do aparelho, hoje volta a ser o do servidor', () => {
    const aneis = aneisDoCalendario([{ day: chaveHoje, steps: 10000 }], [], 400, hoje, 28, null);
    expect(aneis.find((a) => a.day === chaveHoje)?.ativas).toBeGreaterThan(0);
  });
});
