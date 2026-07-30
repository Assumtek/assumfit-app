import { Text } from '@tamagui/core';
import { XStack } from '@tamagui/stacks';
import React from 'react';
import { ActivityIndicator, Pressable } from 'react-native';

import { ShadowView } from './ShadowView';
import { useCtaShadow } from './elevation';

/**
 * Botão do sistema visual.
 *
 * Três variantes, e a diferença entre elas não é decorativa:
 *
 * - `primary` — preenchido com o acento e com sombra colorida. É a ação
 *   principal da tela, no máximo uma por vez.
 * - `secondary` — contornado. Ação alternativa que não compete.
 * - `ghost` — só texto. Saída, "agora não", "pular".
 *
 * O texto sobre o acento é o ink escuro da marca nos DOIS temas: `#877BF0` é um
 * roxo médio, e texto claro em cima dele não alcança contraste. É o mesmo
 * motivo pelo qual `primaryForeground` no config não vira com o tema.
 */

type Variant = 'primary' | 'secondary' | 'ghost';

/**
 * Altura. `lg` é a ação principal; `md` é para ação secundária em linha, onde
 * dois botões da mesma altura da principal somariam mais massa que ela e
 * inverteriam a hierarquia da tela.
 */
type Size = 'lg' | 'md';

const HEIGHT: Record<Size, number> = { lg: 56, md: 44 };

type Props = {
  title: string;
  onPress: () => void;
  variant?: Variant;
  size?: Size;
  icon?: React.ReactNode;
  loading?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
};

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'lg',
  icon,
  loading,
  disabled,
  accessibilityLabel,
}: Props) {
  const shadow = useCtaShadow();
  const inactive = disabled || loading;

  const content = (
    <XStack
      alignItems="center"
      justifyContent="center"
      gap="$sm"
      height={HEIGHT[size]}
      paddingHorizontal="$xl"
      borderRadius={14}
      backgroundColor={variant === 'primary' ? '$primary' : 'transparent'}
      borderWidth={variant === 'secondary' ? 1 : 0}
      borderColor="$borderStrong"
      opacity={inactive ? 0.55 : 1}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? '#0E0A22' : undefined} />
      ) : (
        icon
      )}
      <Text
        fontSize={size === 'lg' ? 15 : 14}
        fontWeight="700"
        color={variant === 'primary' ? '$primaryForeground' : '$foreground'}
      >
        {title}
      </Text>
    </XStack>
  );

  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: Boolean(inactive) }}
      style={({ pressed }) => (pressed ? { opacity: 0.8 } : undefined)}
    >
      {/*
        Só a variante primária projeta sombra. Sombra colorida atrás de um botão
        contornado não lê como relevo — lê como borrão, porque não há massa que
        a justifique.
      */}
      {variant === 'primary' && !inactive ? (
        <ShadowView shadow={shadow} radius={14} backgroundColor="#877BF0">
          {content}
        </ShadowView>
      ) : (
        content
      )}
    </Pressable>
  );
}
