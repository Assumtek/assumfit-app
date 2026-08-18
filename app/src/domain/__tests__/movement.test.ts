import {
  buildMovementWeek,
  consolidateMovement,
  dayKey,
  movementMinutes,
  movementSeries,
  movementTotals,
  sportBreakdown,
  weekdayTally,
  weeklySeries,
} from '../movement';

// Quarta-feira, 12 de agosto de 2026, meio-dia local.
const QUARTA = new Date(2026, 7, 12, 12, 0, 0);

const exec = (data: Date, min: number | null, status = 'FINISHED') => ({
  status,
  startedAt: data.toISOString(),
  durationSec: min === null ? null : min * 60,
});

const sessao = (data: Date, min: number) => ({
  startedAt: data.toISOString(),
  durationS: min * 60,
});

const mapa = (...pares: [string, number][]) => new Map(pares);

describe('movementMinutes', () => {
  it('soma treino concluído e sessão de esporte por dia, em minutos', () => {
    const min = movementMinutes(
      [exec(new Date(2026, 7, 10, 8, 0), 40)],
      [sessao(new Date(2026, 7, 10, 19, 0), 25), sessao(new Date(2026, 7, 11, 7, 0), 30)],
    );
    expect(min.get('2026-08-10')).toBe(65);
    expect(min.get('2026-08-11')).toBe(30);
  });

  it('execução não concluída não conta', () => {
    const min = movementMinutes(
      [
        exec(new Date(2026, 7, 10, 8, 0), 40, 'CANCELLED'),
        exec(new Date(2026, 7, 10, 9, 0), 40, 'IN_PROGRESS'),
        exec(new Date(2026, 7, 10, 10, 0), 40, 'AUTO_CLOSED'),
      ],
      [],
    );
    expect(min.size).toBe(0);
  });

  it('treino concluído sem duração ainda acende o dia — o caso da corrida por blocos', () => {
    const min = movementMinutes([exec(new Date(2026, 7, 12, 14, 0), null)], []);
    expect(min.get('2026-08-12')).toBe(1);
  });

  it('converte no fuso local, não em UTC', () => {
    // 23h locais: a oeste de Greenwich o UTC já é o dia seguinte.
    const min = movementMinutes([], [sessao(new Date(2026, 7, 11, 23, 0), 20)]);
    expect(min.get('2026-08-11')).toBe(20);
  });

  it('sessão vinculada à execução é o mesmo ato: conta uma vez, pela sessão', () => {
    const min = movementMinutes(
      [{ ...exec(new Date(2026, 7, 12, 8, 0), 40), id: 'exec-1' }],
      [{ ...sessao(new Date(2026, 7, 12, 8, 5), 42), workoutExecutionId: 'exec-1' }],
    );
    expect(min.get('2026-08-12')).toBe(42);
  });
});

describe('buildMovementWeek', () => {
  it('monta segunda a domingo com minutos, hoje e futuro marcados', () => {
    const semana = buildMovementWeek(mapa(['2026-08-11', 45]), QUARTA);
    expect(semana.dias).toHaveLength(7);
    expect(semana.dias[1].minutos).toBe(45);
    expect(semana.dias[1].feito).toBe(true);
    expect(semana.dias[2].ehHoje).toBe(true);
    expect(semana.dias.map((d) => d.futuro)).toEqual([
      false, false, false, true, true, true, true,
    ]);
  });

  it('conta a sequência terminando hoje', () => {
    const semana = buildMovementWeek(
      mapa(['2026-08-10', 30], ['2026-08-11', 30], ['2026-08-12', 30]),
      QUARTA,
    );
    expect(semana.streak).toBe(3);
    expect(semana.hojeFeito).toBe(true);
  });

  it('hoje em aberto não zera: conta a partir de ontem', () => {
    const semana = buildMovementWeek(mapa(['2026-08-10', 30], ['2026-08-11', 30]), QUARTA);
    expect(semana.streak).toBe(2);
    expect(semana.hojeFeito).toBe(false);
  });

  it('dia pulado quebra a sequência', () => {
    const semana = buildMovementWeek(mapa(['2026-08-10', 30]), QUARTA);
    expect(semana.streak).toBe(0);
  });

  it('sequência atravessa a virada de semana e de mês', () => {
    const semana = buildMovementWeek(
      mapa(['2026-07-30', 30], ['2026-07-31', 30], ['2026-08-01', 30], ['2026-08-02', 30]),
      new Date(2026, 7, 2, 9, 0),
    );
    expect(semana.streak).toBe(4);
  });

  it('sem nenhum dia feito, streak zero e semana toda em branco', () => {
    const semana = buildMovementWeek(mapa(), QUARTA);
    expect(semana.streak).toBe(0);
    expect(semana.dias.every((d) => !d.feito && d.minutos === 0)).toBe(true);
  });
});

