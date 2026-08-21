import { AnamnesisConversationStatus, type Prisma } from '@prisma/client';

import { badRequest, notFound } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import { extract } from './agent.client';
import { deriveFlags, parseAnamnesis } from './context-builder';
import {
  applicable,
  isComplete,
  matchOption,
  nextQuestion,
  progressOf,
  QUESTIONS,
  reviewFields,
  type Answers,
} from './interview';

/** As perguntas que a extração jamais preenche — sempre perguntadas na cara. */
const PARQ_IDS = new Set([
  'heartCondition',
  'chestPain',
  'chestPainRest',
  'dizziness',
  'boneJoint',
  'boneJointWhere',
  'bloodPressureMed',
  'otherReason',
  'otherReasonWhich',
]);

/**
 * A anamnese conversacional — uma pergunta por vez, com estado no servidor.
 *
 * Substitui as duas entrevistas que existiam (anamnese em formulário e "perfil
 * de rotina" em outra tela). Quem responde não distinguia as duas; nós as
 * tratávamos como coisas diferentes só porque nasceram em momentos diferentes.
 *
 * ## O servidor guarda o estado, e isso não é preguiça de cliente
 *
 * São dezoito perguntas que ramificam. Fechar o app no meio tem que voltar de
 * onde parou, e guardar no aparelho perderia a entrevista na primeira troca de
 * celular — que é justamente quando alguém está começando a usar o produto.
 *
 * ## O ditado é do TECLADO
 *
 * Não há gravação nem transcrição nossa. O campo de texto é um campo de texto, e
 * quem quiser falar em vez de digitar usa o microfone do teclado do sistema. É a
 * mesma resposta em `TEXT`, e não precisa de infraestrutura nenhuma para
 * existir — nem de um serviço a mais por onde dado de saúde passe.
 */

type Turno = {
  role: 'ASSISTANT' | 'STUDENT';
  type: 'TEXT' | 'OPTION';
  content: string;
  questionId: string | null;
  at: string;
};

export type ConversationState = {
  id: string;
  status: AnamnesisConversationStatus;
  messages: Turno[];
  pendingQuestion: {
    questionId: string;
    type: string;
    label: string;
    ask: string;
    options: string[] | null;
    isRequired: boolean;
  } | null;
  filledFields: ReturnType<typeof reviewFields>;
  progress: number;
  readyToFinalize: boolean;
};

/**
 * A abertura, portada do orquestrador do MUVX — com o nome da pessoa.
 *
 * Três coisas que o texto de lá acerta e este preserva: pede TUDO numa fala só
 * (objetivo, rotina, saúde), diz que pode falar "do seu jeito", e explica o
 * ganho — quanto mais contar agora, menos perguntas depois. É a promessa que a
 * extração cumpre. A diferença é o canal do ditado: lá é áudio deles; aqui é o
 * microfone do teclado do sistema.
 */
/**
 * A abertura de quem JÁ respondeu uma vez.
 *
 * As respostas anteriores entram semeadas; a entrevista repete só o PAR-Q — as
 * nove clínicas mudam de verdade (dor nova, gestação, remédio novo) e levam um
 * minuto de chips. O resto a pessoa confere na revisão, e o que ela contar de
 * novo na abertura SOBRESCREVE o que estava guardado, pela mesma extração.
 */
function aberturaDeRetorno(firstName: string | null): string {
  const oi = firstName ? `Oi de novo, ${firstName}!` : 'Oi de novo!';
  return (
    `${oi}\n\n` +
    'Suas respostas da última anamnese estão guardadas — não precisa preencher tudo de novo. ' +
    'Me conta o que MUDOU desde então: objetivo, rotina, alguma dor ou condição nova.\n\n' +
    'Depois eu só reconfirmo as perguntas de segurança, e o resto você revisa antes de enviar.'
  );
}

function abertura(firstName: string | null): string {
  const oi = firstName ? `Oi, ${firstName}! Que bom te ter por aqui.` : 'Oi! Que bom te ter por aqui.';
  return (
    `${oi}\n\n` +
    'Antes de montar seu treino, quero te conhecer de verdade. Me conta com suas palavras: ' +
    'o que você busca, como é sua rotina hoje, e se tem alguma lesão ou condição de saúde ' +
    'que eu precise saber.\n\n' +
    'Fica à vontade pra falar tudo de uma vez, do seu jeito — pode escrever ou ditar pelo ' +
    'microfone do teclado. Quanto mais você me contar agora, menos perguntas eu faço depois.'
  );
}

