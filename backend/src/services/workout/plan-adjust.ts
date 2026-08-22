import {
  DayOfWeek,
  ExerciseSubtype,
  MuscleGroup,
  Prisma,
  TrainingPlanDayType,
  WorkoutPhaseType,
} from '@prisma/client';

/**
 * Aplica no plano as operações que o chat propôs.
 *
 * Esta é a metade que faltava do Personal. O agente sempre soube propor um
 * diff; o backend recebia as operações e as DESCARTAVA, porque o caminho de
 * aplicar nunca foi construído. Do lado de quem usa, o sintoma era um "sim" que
 * não fazia nada: a pessoa aceitava a mudança e o treino continuava igual.
 *
 * ## Duas regras que valem para tudo aqui
 *
 * 1. **Revalidar contra o plano de AGORA.** A proposta foi calculada sobre o
 *    plano de alguns segundos ou minutos atrás. Entre propor e confirmar, uma
 *    geração nova pode ter substituído o plano inteiro — e aplicar um diff
 *    calculado sobre um plano que já não existe escreve mudança em cima de
 *    exercício que ninguém pediu. Alvo que sumiu derruba a aplicação INTEIRA,
 *    não só aquela operação: metade de um ajuste aplicada é pior que nenhuma.
 *
 * 2. **Tudo numa transação.** As operações se compõem — abrir um dia e povoá-lo
 *    são passos do mesmo ato. Falhar no meio deixaria um dia de treino vazio na
 *    agenda, prometendo algo que não existe.
 *
 * O que este arquivo NÃO decide: se a pessoa pode receber prescrição
 * automática. Isso é do `risk-tier`, e já barra antes do modelo ser chamado.
 */

export type AdjustOperation =
  | { op: 'REPLACE_EXERCISE'; day_of_week: string; target_exercise_id: string; new_exercise_id: string }
  | { op: 'ADJUST_SETS'; day_of_week: string; target_exercise_id: string; sets: SetInput[] }
  | { op: 'REMOVE_EXERCISE'; day_of_week: string; target_exercise_id: string }
  | {
      op: 'ADD_EXERCISE';
      day_of_week: string;
      phase_type: string;
      exercise_id: string;
      subtype: string;
      sets: SetInput[];
    }
  | { op: 'MOVE_WORKOUT'; from_day: string; to_day: string }
  | {
      op: 'SET_DAY_TYPE';
      day_of_week: string;
      day_type: 'WORKOUT' | 'OFF';
      workout_name?: string | null;
      muscle_groups?: string[];
    }
  | { op: 'RENAME_WORKOUT'; day_of_week: string; name: string }
  | { op: 'RECORD_CONDITION'; condition: string; detail?: string | null };

export type SetInput = {
  repetitions?: string | number | null;
  restTime?: number | null;
  rest_time?: number | null;
  load?: string | number | null;
};

/** Falha de revalidação. Não é erro do serviço: é a proposta que envelheceu. */
export class PropostaVencida extends Error {
  constructor(readonly motivo: string) {
    super(motivo);
    this.name = 'PropostaVencida';
  }
}

type Tx = Prisma.TransactionClient;

const DIAS = new Set<string>(Object.values(DayOfWeek));

/**
 * O dia do plano com o treino carregado — a unidade sobre a qual quase toda
 * operação age. Falta dele é sempre proposta vencida, nunca erro interno.
 */
async function diaDoPlano(tx: Tx, planId: string, dia: string) {
  if (!DIAS.has(dia)) throw new PropostaVencida(`dia inválido: ${dia}`);
  const encontrado = await tx.trainingPlanDay.findUnique({
    where: { planId_dayOfWeek: { planId, dayOfWeek: dia as DayOfWeek } },
  });
  if (!encontrado) throw new PropostaVencida(`o plano não tem ${dia}`);
  return encontrado;
}

/**
 * O exercício alvo, DENTRO do dia indicado.
 *
 * A busca é por dia e não por id solto de propósito: o mesmo exercício aparece
 * em dias diferentes, e um `findUnique` pelo id pegaria a primeira ocorrência —
 * mudando segunda quando o pedido era sobre sexta.
 */
async function exercicioDoDia(tx: Tx, workoutId: string, exerciseId: string) {
  const item = await tx.workoutExercise.findFirst({
    where: { phase: { workoutId }, exerciseId },
    include: { phase: true },
  });
  if (!item) throw new PropostaVencida(`o exercício ${exerciseId} não está mais nesse dia`);
  return item;
}

