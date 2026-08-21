import { z } from 'zod';

/**
 * Traduz a anamnese e o perfil em FATOS que o agente entende.
 *
 * As flags derivadas aqui alimentam duas coisas: o roteador determinístico do
 * serviço de modelo (que garante a referência clínica certa) e a classificação
 * de risco. Elas são derivadas na hora, a cada geração, e não gravadas em
 * coluna — a tabela de derivação muda com a evidência, e uma flag congelada
 * envelheceria sem ninguém perceber.
 */

/** Perfil mínimo necessário. Vem do `User` e do `LifestyleProfile`. */
export type UserForContext = {
  sex: 'f' | 'm';
  birthDate: Date;
  /** Do perfil de rotina do onboarding — pode não existir. */
  activities?: string[];
  trainDays?: number[];
  trainPlace?: string | null;
  goal?: string | null;
  exercises?: 'regular' | 'sometimes' | 'none' | null;
};

export type WorkoutContext = {
  profile: Record<string, unknown>;
  flags: string[];
  constraints: Record<string, unknown>;
};

/**
 * Leitura tolerante do JSON da anamnese: extrai só o que deriva flag, e ignora
 * o resto. Não usa `.strict()` de propósito — o objetivo é LER dado guardado,
 * não validar um payload de entrada.
 */
const AnamnesisParse = z
  .object({
    conditions: z.array(z.string()).nullish(),
    conditionsDetail: z.string().nullish(),
    medications: z.string().nullish(),
    injuries: z.string().nullish(),
    parq: z
      .object({
        heartCondition: z.boolean().nullish(),
        chestPain: z.boolean().nullish(),
        bloodPressureMedication: z.boolean().nullish(),
        boneJointProblem: z.boolean().nullish(),
        dizziness: z.boolean().nullish(),
      })
      .partial()
      .passthrough()
      .nullish(),
    pregnant: z.boolean().nullish(),
    weightKg: z.number().nullish(),
    heightCm: z.number().nullish(),
    experience: z.enum(['iniciante', 'intermediario', 'avancado']).nullish(),
    minutesPerSession: z.number().nullish(),
    daysPerWeek: z.number().nullish(),
    equipment: z.string().nullish(),
    /** O que o plano cobre (slugs de modalidade), decidido na anamnese. */
    planModalities: z.array(z.string()).nullish(),
    planSportLabel: z.string().nullish(),
    notes: z.string().nullish(),
  })
  .passthrough();

export type AnamnesisAnswers = z.infer<typeof AnamnesisParse>;

const CONDITION_TO_FLAG: Record<string, string> = {
  cardiopatia: 'cardiopata',
  hipertensao: 'hipertensao',
  diabetes: 'diabetico',
  asma: 'asma',
  artrose: 'artrose',
  osteoporose: 'osteoporose',
  depressao_ansiedade: 'saude-mental',
  cancer: 'cancer',
};

const GOAL_TO_OBJETIVO: Record<string, string> = {
  emagrecer: 'emagrecimento',
  massa: 'hipertrofia',
  forca: 'performance',
  performance: 'performance',
  flexibilidade: 'mobilidade',
  saude: 'saude',
  reabilitacao: 'reabilitacao',
  energia: 'saude',
  dormir: 'saude',
};

/**
 * Detecção de análogos de GLP-1 em texto livre. Está aqui, e não numa lista de
 * condições, porque quem usa Ozempic descreve isso escrevendo o nome do
 * remédio — não marcando uma caixa "uso GLP-1". A flag importa: perda de massa
 * magra acelerada muda a prescrição.
 */
const GLP1_REGEX = /ozempic|wegovy|mounjaro|saxenda|semaglutida|tirzepatida|liraglutida|glp-?1/i;
const PREGNANCY_REGEX = /gestante|gr[aá]vid|gesta[cç][aã]o|gravidez|p[oó]s-?parto/i;

export function parseAnamnesis(raw: unknown): AnamnesisAnswers {
  const parsed = AnamnesisParse.safeParse(raw);
  return parsed.success ? parsed.data : {};
}