/**
 * Começa, ou devolve a que já estava em andamento.
 *
 * Reaproveitar em vez de criar outra é o que evita duas entrevistas
 * simultâneas — e com elas duas respostas conflitantes para a mesma pergunta,
 * sem forma de saber qual vale.
 */
export async function startConversation(userId: string): Promise<ConversationState> {
  const emAndamento = await prisma.anamnesisConversation.findFirst({
    where: { userId, status: AnamnesisConversationStatus.ACTIVE },
    orderBy: { createdAt: 'desc' },
  });
  if (emAndamento) return montar(emAndamento);

  /*
   A abertura É a primeira pergunta — uma fala só, não um aviso seguido de
   pergunta. Duas mensagens seguidas do assistente na largada leem como
   robô limpando a garganta.
  */
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, sex: true },
  });
  const primeiroNome = user?.name.trim().split(/\s+/)[0] ?? null;
  /*
   `_sexo` é SEMENTE do cadastro, não pergunta. Ela existe para o roteiro poder
   ramificar (a pergunta de gestação só aparece para sexo feminino) sem
   perguntar o que o cadastro já sabe — perguntar sexo de novo seria o
   formulário mostrando que não conhece a própria conta.
  */
  const sementes: Answers = { _sexo: user?.sex ?? 'm' };

  /*
   Quem já completou uma entrevista não recomeça do zero.

   As respostas da última conversa concluída entram semeadas — MENOS o PAR-Q e
   a gestação, que são reconfirmados sempre: são as perguntas que mudam de
   verdade entre uma anamnese e outra, e reaproveitar um "não sinto dor" de
   três meses atrás seria assinar hoje um atestado antigo.
  */
  const anterior = await prisma.anamnesisConversation.findFirst({
    where: { userId, status: AnamnesisConversationStatus.COMPLETED },
    orderBy: { updatedAt: 'desc' },
  });
  const retorno = anterior !== null;
  if (anterior) {
    const antigas = (anterior.answers ?? {}) as Answers;
    for (const [id, valor] of Object.entries(antigas)) {
      if (id === 'opening' || id.startsWith('_') || PARQ_IDS.has(id) || id === 'pregnant') continue;
      sementes[id] = valor;
    }
  }

  const primeira = nextQuestion(sementes);
  const messages: Turno[] = [
    fala(retorno ? aberturaDeRetorno(primeiroNome) : abertura(primeiroNome), primeira?.id ?? null),
  ];

  const criada = await prisma.anamnesisConversation.create({
    data: {
      userId,
      answers: sementes as Prisma.InputJsonValue,
      messages: messages as unknown as Prisma.InputJsonValue,
    },
  });
  return montar(criada);
}

export async function getConversation(userId: string, id: string): Promise<ConversationState> {
  const achada = await prisma.anamnesisConversation.findFirst({ where: { id, userId } });
  if (!achada) throw notFound('Conversa não encontrada');
  return montar(achada);
}

/**
 * Registra a resposta e devolve o estado com a próxima pergunta.
 *
 * A resposta é validada contra a pergunta PENDENTE, não contra a que o cliente
 * diz estar respondendo. Sem isso, um cliente atrasado — ou um pedido repetido
 * pela rede — sobrescreveria uma resposta já dada com o valor de outra pergunta.
 */
