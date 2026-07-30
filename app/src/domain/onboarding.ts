/**
 * Onboarding — perguntas que se ramificam pelo que já foi respondido.
 *
 * Não é um formulário com todos os campos na tela. Três razões, e as três
 * mudam o resultado:
 *
 * 1. **Pergunta sem consequência não é feita.** Quem responde "não pratico
 *    atividade física" nunca vê "em que dias você treina". Um formulário fixo
 *    mostraria os dois e ensinaria a pessoa a ignorar campos.
 * 2. **O enunciado cita a resposta anterior.** "Você disse que trabalha
 *    sentado. Quantas horas seguidas?" prova que o app está ouvindo — e é a
 *    diferença entre um questionário e uma conversa.
 * 3. **Cada campo aqui altera uma recomendação concreta**, e o comentário de
 *    cada pergunta diz qual. Se alguém acrescentar uma pergunta sem conseguir
 *    escrever esse comentário, ela não deveria existir.
 *
 * O grafo é dado, não código espalhado por telas: dá para testar o caminho
 * inteiro sem montar um único componente.
 */

export type Posture = 'sitting' | 'standing' | 'alternating' | 'moving';
export type Schedule = 'business' | 'shifts' | 'night' | 'flexible';
export type Frequency = 'regular' | 'sometimes' | 'none';

export type Lifestyle = {
  occupation?: string;
  workPosture?: Posture;
  postureHours?: number;
  workSchedule?: Schedule;
  bedtime?: number;
  exercises?: Frequency;
  blocker?: string;
  activities?: string[];
  trainDays?: number[];
  trainPeriod?: string;
  trainPlace?: string;
  goal?: string;
};

export type Option = { value: string | number; label: string; detail?: string };

export type Question = {
  id: keyof Lifestyle;
  kind: 'text' | 'single' | 'multi' | 'weekdays' | 'hours';
  /** O enunciado, já resolvido com as respostas anteriores. */
  title: string;
  hint?: string;
  options?: Option[];
  /** Pergunta que a pessoa pode pular sem travar o fluxo. */
  optional?: boolean;
};

export const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

const POSTURE_LABEL: Record<Posture, string> = {
  sitting: 'sentado',
  standing: 'em pé',
  alternating: 'alternando',
  moving: 'em movimento',
};

/** Modalidades comuns. Texto livre também é aceito na tela. */
const ACTIVITIES = [
  'musculação',
  'corrida',
  'caminhada',
  'ciclismo',
  'natação',
  'futebol',
  'crossfit',
  'yoga',
  'pilates',
  'luta',
  'dança',
];

/** Modalidades de alto impacto — mudam a leitura de recuperação no dia seguinte. */
export const HIGH_IMPACT = new Set(['corrida', 'futebol', 'crossfit', 'luta']);

/**
 * A próxima pergunta, ou `null` quando o fluxo acabou.
 *
 * Ordem deliberada: trabalho antes de treino. Todo mundo trabalha de alguma
 * forma, então as primeiras perguntas nunca caem no vazio; começar por treino
 * faria quem não pratica sentir que o app não é para ele logo na terceira tela.
 */
