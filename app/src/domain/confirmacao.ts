/**
 * "Sim" digitado, quando há uma proposta esperando confirmação.
 *
 * O personal propõe uma mudança e pergunta "Confirma?". Quem muda o plano é o
 * botão Aplicar, e isso é deliberado: mexer na prescrição pede ato explícito.
 * Só que a pessoa responde à pergunta do jeito que se responde a uma pergunta,
 * digitando, e aí a conversa entrava em laço: ele confirmava por texto, o
 * agente reproponha a mesma coisa, e o plano continuava igual. "Não trocou",
 * "não está trocando", "troca de treino ainda não funciona bem" (Leonardo,
 * 25/08/2026).
 *
 * O "sim" digitado passa a valer como o toque. Continua sendo ato explícito: a
 * pessoa está respondendo a uma proposta que acabou de ler, escrita logo acima.
 *
 * **Negativa NUNCA pode passar por aqui.** Um falso positivo aplica no plano de
 * alguém uma mudança que a pessoa recusou, e é por isso que a negação é testada
 * primeiro e o resto só vale como frase curta: "quero" confirma, "não quero
 * isso, prefiro outra coisa" não.
 */

const NEGACOES = /\b(n[ãa]o|nao|nunca|jamais|deixa|esquece|cancela|melhor n[ãa]o)\b/i;

const CONFIRMACOES = [
  /^\s*(sim|s|ok|okay|isso|isso a[íi]|claro|beleza|blz|certo|exato|perfeito)\s*[.!]*\s*$/i,
  /\b(confirmo|confirmado|confirma|pode confirmar)\b/i,
  /\b(pode (ser|aplicar|mudar|trocar|fazer)|manda|aplica|aplicar|vamos|bora)\b/i,
  /\b(quero|prefiro) (esse|este|essa|esta|fazer)\b/i,
];

/**
 * A mensagem é uma confirmação da proposta pendente?
 *
 * Só se aplica quando há proposta esperando: fora disso, "pode" e "quero" são
 * conversa comum e devem ir ao agente como qualquer outra frase.
 */
export function ehConfirmacao(texto: string): boolean {
  const t = (texto ?? '').trim();
  if (t.length === 0 || t.length > 120) return false;
  if (NEGACOES.test(t)) return false;
  return CONFIRMACOES.some((r) => r.test(t));
}