export async function answerConversation(
  userId: string,
  id: string,
  valor: string,
): Promise<ConversationState> {
  const achada = await prisma.anamnesisConversation.findFirst({ where: { id, userId } });
  if (!achada) throw notFound('Conversa não encontrada');
  if (achada.status !== AnamnesisConversationStatus.ACTIVE) {
    throw badRequest('Esta conversa já foi finalizada');
  }

  const answers = (achada.answers ?? {}) as Answers;
  const pendente = nextQuestion(answers);
  if (!pendente) throw badRequest('Não há pergunta pendente — revise e finalize');

  /*
   Texto digitado vale tanto quanto chip tocado.

   O rodapé é sempre um campo de texto, como no MUVX — quem digita "sim" numa
   pergunta de opções não pode ser rejeitado por caixa ou acento. O que se
   guarda é a opção CANÔNICA, porque o resto do sistema compara por igualdade.
  */
  if (pendente.type === 'NUMBER' && valor.trim() !== '' && valor.trim() !== '—') {
    const n = Number(valor.trim().replace(',', '.'));
    // Peso de 500 kg ou altura de 3 cm é dedo escorregando, não medida — e o
    // BMI derivado disso viraria bandeira clínica falsa.
    if (!Number.isFinite(n) || n <= 0 || n > 400) {
      throw badRequest(`"${pendente.label}" precisa ser um número. Ex.: 70`);
    }
  }
  const canonico = matchOption(pendente, valor.trim());
  if (canonico === null) {
    throw badRequest(
      `Não entendi. Responda com uma das opções: ${(pendente.options ?? []).join(', ')}.`,
    );
  }
  if (pendente.required && canonico === '') {
    throw badRequest(`"${pendente.label}" é obrigatória`);
  }

  const novas: Answers = { ...answers, [pendente.id]: canonico };
  const messages = [...((achada.messages ?? []) as Turno[])];
  messages.push({
    role: 'STUDENT',
    type: pendente.options ? 'OPTION' : 'TEXT',
    content: canonico,
    questionId: pendente.id,
    at: new Date().toISOString(),
  });

  /*
   Depois da ABERTURA, a fala é processada e o que já foi dito vira resposta.

   É o desenho do MUVX (`AI_EXTRACTED`): quem contou "quero ganhar massa,
   treino em academia 4 vezes por semana" não ouve essas três perguntas de
   novo — a entrevista pergunta só o que faltou, e o assistente diz o que
   anotou, para a pessoa poder discordar ali mesmo.

   O PAR-Q NUNCA entra na lista extraível. "Minha saúde vai bem" não é resposta
   para "sente dor no peito ao se exercitar?" — inferir um "não" clínico de uma
   frase otimista é o erro que não aparece até machucar alguém. E extração cai
   para vazio em qualquer falha: acelerador, não portão.
  */
  if (pendente.id === 'opening') {
    /*
     Inclui perguntas JÁ respondidas (as sementes da anamnese anterior): quem
     abre dizendo "agora treino em casa" está corrigindo o que estava guardado,
     e ignorar isso obrigaria a achar o campo na revisão. O prompt só extrai o
     explícito, então semente sem menção nova fica intacta.
    */
    const extraiveis = applicable(novas)
      .filter((q) => !PARQ_IDS.has(q.id) && q.id !== 'opening' && q.id !== 'pregnant')
      .map((q) => ({ id: q.id, label: q.label, options: q.options ?? null }));
    const extraidas = await extract(canonico, extraiveis);

    const validas = Object.entries(extraidas).filter(([qid, v]) => {
      const pergunta = applicable(novas).find((q) => q.id === qid);
      // Só entra o que MUDA: repetir a semente igual viraria "já anotei" falso.
      return pergunta !== undefined && matchOption(pergunta, v) !== null && novas[qid] !== v;
    });
    if (validas.length > 0) {
      for (const [qid, v] of validas) novas[qid] = v;
      const rotulos = validas
        .map(([qid, v]) => {
          const pergunta = QUESTIONS.find((q) => q.id === qid);
          return `${pergunta?.label.toLowerCase() ?? qid}: ${v}`;
        })
        .join('; ');
      messages.push(
        fala(`Já anotei do que você contou — ${rotulos}. Se algo estiver errado, dá para corrigir na revisão.`, null),
      );
    }
  }

  const proxima = nextQuestion(novas);
  if (proxima) {
    messages.push(fala(proxima.ask, proxima.id));
  } else {
    messages.push(
      fala('Terminamos. Confira suas respostas abaixo antes de eu montar o treino.', null),
    );
  }

  const salva = await prisma.anamnesisConversation.update({
    where: { id },
    data: {
      answers: novas as Prisma.InputJsonValue,
      messages: messages as unknown as Prisma.InputJsonValue,
    },
  });
  return montar(salva);
}

/** Corrige uma resposta já dada, a partir da tela de revisão. */
export async function editAnswer(
  userId: string,
  id: string,
  questionId: string,
  valor: string,
): Promise<ConversationState> {
  const achada = await prisma.anamnesisConversation.findFirst({ where: { id, userId } });
  if (!achada) throw notFound('Conversa não encontrada');

  const answers = (achada.answers ?? {}) as Answers;
  if (answers[questionId] === undefined) throw badRequest('Esta pergunta ainda não foi respondida');

  /*
   Corrigir uma resposta pode REABRIR um ramo.

   Mudar "dor no peito" de não para sim faz aparecer a pergunta de repouso, que
   não existia. O estado volta a ter pergunta pendente, e a revisão deixa de
   estar pronta — o que é correto: a entrevista não estava completa, a gente só
   não sabia.
  */
  const novas: Answers = { ...answers, [questionId]: valor.trim() };
  const salva = await prisma.anamnesisConversation.update({
    where: { id },
    data: { answers: novas as Prisma.InputJsonValue },
  });
  return montar(salva);
}