describe('dayKey', () => {
  it('zera com dois dígitos', () => {
    expect(dayKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('weeklySeries', () => {
  it('soma por semana, com a semana corrente na última posição', () => {
    const serie = weeklySeries(
      [
        { date: new Date(2026, 7, 3, 8, 0), value: 30 },
        { date: new Date(2026, 7, 9, 20, 0), value: 15 },
        { date: new Date(2026, 7, 10, 7, 0), value: 40 },
      ],
      2,
      QUARTA,
    );
    expect(serie).toEqual([
      { label: '3/8', value: 45 },
      { label: '10/8', value: 40 },
    ]);
  });

  it('ponto fora da janela é descartado', () => {
    const serie = weeklySeries([{ date: new Date(2026, 5, 1), value: 99 }], 3, QUARTA);
    expect(serie.every((s) => s.value === 0)).toBe(true);
    expect(serie).toHaveLength(3);
  });

  it('sem pontos, devolve as semanas zeradas com os rótulos certos', () => {
    const serie = weeklySeries([], 2, QUARTA);
    expect(serie.map((s) => s.label)).toEqual(['3/8', '10/8']);
  });
});

describe('consolidateMovement', () => {
  it('junta as duas fontes numa linha do tempo, do mais recente ao mais antigo', () => {
    const linhas = consolidateMovement(
      [exec(new Date(2026, 7, 10, 8, 0), 40)],
      [sessao(new Date(2026, 7, 11, 19, 0), 25)],
    );
    expect(linhas.map((l) => l.tipo)).toEqual(['esporte', 'treino']);
  });

  it('sessão vinculada substitui a execução: o ato aparece uma vez só', () => {
    const linhas = consolidateMovement(
      [{ ...exec(new Date(2026, 7, 12, 8, 0), 40), id: 'exec-1' }],
      [{ ...sessao(new Date(2026, 7, 12, 8, 5), 42), workoutExecutionId: 'exec-1' }],
    );
    expect(linhas).toHaveLength(1);
    expect(linhas[0].tipo).toBe('esporte');
  });

  it('não filtra por estado — o interrompido continua na lista', () => {
    const linhas = consolidateMovement(
      [exec(new Date(2026, 7, 12, 8, 0), 12, 'CANCELLED')],
      [],
    );
    expect(linhas).toHaveLength(1);
  });
});

describe('movementTotals', () => {
  it('soma minutos e calorias das duas fontes, contando só o que valeu', () => {
    const totais = movementTotals(
      consolidateMovement(
        [
          exec(new Date(2026, 7, 10, 8, 0), 40),
          exec(new Date(2026, 7, 11, 8, 0), 30, 'CANCELLED'),
        ],
        [{ ...sessao(new Date(2026, 7, 11, 19, 0), 25), kcal: 260 }],
      ),
    );
    expect(totais).toEqual({ atividades: 2, minutos: 65, esportes: 1, kcal: 260 });
  });

  it('sem sessão de esporte não há caloria estimada', () => {
    const totais = movementTotals(consolidateMovement([exec(new Date(2026, 7, 10, 8, 0), 50)], []));
    expect(totais.kcal).toBe(0);
    expect(totais.esportes).toBe(0);
  });

  it('o ato vinculado conta uma vez, com os números da sessão', () => {
    const totais = movementTotals(
      consolidateMovement(
        [{ ...exec(new Date(2026, 7, 12, 8, 0), 40), id: 'exec-1' }],
        [
          {
            ...sessao(new Date(2026, 7, 12, 8, 5), 42),
            kcal: 400,
            workoutExecutionId: 'exec-1',
          },
        ],
      ),
    );
    expect(totais).toEqual({ atividades: 1, minutos: 42, esportes: 1, kcal: 400 });
  });
});

describe('sportBreakdown', () => {
  it('agrupa por modalidade, da mais praticada para a menos', () => {
    const tally = sportBreakdown([
      { sport: 'corrida', durationS: 1800, kcal: 300, distanceM: 5000 },
      { sport: 'yoga', durationS: 3600, kcal: 150, distanceM: null },
      { sport: 'corrida', durationS: 2400, kcal: 380, distanceM: 7000 },
    ]);
    expect(tally.map((t) => t.sport)).toEqual(['corrida', 'yoga']);
    expect(tally[0]).toEqual({
      sport: 'corrida',
      sessoes: 2,
      minutos: 70,
      kcal: 680,
      metros: 12000,
    });
    expect(tally[1].metros).toBe(0);
  });
});

describe('weekdayTally', () => {
  it('conta atividades por dia da semana, domingo na posição zero', () => {
    const linhas = consolidateMovement(
      [
        exec(new Date(2026, 7, 10, 8, 0), 40), // segunda
        exec(new Date(2026, 7, 11, 8, 0), 40, 'CANCELLED'), // terça, não conta
      ],
      [sessao(new Date(2026, 7, 9, 8, 0), 30)], // domingo
    );
    expect(weekdayTally(linhas)).toEqual([1, 1, 0, 0, 0, 0, 0]);
  });
});

describe('movementSeries', () => {
  it('devolve um balde por dia do período, terminando hoje', () => {
    const serie = movementSeries(
      consolidateMovement(
        [exec(new Date(2026, 7, 10, 8, 0), 40)],
        [sessao(new Date(2026, 7, 12, 7, 0), 20)],
      ),
      7,
      QUARTA,
    );
    expect(serie).toHaveLength(7);
    expect(serie[serie.length - 1]).toEqual({ label: '12', value: 20 });
    expect(serie[serie.length - 3]).toEqual({ label: '10', value: 40 });
  });

  it('dia sem movimento vale zero, não some da série', () => {
    const serie = movementSeries([], 3, QUARTA);
    expect(serie.map((p) => p.value)).toEqual([0, 0, 0]);
    expect(serie.map((p) => p.label)).toEqual(['10', '11', '12']);
  });
});
