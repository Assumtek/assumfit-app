/**
 * Distância e calorias do dia — o que a pulseira diz, quando faz sentido.
 *
 * Um testador (22/08/2026) viu 1.253 passos, 3,2 km e **886.149 kcal**. O
 * cabeçalho do SDK diz que a distância vem em metros e não diz a unidade das
 * calorias; o valor não fecha em unidade nenhuma razoável, e mostrar isso numa
 * tela de saúde é pior que não mostrar. Então a regra é por PASSO: calorias e
 * distância só entram se couberem numa faixa humana de caminhada; fora dela,
 * tenta-se ler como "cal" (÷ 1000) e, se ainda não couber, vale a estimativa
 * por passo — que é o que o app já fazia quando a pulseira não mandava nada.
 *
 * Módulo de domínio puro, testado sem pulseira.
 */

/** Caminhada: ~0,7 m por passo; a faixa cobre de criança a pessoa alta correndo. */
export const METROS_POR_PASSO = 0.7;
const METROS_POR_PASSO_MIN = 0.3;
const METROS_POR_PASSO_MAX = 1.3;

/** Caminhada: ~0,04 kcal por passo; a faixa cobre de leve a subida íngreme. */
export const KCAL_POR_PASSO = 0.04;
const KCAL_POR_PASSO_MIN = 0.015;
const KCAL_POR_PASSO_MAX = 0.15;

export type Estimativa = { valor: number; fonte: 'pulseira' | 'estimada' };

function dentro(valorPorPasso: number, min: number, max: number): boolean {
  return Number.isFinite(valorPorPasso) && valorPorPasso >= min && valorPorPasso <= max;
}

/** Distância do dia em km. `brutaM` é o que a pulseira mandou, em metros. */
export function distanciaDoDia(steps: number, brutaM: number | null | undefined): Estimativa {
  if (steps <= 0) return { valor: 0, fonte: 'estimada' };
  if (brutaM != null && brutaM > 0 && dentro(brutaM / steps, METROS_POR_PASSO_MIN, METROS_POR_PASSO_MAX)) {
    return { valor: brutaM / 1000, fonte: 'pulseira' };
  }
  return { valor: (steps * METROS_POR_PASSO) / 1000, fonte: 'estimada' };
}

/** Calorias ativas do dia em kcal. `bruta` é o que a pulseira mandou, unidade desconhecida. */
export function caloriasDoDia(steps: number, bruta: number | null | undefined): Estimativa {
  if (steps <= 0) return { valor: 0, fonte: 'estimada' };
  if (bruta != null && bruta > 0) {
    // Primeiro como kcal; depois como cal (÷ 1000). A primeira que couber vale.
    for (const fator of [1, 1 / 1000]) {
      const kcal = bruta * fator;
      if (dentro(kcal / steps, KCAL_POR_PASSO_MIN, KCAL_POR_PASSO_MAX)) {
        return { valor: Math.round(kcal), fonte: 'pulseira' };
      }
    }
  }
  return { valor: Math.round(steps * KCAL_POR_PASSO), fonte: 'estimada' };
}