function ageFrom(birthDate: Date, now = new Date()): number {
  let age = now.getUTCFullYear() - birthDate.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - birthDate.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < birthDate.getUTCDate())) age -= 1;
  return age;
}

function bmiFrom(answers: AnamnesisAnswers): number | null {
  const { weightKg, heightCm } = answers;
  if (!weightKg || !heightCm || heightCm <= 0) return null;
  const meters = heightCm / 100;
  return weightKg / (meters * meters);
}

/** Flags clínicas. É a entrada da classificação de risco e da recuperação de referências. */
export function deriveFlags(answers: AnamnesisAnswers, user: UserForContext): string[] {
  const flags = new Set<string>();

  for (const condition of answers.conditions ?? []) {
    const flag = CONDITION_TO_FLAG[condition];
    if (flag) flags.add(flag);
  }

  const parq = answers.parq ?? {};
  if (parq.heartCondition) flags.add('cardiopata');
  // Dor no peito e tontura sem investigação são as duas perguntas do PAR-Q que
  // param tudo. Não é "cuidado extra": é liberação médica antes de treinar.
  if (parq.chestPain || parq.dizziness) flags.add('dor-toracica-nao-investigada');
  if (parq.bloodPressureMedication) flags.add('hipertensao');
  if (parq.boneJointProblem) flags.add('lesao-ortopedica');

  const age = ageFrom(user.birthDate);
  if (age >= 60) flags.add('idoso');
  else if (age >= 40) flags.add('40-mais');

  const bmi = bmiFrom(answers);
  if (bmi !== null && bmi >= 30) flags.add('obeso');

  if (answers.experience === 'iniciante' || user.exercises === 'none') flags.add('iniciante');

  // Texto livre: medicação, detalhe da condição, histórico de lesão.
  const freeText = [answers.medications, answers.conditionsDetail, answers.injuries, answers.notes]
    .filter((v): v is string => Boolean(v))
    .join(' ');
  if (GLP1_REGEX.test(freeText)) flags.add('glp1');
  if (answers.pregnant || PREGNANCY_REGEX.test(freeText)) flags.add('gestante');
  if (answers.injuries) flags.add('lesao-ortopedica');

  return [...flags];
}

/**
 * Contexto completo enviado ao agente.
 *
 * `biometrics` é o que o AssumFit tem e um app de treino comum não: linha de
 * base de HRV medida, cronótipo observado, score de energia. Entra no perfil
 * porque calibra o nível REAL — o declarado costuma ser otimista.
 */
export function buildContext(
  answers: AnamnesisAnswers,
  user: UserForContext,
  biometrics: Record<string, unknown> = {},
): WorkoutContext {
  const age = ageFrom(user.birthDate);
  const goal = user.goal ? GOAL_TO_OBJETIVO[user.goal] : undefined;

  return {
    profile: {
      sexo: user.sex === 'f' ? 'feminino' : 'masculino',
      idade: age,
      objetivo: goal ?? 'saude',
      experiencia: answers.experience ?? (user.exercises === 'regular' ? 'intermediario' : 'iniciante'),
      frequencia_semanal: answers.daysPerWeek ?? user.trainDays?.length ?? 3,
      // O que o plano deve COBRIR — decisão da pessoa na anamnese. Anamnese
      // antiga não tem a resposta, e aí vale o comportamento de sempre.
      modalidades: answers.planModalities ?? ['musculacao'],
      // O esporte com o nome que a pessoa deu — é como a sessão deve se chamar.
      esporte_declarado: answers.planSportLabel ?? undefined,
      // O que ela pratica por fora: contexto de carga e recuperação, não
      // ordem de prescrição.
      esportes_praticados: user.activities ?? [],
      ...biometrics,
    },
    flags: deriveFlags(answers, user),
    constraints: {
      local: user.trainPlace ?? 'academia',
      equipamento: answers.equipment ?? undefined,
      minutos_por_sessao: answers.minutesPerSession ?? undefined,
      dias_disponiveis: user.trainDays ?? undefined,
      lesoes: answers.injuries ?? undefined,
    },
  };
}