export function nextQuestion(answers: Lifestyle): Question | null {
  const posture = answers.workPosture;

  if (answers.occupation === undefined) {
    return {
      id: 'occupation',
      kind: 'text',
      title: 'O que você faz da vida?',
      hint: 'Serve para o app entender o tipo de desgaste do seu dia. Pode ser informal.',
    };
  }

  // Muda a meta de passos e o aviso de movimento. Quem passa o dia sentado tem
  // risco diferente de quem passa em pé — e nenhum dos dois é "sedentário" pela
  // contagem de passos sozinha.
  if (posture === undefined) {
    return {
      id: 'workPosture',
      kind: 'single',
      title: `Como é o corpo no seu dia como ${short(answers.occupation)}?`,
      hint: 'Postura predominante nas horas de trabalho.',
      options: [
        { value: 'sitting', label: 'Sentado quase o tempo todo' },
        { value: 'standing', label: 'Em pé quase o tempo todo' },
        { value: 'alternating', label: 'Alterno bastante' },
        { value: 'moving', label: 'Em movimento o tempo todo' },
      ],
    };
  }

  // Só faz sentido para quem fica parado numa posição. Quem se move o dia
  // inteiro não tem "horas seguidas" a informar, e a pergunta soaria absurda.
  if (answers.postureHours === undefined && (posture === 'sitting' || posture === 'standing')) {
    return {
      id: 'postureHours',
      kind: 'hours',
      title:
        posture === 'sitting'
          ? 'Quantas horas seguidas você costuma ficar sentado?'
          : 'Quantas horas por dia você fica em pé?',
      hint:
        posture === 'sitting'
          ? 'Sem se levantar de verdade — ir ao banheiro não conta como pausa.'
          : 'Somando o dia todo, mesmo com pausas curtas.',
      options: [2, 4, 6, 8, 10].map((h) => ({ value: h, label: `${h}h`, detail: h >= 8 ? 'ou mais' : undefined })),
    };
  }

  // A entrada mais decisiva do perfil inteiro: turno noturno desloca o ritmo
  // circadiano, e aplicar a curva padrão a essa pessoa erra em toda hora do dia.
  if (answers.workSchedule === undefined) {
    return {
      id: 'workSchedule',
      kind: 'single',
      title: 'Como é o seu horário?',
      hint: 'É o que mais muda a curva de energia que o app projeta.',
      options: [
        { value: 'business', label: 'Comercial', detail: 'mais ou menos das 9h às 18h' },
        { value: 'shifts', label: 'Por turnos', detail: 'o horário muda de semana para semana' },
        { value: 'night', label: 'Noturno' },
        { value: 'flexible', label: 'Livre', detail: 'eu escolho quando começo' },
      ],
    };
  }

  // Perguntada só a quem tem horário irregular. Para o resto, o próprio sono
  // medido pelo wearable dá a resposta em sete noites, e perguntar seria pedir
  // um dado que já vamos ter.
  if (
    answers.bedtime === undefined &&
    (answers.workSchedule === 'night' || answers.workSchedule === 'shifts' || answers.workSchedule === 'flexible')
  ) {
    return {
      id: 'bedtime',
      kind: 'single',
      title: 'Que horas você costuma dormir?',
      hint: 'Com horário irregular, o app precisa de um ponto de partida antes de medir sete noites.',
      options: [
        { value: 22, label: 'Antes das 23h' },
        { value: 23.5, label: 'Entre 23h e meia-noite' },
        { value: 1, label: 'Entre meia-noite e 2h' },
        { value: 4, label: 'De madrugada' },
        { value: 9, label: 'De manhã', detail: 'durmo de dia' },
      ],
    };
  }

  if (answers.exercises === undefined) {
    return {
      id: 'exercises',
      kind: 'single',
      title: 'Você pratica atividade física?',
      options: [
        { value: 'regular', label: 'Sim, com regularidade' },
        { value: 'sometimes', label: 'De vez em quando' },
        { value: 'none', label: 'Não pratico' },
      ],
    };
  }

  // Quem não pratica sai por aqui. Insistir em "quais dias" com alguém que
  // acabou de dizer não é o jeito mais rápido de perder a pessoa.
  if (answers.exercises === 'none') {
    if (answers.blocker === undefined) {
      return {
        id: 'blocker',
        kind: 'single',
        title: 'O que mais atrapalha hoje?',
        hint: 'Sem julgamento — muda só o tipo de sugestão que o app faz.',
        options: [
          { value: 'tempo', label: 'Falta de tempo' },
          { value: 'disposição', label: 'Falta de disposição' },
          { value: 'lesão', label: 'Lesão ou dor' },
          { value: 'gosto', label: 'Não gosto de treinar' },
          { value: 'não sei', label: 'Não sei bem' },
        ],
      };
    }
    return goalQuestion(answers);
  }

  if (answers.activities === undefined) {
    return {
      id: 'activities',
      kind: 'multi',
      title: 'O que você pratica?',
      hint: 'Pode marcar mais de um, ou escrever o seu.',
      options: ACTIVITIES.map((a) => ({ value: a, label: a })),
    };
  }

  if (answers.trainDays === undefined) {
    return {
      id: 'trainDays',
      kind: 'weekdays',
      title: `Em que dias você ${verbFor(answers.activities)}?`,
      hint: 'Nos dias de treino o app muda a recomendação: a janela boa passa a ser protegida.',
    };
  }

  if (answers.trainPeriod === undefined) {
    return {
      id: 'trainPeriod',
      kind: 'single',
      title: 'Em que horário, normalmente?',
      hint: 'O app compara a energia projetada nesse horário com o resto do seu dia.',
      options: [
        { value: 'manhã', label: 'De manhã' },
        { value: 'almoço', label: 'No horário do almoço' },
        { value: 'tarde', label: 'À tarde' },
        { value: 'noite', label: 'À noite' },
        { value: 'varia', label: 'Varia bastante' },
      ],
    };
  }

  if (answers.trainPlace === undefined) {
    return {
      id: 'trainPlace',
      kind: 'single',
      title: 'Onde?',
      options: [
        { value: 'academia', label: 'Academia' },
        { value: 'casa', label: 'Em casa' },
        { value: 'ar livre', label: 'Ao ar livre', detail: 'rua, parque, praia' },
        { value: 'clube', label: 'Clube ou quadra' },
      ],
      optional: true,
    };
  }

  return goalQuestion(answers);
}

