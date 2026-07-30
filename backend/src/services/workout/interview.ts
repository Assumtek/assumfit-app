/**
 * O roteiro da anamnese conversacional.
 *
 * ## Por que grafo, e não o modelo conduzindo
 *
 * O MUVX deixa o agente conduzir a entrevista. Aqui as perguntas são
 * determinísticas, e a escolha é sobre RESPONSABILIDADE: estas respostas
 * decidem o tier de risco, e o tier decide se a pessoa recebe prescrição
 * automática ou encaminhamento clínico. Um modelo que pula a pergunta de dor no
 * peito porque a conversa fluiu para outro lado produz um plano que nunca
 * deveria ter existido — e a falha é invisível, porque o texto continua
 * plausível.
 *
 * O modelo entra depois, para GERAR o treino a partir de respostas completas.
 * Antes disso, o roteiro é o contrato.
 *
 * ## O perfil de rotina foi absorvido
 *
 * Turno, postura e dias de treino eram uma segunda entrevista, em outra tela,
 * com outro fluxo. Duas entrevistas para gerar um treino é atrito puro: quem
 * responde não distingue "anamnese" de "perfil de rotina", e nós tratávamos as
 * duas como coisas diferentes só porque nasceram em momentos diferentes.
 */

export type QuestionType = 'TEXT' | 'NUMBER' | 'MULTIPLE_CHOICE' | 'YES_NO';

export type Question = {
  id: string;
  /** Como o assistente pergunta. É a fala, não o rótulo do campo. */
  ask: string;
  /** Rótulo curto, usado na tela de revisão. */
  label: string;
  type: QuestionType;
  options?: string[];
  required: boolean;
  /**
   * Quando a pergunta se aplica.
   *
   * É o que faz a entrevista ramificar: quem não pratica atividade nunca vê
   * "em que dias você treina". Ausente significa "sempre".
   */
  when?: (answers: Answers) => boolean;
};

export type Answers = Record<string, string>;

const SIM_NAO = ['Sim', 'Não'];
const sim = (a: Answers, id: string) => a[id] === 'Sim';

/**
 * O roteiro, na ordem em que é perguntado.
 *
 * PAR-Q primeiro, e não por formalidade: são as sete perguntas que decidem
 * encaminhamento, e perguntá-las no fim significaria conduzir uma entrevista
 * inteira para descobrir no último passo que ela não podia ter acontecido.
 */
