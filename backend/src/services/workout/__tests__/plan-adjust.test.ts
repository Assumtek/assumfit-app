import { aplicarOperacoes, PropostaVencida, type AdjustOperation } from '../plan-adjust';

/**
 * O aplicar do chat do Personal.
 *
 * Testado com um `tx` de mentira porque o que importa aqui é a SEMÂNTICA das
 * operações — o que cada uma lê antes de escrever, e o que ela faz quando o
 * alvo não está mais lá. Isso é decidido em código, não pelo banco, e é onde
 * mora o risco: escrever prescrição em cima do dia errado.
 *
 * Alvo que sumiu tem que derrubar o lote INTEIRO. Metade de um ajuste aplicada
 * é o pior desfecho possível: o plano fica num estado que ninguém propôs e que
 * a conversa não explica.
 */

type Dia = { id: string; dayOfWeek: string; dayType: string; workoutId: string | null };

/** Um plano de mentira: segunda com treino, terça de descanso, quarta com treino. */
function bancoFalso(dias: Dia[] = padrao()) {
  const escritas: { tabela: string; dados: unknown }[] = [];
  const exerciciosNoTreino = new Map<string, string[]>([
    ['w-seg', ['ex-supino']],
    ['w-qua', ['ex-remada']],
  ]);

  const anamnese: { answers: Record<string, unknown> } = { answers: {} };

  const tx = {
    healthAnamnesis: {
      findUnique: async () => anamnese,
      update: async ({ data }: any) => {
        anamnese.answers = data.answers;
        escritas.push({ tabela: 'anamnese', dados: data.answers });
        return anamnese;
      },
    },
    trainingPlanDay: {
      findUnique: async ({ where }: any) =>
        dias.find((d) => d.dayOfWeek === where.planId_dayOfWeek.dayOfWeek) ?? null,
      update: async ({ where, data }: any) => {
        const dia = dias.find((d) => d.id === where.id)!;
        Object.assign(dia, data);
        escritas.push({ tabela: 'dia', dados: { id: where.id, ...data } });
        return dia;
      },
    },
    workoutExercise: {
      findFirst: async ({ where }: any) => {
        const noTreino = exerciciosNoTreino.get(where.phase.workoutId) ?? [];
        return noTreino.includes(where.exerciseId)
          ? { id: `we-${where.exerciseId}`, exerciseId: where.exerciseId }
          : null;
      },
      update: async ({ where, data }: any) => {
        escritas.push({ tabela: 'exercicio', dados: { id: where.id, ...data } });
        return {};
      },
      delete: async ({ where }: any) => {
        escritas.push({ tabela: 'exercicio.delete', dados: where });
        return {};
      },
      count: async () => 1,
      create: async ({ data }: any) => {
        escritas.push({ tabela: 'exercicio.create', dados: data });
        return { id: 'we-novo' };
      },
    },
    workoutExerciseSet: {
      deleteMany: async () => ({ count: 1 }),
      createMany: async ({ data }: any) => {
        escritas.push({ tabela: 'series', dados: data });
        return { count: data.length };
      },
    },
    workout: {
      update: async ({ where, data }: any) => {
        escritas.push({ tabela: 'treino', dados: { id: where.id, ...data } });
        return {};
      },
      create: async ({ data }: any) => {
        escritas.push({ tabela: 'treino.create', dados: data });
        return { id: 'w-novo' };
      },
      delete: async ({ where }: any) => {
        escritas.push({ tabela: 'treino.delete', dados: where });
        return {};
      },
    },
    workoutPhase: {
      findFirst: async () => ({ id: 'fase-treino' }),
      create: async ({ data }: any) => {
        escritas.push({ tabela: 'fase.create', dados: data });
        return { id: 'fase-nova' };
      },
      count: async () => 1,
    },
    exercise: {
      findUnique: async ({ where }: any) =>
        where.id.startsWith('ex-') ? { id: where.id } : null,
    },
  };

  return { tx: tx as never, dias, escritas, anamnese };
}

