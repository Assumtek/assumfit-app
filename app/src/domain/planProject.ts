import { WEEK_ORDER } from './workout';
/**
 * O PROJETO por trás do plano — o que dá para afirmar lendo a prescrição.
 *
 * Nasceu de uma pergunta de quem treina (ago/2026): "não sei qual a
 * metodologia, ele fica intercalando peito e costas". A ordem estava correta —
 * é pareamento agonista-antagonista, método consolidado — e mesmo assim o
 * relato chegou como defeito. Num produto em que a prescrição é automática,
 * escolha deliberada que não se explica é indistinguível de erro.
 *
 * Este módulo NÃO gera texto sobre o corpo de ninguém e não repete a prosa do
 * modelo. Ele lê a estrutura do plano e afirma só o que a estrutura sustenta:
 * quantos dias, com que frequência cada grupo volta, se os exercícios alternam
 * empurrar e puxar, se há aquecimento em rampa. Cada afirmação é verificável
 * abrindo o treino — e é por isso que ela pode ser mostrada.
 *
 * Domínio puro: recebe plano e treinos, devolve fatos. Sem React, sem paleta.
 */

/** Os grupos que "empurram" e os que "puxam" — a base do pareamento. */
const EMPURRA = new Set(['PEITO', 'OMBROS', 'TRICEPS', 'QUADRICEPS', 'PANTURRILHA']);
const PUXA = new Set(['COSTAS', 'BICEPS', 'POSTERIOR_COXA', 'GLUTEOS', 'ANTEBRACO']);

export type ExercicioDoProjeto = { name: string; muscleGroup: string; subtype: string };
export type TreinoDoProjeto = {
  name: string;
  /** Exercícios da fase de TREINO, na ordem prescrita. */
  principais: ExercicioDoProjeto[];
  /** Existe fase de alongamento/mobilidade antes do treino. */
  temPreparo: boolean;
};

export type FatoDoProjeto = {
  /** Chave estável, para a tela escolher ícone e ordem sem casar string. */
  chave: 'frequencia' | 'alternancia' | 'preparo' | 'volume' | 'nivel' | 'tempo';
  titulo: string;
  /** Por que a escolha existe. Uma ou duas frases, sem prometer resultado. */
  porque: string;
};

/** Quantas vezes cada grupo muscular volta na semana. */
export function frequenciaPorGrupo(treinos: TreinoDoProjeto[]): Map<string, number> {
  const contagem = new Map<string, number>();
  for (const treino of treinos) {
    const noDia = new Set(treino.principais.map((e) => e.muscleGroup));
    for (const grupo of noDia) contagem.set(grupo, (contagem.get(grupo) ?? 0) + 1);
  }
  return contagem;
}

/**
 * O treino alterna empurrar e puxar?
 *
 * Exige pelo menos duas TROCAS de sentido — uma só é sequência, não padrão. É a
 * diferença entre "peito, costas, ombro" (que acontece por acaso) e "peito,
 * costas, peito, costas" (que é decisão).
 */
export function alternaEmpurrarEPuxar(principais: ExercicioDoProjeto[]): boolean {
  const sentidos = principais
    .map((e) => (EMPURRA.has(e.muscleGroup) ? 'empurra' : PUXA.has(e.muscleGroup) ? 'puxa' : null))
    .filter((s): s is 'empurra' | 'puxa' => s !== null);
  if (sentidos.length < 4) return false;

  let trocas = 0;
  for (let i = 1; i < sentidos.length; i++) if (sentidos[i] !== sentidos[i - 1]) trocas += 1;
  return trocas >= 2;
}

/**
 * Os fatos que a tela mostra, derivados da prescrição.
 *
 * Só entra o que a estrutura sustenta. Nada aqui é opinião nem promessa: um
 * fato que a pessoa não consiga conferir abrindo o próprio treino não deveria
 * estar numa tela que se propõe a explicar o treino.
 */
/**
 * As respostas da anamnese que FUNDAMENTAM decisões — só as que o plano
 * comprovadamente obedece (dias, tempo por sessão, nível). Um testador (22/08)
 * pediu que as explicações mostrassem "que foi de fato personalizado": a
 * forma honesta é citar o que a pessoa respondeu e apontar onde isso aparece
 * no plano, não prometer ciência.
 */
export type AnamneseDoProjeto = {
  daysPerWeek?: number | string | null;
  minutesPerSession?: number | string | null;
  experience?: string | null;
};

