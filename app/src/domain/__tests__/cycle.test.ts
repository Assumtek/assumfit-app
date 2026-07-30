import { DEFAULT_LENGTH, averageLength, nextPeriod, phaseOn, type LoggedCycle } from '../cycle';

/**
 * O que estes testes travam é a PROPRIEDADE, não o número.
 *
 * A regra que mais importa é a da ovulação: ela sai da próxima menstruação
 * menos a fase lútea, e não de "dia 14". Um ciclo de 35 dias com ovulação
 * cravada no dia 14 colocaria a pessoa na fase errada por uma semana — e como
 * o app usa a fase para calibrar recomendação de treino, o erro seria visível
 * e silencioso ao mesmo tempo.
 */
const ciclo = (startedAt: string, durationDays: number | null = 5): LoggedCycle => ({
  startedAt,
  durationDays,
});

describe('averageLength', () => {
  it('sem dois registros não há intervalo, e não se inventa um', () => {
    expect(averageLength([])).toBeNull();
    expect(averageLength([ciclo('2026-07-01')])).toBeNull();
  });

  it('calcula a média dos intervalos entre inícios', () => {
    // 01/06 → 29/06 = 28 dias; 29/06 → 27/07 = 28 dias.
    expect(averageLength([ciclo('2026-06-01'), ciclo('2026-06-29'), ciclo('2026-07-27')])).toBe(28);
  });

  it('descarta intervalo fora da faixa fisiológica', () => {
    // O salto de 90 dias é registro esquecido, não ciclo. Entrando na média,
    // ele empurraria a próxima previsão em semanas.
    const media = averageLength([ciclo('2026-01-01'), ciclo('2026-04-01'), ciclo('2026-04-29')]);
    expect(media).toBe(28);
  });
});

describe('phaseOn', () => {
  it('sem registro não devolve fase — não existe ciclo sem primeiro dia', () => {
    expect(phaseOn('2026-07-28', [])).toBeNull();
  });

  it('os dias de fluxo são a fase menstrual', () => {
    const c = [ciclo('2026-07-20', 5)];
    expect(phaseOn('2026-07-20', c)?.phase).toBe('menstrual');
    expect(phaseOn('2026-07-24', c)?.phase).toBe('menstrual');
    expect(phaseOn('2026-07-25', c)?.phase).not.toBe('menstrual');
  });

  it('o dia do ciclo começa em 1, não em 0', () => {
    expect(phaseOn('2026-07-20', [ciclo('2026-07-20')])?.day).toBe(1);
  });

  it('a ovulação acompanha a duração do ciclo, não o dia 14', () => {
    // Ciclo curto (24 dias): ovulação em torno do dia 10.
    const curto = [ciclo('2026-05-01'), ciclo('2026-05-25'), ciclo('2026-06-18')];
    expect(phaseOn('2026-06-27', curto)?.phase).toBe('ovulatory'); // dia 10

    // Ciclo longo (34 dias): ovulação em torno do dia 20. No dia 14 dele a
    // pessoa ainda está na folicular — é exatamente onde o modelo de "dia 14
    // fixo" erraria.
    const longo = [ciclo('2026-05-01'), ciclo('2026-06-04'), ciclo('2026-07-08')];
    expect(phaseOn('2026-07-21', longo)?.phase).toBe('follicular'); // dia 14
    expect(phaseOn('2026-07-27', longo)?.phase).toBe('ovulatory'); // dia 20
  });

  it('depois da ovulação vem a lútea', () => {
    const c = [ciclo('2026-06-01'), ciclo('2026-06-29')];
    expect(phaseOn('2026-07-20', c)?.phase).toBe('luteal'); // dia 22 de 28
  });

  it('marca que está estimando enquanto não houver histórico próprio', () => {
    const um = phaseOn('2026-07-25', [ciclo('2026-07-20')]);
    expect(um?.estimating).toBe(true);
    expect(um?.length).toBe(DEFAULT_LENGTH);

    const dois = phaseOn('2026-07-25', [ciclo('2026-06-22'), ciclo('2026-07-20')]);
    expect(dois?.estimating).toBe(false);
  });

  it('atraso aparece como dias negativos, sem virar diagnóstico', () => {
    // 40 dias depois de um ciclo de 28: 12 dias de atraso. O módulo devolve o
    // número; interpretar é com a pessoa.
    const c = [ciclo('2026-05-25'), ciclo('2026-06-22')];
    expect(phaseOn('2026-08-01', c)?.daysToNext).toBe(-12);
  });
});

describe('nextPeriod', () => {
  it('sem registro não prevê data', () => {
    expect(nextPeriod([])).toBeNull();
  });

  it('projeta a partir do último início e da média da pessoa', () => {
    expect(nextPeriod([ciclo('2026-06-01'), ciclo('2026-06-29')])).toBe('2026-07-27');
  });

  it('com um registro só usa a referência populacional', () => {
    expect(nextPeriod([ciclo('2026-07-01')])).toBe('2026-07-29');
  });
});