/**
 * As séries no formato da tabela.
 *
 * `repetitions` é TEXTO e não aceita nulo — o banco guarda "8-12", que é a
 * prescrição real, não um número. Série sem repetição declarada vira "—", que
 * é como a tela já lê ausência; gravar string vazia produziria um campo que
 * parece preenchido.
 *
 * `load` é NUMÉRICO no banco, mas o agente manda texto ("corporal", "leve").
 * O que não vira número entra como nulo: carga é grandeza, e guardar "leve"
 * como se fosse quilo é o tipo de dado que só se descobre errado no gráfico.
 */
function normalizarSets(sets: SetInput[]) {
  return sets.map((s, i) => {
    const carga = typeof s.load === 'number' ? s.load : Number(s.load);
    return {
      order: i + 1,
      repetitions: s.repetitions == null ? '–' : String(s.repetitions),
      restTime: s.restTime ?? s.rest_time ?? null,
      load: Number.isFinite(carga) ? carga : null,
    };
  });
}

/** Grupo muscular que o banco reconhece. Desconhecido some em vez de derrubar. */
function gruposValidos(grupos: string[] | undefined): MuscleGroup[] {
  const conhecidos = new Set<string>(Object.values(MuscleGroup));
  return (grupos ?? []).filter((g): g is MuscleGroup => conhecidos.has(g));
}

/**
 * Aplica o lote inteiro. Devolve quantas operações mudaram o plano.
 *
 * Recebe `tx` em vez de abrir a transação aqui: quem chama precisa marcar a
 * proposta como aplicada no MESMO commit — senão existe o instante em que o
 * plano mudou e a proposta ainda diz "pendente", e um segundo toque no botão
 * aplicaria tudo de novo.
 */
export async function aplicarOperacoes(
  tx: Tx,
  planId: string,
  operations: AdjustOperation[],
  userId?: string): Promise<number> {
  for (const op of operations) {
    switch (op.op) {
      case 'MOVE_WORKOUT': {
        await moverTreino(tx, planId, op.from_day, op.to_day);
        break;
      }
      case 'SET_DAY_TYPE': {
        await definirTipoDoDia(tx, planId, op);
        break;
      }
      case 'RENAME_WORKOUT': {
        const dia = await diaDoPlano(tx, planId, op.day_of_week);
        if (!dia.workoutId) throw new PropostaVencida(`${op.day_of_week} não tem treino para renomear`);
        await tx.workout.update({ where: { id: dia.workoutId }, data: { name: op.name } });
        break;
      }
      case 'REPLACE_EXERCISE': {
        const dia = await diaDoPlano(tx, planId, op.day_of_week);
        if (!dia.workoutId) throw new PropostaVencida(`${op.day_of_week} não tem treino`);
        const item = await exercicioDoDia(tx, dia.workoutId, op.target_exercise_id);
        await garantirNoCatalogo(tx, op.new_exercise_id);
        await tx.workoutExercise.update({
          where: { id: item.id },
          data: { exerciseId: op.new_exercise_id },
        });
        break;
      }
      case 'ADJUST_SETS': {
        const dia = await diaDoPlano(tx, planId, op.day_of_week);
        if (!dia.workoutId) throw new PropostaVencida(`${op.day_of_week} não tem treino`);
        const item = await exercicioDoDia(tx, dia.workoutId, op.target_exercise_id);
        // Substitui a lista INTEIRA: o agente devolve as séries após o ajuste,
        // não um delta. Mesclar produziria uma prescrição que ninguém escreveu.
        await tx.workoutExerciseSet.deleteMany({ where: { workoutExerciseId: item.id } });
        await tx.workoutExerciseSet.createMany({
          data: normalizarSets(op.sets).map((s) => ({ ...s, workoutExerciseId: item.id })),
        });
        break;
      }
      case 'REMOVE_EXERCISE': {
        const dia = await diaDoPlano(tx, planId, op.day_of_week);
        if (!dia.workoutId) throw new PropostaVencida(`${op.day_of_week} não tem treino`);
        const item = await exercicioDoDia(tx, dia.workoutId, op.target_exercise_id);
        await tx.workoutExercise.delete({ where: { id: item.id } });
        break;
      }
      case 'ADD_EXERCISE': {
        await adicionarExercicio(tx, planId, op);
        break;
      }
      case 'RECORD_CONDITION': {
        if (!userId) throw new PropostaVencida('registrar condição exige usuário');
        await registrarCondicao(tx, userId, op.condition, op.detail ?? null);
        break;
      }
      default: {
        // Operação desconhecida NÃO é ignorada em silêncio: ela chegou porque o
        // contrato entre o agente e o backend divergiu, e aplicar o resto do
        // lote entregaria um ajuste pela metade sem ninguém saber.
        const desconhecida = op as { op?: string };
        throw new PropostaVencida(`operação não suportada: ${desconhecida.op ?? '?'}`);
      }
    }
  }
  return operations.length;
}

