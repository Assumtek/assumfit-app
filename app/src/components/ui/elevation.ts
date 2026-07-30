import { useThemeName } from '@tamagui/core';

import type { Shadow } from './ShadowView';

/**
 * Tokens de relevo — quatro níveis, sempre via `ShadowView`.
 *
 * Portados do sistema de sombras do MUVX, com o acento do AssumFit (`#877BF0`)
 * no lugar do verde de marca deles. A geometria (deslocamento, raio, opacidade)
 * é a mesma; só a cor muda.
 *
 * **Por que os valores diferem entre os temas.** No escuro, o relevo é
 * MATERIAL: a peça se destaca por ser mais clara que o fundo, e a sombra só
 * assenta. No claro isso não existe — não há "mais claro que o papel" — então a
 * espessura inteira vem da sombra, que precisa ser mais larga e mais opaca.
 * Um card calibrado só no escuro aparece chapado no claro, e é o defeito mais
 * provável de aparecer aqui.
 *
 * O React Native não aceita alfa dentro de `shadowColor`: a transparência vai
 * em `shadowOpacity`, sempre.
 */

const ACCENT = '#877BF0';

const useIsLight = () => useThemeName() === 'light';

/** Superfície comum: card de conteúdo, linha de lista elevada. Neutra. */
export function useCardShadow(): Shadow {
  const isLight = useIsLight();
  return {
    shadowColor: isLight ? 'rgb(40,35,75)' : '#000000',
    shadowOffset: { width: 0, height: isLight ? 4 : 6 },
    shadowOpacity: isLight ? 0.06 : 0.18,
    shadowRadius: isLight ? 14 : 24,
    elevation: isLight ? 2 : 3,
  };
}

/**
 * Peça em destaque — o card do treino de hoje.
 *
 * A sombra é COLORIDA, e é o que faz a peça parecer iluminada por dentro em vez
 * de apenas levantada. É o efeito mais característico do sistema visual, e o
 * único lugar onde o acento aparece sem ser dado.
 */
export function useHighlightShadow(): Shadow {
  return {
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: useIsLight() ? 8 : 10 },
    shadowOpacity: 0.1,
    shadowRadius: useIsLight() ? 24 : 28,
    elevation: 3,
  };
}

/** Ação principal. Mais fechada e mais opaca que a de destaque. */
export function useCtaShadow(): Shadow {
  const isLight = useIsLight();
  return {
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: isLight ? 8 : 6 },
    shadowOpacity: isLight ? 0.28 : 0.25,
    shadowRadius: isLight ? 18 : 20,
    elevation: 5,
  };
}

/** Ação flutuante, acima de tudo. O único nível que sobe de verdade. */
export function useFabShadow(): Shadow {
  return {
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: useIsLight() ? 0.3 : 0.22,
    shadowRadius: 14,
    elevation: 8,
  };
}

/**
 * Cor de fundo que a sombra precisa por baixo.
 *
 * A sombra do iOS é projetada a partir do fundo da view: sobre transparente,
 * ela não desenha. Este é o valor a passar em `ShadowView backgroundColor`.
 */
export function useSurfaceColor(): string {
  return useIsLight() ? 'rgba(252,251,254,0.96)' : 'rgba(236,231,244,0.032)';
}
