/**
 * Anamnese de saúde — o que precede qualquer prescrição de treino.
 *
 * Mesmo formato do grafo de onboarding (`onboarding.ts`), pela mesma razão:
 * pergunta sem consequência não é feita, o enunciado cita a resposta anterior,
 * e o grafo é DADO — dá para testar o caminho de um cardiopata inteiro sem
 * montar um componente.
 *
 * A diferença em relação ao onboarding é o que está em jogo. Lá, um campo
 * errado desloca uma sugestão. Aqui, uma resposta perdida é um treino
 * prescrito para quem não deveria treinar sozinho. Por isso:
 *
 * 1. **O PAR-Q vem primeiro e não é pulável.** São as perguntas que, sozinhas,
 *    decidem se existe treino a gerar. O resto do fluxo pode ser abreviado; ele
 *    não.
 * 2. **Toda pergunta clínica é de resposta única e explícita.** Sem "prefiro
 *    não dizer", sem padrão implícito: não responder e responder "não" são
 *    coisas diferentes, e tratar uma como a outra é o erro que mata.
 * 3. **Cada campo aqui deriva uma flag**, e a flag muda a referência clínica
 *    injetada e o tier de risco. O comentário de cada pergunta diz qual.
 */

export type Experience = 'iniciante' | 'intermediario' | 'avancado';

export type Parq = {
  /** → flag `cardiopata` → encaminhamento. */
  heartCondition?: boolean;
  /** → flag `dor-toracica-nao-investigada` → encaminhamento. */
  chestPain?: boolean;
  /** Também `dor-toracica-nao-investigada`: tontura ao esforço é o mesmo sinal. */
  dizziness?: boolean;
  /** → flag `hipertensao` → referência de hipertensos. */
  bloodPressureMedication?: boolean;
  /** → flag `lesao-ortopedica` → referência de patologias ortopédicas. */
  boneJointProblem?: boolean;
};

export type Anamnesis = {
  parq?: Parq;
  /** Condições declaradas → uma flag cada. */
  conditions?: string[];
  conditionsDetail?: string;
  /** Texto livre. É onde "Ozempic" aparece, e é o que deriva a flag `glp1`. */
  medications?: string;
  /** → flag `gestante` → encaminhamento. */
  pregnant?: boolean;
  injuries?: string;
  /** Peso e altura derivam o IMC, e IMC ≥ 30 vira a flag `obeso`. */
  weightKg?: number;
  heightCm?: number;
  experience?: Experience;
  daysPerWeek?: number;
  minutesPerSession?: number;
  equipment?: string;
  notes?: string;
};

export type Option = { value: string | number | boolean; label: string; detail?: string };

export type Question = {
  /** Caminho do campo. `parq.heartCondition` grava dentro do objeto aninhado. */
  id: string;
  kind: 'yesno' | 'single' | 'multi' | 'number' | 'text';
  title: string;
  hint?: string;
  options?: Option[];
  /** Só perguntas que não decidem segurança podem ser puladas. */
  optional?: boolean;
  /** Marca a etapa do PAR-Q, que a tela destaca como bloco clínico. */
  clinical?: boolean;
  unit?: string;
};

export const CONDITIONS: Option[] = [
  { value: 'cardiopatia', label: 'Problema cardíaco' },
  { value: 'hipertensao', label: 'Pressão alta' },
  { value: 'diabetes', label: 'Diabetes' },
  { value: 'asma', label: 'Asma ou problema respiratório' },
  { value: 'artrose', label: 'Artrite ou artrose' },
  { value: 'osteoporose', label: 'Osteoporose' },
  { value: 'depressao_ansiedade', label: 'Depressão ou ansiedade' },
  { value: 'cancer', label: 'Câncer, em tratamento ou histórico' },
  { value: 'nenhuma', label: 'Nenhuma dessas' },
];

const YES_NO: Option[] = [
  { value: true, label: 'Sim' },
  { value: false, label: 'Não' },
];

/** Leitura de caminho aninhado: `parq.chestPain`. */
export function valueAt(answers: Anamnesis, id: string): unknown {
  const [head, tail] = id.split('.');
  if (!tail) return (answers as Record<string, unknown>)[head];
  const nested = (answers as Record<string, unknown>)[head] as Record<string, unknown> | undefined;
  return nested?.[tail];
}

/** Escrita de caminho aninhado, sem mutar o objeto recebido. */
export function setAt(answers: Anamnesis, id: string, value: unknown): Anamnesis {
  const [head, tail] = id.split('.');
  if (!tail) return { ...answers, [head]: value };
  const nested = ((answers as Record<string, unknown>)[head] ?? {}) as Record<string, unknown>;
  return { ...answers, [head]: { ...nested, [tail]: value } };
}

