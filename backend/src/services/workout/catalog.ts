import { prisma } from '../../lib/prisma';

/**
 * O universo permitido de prescrição.
 *
 * Só exercícios `active`. O agente fica restrito a isto na ORIGEM — antes de
 * qualquer validação, o que ele recebe já é o conjunto fechado. A checagem
 * posterior (no serviço de modelo, e de novo na chave estrangeira) existe
 * porque o modelo ainda assim pode inventar um identificador.
 */

export type CatalogExercise = {
  id: string;
  name: string;
  muscle_group: string;
  equipment: string;
  level: string;
  type: string;
};

/**
 * O substituto oferecido na troca durante o treino.
 *
 * Tipo PRÓPRIO, e não `CatalogExercise` com campos a mais, porque o catálogo é
 * o que vai ao modelo na geração do plano: descrição e vídeo ali seriam
 * milhares de tokens por chamada para um texto que o modelo não usa. Aqui são
 * seis itens numa tela.
 */
export type SubstitutoSugerido = CatalogExercise & {
  description: string | null;
  video_url: string | null;
  thumbnail_url: string | null;
  /** A última carga que ESTA pessoa registrou neste exercício, se houver. */
  last_load?: number | null;
};

/**
 * Teto de itens enviados ao modelo.
 *
 * O catálogo inteiro (370) cabe folgado no prompt e é cacheado, então não há
 * razão para filtrar por grupo muscular na v1: filtrar por antecipação é o que
 * impede o modelo de escolher um acessório de um grupo que ele decidiu incluir.
 * O teto existe só para o dia em que o catálogo crescer muito.
 */
const MAX_CATALOG = 600;

export async function allowedExercises(): Promise<CatalogExercise[]> {
  const rows = await prisma.exercise.findMany({
    where: { active: true },
    select: { id: true, name: true, muscleGroup: true, equipment: true, level: true, type: true },
    orderBy: [{ muscleGroup: 'asc' }, { name: 'asc' }],
    take: MAX_CATALOG,
  });

  return rows.map((e) => ({
    id: e.id,
    name: e.name,
    muscle_group: e.muscleGroup,
    equipment: e.equipment,
    level: e.level,
    type: e.type,
  }));
}

/**
 * Substitutos para a troca durante a execução.
 *
 * Sem tabela de equivalência calibrada ainda: mesmo grupo muscular, mesmo tipo,
 * e — quando possível — o mesmo equipamento. É uma aproximação honesta, e é
 * melhor que a alternativa de não oferecer troca nenhuma quando a máquina está
 * ocupada.
 */
export async function similarExercises(exerciseId: string, limit = 6): Promise<SubstitutoSugerido[]> {
  const base = await prisma.exercise.findUnique({ where: { id: exerciseId } });
  if (!base) return [];

  const rows = await prisma.exercise.findMany({
    where: {
      active: true,
      id: { not: base.id },
      muscleGroup: base.muscleGroup,
      type: base.type,
    },
    /*
     Descrição e vídeo vão JUNTO com o substituto.

     Sem eles, o app trocava nome e id e deixava a descrição do exercício
     anterior na tela: "ao substituir exercício a descrição não foi atualizada"
     (Leonardo, 25/08/2026). A tela não tinha como corrigir sozinha, porque o
     dado nunca chegava até ela.
    */
    select: {
      id: true,
      name: true,
      muscleGroup: true,
      equipment: true,
      level: true,
      type: true,
      description: true,
      videoUrl: true,
      thumbnailUrl: true,
    },
    take: limit * 3,
  });

  // Mesmo equipamento primeiro: quem troca de exercício no meio do treino
  // normalmente está com a máquina ocupada, não mudando de estímulo.
  const sameEquipment = rows.filter((e) => e.equipment === base.equipment);
  const rest = rows.filter((e) => e.equipment !== base.equipment);

  return [...sameEquipment, ...rest].slice(0, limit).map((e) => ({
    id: e.id,
    name: e.name,
    muscle_group: e.muscleGroup,
    equipment: e.equipment,
    level: e.level,
    type: e.type,
    description: e.description,
    video_url: e.videoUrl,
    thumbnail_url: e.thumbnailUrl,
  }));
}

/**
 * A última carga que a pessoa registrou em CADA um destes exercícios.
 *
 * Trocar de exercício mantinha o peso do anterior pré-preenchido, e o peso é
 * de quem levanta, não do lugar na ficha: "manteve o peso do anterior mas
 * deveria aparecer somente se já registrei peso pra esse exercício"
 * (Leonardo, 25/08/2026). Aqui a busca é por EXERCÍCIO do catálogo, não por
 * linha do treino, porque é assim que a pergunta faz sentido: quanto eu
 * levantei nisto, em qualquer ficha.
 *
 * Exercício sem histórico simplesmente não aparece no resultado, e o app
 * deixa o campo vazio em vez de sugerir um número que ninguém levantou.
 */
export async function ultimasCargasPorExercicio(
  userId: string,
  exerciseIds: string[]): Promise<Record<string, number>> {
  if (exerciseIds.length === 0) return {};
  const rows = await prisma.exerciseExecution.findMany({
    where: {
      execution: { userId, status: 'FINISHED' },
      workoutExercise: { exerciseId: { in: exerciseIds } },
      load: { not: null },
    },
    orderBy: { completedAt: 'desc' },
    select: { load: true, workoutExercise: { select: { exerciseId: true } } },
  });

  const porExercicio: Record<string, number> = {};
  for (const row of rows) {
    const id = row.workoutExercise.exerciseId;
    // Ordenado do mais recente para o mais antigo: o primeiro vence.
    if (porExercicio[id] === undefined && row.load !== null) porExercicio[id] = row.load;
  }
  return porExercicio;
}

/**
 * Troca o exercício prescrito, no PLANO, e não só na sessão de hoje.
 *
 * Pedido de testador (Bruno, 24/08/2026): "ao trocar o exercício, perguntar se
 * na ficha para os próximos treinos desse dia trazer o que foi selecionado ou
 * se é especificamente para aquele treino". A troca de hoje já existia; o que
 * faltava era poder fixá-la.
 *
 * Duas travas, e nenhuma é opcional:
 *
 * 1. **O exercício tem que ser do dono.** A linha só é alterada se pertencer a
 *    um treino de um plano DESTE usuário. Sem isso, um id adivinhado reescreve
 *    a ficha de outra pessoa.
 * 2. **O substituto tem que estar entre os SIMILARES** que o próprio servidor
 *    ofereceu. É a mesma lista da troca de hoje, com o mesmo grupo muscular e
 *    o mesmo tipo, e é o que impede a troca permanente de virar uma porta para
 *    prescrever qualquer coisa do catálogo por fora do agente e das travas
 *    clínicas que geraram o plano.
 */
export async function trocarNoPlano({
  userId,
  workoutExerciseId,
  exerciseId,
}: {
  userId: string;
  workoutExerciseId: string;
  exerciseId: string;
}): Promise<'ok' | 'nao-encontrado' | 'substituto-invalido'> {
  const atual = await prisma.workoutExercise.findFirst({
    where: {
      id: workoutExerciseId,
      workout: { planDays: { some: { plan: { userId } } } },
    },
    select: { id: true, exerciseId: true },
  });
  if (!atual) return 'nao-encontrado';

  const permitidos = await similarExercises(atual.exerciseId, 24);
  if (!permitidos.some((e) => e.id === exerciseId)) return 'substituto-invalido';

  await prisma.workoutExercise.update({
    where: { id: atual.id },
    data: { exerciseId },
  });
  return 'ok';
}