function goalQuestion(answers: Lifestyle): Question | null {
  if (answers.goal !== undefined) return null;
  return {
    id: 'goal',
    kind: 'single',
    title: 'O que você mais quer melhorar?',
    hint: 'Define o que o app coloca em primeiro plano.',
    options: [
      { value: 'energia', label: 'Energia no trabalho' },
      { value: 'sono', label: 'Qualidade do sono' },
      { value: 'condicionamento', label: 'Condicionamento físico' },
      { value: 'estresse', label: 'Controle do estresse' },
      { value: 'longevidade', label: 'Longevidade' },
    ],
  };
}

/**
 * Quantas perguntas faltam, para a barra de progresso.
 *
 * É estimativa, e a tela precisa dizer isso: o caminho de quem não treina tem
 * quatro perguntas a menos, e prometer um número exato que depois encolhe é
 * pior que assumir a incerteza.
 */
export function progressOf(answers: Lifestyle): { answered: number; estimatedTotal: number } {
  const answered = Object.values(answers).filter((v) => v !== undefined).length;

  let total = 5; // ocupação, postura, horário, prática, objetivo
  const posture = answers.workPosture;
  if (posture === 'sitting' || posture === 'standing') total++;
  if (answers.workSchedule && answers.workSchedule !== 'business') total++;
  if (answers.exercises === 'none') total++;
  else if (answers.exercises) total += 4;

  return { answered, estimatedTotal: Math.max(total, answered) };
}

/**
 * O resumo do fim, em primeira pessoa.
 *
 * Devolver o que foi entendido é o que transforma o onboarding em algo que a
 * pessoa confere, em vez de um formulário que ela preencheu e esqueceu. Se a
 * frase soar errada, ela percebe na hora — e ainda dá para voltar.
 */
export function summarize(answers: Lifestyle): string[] {
  const lines: string[] = [];

  if (answers.occupation) {
    const posture = answers.workPosture ? ` e passa o dia ${POSTURE_LABEL[answers.workPosture]}` : '';
    lines.push(`Você trabalha como ${short(answers.occupation)}${posture}.`);
  }

  if (answers.workSchedule === 'night') {
    lines.push('Seu turno é noturno, então a curva de energia do app já nasce deslocada para o seu relógio.');
  } else if (answers.workSchedule === 'shifts') {
    lines.push('Como seu horário muda de semana para semana, a projeção vai se ajustar conforme o sono for medido.');
  }

  if (answers.postureHours && answers.workPosture === 'sitting' && answers.postureHours >= 6) {
    lines.push(`São ${answers.postureHours} horas seguidas sentado — o app vai lembrar de quebrar esse bloco.`);
  }

  if (answers.exercises === 'none') {
    lines.push('Você não treina hoje, então as sugestões começam pelo que cabe na sua rotina.');
  } else if (answers.activities?.length && answers.trainDays?.length) {
    const dias = answers.trainDays.map((d) => WEEKDAYS[d]).join(', ');
    const periodo = answers.trainPeriod && answers.trainPeriod !== 'varia' ? ` ${periodPhrase(answers.trainPeriod)}` : '';
    lines.push(`Treina ${answers.activities.join(' e ')}${periodo}, em ${dias}.`);
  }

  return lines;
}

const periodPhrase = (period: string) =>
  period === 'almoço' ? 'no horário do almoço' : period === 'manhã' ? 'de manhã' : `à ${period}`;

/** Concorda o verbo com a modalidade, para a pergunta não soar automática. */
function verbFor(activities?: string[]): string {
  if (!activities?.length) return 'treina';
  const first = activities[0];
  if (first === 'corrida') return 'corre';
  if (first === 'caminhada') return 'caminha';
  if (first === 'natação') return 'nada';
  if (first === 'ciclismo') return 'pedala';
  if (first === 'dança') return 'dança';
  return 'treina';
}

/** Encurta a ocupação para caber num enunciado sem virar parágrafo. */
function short(occupation?: string): string {
  const value = (occupation ?? '').trim();
  if (!value) return 'profissional';
  return value.length > 28 ? `${value.slice(0, 28).trimEnd()}…` : value.toLowerCase();
}
