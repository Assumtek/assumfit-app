/**
 * Leitura da prescrição que chega como TEXTO e a ordem dos substitutos.
 *
 * Dois pedidos de um testador (Bruno, 22/08):
 *
 * 1. Exercício de força prescrito em SEGUNDOS ("30-45s" na prancha) mostrava
 *    o campo de repetições. A prescrição vem como texto livre do modelo, e o
 *    app precisa reconhecer quando ela é tempo para oferecer um relógio.
 * 2. "Aparelho ocupado" e "não sei executar" prometiam listas diferentes de
 *    substitutos e entregavam a mesma. O motivo agora ordena a lista.
 */

/**
 * Segundos de uma prescrição textual, ou `null` quando ela é de repetições.
 *
 * Faixa ("30-45s") devolve o TETO: é o alvo; quem não aguenta para antes e
 * marca a série do mesmo jeito. Minutos viram segundos. "12" e "8-12" são
 * repetições e devolvem `null`.
 */
export function segundosDaPrescricao(reps: string | null | undefined): number | null {
  if (!reps) return null;
  const t = reps.trim().toLowerCase();
  const m = t.match(/^(\d+)\s*(?:[-–a]\s*(\d+))?\s*(s|seg|segs|segundos?|min|minutos?)\b/);
  if (!m) return null;
  const teto = Number(m[2] ?? m[1]);
  if (!Number.isFinite(teto) || teto <= 0) return null;
  return m[3].startsWith('min') ? teto * 60 : teto;
}

export type MotivoDeTroca = 'equipamento' | 'execucao';

const ORDEM_DE_NIVEL: Record<string, number> = { INICIANTE: 0, INTERMEDIARIO: 1, AVANCADO: 2 };

/**
 * Ordena substitutos pelo motivo da troca — estável, sem remover ninguém.
 *
 * - `equipamento`: outro equipamento primeiro. A máquina está ocupada; sugerir
 *   outro exercício NA MESMA máquina é sugerir a mesma fila.
 * - `execucao`: nível mais baixo primeiro. Quem não sabe executar quer a
 *   versão mais simples do movimento, não a mais sofisticada.
 * - sem motivo (botão "Trocar"): a ordem que veio.
 */
export function ordenarSubstitutos<T extends { equipment: string; level: string }>(
  opcoes: T[],
  motivo: MotivoDeTroca | null | undefined,
  equipamentoAtual: string,
): T[] {
  if (!motivo) return opcoes;
  const chave = (o: T) =>
    motivo === 'equipamento'
      ? (o.equipment === equipamentoAtual ? 1 : 0)
      : (ORDEM_DE_NIVEL[o.level] ?? 1);
  return opcoes
    .map((o, i) => ({ o, i, k: chave(o) }))
    .sort((a, b) => a.k - b.k || a.i - b.i)
    .map((x) => x.o);
}
