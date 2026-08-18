/**
 * Teto de tempo para qualquer conversa com a pulseira.
 *
 * A patologia que este módulo existe para impedir: uma promessa que **nunca
 * liquida**. O SDK do fabricante entrega o resultado por bloco de conclusão, e
 * há caminhos em que esse bloco simplesmente não é chamado — pulseira que saiu
 * de alcance no meio da consulta, sensor que não converge, canal serial que
 * ficou esperando um pacote que não vem. A promessa nativa não resolve nem
 * rejeita: fica pendente para sempre.
 *
 * `.catch()` NÃO cobre isso. Ele trata rejeição, e aqui não há rejeição — há
 * ausência. Por isso todo `await` numa chamada nativa passa por aqui: um
 * `Promise.race` contra um relógio é a única coisa que devolve o controle.
 *
 * Foi visto em campo (ago/2026) em três lugares independentes — medir,
 * sincronizar e buscar a noite —, sempre com o mesmo sintoma para quem usa: um
 * indicador girando até o app ser fechado.
 */

/** Erro de teto estourado, para quem chama distinguir de falha do aparelho. */
export class TempoEsgotado extends Error {
  constructor(public readonly oQue: string) {
    super(`TEMPO:${oQue}`);
    this.name = 'TempoEsgotado';
  }
}

export function eTempoEsgotado(err: unknown): err is TempoEsgotado {
  return err instanceof TempoEsgotado;
}

/**
 * Corre `promessa` contra o relógio. Estourou o teto, rejeita com
 * `TempoEsgotado` — a promessa original continua pendente, e não há como
 * cancelá-la (o SDK não expõe cancelamento); o que se recupera é o controle do
 * fluxo, que é o que a tela precisa.
 *
 * O `clearTimeout` no fim importa: sem ele, cada consulta deixaria um timer
 * vivo, e no React Native um timer pendente segura o ciclo de vida do módulo.
 */
export function comTeto<T>(promessa: Promise<T>, ms: number, oQue: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const relogio = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TempoEsgotado(oQue)), ms);
  });
  return Promise.race([promessa, relogio]).finally(() => {
    if (timer) clearTimeout(timer);
  }) as Promise<T>;
}

/**
 * Tetos por natureza da conversa.
 *
 * Uma consulta de histórico é resposta de memória: se o aparelho vai responder,
 * responde em segundos. Medir é diferente — o sensor precisa CONVERGIR, e trinta
 * a sessenta segundos é o normal documentado pelo fabricante.
 */
export const TETO_CONSULTA_MS = 15_000;
export const TETO_SINCRONIA_MS = 120_000;
export const TETO_MEDICAO_MS = 90_000;