/**
 * Fecha a entrevista: grava a anamnese e uma versão dela.
 *
 * As respostas de rotina vão para `LifestyleProfile` e as de saúde para
 * `HealthAnamnesis` — a divisão continua existindo no banco porque o agente lê
 * as duas de formas diferentes. O que deixou de existir é a divisão na CARA de
 * quem responde.
 */
export async function finalizeConversation(userId: string, id: string) {
  const achada = await prisma.anamnesisConversation.findFirst({ where: { id, userId } });
  if (!achada) throw notFound('Conversa não encontrada');

  const respostas = (achada.answers ?? {}) as Answers;
  if (!isComplete(respostas)) throw badRequest('Ainda faltam respostas obrigatórias');

  /*
   A tradução para o formato que o resto do sistema JÁ LÊ.

   O grafo da entrevista tem ids próprios ("Sim"/"Não", opções em português); o
   `parseAnamnesis` e o `deriveFlags` leem o formato do formulário antigo
   (`parq.heartCondition: boolean`, `conditions: ['hipertensao']`). Traduzir
   aqui — e não mudar o leitor — é o que mantém UM caminho de derivação de
   bandeira clínica no sistema inteiro. Dois leitores divergiriam em silêncio, e
   bandeira clínica é onde divergência vira plano gerado para quem não devia.
  */
  const anamnese = traduzirParaAnamnese(respostas);

  const [user, lifestyle] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { sex: true, birthDate: true } }),
    prisma.lifestyleProfile.findUnique({ where: { userId } }),
  ]);
  const flags = deriveFlags(parseAnamnesis(anamnese), {
    sex: user.sex,
    birthDate: user.birthDate,
    activities: lifestyle?.activities ?? [],
    trainDays: lifestyle?.trainDays ?? [],
    trainPlace: respostas.trainPlace ?? lifestyle?.trainPlace ?? null,
    goal: OBJETIVO[respostas.goal] ?? lifestyle?.goal ?? null,
    exercises: lifestyle?.exercises ?? null,
  });

  const estiloDeVida = {
    activities: respostas.qualEsporte ? [respostas.qualEsporte.toLowerCase()] : [],
    trainPeriod: respostas.horario ?? null,
    workPosture: POSTURA[respostas.posture] ?? null,
    workSchedule: TURNO[respostas.shift] ?? null,
    trainPlace: respostas.trainPlace ?? null,
    goal: OBJETIVO[respostas.goal] ?? null,
    // A entrevista concluída é o que destrava a home personalizada — é o mesmo
    // portão que o onboarding antigo fechava.
    completedAt: new Date(),
  };

  await prisma.$transaction([
    prisma.healthAnamnesis.upsert({
      where: { userId },
      create: { userId, answers: anamnese as Prisma.InputJsonObject },
      update: { answers: anamnese as Prisma.InputJsonObject },
    }),
    prisma.healthAnamnesisVersion.create({
      data: { userId, answers: anamnese as Prisma.InputJsonObject, flags },
    }),
    prisma.lifestyleProfile.upsert({
      where: { userId },
      create: { userId, ...estiloDeVida },
      update: estiloDeVida,
    }),
    prisma.anamnesisConversation.update({
      where: { id },
      data: { status: AnamnesisConversationStatus.COMPLETED },
    }),
  ]);

  return { answers: anamnese, conversationId: id };
}

const sim = (v: string | undefined) => v === 'Sim';

/** Opção da entrevista → slug que o `CONDITION_TO_FLAG` conhece. */
const CONDICAO: Record<string, string> = {
  Hipertensão: 'hipertensao',
  Diabetes: 'diabetes',
  Asma: 'asma',
};

const EXPERIENCIA: Record<string, 'iniciante' | 'intermediario' | 'avancado'> = {
  'Nunca treinei': 'iniciante',
  'Já treinei, mas parei': 'iniciante',
  'Treino há menos de um ano': 'intermediario',
  'Treino há mais de um ano': 'avancado',
};

const OBJETIVO: Record<string, string> = {
  'Ganhar massa': 'massa',
  'Perder peso': 'emagrecer',
  'Mais energia no dia': 'energia',
  'Saúde e manutenção': 'saude',
  'Melhorar o sono': 'dormir',
};