const NIVEL: Record<string, { titulo: string; porque: string }> = {
  iniciante: {
    titulo: 'Cargas e progressão de quem está começando',
    porque: 'Você respondeu que nunca treinou ou parou há muito tempo: as primeiras semanas priorizam técnica e volume baixo, e a carga sobe quando a execução está estável.',
  },
  intermediario: {
    titulo: 'Progressão de quem já treina com constância',
    porque: 'Você respondeu que já treinou com constância: o plano parte de um volume que o corpo conhece e progride em carga e séries ao longo das semanas.',
  },
  avancado: {
    titulo: 'Volume e variação de quem treina há anos',
    porque: 'Você respondeu que treina há anos sem pausa longa: o plano usa mais séries por grupo e mais variação de estímulo dentro da semana.',
  },
};

export function fatosDoProjeto(treinos: TreinoDoProjeto[], anamnese?: AnamneseDoProjeto | null): FatoDoProjeto[] {
  const fatos: FatoDoProjeto[] = [];
  if (treinos.length === 0) return fatos;

  const frequencia = frequenciaPorGrupo(treinos);
  const repetidos = [...frequencia.values()].filter((n) => n >= 2).length;
  if (repetidos > 0) {
    const vezes = Math.max(...frequencia.values());
    fatos.push({
      chave: 'frequencia',
      titulo: `${treinos.length} ${treinos.length === 1 ? 'dia' : 'dias'}, cada grupo até ${vezes}× por semana`,
      porque:
        'Distribuir o mesmo músculo em mais de um dia mantém o estímulo ao longo da semana em vez de concentrá-lo num treino só.',
    });
  }

  const comAlternancia = treinos.filter((t) => alternaEmpurrarEPuxar(t.principais));
  if (comAlternancia.length > 0) {
    fatos.push({
      chave: 'alternancia',
      titulo: 'Exercícios alternam entre empurrar e puxar',
      porque:
        'Um grupo descansa enquanto o outro trabalha. A força se mantém ao longo das séries e a sessão termina mais cedo. A ordem é essa de propósito.',
    });
  }

  if (treinos.every((t) => t.temPreparo)) {
    fatos.push({
      chave: 'preparo',
      titulo: 'Toda sessão começa com preparo',
      porque: 'Mobilidade antes da carga prepara a articulação para a amplitude que o treino vai pedir.',
    });
  }

  const porSessao = Math.round(
    treinos.reduce((n, t) => n + t.principais.length, 0) / treinos.length);
  if (porSessao > 0) {
    fatos.push({
      chave: 'volume',
      titulo: `${porSessao} exercícios por sessão, em média`,
      porque:
        'Volume por sessão é o que decide se o treino cabe no tempo que você declarou ter.',
    });
  }

  // O que a anamnese fundamenta, citado como resposta da pessoa.
  const dias = Number(anamnese?.daysPerWeek);
  const freq = fatos.find((f) => f.chave === 'frequencia');
  if (freq && Number.isFinite(dias) && dias === treinos.length) {
    freq.porque += ` São os ${dias} dias por semana que você informou na anamnese.`;
  }
  const minutos = Number(anamnese?.minutesPerSession);
  if (Number.isFinite(minutos) && minutos > 0) {
    const media = Math.round(treinos.reduce((n, t) => n + t.principais.length, 0) / treinos.length);
    fatos.push({
      chave: 'tempo',
      titulo: `Sessões para caber em ${minutos >= 60 ? `${minutos / 60}h` : `${minutos} min`}`,
      porque: `Você informou ter ${minutos >= 60 ? `${minutos / 60} hora${minutos > 60 ? 's' : ''}` : `${minutos} minutos`} por sessão, é o que limita a ${media} ${media === 1 ? 'exercício principal' : 'exercícios principais'} por dia, com descanso entre séries incluído.`,
    });
  }
  const nivel = anamnese?.experience ? NIVEL[String(anamnese.experience)] : undefined;
  if (nivel) fatos.push({ chave: 'nivel', ...nivel });
  return fatos;
}

/** O mínimo de um dia do plano para montar a semana. */
export type DiaDoPlano = {
  dayOfWeek: string;
  dayType: 'WORKOUT' | 'OFF';
  workout?: { name: string } | null;
};