/**
 * Troca o conteúdo de dois dias.
 *
 * Troca os CAMPOS entre as linhas, e não o `dayOfWeek` delas: o par
 * `(planId, dayOfWeek)` é único, e reescrever o dia da linha colidiria com a
 * outra no meio da operação.
 */
async function moverTreino(tx: Tx, planId: string, de: string, para: string) {
  if (de === para) throw new PropostaVencida('origem e destino são o mesmo dia');
  const origem = await diaDoPlano(tx, planId, de);
  const destino = await diaDoPlano(tx, planId, para);
  if (!origem.workoutId) throw new PropostaVencida(`${de} não tem treino para mover`);

  /*
   Os valores saem para variáveis ANTES de qualquer escrita.

   A primeira `update` já escreveu em `origem` quando a segunda vai ler dela — e
   ler o que se acabou de sobrescrever devolve o valor do destino nos dois dias,
   apagando o treino em vez de trocá-lo. Hoje o Prisma devolve um objeto solto e
   a leitura escaparia, mas a correção não é "o Prisma protege": é não depender
   disso. Foi o teste do banco falso que expôs.
  */
  const daOrigem = { workoutId: origem.workoutId, dayType: origem.dayType };
  const doDestino = { workoutId: destino.workoutId, dayType: destino.dayType };

  await tx.trainingPlanDay.update({ where: { id: origem.id }, data: doDestino });
  await tx.trainingPlanDay.update({ where: { id: destino.id }, data: daOrigem });
}

/** Abre ou fecha um dia — é como a frequência semanal muda pelo chat. */
async function definirTipoDoDia(
  tx: Tx,
  planId: string,
  op: Extract<AdjustOperation, { op: 'SET_DAY_TYPE' }>) {
  const dia = await diaDoPlano(tx, planId, op.day_of_week);

  if (op.day_type === 'OFF') {
    // Guardado ANTES da escrita, pelo mesmo motivo do `moverTreino`: soltar o
    // vínculo e depois perguntar qual era o treino devolve nulo, e o órfão fica.
    const orfao = dia.workoutId;
    await tx.trainingPlanDay.update({
      where: { id: dia.id },
      data: { dayType: TrainingPlanDayType.OFF, workoutId: null },
    });
    // O treino órfão sai junto: deixá-lo no banco faz o histórico do plano
    // listar sessões que não estão em dia nenhum.
    if (orfao) {
      await tx.workout.delete({ where: { id: orfao } }).catch(() => undefined);
    }
    return;
  }

  if (!op.workout_name) throw new PropostaVencida('abrir um dia exige o nome do treino');
  if (dia.workoutId) {
    // Já é dia de treino: abrir de novo seria criar um segundo treino no mesmo
    // dia, e o vínculo é um só.
    await tx.workout.update({ where: { id: dia.workoutId }, data: { name: op.workout_name } });
    return;
  }

  const treino = await tx.workout.create({
    data: { name: op.workout_name, muscleGroups: gruposValidos(op.muscle_groups) },
  });
  await tx.trainingPlanDay.update({
    where: { id: dia.id },
    data: { dayType: TrainingPlanDayType.WORKOUT, workoutId: treino.id },
  });
}

async function adicionarExercicio(
  tx: Tx,
  planId: string,
  op: Extract<AdjustOperation, { op: 'ADD_EXERCISE' }>) {
  const dia = await diaDoPlano(tx, planId, op.day_of_week);
  if (!dia.workoutId) throw new PropostaVencida(`${op.day_of_week} não é dia de treino`);
  await garantirNoCatalogo(tx, op.exercise_id);

  // A fase é criada sob demanda: um dia recém-aberto não tem nenhuma, e um dia
  // antigo pode não ter a fase pedida (treino sem cardio, por exemplo).
  const tipoDaFase = WorkoutPhaseType[op.phase_type as keyof typeof WorkoutPhaseType];
  if (!tipoDaFase) throw new PropostaVencida(`fase inválida: ${op.phase_type}`);
  const subtipo = ExerciseSubtype[op.subtype as keyof typeof ExerciseSubtype];
  if (!subtipo) throw new PropostaVencida(`subtipo inválido: ${op.subtype}`);

  const fase =
    (await tx.workoutPhase.findFirst({
      where: { workoutId: dia.workoutId, type: tipoDaFase },
    })) ??
    (await tx.workoutPhase.create({
      data: {
        workoutId: dia.workoutId,
        type: tipoDaFase,
        order: (await tx.workoutPhase.count({ where: { workoutId: dia.workoutId } })) + 1,
      },
    }));

  const ordem = (await tx.workoutExercise.count({ where: { phaseId: fase.id } })) + 1;
  const item = await tx.workoutExercise.create({
    data: {
      // `workoutId` além de `phaseId`: a tabela guarda os dois, e a fase sozinha
      // deixaria o exercício fora das consultas que partem do treino.
      workoutId: dia.workoutId,
      phaseId: fase.id,
      exerciseId: op.exercise_id,
      order: ordem,
      subtype: subtipo,
    },
  });
  await tx.workoutExerciseSet.createMany({
    data: normalizarSets(op.sets).map((s) => ({ ...s, workoutExerciseId: item.id })),
  });
}