const TURNO: Record<string, 'business' | 'shifts' | 'night' | 'flexible'> = {
  Comercial: 'business',
  'Começo muito cedo': 'shifts',
  Vespertino: 'shifts',
  Noturno: 'night',
  'Escala variável': 'flexible',
};

const POSTURA: Record<string, 'sitting' | 'standing' | 'moving'> = {
  'Sentado a maior parte': 'sitting',
  'Em pé a maior parte': 'standing',
  'Me movimento bastante': 'moving',
};

const num = (v: string | undefined) => {
  if (!v || v === '—') return null;
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
};

/*
 "—" é como a entrevista grava pergunta pulada, e "não"/"nenhuma" é como gente
 real nega em campo livre. Nada disso é conteúdo. Embrulhado num template o
 placeholder escapava do filtro adiante ("cirurgia: —" ≠ "—") e virava texto —
 e texto em `injuries` acende `lesao-ortopedica` no deriveFlags, sobe o tier
 de risco e fez o avaliador zerar o plano de uma conta sem lesão nenhuma.
 Só negativa PURA é descartada: "não, mas sinto o joelho" continua inteira.
*/
const NEGATIVAS = new Set([
  'nao', 'nenhum', 'nenhuma', 'nada', 'nao tenho', 'nunca', 'nao, nunca', 'n/a',
]);
const dito = (v: string | undefined): string | null => {
  const t = v?.trim();
  if (!t || t === '—') return null;
  const puro = t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[.!]+$/, '');
  return NEGATIVAS.has(puro) ? null : t;
};

const MINUTOS: Record<string, number> = {
  '30 minutos': 30,
  '45 minutos': 45,
  '1 hora': 60,
  'Mais de 1 hora': 75,
};

/**
 * Rótulo do `qualEsporte` → slug de modalidade que a IA entende (é a chave do
 * mapa de referências do serviço de modelo). Rótulo sem slug próprio cai no
 * texto em minúsculas: o prompt instrui o modelo a tratar modalidade sem
 * catálogo específico com sessões aeróbias/funcionais genéricas.
 */
const ESPORTE_SLUG: Record<string, string> = {
  Corrida: 'corrida',
  Ciclismo: 'ciclismo',
  Natação: 'natacao',
  Futebol: 'futebol',
  Lutas: 'lutas',
  Crossfit: 'crossfit',
  'Tênis ou padel': 'esportes-coletivos',
  'Vôlei ou basquete': 'esportes-coletivos',
  'Yoga ou pilates': 'yoga',
  Dança: 'danca',
};

/**
 * O que o plano deve cobrir, decidido pela pessoa em `planoCobre`.
 *
 * O esporte do plano é `esporteDoPlano`; `qualEsporte` (o que ela já pratica)
 * é só a queda para respostas da primeira versão da pergunta, que era gateada
 * em "pratica esporte?". Sem resposta ou sem esporte identificável, o padrão
 * é o comportamento que sempre existiu: plano de musculação.
 */
export function modalidadesDoPlano(r: Answers): string[] {
  const esporte = dito(r.esporteDoPlano) ?? dito(r.qualEsporte);
  const slug = esporte ? (ESPORTE_SLUG[esporte] ?? esporte.toLowerCase()) : null;
  if (!slug) return ['musculacao'];
  // As duas grafias: "meu esporte" é a primeira versão da pergunta, ainda
  // viva em conversas COMPLETED que semeiam a próxima.
  if (r.planoCobre === 'Só um esporte' || r.planoCobre === 'Só meu esporte') return [slug];
  if (r.planoCobre === 'Musculação e um esporte' || r.planoCobre === 'Musculação e meu esporte') {
    return ['musculacao', slug];
  }
  return ['musculacao'];
}