export const QUESTIONS: Question[] = [
  /*
   A abertura vem antes de tudo, e é aberta de propósito: a primeira coisa que
   a pessoa faz é FALAR. A extração preenche o que já veio aqui.
  */
  {
    id: 'opening',
    ask: 'Pra começar, me conta um pouco de você: como anda sua saúde, e o que você quer alcançar com o treino?',
    label: 'Abertura',
    type: 'TEXT',
    required: true,
  },

  /*
   A ORDEM é a do template do MUVX: corpo → atividade → saúde → hábitos →
   objetivo → experiência → estrutura → PAR-Q → cuidados finais. Rapport antes
   de clínica. Idade e sexo NÃO são perguntados (vêm do cadastro, como lá), e
   sono, estresse e água também não — a pulseira MEDE os três, e perguntar o
   que se mede seria pedir à pessoa um dado pior do que o que já temos.
  */
  { id: 'weightKg', ask: 'Qual é o seu peso atual, em quilogramas?', label: 'Peso (kg)', type: 'NUMBER', required: false },
  { id: 'heightCm', ask: 'E a sua altura, em centímetros?', label: 'Altura (cm)', type: 'NUMBER', required: false },

  {
    id: 'praticaEsporte',
    ask: 'Você pratica algum esporte ou outra atividade física além do treino?',
    label: 'Pratica outro esporte',
    type: 'YES_NO',
    options: SIM_NAO,
    required: false,
  },
  {
    id: 'qualEsporte',
    ask: 'Qual atividade você pratica?',
    label: 'Qual atividade',
    type: 'MULTIPLE_CHOICE',
    options: ['Corrida', 'Ciclismo', 'Natação', 'Futebol', 'Lutas', 'Crossfit', 'Tênis ou padel', 'Vôlei ou basquete', 'Yoga ou pilates', 'Dança', 'Outra'],
    required: false,
    when: (a) => sim(a, 'praticaEsporte'),
  },
  {
    id: 'freqEsporte',
    ask: 'Com que frequência você pratica essa atividade?',
    label: 'Frequência do esporte',
    type: 'MULTIPLE_CHOICE',
    options: ['1 vez por semana', '2 vezes por semana', '3 vezes por semana', '4 vezes ou mais'],
    required: false,
    when: (a) => sim(a, 'praticaEsporte'),
  },

  {
    id: 'conditions',
    ask: 'Você tem alguma condição de saúde diagnosticada?',
    label: 'Condições de saúde',
    type: 'MULTIPLE_CHOICE',
    options: ['Nenhuma', 'Diabetes', 'Hipertensão', 'Cardiopatia', 'Asma', 'Obesidade', 'Problema de tireoide', 'Outra'],
    required: true,
  },
  {
    id: 'condicaoControlada',
    ask: 'Essa condição está controlada — com acompanhamento ou medicação?',
    label: 'Condição controlada',
    type: 'YES_NO',
    options: SIM_NAO,
    required: true,
    when: (a) => a.conditions !== undefined && a.conditions !== 'Nenhuma',
  },
  {
    id: 'medications',
    ask: 'Usa algum medicamento de forma contínua? Pode escrever ou ditar.',
    label: 'Medicamentos de uso contínuo',
    type: 'TEXT',
    required: false,
  },
  {
    id: 'injuries',
    ask: 'Você tem ou já teve alguma lesão? Me conta como foi.',
    label: 'Lesões',
    type: 'TEXT',
    required: false,
  },
  {
    id: 'cirurgias',
    ask: 'Já passou por alguma cirurgia? Qual?',
    label: 'Cirurgias',
    type: 'TEXT',
    required: false,
  },

  {
    id: 'fuma',
    ask: 'Você fuma?',
    label: 'Fumo',
    type: 'YES_NO',
    options: SIM_NAO,
    required: false,
  },
  {
    id: 'alcool',
    ask: 'Com que frequência você consome bebida alcoólica?',
    label: 'Álcool',
    type: 'MULTIPLE_CHOICE',
    options: ['Não bebo', 'Socialmente', 'Toda semana', 'Quase todo dia'],
    required: false,
  },
  {
    id: 'alimentacao',
    ask: 'Como é a sua alimentação hoje?',
    label: 'Alimentação',
    type: 'MULTIPLE_CHOICE',
    options: ['Como de tudo, sem controle', 'Tento comer bem', 'Sigo uma dieta', 'Faço acompanhamento nutricional'],
    required: false,
  },

  {
    id: 'goal',
    ask: 'Qual é o seu principal objetivo com o treino?',
    label: 'Objetivo',
    type: 'MULTIPLE_CHOICE',
    options: ['Ganhar massa', 'Perder peso', 'Mais energia no dia', 'Saúde e manutenção', 'Melhorar o sono'],
    required: true,
  },
  {
    id: 'regiaoPrioritaria',
    ask: 'Tem alguma região do corpo que você quer priorizar?',
    label: 'Região prioritária',
    type: 'MULTIPLE_CHOICE',
    options: ['Não, corpo todo', 'Membros superiores', 'Membros inferiores', 'Glúteos', 'Abdômen e core', 'Costas'],
    required: false,
  },
  {
    id: 'motivacao',
    ask: 'O que te motiva a treinar neste momento?',
    label: 'Motivação',
    type: 'TEXT',
    required: false,
  },

  {
    id: 'experience',
    ask: 'Qual é o seu nível de experiência com treinos?',
    label: 'Experiência',
    type: 'MULTIPLE_CHOICE',
    options: ['Nunca treinei', 'Já treinei, mas parei', 'Treino há menos de um ano', 'Treino há mais de um ano'],
    required: true,
  },

  {
    id: 'trainPlace',
    ask: 'Onde você prefere treinar?',
    label: 'Local do treino',
    type: 'MULTIPLE_CHOICE',
    options: ['Academia', 'Em casa, com equipamento', 'Em casa, sem equipamento', 'Ao ar livre'],
    required: true,
  },
  {
    id: 'estrutura',
    ask: 'Qual opção descreve melhor a estrutura do seu local de treino?',
    label: 'Estrutura do local',
    type: 'MULTIPLE_CHOICE',
    options: ['Completa, com máquinas e pesos', 'Básica, halteres e elásticos', 'Só o peso do corpo'],
    required: true,
  },
  {
    id: 'horario',
    ask: 'Em qual horário você costuma treinar?',
    label: 'Horário do treino',
    type: 'MULTIPLE_CHOICE',
    options: ['De manhã', 'Na hora do almoço', 'À tarde', 'À noite', 'Varia'],
    required: false,
  },
  {
    id: 'daysPerWeek',
    ask: 'Quantos dias por semana você quer treinar, com sinceridade?',
    label: 'Dias por semana',
    type: 'MULTIPLE_CHOICE',
    options: ['2', '3', '4', '5', '6'],
    required: true,
  },
  {
    id: 'minutesPerSession',
    ask: 'Quanto tempo você tem disponível por treino?',
    label: 'Tempo por treino',
    type: 'MULTIPLE_CHOICE',
    options: ['30 minutos', '45 minutos', '1 hora', 'Mais de 1 hora'],
    required: true,
  },
  {
    id: 'shift',
    ask: 'Como é o seu turno de trabalho?',
    label: 'Turno',
    type: 'MULTIPLE_CHOICE',
    options: ['Comercial', 'Começo muito cedo', 'Vespertino', 'Noturno', 'Escala variável'],
    required: true,
  },
  {
    id: 'posture',
    ask: 'No trabalho, você passa mais tempo sentado ou em pé?',
    label: 'Postura no trabalho',
    type: 'MULTIPLE_CHOICE',
    options: ['Sentado a maior parte', 'Em pé a maior parte', 'Me movimento bastante'],
    required: true,
  },

  /*
   PAR-Q perto do FIM, como no template do MUVX. A posição não muda segurança
   nenhuma — o encaminhamento é decidido na finalização, com todas as respostas
   na mão — e clínica depois de rapport responde melhor que clínica na cara.
  */
  {
    id: 'heartCondition',
    ask: 'Agora umas rápidas de segurança. Algum médico já disse que você tem um problema cardíaco e que só deveria fazer atividade física supervisionado?',
    label: 'Problema cardíaco diagnosticado',
    type: 'YES_NO',
    options: SIM_NAO,
    required: true,
  },
  {
    id: 'chestPain',
    ask: 'Você sente dor no peito quando faz atividade física?',
    label: 'Dor no peito ao se exercitar',
    type: 'YES_NO',
    options: SIM_NAO,
    required: true,
  },
  {
    id: 'chestPainRest',
    ask: 'E no último mês, sentiu dor no peito mesmo sem estar se exercitando?',
    label: 'Dor no peito em repouso',
    type: 'YES_NO',
    options: SIM_NAO,
    required: true,
    when: (a) => sim(a, 'chestPain'),
  },
  {
    id: 'dizziness',
    ask: 'Você perde o equilíbrio por tontura ou já perdeu a consciência?',
    label: 'Tontura ou desmaio',
    type: 'YES_NO',
    options: SIM_NAO,
    required: true,
  },
  {
    id: 'boneJoint',
    ask: 'Tem algum problema de osso ou articulação que possa piorar com atividade física?',
    label: 'Problema ósseo ou articular',
    type: 'YES_NO',
    options: SIM_NAO,
    required: true,
  },
  {
    id: 'boneJointWhere',
    ask: 'Onde, e o que costuma incomodar?',
    label: 'Onde é o problema articular',
    type: 'TEXT',
    required: true,
    when: (a) => sim(a, 'boneJoint'),
  },
  {
    id: 'bloodPressureMed',
    ask: 'Você toma algum medicamento para pressão ou para o coração?',
    label: 'Medicamento para pressão ou coração',
    type: 'YES_NO',
    options: SIM_NAO,
    required: true,
  },
  {
    id: 'pregnant',
    ask: 'Você está grávida, ou teve bebê nos últimos meses?',
    label: 'Gestação',
    type: 'YES_NO',
    options: SIM_NAO,
    required: true,
    // O sexo vem do CADASTRO, semeado na conversa como `_sexo` — não é
    // pergunta. Fazer esta a um homem seria o formulário mostrando que não
    // sabe com quem fala.
    when: (a) => a._sexo === 'f',
  },
  {
    id: 'otherReason',
    ask: 'Existe algum outro motivo pelo qual você não deveria fazer atividade física?',
    label: 'Outro impedimento',
    type: 'YES_NO',
    options: SIM_NAO,
    required: true,
  },
  {
    id: 'otherReasonWhich',
    ask: 'Qual?',
    label: 'Qual outro impedimento',
    type: 'TEXT',
    required: true,
    when: (a) => sim(a, 'otherReason'),
  },

  {
    id: 'cuidadoEspecial',
    ask: 'Alguma região do seu corpo precisa de cuidado especial no treino?',
    label: 'Cuidado especial',
    type: 'TEXT',
    required: false,
  },
  {
    id: 'observacaoFinal',
    ask: 'Para terminar: tem mais alguma coisa que eu deva considerar ao montar o seu plano?',
    label: 'Observações finais',
    type: 'TEXT',
    required: false,
  },
];

