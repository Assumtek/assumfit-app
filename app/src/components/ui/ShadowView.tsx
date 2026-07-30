import React from 'react';
import { View, type ViewProps, type ViewStyle } from 'react-native';

/**
 * `View` nativa que aceita props de sombra.
 *
 * Existe por um motivo específico, e não é preferência: o `YStack` do Tamagui
 * **descarta silenciosamente** `shadowColor`, `shadowOffset`, `shadowOpacity`,
 * `shadowRadius` e `elevation`. Elas não chegam à view nativa, e o resultado é
 * uma sombra que simplesmente não aparece — sem erro, sem aviso, sem nada que
 * indique o porquê.
 *
 * O desenho é sempre em duas camadas: esta `View` cuida da sombra e do raio, e
 * o `YStack` por dentro cuida de layout e recorte.
 *
 * ```tsx
 * <ShadowView shadow={useHighlightShadow()} radius={24}>
 *   <YStack borderRadius={24} overflow="hidden" padding="$lg">
 *     …
 *   </YStack>
 * </ShadowView>
 * ```
 *
 * O `overflow: 'hidden'` fica no filho, nunca aqui: no iOS ele **recorta a
 * sombra**, e uma peça com relevo vira uma peça chapada.
 */

export type Shadow = {
  shadowColor: string;
  shadowOffset: { width: number; height: number };
  shadowOpacity: number;
  shadowRadius: number;
  elevation: number;
};

type Props = ViewProps & {
  shadow: Shadow;
  /** Precisa acompanhar o raio do filho, ou a sombra sai quadrada num card redondo. */
  radius?: number;
  /**
   * A sombra do iOS é projetada a partir do FUNDO da view.
   *
   * Sobre fundo transparente ela não desenha nada — e é assim que a sombra
   * some sem explicação. Quem chama passa a cor da superfície.
   */
  backgroundColor?: string;
  style?: ViewStyle;
};

export function ShadowView({ shadow, radius, backgroundColor, style, children, ...rest }: Props) {
  return (
    <View {...rest} style={[{ borderRadius: radius, backgroundColor, ...shadow }, style]}>
      {children}
    </View>
  );
}
