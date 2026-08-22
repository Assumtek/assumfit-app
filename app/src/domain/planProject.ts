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
        'Um grupo descansa enquanto o outro trabalha. A força se mantém ao longo das séries e a sessão termina mais cedo, não é erro de ordem.',
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