// Exportada para teste: é pura, e é a fronteira onde "—" e negativa de campo
// livre precisam morrer antes de virarem flag de risco no deriveFlags.
export function traduzirParaAnamnese(r: Answers) {
  const condicoes = r.conditions && CONDICAO[r.conditions] ? [CONDICAO[r.conditions]] : [];
  // O que não tem slug conhecido não é descartado: vai como texto, onde o
  // modelo lê. "Problema de tireoide" muda prescrição mesmo sem bandeira.
  const detalhe =
    r.conditions && !CONDICAO[r.conditions] && r.conditions !== 'Nenhuma' ? r.conditions : null;

  /*
   O que não tem campo próprio no leitor vira NOTA — texto que o modelo lê ao
   gerar. Descartar seria jogar fora exatamente o que a entrevista longa
   coletou; inventar campo novo obrigaria a mexer no leitor, que é compartilhado
   com o formulário antigo.
  */
  const esporte = dito(r.qualEsporte);
  const notas = [
    r.opening,
    esporte ? `pratica ${esporte} (${dito(r.freqEsporte) ?? 'frequência não dita'})` : null,
    dito(r.condicaoControlada) ? `condição controlada: ${dito(r.condicaoControlada)}` : null,
    r.fuma === 'Sim' ? 'fumante' : null,
    r.alcool && r.alcool !== 'Não bebo' ? `álcool: ${r.alcool}` : null,
    dito(r.alimentacao) ? `alimentação: ${dito(r.alimentacao)}` : null,
    r.regiaoPrioritaria && r.regiaoPrioritaria !== 'Não, corpo todo'
      ? `priorizar: ${r.regiaoPrioritaria}`
      : null,
    r.horario ? `treina: ${r.horario}` : null,
    dito(r.observacaoFinal),
    dito(r.otherReasonWhich),
  ].filter((x) => x && x !== '—');

  return {
    parq: {
      heartCondition: sim(r.heartCondition),
      // Dor no esforço OU em repouso: para o PAR-Q as duas contam como dor.
      chestPain: sim(r.chestPain) || sim(r.chestPainRest),
      dizziness: sim(r.dizziness),
      boneJointProblem: sim(r.boneJoint),
      bloodPressureMedication: sim(r.bloodPressureMed),
    },
    conditions: condicoes,
    conditionsDetail: detalhe,
    pregnant: r.pregnant === 'Sim',
    weightKg: num(r.weightKg),
    heightCm: num(r.heightCm),
    medications: dito(r.medications),
    /*
     A lesão vem do PAR-Q e das cirurgias, não mais de uma pergunta própria.

     Havia um `injuries` em texto livre — "tem ou já teve alguma lesão?" — que
     produzia a MESMA flag `lesao-ortopedica` que `boneJoint`, e ainda por cima
     acendia a flag para lesão antiga e resolvida. Quem responde não ao PAR-Q
     ("problema que possa PIORAR com atividade") está dizendo que não há lesão
     ativa, e é essa a pergunta que decide prescrição.
    */
    injuries:
      [dito(r.cirurgias) ? `cirurgia: ${dito(r.cirurgias)}` : null, dito(r.boneJointWhere)]
        .filter(Boolean)
        .join('; ') || null,
    experience: EXPERIENCIA[r.experience] ?? 'iniciante',
    daysPerWeek: r.daysPerWeek ? Number(r.daysPerWeek) : null,
    minutesPerSession: r.minutesPerSession ? (MINUTOS[r.minutesPerSession] ?? null) : null,
    equipment: r.estrutura ?? null,
    // O que o plano cobre — decisão da pessoa, não inferência. O leitor
    // (context-builder) repassa à IA como `modalidades` do perfil.
    planModalities: modalidadesDoPlano(r),
    /*
     O NOME do esporte, além do slug. "Tênis ou padel" vira `esportes-coletivos`
     na modalidade — e o gerador batizava a sessão de "Esportes Coletivos", o
     que para quem joga tênis lê como o app não ter entendido (relato de
     ago/2026). A modalidade continua decidindo a referência; o nome decide
     como a pessoa vê o próprio dia.
    */
    planSportLabel: dito(r.esporteDoPlano) ?? dito(r.qualEsporte) ?? null,
    notes: notas.join(' | ') || null,
  };
}

const fala = (content: string, questionId: string | null): Turno => ({
  role: 'ASSISTANT',
  type: 'TEXT',
  content,
  questionId,
  at: new Date().toISOString(),
});

function montar(row: {
  id: string;
  status: AnamnesisConversationStatus;
  answers: Prisma.JsonValue;
  messages: Prisma.JsonValue;
}): ConversationState {
  const answers = (row.answers ?? {}) as Answers;
  const pendente = nextQuestion(answers);

  return {
    id: row.id,
    status: row.status,
    messages: (row.messages ?? []) as Turno[],
    pendingQuestion: pendente
      ? {
          questionId: pendente.id,
          type: pendente.type,
          label: pendente.label,
          ask: pendente.ask,
          options: pendente.options ?? null,
          isRequired: pendente.required,
        }
      : null,
    filledFields: reviewFields(answers),
    progress: progressOf(answers),
    readyToFinalize: pendente === null && isComplete(answers),
  };
}
