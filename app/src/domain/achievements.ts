/**
 * Conquistas do treino.
 *
 * Duas regras decidem tudo o que existe aqui, e as duas são sobre o que NÃO
 * entra:
 *
 * 1. **Conquista é sobre ESFORÇO, nunca sobre corpo.** "10 treinos seguidos" é
 *    uma coisa que a pessoa fez; "perdeu 2 kg" é resultado, depende de fatores
 *    que nenhum treino controla, e transformar isso em medalha faz o app
 *    prometer o que não pode cumprir.
 * 2. **Nada aqui compara com outras pessoas.** O produto é individual — só o
 *    usuário vê os próprios dados —, e ranking exigiria agregação entre contas,
 *    que não existe neste produto por decisão de arquitetura.
 *
 * A sequência é contada em SEMANAS, não em dias. Treino é hábito semanal: quem
 * treina terça e quinta tem dois dias vazios no meio que são o plano, não
 * falha. Uma sequência diária quebraria toda quarta-feira e ensinaria a pessoa
 * a ignorar a métrica.
 */

export type Execution = {
  startedAt: string;
  status: string;
};

export type Achievement = {
  key: string;
  /** O que aconteceu, em linguagem humana. */
  title: string;
  detail: string;
  /** `true` quando foi desbloqueada NESTA sessão — é o que a tela celebra. */
  fresh: boolean;
  /**
   * Quando a conquista aconteceu, em epoch.
   *
   * Na tela de fim de treino a data é óbvia: acabou agora. Fora dela não é, e
   * a home passou a mostrar conquistas em agosto: "Primeiro treino" aparecendo
   * num domingo em que a pessoa não treinou foi lido como "o app marcou que eu
   * treinei hoje" (Bruno, 23/08/2026). Conquista sem data é uma afirmação
   * sobre hoje.
   */
  at: number | null;
};

const DIA = 86_400_000;

/** Início da semana (segunda) que contém a data, em epoch local. */
export function weekStart(at: number): number {
  const d = new Date(at);
  d.setHours(0, 0, 0, 0);
  // `getDay()` devolve 0 no domingo; a semana do produto começa na segunda.
  const desde = (d.getDay() + 6) % 7;
  return d.getTime() - desde * DIA;
}

/**
 * Semanas consecutivas com pelo menos um treino concluído.
 *
 * A semana CORRENTE conta como viva mesmo sem treino ainda: quem treinou nas
 * três semanas anteriores e está na segunda-feira não perdeu a sequência —
 * perderia se a semana acabasse vazia, o que ainda não aconteceu.
 */
export function weekStreak(executions: Execution[], now: number): number {
  const semanas = new Set(
    executions
      .filter((e) => e.status === 'FINISHED')
      .map((e) => weekStart(new Date(e.startedAt).getTime())));
  if (semanas.size === 0) return 0;

  const atual = weekStart(now);
  let sequencia = 0;
  let cursor = semanas.has(atual) ? atual : atual - 7 * DIA;

  // Sem treino nem nesta semana nem na anterior, a sequência já morreu.
  if (!semanas.has(cursor)) return 0;

  while (semanas.has(cursor)) {
    sequencia += 1;
    cursor -= 7 * DIA;
  }
  return sequencia;
}

/** Marcos de contagem total. Espaçados para não virar confete a cada sessão. */
const MARCOS = [1, 5, 10, 25, 50, 100, 200];

/**
 * O que esta sessão desbloqueou.
 *
 * `executions` já inclui a sessão recém-concluída — é o que permite dizer
 * "fresh": um marco atingido agora é diferente de um marco atingido em março.
 */
export function achievementsFor(executions: Execution[], now: number): Achievement[] {
  const concluidos = executions.filter((e) => e.status === 'FINISHED');
  const total = concluidos.length;
  const lista: Achievement[] = [];

  // Do mais antigo ao mais novo: cada conquista carrega o instante do treino
  // que a destravou, e é ele que a tela mostra fora do fim de sessão.
  const emOrdem = [...concluidos].sort(
    (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime(),
  );
  const quando = (indice: number): number | null => {
    const e = emOrdem[indice];
    const t = e ? new Date(e.startedAt).getTime() : Number.NaN;
    return Number.isFinite(t) ? t : null;
  };
  const ultimo = quando(emOrdem.length - 1);

  const marco = MARCOS.filter((m) => total >= m).pop();
  if (marco) {
    lista.push({
      key: `total-${marco}`,
      title: marco === 1 ? 'Primeiro treino' : `${marco} treinos`,
      detail:
        marco === 1
          ? 'O começo é a parte que mais gente não faz.'
          : `Você concluiu ${total} sessões desde que começou.`,
      fresh: total === marco,
      // O treino que fechou o marco, não o mais recente.
      at: quando(marco - 1),
    });
  }

  const sequencia = weekStreak(concluidos, now);
  if (sequencia >= 2) {
    lista.push({
      key: `streak-${sequencia}`,
      title: `${sequencia} semanas seguidas`,
      detail: 'Constância vale mais que intensidade, é ela que muda o corpo.',
      // Nova quando a semana corrente acabou de entrar na conta: a sessão de
      // hoje é a primeira desta semana.
      fresh: concluidos.filter((e) => weekStart(new Date(e.startedAt).getTime()) === weekStart(now)).length === 1,
      at: ultimo,
    });
  }

  /*
   Melhor semana. Só aparece quando é RECORDE — e o recorde precisa ser da
   semana corrente, senão a tela celebraria algo de dois meses atrás.
  */
  const porSemana = new Map<number, number>();
  for (const e of concluidos) {
    const semana = weekStart(new Date(e.startedAt).getTime());
    porSemana.set(semana, (porSemana.get(semana) ?? 0) + 1);
  }
  const estaSemana = porSemana.get(weekStart(now)) ?? 0;
  const maiorAnterior = Math.max(
    0, ...[...porSemana.entries()].filter(([s]) => s !== weekStart(now)).map(([, n]) => n));
  if (estaSemana > maiorAnterior && estaSemana >= 3) {
    lista.push({
      key: `melhor-semana-${estaSemana}`,
      title: 'Melhor semana até agora',
      detail: `${estaSemana} treinos nesta semana.`,
      fresh: true,
      at: ultimo,
    });
  }

  return lista;
}