const answered = (answers: Anamnesis, id: string) => valueAt(answers, id) !== undefined;

/**
 * A próxima pergunta, ou `null` quando acabou.
 *
 * Ordem deliberada: o PAR-Q inteiro antes de qualquer coisa sobre preferência
 * de treino. Perguntar "quantos dias por semana você quer treinar?" antes de
 * saber se a pessoa pode treinar seria construir expectativa que talvez se
 * encerre em encaminhamento.
 */
export function nextQuestion(answers: Anamnesis): Question | null {
  // ---- PAR-Q ------------------------------------------------------------

  if (!answered(answers, 'parq.heartCondition')) {
    return {
      id: 'parq.heartCondition',
      kind: 'yesno',
      clinical: true,
      title: 'Algum médico já disse que você tem um problema no coração?',
      hint: 'Inclui arritmia, sopro, infarto anterior ou qualquer restrição cardíaca.',
      options: YES_NO,
    };
  }

  if (!answered(answers, 'parq.chestPain')) {
    return {
      id: 'parq.chestPain',
      kind: 'yesno',
      clinical: true,
      title: 'Você sente dor no peito ao fazer esforço físico?',
      hint: 'Ou em repouso, no último mês.',
      options: YES_NO,
    };
  }

  if (!answered(answers, 'parq.dizziness')) {
    return {
      id: 'parq.dizziness',
      kind: 'yesno',
      clinical: true,
      title: 'Você já perdeu o equilíbrio por tontura, ou desmaiou?',
      options: YES_NO,
    };
  }

  if (!answered(answers, 'parq.bloodPressureMedication')) {
    return {
      id: 'parq.bloodPressureMedication',
      kind: 'yesno',
      clinical: true,
      title: 'Você toma remédio para pressão ou para o coração?',
      options: YES_NO,
    };
  }

  if (!answered(answers, 'parq.boneJointProblem')) {
    return {
      id: 'parq.boneJointProblem',
      kind: 'yesno',
      clinical: true,
      title: 'Você tem algum problema de osso ou articulação que piora com exercício?',
      hint: 'Joelho, coluna, ombro, quadril.',
      options: YES_NO,
    };
  }

  // ---- Condições e medicação -------------------------------------------

  if (!answered(answers, 'conditions')) {
    return {
      id: 'conditions',
      kind: 'multi',
      clinical: true,
      title: 'Alguma dessas condições se aplica a você?',
      hint: 'Pode marcar mais de uma.',
      options: CONDITIONS,
    };
  }

  // Só para quem marcou algo. Perguntar detalhe de "nenhuma dessas" seria
  // desatenção visível.
  const conditions = answers.conditions ?? [];
  const hasCondition = conditions.length > 0 && !conditions.includes('nenhuma');
  if (hasCondition && !answered(answers, 'conditionsDetail')) {
    return {
      id: 'conditionsDetail',
      kind: 'text',
      title: 'Quer contar um pouco mais sobre isso?',
      hint: 'Desde quando, se está controlado, se algum médico restringiu alguma coisa.',
      optional: true,
    };
  }

  if (!answered(answers, 'medications')) {
    return {
      id: 'medications',
      kind: 'text',
      title: 'Você usa algum medicamento com regularidade?',
      // Este campo existe por causa dos análogos de GLP-1: quem usa Ozempic
      // escreve o nome do remédio aqui, e a perda acelerada de massa magra
      // muda a prescrição de força. Ninguém marcaria essa caixa numa lista.
      hint: 'Escreva o nome. Se não usa nenhum, é só pular.',
      optional: true,
    };
  }

  if (!answered(answers, 'pregnant')) {
    return {
      id: 'pregnant',
      kind: 'yesno',
      clinical: true,
      title: 'Você está grávida ou teve bebê nos últimos seis meses?',
      options: YES_NO,
    };
  }

  if (!answered(answers, 'injuries')) {
    return {
      id: 'injuries',
      kind: 'text',
      title: 'Alguma lesão que ainda te limita?',
      hint: 'Escreva onde e o que dói. Vai definir o que fica fora do seu treino.',
      optional: true,
    };
  }

  // ---- Corpo e experiência ---------------------------------------------

  if (!answered(answers, 'weightKg')) {
    return {
      id: 'weightKg',
      kind: 'number',
      unit: 'kg',
      title: 'Quanto você pesa hoje?',
      // Com a altura, deriva o IMC — e IMC a partir de 30 muda a escolha de
      // exercício (menos impacto, mais máquina) e a progressão de carga.
      hint: 'Aproximado está bom.',
    };
  }

  if (!answered(answers, 'heightCm')) {
    return { id: 'heightCm', kind: 'number', unit: 'cm', title: 'E sua altura?' };
  }

  if (!answered(answers, 'experience')) {
    return {
      id: 'experience',
      kind: 'single',
      title: 'Como é sua experiência com treino de força?',
      // Calibra a complexidade técnica. Quem nunca treinou não recebe
      // agachamento livre com barra na primeira semana.
      hint: 'Vale o que você realmente já fez, não o que gostaria de fazer.',
      options: [
        { value: 'iniciante', label: 'Nunca treinei, ou faz muito tempo' },
        { value: 'intermediario', label: 'Já treinei com constância' },
        { value: 'avancado', label: 'Treino há anos, sem interrupção longa' },
      ],
    };
  }

  if (!answered(answers, 'daysPerWeek')) {
    return {
      id: 'daysPerWeek',
      kind: 'single',
      title: 'Quantos dias por semana dá para treinar?',
      hint: 'Conte os dias que cabem de verdade na sua semana.',
      options: [2, 3, 4, 5, 6].map((d) => ({ value: d, label: `${d} dias` })),
    };
  }

  if (!answered(answers, 'minutesPerSession')) {
    return {
      id: 'minutesPerSession',
      kind: 'single',
      title: 'Quanto tempo você tem por sessão?',
      // Define o volume. Com pouco tempo, o alongamento encolhe antes do
      // estímulo principal — nunca o contrário.
      hint: 'Do aquecimento ao fim.',
      options: [
        { value: 30, label: '30 minutos' },
        { value: 45, label: '45 minutos' },
        { value: 60, label: '1 hora' },
        { value: 90, label: '1h30 ou mais' },
      ],
    };
  }

  if (!answered(answers, 'equipment')) {
    return {
      id: 'equipment',
      kind: 'single',
      title: 'O que você tem à disposição?',
      // Restringe o catálogo na prática: prescrever leg press para quem treina
      // na sala de casa é um treino que não acontece.
      options: [
        { value: 'academia completa', label: 'Academia completa' },
        { value: 'halteres e banco', label: 'Halteres e banco em casa' },
        { value: 'elásticos e peso corporal', label: 'Elásticos e peso do corpo' },
        { value: 'apenas peso corporal', label: 'Só o peso do corpo' },
      ],
    };
  }

  if (!answered(answers, 'notes')) {
    return {
      id: 'notes',
      kind: 'text',
      title: 'Mais alguma coisa que a gente deveria saber?',
      hint: 'Qualquer coisa que mude o seu treino.',
      optional: true,
    };
  }

  return null;
}