const padrao = (): Dia[] => [
  { id: 'd1', dayOfWeek: 'MONDAY', dayType: 'WORKOUT', workoutId: 'w-seg' },
  { id: 'd2', dayOfWeek: 'TUESDAY', dayType: 'OFF', workoutId: null },
  { id: 'd3', dayOfWeek: 'WEDNESDAY', dayType: 'WORKOUT', workoutId: 'w-qua' },
];

describe('MOVE_WORKOUT', () => {
  it('troca o CONTEÚDO dos dois dias, nunca o dia da linha', async () => {
    /*
     O par (plano, dia) é único no banco. Reescrever o `dayOfWeek` da linha
     colidiria com a outra no meio da operação — por isso o que anda são os
     campos, e é isso que este teste trava.
    */
    const { tx, dias } = bancoFalso();
    await aplicarOperacoes(tx, 'p1', [
      { op: 'MOVE_WORKOUT', from_day: 'MONDAY', to_day: 'TUESDAY' },
    ]);

    const seg = dias.find((d) => d.dayOfWeek === 'MONDAY')!;
    const ter = dias.find((d) => d.dayOfWeek === 'TUESDAY')!;
    expect(seg.workoutId).toBeNull();
    expect(seg.dayType).toBe('OFF');
    expect(ter.workoutId).toBe('w-seg');
    expect(ter.dayType).toBe('WORKOUT');
    // Os dias em si não se mexeram.
    expect(dias.map((d) => d.dayOfWeek)).toEqual(['MONDAY', 'TUESDAY', 'WEDNESDAY']);
  });

  it('entre dois dias de treino, TROCA os dois', async () => {
    const { tx, dias } = bancoFalso();
    await aplicarOperacoes(tx, 'p1', [
      { op: 'MOVE_WORKOUT', from_day: 'MONDAY', to_day: 'WEDNESDAY' },
    ]);
    expect(dias.find((d) => d.dayOfWeek === 'MONDAY')!.workoutId).toBe('w-qua');
    expect(dias.find((d) => d.dayOfWeek === 'WEDNESDAY')!.workoutId).toBe('w-seg');
  });

  it('mover de um dia sem treino é proposta vencida', async () => {
    const { tx } = bancoFalso();
    await expect(
      aplicarOperacoes(tx, 'p1', [{ op: 'MOVE_WORKOUT', from_day: 'TUESDAY', to_day: 'MONDAY' }])).rejects.toThrow(PropostaVencida);
  });

  it('dia que não existe no plano é proposta vencida, não erro interno', async () => {
    const { tx } = bancoFalso();
    await expect(
      aplicarOperacoes(tx, 'p1', [{ op: 'MOVE_WORKOUT', from_day: 'MONDAY', to_day: 'SUNDAY' }])).rejects.toThrow(/não tem SUNDAY/);
  });
});

describe('SET_DAY_TYPE', () => {
  it('abrir um dia cria o treino e o vincula', async () => {
    const { tx, dias, escritas } = bancoFalso();
    await aplicarOperacoes(tx, 'p1', [
      {
        op: 'SET_DAY_TYPE',
        day_of_week: 'TUESDAY',
        day_type: 'WORKOUT',
        workout_name: 'Pernas',
        muscle_groups: ['QUADRICEPS', 'INVENTADO'],
      },
    ]);
    expect(dias.find((d) => d.dayOfWeek === 'TUESDAY')!.dayType).toBe('WORKOUT');
    const criado = escritas.find((e) => e.tabela === 'treino.create')!.dados as any;
    expect(criado.name).toBe('Pernas');
    // Grupo que o banco não conhece some em vez de derrubar a transação.
    expect(criado.muscleGroups).toEqual(['QUADRICEPS']);
  });

  it('abrir sem nome é recusado, a agenda mostraria um dia sem rótulo', async () => {
    const { tx } = bancoFalso();
    await expect(
      aplicarOperacoes(tx, 'p1', [
        { op: 'SET_DAY_TYPE', day_of_week: 'TUESDAY', day_type: 'WORKOUT' },
      ])).rejects.toThrow(/exige o nome/);
  });

  it('fechar um dia solta o vínculo E apaga o treino órfão', async () => {
    const { tx, dias, escritas } = bancoFalso();
    await aplicarOperacoes(tx, 'p1', [
      { op: 'SET_DAY_TYPE', day_of_week: 'MONDAY', day_type: 'OFF' },
    ]);
    expect(dias.find((d) => d.dayOfWeek === 'MONDAY')!.workoutId).toBeNull();
    expect(escritas.some((e) => e.tabela === 'treino.delete')).toBe(true);
  });
});

