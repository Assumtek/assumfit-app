import {
  DEFAULT_LENGTH,
  averageLength,
  monthAhead,
  nextPeriod,
  periodLink,
  phaseOn,
  shiftDay,
  type LoggedCycle,
} from '../cycle';

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

describe('monthAhead', () => {
  const ciclos = [
    { startedAt: '2026-06-03', durationDays: 5 },
    { startedAt: '2026-07-01', durationDays: 5 },
  ];

  it('sem registro não desenha o mês', () => {
    expect(monthAhead([], '2026-07-10')).toBeNull();
  });

  it('as janelas cobrem o ciclo inteiro, sem buraco e na ordem', () => {
    const mes = monthAhead(ciclos, '2026-07-10')!;
    expect(mes.windows[0]).toEqual({ label: 'Menstruação', from: '2026-07-01', to: '2026-07-05' });
    // Fim de uma janela é véspera do início da seguinte.
    for (let i = 1; i < mes.windows.length; i++) {
      const fimAnterior = new Date(`${mes.windows[i - 1].to}T12:00:00`).getTime();
      const inicioAtual = new Date(`${mes.windows[i].from}T12:00:00`).getTime();
      expect(inicioAtual - fimAnterior).toBe(86_400_000);
    }
    expect(mes.windows[3].to).toBe('2026-07-28'); // ciclo de 28 dias
  });

  it('janela fértil: 5 dias antes da ovulação até 1 depois, com o pico marcado', () => {
    // Ciclo de 28: ovulação no dia 14 → 14/jul; fértil 09–15/jul.
    const mes = monthAhead(ciclos, '2026-07-10')!;
    expect(mes.fertile.peak).toBe('2026-07-14');
    expect(mes.fertile.from).toBe('2026-07-09');
    expect(mes.fertile.to).toBe('2026-07-15');
  });

  it('prevê o início do próximo ciclo', () => {
    expect(monthAhead(ciclos, '2026-07-10')!.nextStart).toBe('2026-07-29');
  });
});

describe('discardedIntervals', () => {
  const { discardedIntervals } = require('../cycle');

  it('conta os intervalos que a média descartou', () => {
    // 38 e 40 dias: fora da faixa 21–35 — a pessoa de ciclo longo fornece
    // dados todo mês e o filtro os descarta; a tela precisa saber disso.
    const cycles = [
      { startedAt: '2026-05-01', durationDays: null },
      { startedAt: '2026-06-08', durationDays: null }, // 38
      { startedAt: '2026-07-18', durationDays: null }, // 40
    ];
    expect(discardedIntervals(cycles)).toBe(2);
  });

  it('zero quando tudo está na faixa ou não há intervalos', () => {
    expect(discardedIntervals([])).toBe(0);
    expect(discardedIntervals([{ startedAt: '2026-07-01', durationDays: null }])).toBe(0);
    expect(
      discardedIntervals([
        { startedAt: '2026-06-03', durationDays: null },
        { startedAt: '2026-07-01', durationDays: null }, // 28
      ]),
    ).toBe(0);
  });
});

describe('phaseProjected', () => {
  const { phaseProjected } = require('../cycle');
  const base = [{ startedAt: '2026-07-01', durationDays: null }];

  it('dentro do ciclo corrente repassa a fase real', () => {
    expect(phaseProjected('2026-07-03', base)).toEqual({ phase: 'menstrual', projected: false });
  });

  it('além do ciclo corrente embrulha no comprimento e marca como projeção', () => {
    // 2026-08-01 é o dia 32 de um ciclo de 28: projeta o dia 4 do próximo.
    const r = phaseProjected('2026-08-01', base);
    expect(r).toEqual({ phase: 'menstrual', projected: true });
  });

  it('null sem registro', () => {
    expect(phaseProjected('2026-07-03', [])).toBeNull();
  });
});