/**
 * O exercício precisa existir no catálogo.
 *
 * A checagem já acontece no serviço de IA, contra a lista enviada no prompt.
 * Ela se repete aqui porque aquela roda sobre o catálogo de QUANDO a proposta
 * foi feita, e um exercício pode ter sido desativado desde então — e porque uma
 * trava de integridade que só existe do lado do modelo não é uma trava.
 */
async function garantirNoCatalogo(tx: Tx, exerciseId: string) {
  const existe = await tx.exercise.findUnique({ where: { id: exerciseId }, select: { id: true } });
  if (!existe) throw new PropostaVencida(`exercício fora do catálogo: ${exerciseId}`);
}

/**
 * Grava na anamnese uma condição relatada na conversa.
 *
 * Escreve no MESMO campo que a anamnese escreveria, e é isso que faz a coisa
 * funcionar sem nenhuma reimplementação: `deriveFlags` lê `conditions`, `parq` e
 * `pregnant`, e a classificação de risco roda em cima do que ela derivar. A
 * condição registrada aqui vira flag na próxima mensagem, e se a flag encaminhar,
 * o `isReferral` barra antes do modelo ser chamado — como sempre barrou.
 *
 * Nenhuma prescrição acontece por esta operação. Ela só registra o que a pessoa
 * disse, e deixa a trava existente decidir o que isso significa. Foi a única
 * forma que encontrei de atender "o chat também resolve" (decisão da fundadora,
 * ago/2026) sem criar um segundo lugar onde risco clínico é avaliado — dois
 * avaliadores divergem, e o que diverge em silêncio numa tela de saúde é o
 * defeito que ninguém descobre olhando.
 */
async function registrarCondicao(
  tx: Tx,
  userId: string,
  condition: string,
  detail: string | null) {
  const anamnese = await tx.healthAnamnesis.findUnique({ where: { userId } });
  if (!anamnese) throw new PropostaVencida('sem anamnese para registrar a condição');

  const respostas = (anamnese.answers ?? {}) as Record<string, unknown>;
  const parq = { ...((respostas.parq as Record<string, unknown>) ?? {}) };
  const condicoes = new Set<string>(
    Array.isArray(respostas.conditions) ? (respostas.conditions as string[]) : []);

  // As do PAR-Q moram noutro campo, e é por ele que `deriveFlags` as lê.
  const NO_PARQ: Record<string, string> = {
    dor_no_peito: 'chestPain',
    tontura: 'dizziness',
    problema_osteoarticular: 'boneJointProblem',
    medicacao_pressao: 'bloodPressureMedication',
  };

  if (condition === 'gestante') {
    respostas.pregnant = true;
  } else if (NO_PARQ[condition]) {
    parq[NO_PARQ[condition]] = true;
    respostas.parq = parq;
  } else {
    condicoes.add(condition);
    respostas.conditions = [...condicoes];
  }

  /*
   O relato fica com as palavras DELA, acumulado.

   `deriveFlags` também varre esse texto livre em busca de gestação, e sobrescrevê-lo
   apagaria o histórico do que foi dito — que é justamente o que um profissional
   leria antes de decidir qualquer coisa.
  */
  if (detail) {
    const anterior = typeof respostas.conditionsDetail === 'string' ? respostas.conditionsDetail : '';
    const carimbo = new Date().toISOString().slice(0, 10);
    respostas.conditionsDetail = `${anterior}${anterior ? '\n' : ''}[${carimbo}, pelo chat] ${detail}`.trim();
  }

  await tx.healthAnamnesis.update({
    where: { userId },
    data: { answers: respostas as never },
  });
}