describe('operações de exercício', () => {
  it('procura o exercício DENTRO do dia pedido', async () => {
    // `ex-remada` existe no plano, mas na quarta. Pedir a troca dele na segunda
    // não pode encontrar nada — senão o ajuste cai no dia errado.
    const { tx } = bancoFalso();
    await expect(
      aplicarOperacoes(tx, 'p1', [
        {
          op: 'REPLACE_EXERCISE',
          day_of_week: 'MONDAY',
          target_exercise_id: 'ex-remada',
          new_exercise_id: 'ex-puxada',
        },
      ])).rejects.toThrow(/não está mais nesse dia/);
  });

  it('exercício fora do catálogo é recusado mesmo vindo do agente', async () => {
    const { tx } = bancoFalso();
    await expect(
      aplicarOperacoes(tx, 'p1', [
        {
          op: 'REPLACE_EXERCISE',
          day_of_week: 'MONDAY',
          target_exercise_id: 'ex-supino',
          new_exercise_id: 'inventado-123',
        },
      ])).rejects.toThrow(/fora do catálogo/);
  });

  it('ADJUST_SETS substitui a lista inteira, e a carga em texto vira nulo', async () => {
    const { tx, escritas } = bancoFalso();
    await aplicarOperacoes(tx, 'p1', [
      {
        op: 'ADJUST_SETS',
        day_of_week: 'MONDAY',
        target_exercise_id: 'ex-supino',
        sets: [
          { repetitions: '8-12', restTime: 90, load: 40 },
          { repetitions: '10', restTime: 60, load: 'corporal' },
        ],
      },
    ]);
    const series = escritas.find((e) => e.tabela === 'series')!.dados as any[];
    expect(series).toHaveLength(2);
    expect(series[0]).toMatchObject({ order: 1, repetitions: '8-12', load: 40 });
    // "corporal" não é quilo: entra nulo em vez de virar número inventado.
    expect(series[1].load).toBeNull();
  });

  it('ADD_EXERCISE grava workoutId ALÉM de phaseId', async () => {
    // A tabela guarda os dois. Só a fase deixaria o exercício fora de toda
    // consulta que parte do treino — e o treino apareceria mais curto do que é.
    const { tx, escritas } = bancoFalso();
    await aplicarOperacoes(tx, 'p1', [
      {
        op: 'ADD_EXERCISE',
        day_of_week: 'MONDAY',
        phase_type: 'TREINO',
        exercise_id: 'ex-crucifixo',
        subtype: 'STRENGTH',
        sets: [{ repetitions: '12', restTime: 60 }],
      },
    ]);
    const criado = escritas.find((e) => e.tabela === 'exercicio.create')!.dados as any;
    expect(criado.workoutId).toBe('w-seg');
    expect(criado.phaseId).toBe('fase-treino');
  });

  it('fase e subtipo inválidos são recusados', async () => {
    const { tx } = bancoFalso();
    await expect(
      aplicarOperacoes(tx, 'p1', [
        {
          op: 'ADD_EXERCISE',
          day_of_week: 'MONDAY',
          phase_type: 'AQUECIMENTO_QUE_NAO_EXISTE',
          exercise_id: 'ex-crucifixo',
          subtype: 'STRENGTH',
          sets: [{ repetitions: '12' }],
        },
      ])).rejects.toThrow(/fase inválida/);
  });
});