/**
 * A semana em ORDEM DE SEMANA, com os dias de descanso.
 *
 * A tela listava só os dias com treino, na ordem em que o plano os gerou
 * ("quinta, domingo, segunda…"), e o descanso não aparecia — um testador
 * (22/08) leu como desordem. Segunda a domingo, um dia por linha; dia sem
 * treino é "Descanso", que é decisão do plano tanto quanto o treino.
 */
export function semanaDoProjeto(days: DiaDoPlano[]): { dayOfWeek: string; nome: string | null }[] {
  return WEEK_ORDER.map((dow) => {
    const dia = days.find((d) => d.dayOfWeek === dow && d.dayType === 'WORKOUT' && d.workout);
    return { dayOfWeek: dow, nome: dia?.workout?.name ?? null };
  });
}

/* ------------------------------------------------------------------------- *
 * Duração e alvo
 *
 * Pedido de testador (Leonardo, 24/08/2026), nas palavras dele: "no projeto
 * falta a duração e os objetivos que pretendemos alcançar com o projeto,
 * pessoas são movidas pelo resultado, o hábito acaba sendo o obstáculo
 * necessário para atingi-lo".
 *
 * Ele tem razão sobre a falta, e a forma de atender sem quebrar o escopo do
 * produto é uma só: o AssumFit não é dispositivo médico e não promete resultado
 * corporal, então o que se afirma aqui é o que o app MEDE. Prazo do plano, em
 * que semana a pessoa está, o objetivo que ela mesma declarou, e marcos de
 * PROCESSO que ela pode conferir: sessões fechadas, constância, volume. Nada
 * de "você vai perder N quilos", que ninguém pode garantir e que este produto
 * não está autorizado a dizer.
 * ------------------------------------------------------------------------- */

export type HorizonteDoProjeto = {
  /** Semanas entre o começo e o fim do plano. */
  semanas: number;
  /** Em qual delas a pessoa está, começando em 1 e nunca passando do total. */
  semanaAtual: number;
  /** Dias que faltam para o fim, zero quando o plano já venceu. */
  diasRestantes: number;
  /** 0..1, para régua e frase. */
  fracao: number;
  inicio: Date;
  fim: Date;
  /** O plano passou da data de fim e pede revisão. */
  vencido: boolean;
};

const DIA_MS = 24 * 60 * 60 * 1000;

/**
 * Meia-noite LOCAL, para a conta ser de dias e não de horas corridas.
 *
 * `YYYY-MM-DD` é tratado à mão de propósito. O `new Date('2026-09-28')` do
 * JavaScript lê a forma curta como UTC, e no fuso do Brasil isso vira 27/09 às
 * 21h: o plano exibiria o dia anterior ao que o servidor gravou, e a contagem
 * de semanas nasceria um dia curta. Data com hora, essa sim, é instante e pode
 * ser convertida direto.
 */
