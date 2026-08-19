import { dayKey } from './movement';
import { WEEK_ORDER } from './workout';

/**
 * A semana de treino como UMA série de sete posições, com as duas grandezas
 * que o produto tem sobre cada dia: o que foi PREVISTO pelo plano e o que foi
 * CUMPRIDO de fato.
 *
 * As duas viviam separadas — o plano numa tela, o movimento realizado noutra —
 * e a pergunta que nenhuma das duas respondia é justamente a que se faz ao
 * abrir o app: "estou em dia com o que combinei comigo?". Juntas na mesma
 * régua, a resposta é visual e não precisa de texto.
 *
 * Módulo de domínio puro: recebe plano, mapa de minutos e uma data; devolve
 * estrutura. Sem React e sem paleta — roda em teste sem montar componente.
 */

/** O dia do plano, no formato que a API entrega (`api.PlanDay`). */
export type DiaDoPlano = {
  dayOfWeek: string;
  dayType: 'WORKOUT' | 'OFF';
  workout: {
    id: string;
    name: string;
    modality: string | null;
    muscleGroups: string[];
    estimatedDuration: number | null;
    exerciseCount: number;
  } | null;
};

export type DiaDeTreino = {
  weekday: (typeof WEEK_ORDER)[number];
  /** O treino que o plano marcou. Null em dia de descanso e em semana sem plano. */
  planejado: DiaDoPlano['workout'];
  /** O plano existe e marcou este dia como descanso. */
  descanso: boolean;
  /** Minutos PREVISTOS pelo plano, quando ele estima duração. */
  previsto: number | null;
  /**
   * Minutos de movimento REGISTRADOS no dia — treino concluído e sessão de
   * esporte, já consolidados por `movementMinutes`. É a única grandeza medida
   * aqui; as demais são combinado.
   */
  cumprido: number;
  ehHoje: boolean;
  /** Ainda não chegou: não conta como falta. */
  futuro: boolean;
};

export type SemanaDeTreino = {
  dias: DiaDeTreino[];
  /** Dias com treino previsto na semana. Zero quando não há plano. */
  previstos: number;
  /** Desses, quantos já têm movimento registrado. */
  cumpridos: number;
  /** Minutos registrados na semana, das duas fontes. */
  minutos: number;
};

/**
 * Monta a semana corrente (segunda a domingo, fuso local).
 *
 * `hojeNoPlano` existe porque o servidor resolve o dia da pessoa e o aparelho
 * resolve o dele: perto da meia-noite os dois discordam, e uma tela com dois
 * "hoje" diferentes é pior que uma tela com o "hoje" do servidor. Sem plano,
 * vale a data do aparelho.
 */
export function montarSemanaDeTreino(
  plano: { days: DiaDoPlano[]; today: string } | null,
  minutosPorDia: Map<string, number>,
  hoje: Date,
): SemanaDeTreino {
  const segunda = new Date(hoje);
  segunda.setHours(0, 0, 0, 0);
  segunda.setDate(segunda.getDate() - ((segunda.getDay() + 6) % 7));

  const chaveHoje = dayKey(hoje);
  const porDia = new Map((plano?.days ?? []).map((d) => [d.dayOfWeek, d]));
  const diaCorrente = plano?.today ?? WEEK_ORDER[(hoje.getDay() + 6) % 7];

  const dias: DiaDeTreino[] = WEEK_ORDER.map((weekday, i) => {
    const data = new Date(segunda);
    data.setDate(segunda.getDate() + i);
    const chave = dayKey(data);
    const entrada = porDia.get(weekday);
    const treina = entrada?.dayType === 'WORKOUT' ? (entrada.workout ?? null) : null;

    return {
      weekday,
      planejado: treina,
      descanso: !!plano && !treina,
      previsto: treina?.estimatedDuration ?? null,
      cumprido: minutosPorDia.get(chave) ?? 0,
      ehHoje: plano ? weekday === diaCorrente : chave === chaveHoje,
      futuro: chave > chaveHoje,
    };
  });

  return {
    dias,
    previstos: dias.filter((d) => d.planejado).length,
    cumpridos: dias.filter((d) => d.planejado && d.cumprido > 0).length,
    minutos: dias.reduce((soma, d) => soma + d.cumprido, 0),
  };
}

/** O dia que a leitura abre por padrão: hoje. */
export function diaCorrente(semana: SemanaDeTreino): DiaDeTreino {
  return semana.dias.find((d) => d.ehHoje) ?? semana.dias[0];
}