describe('lote', () => {
  it('operação desconhecida derruba tudo em vez de ser ignorada', async () => {
    // Contrato divergente entre o agente e o backend não pode virar "aplicou
    // uma parte": o silêncio esconde a divergência até alguém notar o treino
    // errado semanas depois.
    const { tx } = bancoFalso();
    await expect(
      aplicarOperacoes(tx, 'p1', [{ op: 'INVENTADA' } as unknown as AdjustOperation])).rejects.toThrow(/não suportada/);
  });

  it('aplica na ORDEM recebida, abrir o dia antes de povoá-lo', async () => {
    const { tx, escritas } = bancoFalso();
    await aplicarOperacoes(tx, 'p1', [
      {
        op: 'SET_DAY_TYPE',
        day_of_week: 'TUESDAY',
        day_type: 'WORKOUT',
        workout_name: 'Pernas',
        muscle_groups: [],
      },
      {
        op: 'ADD_EXERCISE',
        day_of_week: 'TUESDAY',
        phase_type: 'TREINO',
        exercise_id: 'ex-agachamento',
        subtype: 'STRENGTH',
        sets: [{ repetitions: '10' }],
      },
    ]);
    const ordem = escritas.map((e) => e.tabela);
    expect(ordem.indexOf('treino.create')).toBeLessThan(ordem.indexOf('exercicio.create'));
  });
});


/**
 * Registrar condição é a operação mais sensível do conjunto.
 *
 * Ela não prescreve nada — escreve no MESMO campo que a anamnese escreveria, e
 * é isso que faz a classificação de risco existente rodar em cima dela na
 * próxima mensagem. Escrever no campo errado seria pior que não escrever: a
 * condição pareceria registrada e não viraria flag nenhuma.
 */
describe('RECORD_CONDITION', () => {
  it('condição comum entra em `conditions`, que é de onde a flag nasce', async () => {
    const { tx, anamnese } = bancoFalso();
    await aplicarOperacoes(
      tx,
      'p1',
      [{ op: 'RECORD_CONDITION', condition: 'hipertensao' }],
      'u1');
    expect(anamnese.answers.conditions).toEqual(['hipertensao']);
  });

  it('gestação tem campo PRÓPRIO, em `conditions` ela não viraria flag', async () => {
    const { tx, anamnese } = bancoFalso();
    await aplicarOperacoes(tx, 'p1', [{ op: 'RECORD_CONDITION', condition: 'gestante' }], 'u1');
    expect(anamnese.answers.pregnant).toBe(true);
    expect(anamnese.answers.conditions).toBeUndefined();
  });

  it('as do PAR-Q vão para `parq`, não para `conditions`', async () => {
    const { tx, anamnese } = bancoFalso();
    await aplicarOperacoes(tx, 'p1', [{ op: 'RECORD_CONDITION', condition: 'dor_no_peito' }], 'u1');
    expect(anamnese.answers.parq).toMatchObject({ chestPain: true });
    expect(anamnese.answers.conditions).toBeUndefined();
  });

  it('o relato ACUMULA, com data, não sobrescreve o que já estava lá', async () => {
    // `deriveFlags` também varre esse texto livre. Sobrescrever apagaria o
    // histórico que um profissional leria antes de decidir qualquer coisa.
    const { tx, anamnese } = bancoFalso();
    anamnese.answers.conditionsDetail = 'anterior';
    await aplicarOperacoes(
      tx,
      'p1',
      [{ op: 'RECORD_CONDITION', condition: 'asma', detail: 'falta de ar subindo escada' }],
      'u1');
    const texto = anamnese.answers.conditionsDetail as string;
    expect(texto).toContain('anterior');
    expect(texto).toContain('falta de ar subindo escada');
    expect(texto).toContain('pelo chat');
  });

  it('sem usuário, recusa, registrar condição no anônimo não existe', async () => {
    const { tx } = bancoFalso();
    await expect(
      aplicarOperacoes(tx, 'p1', [{ op: 'RECORD_CONDITION', condition: 'asma' }])).rejects.toThrow(/exige usuário/);
  });
});