/**
 * Quantas perguntas faltam, para a barra de progresso.
 *
 * Simula o grafo até o fim em vez de contar um total fixo — o caminho de quem
 * marcou uma condição é mais longo, e uma barra que anda para trás é pior que
 * nenhuma barra.
 */
export function remainingCount(answers: Anamnesis): number {
  let simulated = answers;
  let count = 0;
  // Teto de segurança: um grafo com ciclo travaria a tela em vez de errar.
  while (count < 40) {
    const question = nextQuestion(simulated);
    if (!question) break;
    count += 1;
    simulated = setAt(simulated, question.id, question.optional ? null : placeholder(question));
  }
  return count;
}

function placeholder(question: Question): unknown {
  switch (question.kind) {
    case 'yesno':
      return false;
    case 'multi':
      return [];
    case 'number':
      return 0;
    case 'single':
      return question.options?.[0]?.value ?? null;
    default:
      return '';
  }
}

/**
 * As respostas que, sozinhas, já implicam encaminhamento.
 *
 * Espelha `services/workout/risk-tier.ts` no servidor. Existe aqui para a tela
 * poder ser honesta no fim da anamnese em vez de prometer um treino e voltar
 * com uma recusa — mas **quem decide é o servidor**. Esta função nunca libera
 * nada; ela só antecipa a má notícia.
 */
export function impliesReferral(answers: Anamnesis): boolean {
  const parq = answers.parq ?? {};
  return Boolean(
    parq.heartCondition ||
      parq.chestPain ||
      parq.dizziness ||
      answers.pregnant ||
      (answers.conditions ?? []).includes('cardiopatia'),
  );
}
