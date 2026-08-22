/**
 * Quantos LADOS um exercício por tempo tem — 1 ou 2.
 *
 * Um testador (Bruno, 22/08) pediu que o alongamento unilateral pudesse rodar o
 * cronômetro duas vezes, uma por membro. O catálogo e o modelo que gera o
 * plano não marcam isso em campo nenhum: a informação está no TEXTO — "gire o
 * corpo para o lado oposto", "uma perna", "unilateral". Este módulo lê o texto
 * e decide. É heurística, e errar tem custo assimétrico: dizer "dois lados"
 * num alongamento bilateral oferece um botão a mais que a pessoa ignora; dizer
 * "um lado" num unilateral volta ao problema relatado. Por isso o viés é
 * para dois quando há qualquer pista.
 *
 * Um campo `unilateral` vindo do modelo substituiria isto — fica registrado
 * como decisão para a fundadora.
 */

const PISTAS = [
  /unilateral/i,
  /\bcada lado\b/i,
  /\bcada (perna|braço|braco|membro)\b/i,
  /\bum lado\b/i,
  /\blado oposto\b/i,
  /\boutro lado\b/i,
  /\buma (perna|das pernas)\b/i,
  /\bum (braço|braco|dos braços|dos bracos)\b/i,
  /\bperna (direita|esquerda)\b/i,
  /\bbraço (direito|esquerdo)\b/i,
  /\btroque (de|o) lado\b/i,
  /\brepita (do|no) outro lado\b/i,
  /\balterne\b/i,
  /\bmesmo lado\b/i,
  /\bum (joelho|pé|pe|tornozelo|calcanhar|quadril|ombro|cotovelo|punho)\b/i,
  /\b(joelho|pé|tornozelo|calcanhar) (direito|esquerdo)\b/i,
];

export function ladosDoExercicio(name: string, description?: string | null): 1 | 2 {
  const texto = `${name} ${description ?? ''}`;
  return PISTAS.some((p) => p.test(texto)) ? 2 : 1;
}