describe('phaseProjected — retro-projeção', () => {
  const { phaseProjected } = require('../cycle');

  it('pinta os dias anteriores ao primeiro registro, marcados como projeção', () => {
    const cycles = [{ startedAt: '2026-07-15', durationDays: null }];
    // 28 dias antes de 15/jul cai exatamente noutro início projetado.
    expect(phaseProjected('2026-06-17', cycles)).toEqual({ phase: 'menstrual', projected: true });
    // Meio do ciclo retro-projetado: não pode ser null.
    const meio = phaseProjected('2026-07-01', cycles);
    expect(meio).not.toBeNull();
    expect(meio?.projected).toBe(true);
  });
});

describe('groupCycles', () => {
  const { groupCycles } = require('../cycle');

  it('agrupa dias consecutivos num ciclo com duração real de fluxo', () => {
    expect(
      groupCycles(['2026-07-15', '2026-07-16', '2026-07-17', '2026-07-18']),
    ).toEqual([{ startedAt: '2026-07-15', durationDays: 4 }]);
  });

  it('separa sequências com lacuna e ordena o que chegar embaralhado', () => {
    expect(groupCycles(['2026-07-17', '2026-06-18', '2026-07-15', '2026-07-16'])).toEqual([
      { startedAt: '2026-06-18', durationDays: 1 },
      { startedAt: '2026-07-15', durationDays: 3 },
    ]);
  });

  it('deduplica dias repetidos e aceita vazio', () => {
    expect(groupCycles(['2026-07-15', '2026-07-15'])).toEqual([
      { startedAt: '2026-07-15', durationDays: 1 },
    ]);
    expect(groupCycles([])).toEqual([]);
  });
});

describe('periodLink — a faixa contínua do período', () => {
  const marcados = new Set(['2026-08-10', '2026-08-11', '2026-08-12']);

  it('o primeiro dia abre o trecho: fecha à esquerda, segue à direita', () => {
    // 10/8 é uma segunda-feira: coluna 1 na grade que começa no domingo.
    expect(periodLink('2026-08-10', marcados, 1)).toEqual({ antes: false, depois: true });
  });

  it('o dia do meio não tem ponta nenhuma', () => {
    expect(periodLink('2026-08-11', marcados, 2)).toEqual({ antes: true, depois: true });
  });

  it('o último dia fecha o trecho', () => {
    expect(periodLink('2026-08-12', marcados, 3)).toEqual({ antes: true, depois: false });
  });

  it('dia solto não liga a nada', () => {
    expect(periodLink('2026-08-20', new Set(['2026-08-20']), 4)).toEqual({
      antes: false,
      depois: false,
    });
  });

  it('a faixa QUEBRA na virada de semana, mesmo com os dias consecutivos', () => {
    const semana = new Set(['2026-08-15', '2026-08-16']);
    // 15/8 é sábado (coluna 6) e 16/8 é domingo (coluna 0) — linhas diferentes.
    expect(periodLink('2026-08-15', semana, 6).depois).toBe(false);
    expect(periodLink('2026-08-16', semana, 0).antes).toBe(false);
  });

  it('dia não marcado nunca liga', () => {
    expect(periodLink('2026-08-13', marcados, 4)).toEqual({ antes: false, depois: false });
  });

  it('o trecho atravessa a virada de mês', () => {
    const virada = new Set(['2026-07-31', '2026-08-01']);
    // 31/7 é sexta (coluna 5), 1/8 é sábado (coluna 6) — mesma linha.
    expect(periodLink('2026-07-31', virada, 5).depois).toBe(true);
    expect(periodLink('2026-08-01', virada, 6).antes).toBe(true);
  });
});

describe('shiftDay', () => {
  it('atravessa mês e ano', () => {
    expect(shiftDay('2026-08-01', -1)).toBe('2026-07-31');
    expect(shiftDay('2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftDay('2026-03-01', -1)).toBe('2026-02-28');
  });
});