/**
 * Compara resposta digitada com as opções da pergunta, com tolerância.
 *
 * O rodapé é SEMPRE um campo de texto — quem prefere digitar "sim" a tocar no
 * chip não pode ser rejeitado por causa de caixa ou acento. Devolve a opção
 * CANÔNICA, porque é ela que o resto do sistema compara por igualdade.
 */
export function matchOption(question: Question, valor: string): string | null {
  if (!question.options) return valor;
  const norm = (t: string) =>
    t
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();
  const alvo = norm(valor);
  return question.options.find((o) => norm(o) === alvo) ?? null;
}

/** A próxima pergunta sem resposta que se aplica ao que já foi dito. */
export function nextQuestion(answers: Answers): Question | null {
  for (const q of QUESTIONS) {
    if (q.when && !q.when(answers)) continue;
    if (answers[q.id] === undefined) return q;
  }
  return null;
}

/** Quantas perguntas aplicáveis existem, dado o que já foi respondido. */
export function applicable(answers: Answers): Question[] {
  return QUESTIONS.filter((q) => !q.when || q.when(answers));
}

/**
 * Progresso de 0 a 1.
 *
 * O denominador é o número de perguntas APLICÁVEIS agora, e ele muda conforme a
 * conversa ramifica. É por isso que a barra pode andar mais rápido de repente:
 * responder "não" a uma pergunta com desdobramento remove os filhos dela do
 * total. Preferimos isso a um denominador fixo que promete dezoito e entrega
 * doze.
 */
export function progressOf(answers: Answers): number {
  const total = applicable(answers).length;
  // `_sexo` é semente do cadastro, não resposta — fora da conta.
  if (total === 0) return 1;
  const respondidas = applicable(answers).filter((q) => answers[q.id] !== undefined).length;
  return respondidas / total;
}

export function isComplete(answers: Answers): boolean {
  return applicable(answers).every((q) => !q.required || answers[q.id] !== undefined);
}

/** As respostas prontas para a revisão, na ordem do roteiro. */
export function reviewFields(answers: Answers) {
  return applicable(answers)
    .filter((q) => answers[q.id] !== undefined)
    .map((q, i) => ({
      questionId: q.id,
      label: q.label,
      type: q.type,
      value: answers[q.id],
      options: q.options ?? null,
      order: i,
    }));
}
