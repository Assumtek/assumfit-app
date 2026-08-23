/**
 * Geometria do canvas de compartilhar.
 *
 * Mora no domínio porque é conta pura, e porque o componente importa o
 * gesture-handler, que o jest não transforma: regra do projeto é que
 * comportamento se prova sem montar árvore React.
 */

export type Ponto = { x: number; y: number };
export type Zona = { x: number; y: number; largura: number; altura: number };

/**
 * O dedo caiu dentro da lixeira?
 *
 * A folga existe porque o dedo COBRE o alvo: quem arrasta não vê o ponto exato
 * que o sistema registra, e errar por dois pontos custa o gesto inteiro de
 * novo. Zona não medida (largura zero) nunca casa, senão um layout que ainda
 * não aconteceu apagaria blocos.
 */
export const FOLGA_DA_LIXEIRA = 24;

export function sobreALixeira(ponto: Ponto | null, zona: Zona | null): boolean {
  if (!ponto || !zona || zona.largura === 0 || zona.altura === 0) return false;
  return (
    ponto.x >= zona.x - FOLGA_DA_LIXEIRA &&
    ponto.x <= zona.x + zona.largura + FOLGA_DA_LIXEIRA &&
    ponto.y >= zona.y - FOLGA_DA_LIXEIRA &&
    ponto.y <= zona.y + zona.altura + FOLGA_DA_LIXEIRA
  );
}