function meiaNoite(valor: string | Date): Date | null {
  if (typeof valor === 'string') {
    const so = /^(\d{4})-(\d{2})-(\d{2})/.exec(valor);
    if (so) return new Date(Number(so[1]), Number(so[2]) - 1, Number(so[3]));
  }
  const d = valor instanceof Date ? new Date(valor) : new Date(valor);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function horizonteDoProjeto(
  plano: { startDate: string; endDate: string },
  agora: Date = new Date()): HorizonteDoProjeto | null {
  const inicio = meiaNoite(plano.startDate);
  const fim = meiaNoite(plano.endDate);
  const hoje = meiaNoite(agora);
  if (!inicio || !fim || !hoje || fim <= inicio) return null;

  const totalDias = Math.round((fim.getTime() - inicio.getTime()) / DIA_MS);
  const semanas = Math.max(1, Math.round(totalDias / 7));
  const corridos = Math.round((hoje.getTime() - inicio.getTime()) / DIA_MS);
  const semanaAtual = Math.min(semanas, Math.max(1, Math.floor(corridos / 7) + 1));
  const diasRestantes = Math.max(0, Math.round((fim.getTime() - hoje.getTime()) / DIA_MS));
  const fracao = Math.max(0, Math.min(1, corridos / totalDias));

  return { semanas, semanaAtual, diasRestantes, fracao, inicio, fim, vencido: hoje > fim };
}

export type MarcoDoProjeto = {
  titulo: string;
  detalhe: string;
};

export type AlvoDoProjeto = {
  /** O objetivo declarado, em linguagem de gente. */
  objetivo: string;
  /** O que a ESTRUTURA do plano faz para perseguir esse objetivo. */
  comoOPlanoPersegue: string;
  /** O que dá para conferir até o fim do plano. Processo, nunca corpo. */
  marcos: MarcoDoProjeto[];
};

/**
 * O objetivo declarado, lido dos três vocabulários que o sistema usa: a
 * resposta da anamnese ("Ganhar massa"), o objetivo do plano (`hipertrofia`) e
 * o do perfil. É a mesma leitura de `nutritionGoal.ts`, e ela mora nos dois
 * porque cada um decide uma coisa diferente com a resposta.
 */
function lerObjetivo(bruto: string | null | undefined): 'emagrecer' | 'massa' | 'condicionamento' | null {
  const t = (bruto ?? '').toLowerCase();
  if (!t) return null;
  if (t.includes('perder') || t.includes('emagrec') || t.includes('gordura')) return 'emagrecer';
  if (t.includes('massa') || t.includes('ganhar') || t.includes('hipertrof') || t.includes('força') || t.includes('forca')) {
    return 'massa';
  }
  return 'condicionamento';
}

const COMO: Record<'emagrecer' | 'massa' | 'condicionamento', string> = {
  emagrecer:
    'Os treinos usam grupos grandes e descanso curto, que é o que mantém o gasto alto dentro do tempo que você tem.',
  massa:
    'Cada grupo volta mais de uma vez por semana e a carga sobe quando a execução se estabiliza, que é o estímulo repetido de que a hipertrofia depende.',
  condicionamento:
    'A semana mistura força e movimento contínuo, para o preparo geral subir sem depender de uma modalidade só.',
};

const OBJETIVO_EM_PALAVRAS: Record<'emagrecer' | 'massa' | 'condicionamento', string> = {
  emagrecer: 'Perder gordura',
  massa: 'Ganhar massa e força',
  condicionamento: 'Melhorar o condicionamento',
};

/**
 * O alvo do projeto: objetivo declarado, o que o plano faz por ele, e os marcos.
 *
 * Os marcos são de PROCESSO porque é o que o app consegue conferir e o que a
 * pessoa controla. "Fechar 24 sessões até 19/10" é verificável na tela de
 * progresso no dia seguinte; "você vai secar" não é verificável nunca, e num
 * produto que não é dispositivo médico também não é dizível.
 */
export function alvoDoProjeto({
  objetivo,
  treinos,
  horizonte,
}: {
  objetivo: string | null | undefined;
  treinos: TreinoDoProjeto[];
  horizonte: HorizonteDoProjeto | null;
}): AlvoDoProjeto | null {
  const chave = lerObjetivo(objetivo);
  if (!chave) return null;

  const marcos: MarcoDoProjeto[] = [];
  if (horizonte && treinos.length > 0) {
    const sessoes = treinos.length * horizonte.semanas;
    const data = `${String(horizonte.fim.getDate()).padStart(2, '0')}/${String(horizonte.fim.getMonth() + 1).padStart(2, '0')}`;
    marcos.push({
      titulo: `${sessoes} sessões até ${data}`,
      detalhe: `${treinos.length} por semana durante ${horizonte.semanas} semanas. É a conta do plano, e a tela de progresso mostra quantas já fecharam.`,
    });
    marcos.push({
      titulo: 'Três de cada quatro semanas completas',
      detalhe:
        'A constância é o que sustenta qualquer objetivo, e é a única coisa aqui que depende só de você. Semana perdida não se recupera dobrando a seguinte.',
    });
  }
  if (chave === 'massa') {
    marcos.push({
      titulo: 'Carga maior no fim do que no começo',
      detalhe: 'Cada exercício guarda a carga da última vez. Subir com a execução estável é o sinal de que o estímulo está funcionando.',
    });
  }
  if (chave === 'emagrecer') {
    marcos.push({
      titulo: 'Alimentação registrada na maioria dos dias',
      detalhe: 'O treino gasta, o prato decide. Registrar é o que transforma a meta de calorias em algo que dá para acompanhar.',
    });
  }
  if (chave === 'condicionamento') {
    marcos.push({
      titulo: 'Recuperação estável ou melhor ao longo do plano',
      detalhe: 'A variabilidade cardíaca é o número que responde ao preparo geral. A tela de tendências compara o mês com os anteriores.',
    });
  }

  return { objetivo: OBJETIVO_EM_PALAVRAS[chave], comoOPlanoPersegue: COMO[chave], marcos };
}
