import { XStack, YStack } from '@tamagui/stacks';
import { Data } from './Type';
import React from 'react';
import { Pressable } from 'react-native';

import { ShadowView } from './ShadowView';
import { useCardShadow, useHighlightShadow, useSurfaceColor } from './elevation';

/**
 * Os cards do sistema visual portado do MUVX.
 *
 * Duas variantes, e a diferença entre elas é o que carrega a hierarquia da
 * tela: `HeroCard` é a peça em destaque — no máximo uma por tela — e `Card` é
 * tudo o mais.
 *
 * A composição do hero tem quatro camadas empilhadas, e a ordem importa:
 *
 *   1. `ShadowView`, sombra neutra e discreta, por fora do recorte;
 *   2. `YStack` com `overflow: hidden` — o recorte, que NÃO pode envolver a
 *      sombra (no iOS ele a corta e a peça fica chapada);
 *
 * Sem brilho e sem halo: a peça se destaca pela superfície e pelo fio.
 */

const RADIUS = 12;
const HERO_RADIUS = 16;

type CardProps = {
  children: React.ReactNode;
  onPress?: () => void;
  selected?: boolean;
  accessibilityLabel?: string;
};

export function Card({ children, onPress, selected, accessibilityLabel }: CardProps) {
  const shadow = useCardShadow();
  const surface = useSurfaceColor();

  const body = (
    <ShadowView shadow={shadow} radius={RADIUS} backgroundColor={surface}>
      <YStack
        borderRadius={RADIUS}
        padding="$lg"
        gap="$sm"
        borderWidth={selected ? 2 : 1}
        borderColor={selected ? '$primary' : '$border'}
        overflow="hidden"
      >
        {children}
      </YStack>
    </ShadowView>
  );

  if (!onPress) return body;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => (pressed ? { opacity: 0.72 } : undefined)}
    >
      {body}
    </Pressable>
  );
}

type HeroCardProps = CardProps & {
  /** Etiqueta em caixa alta acima do título. */
  eyebrow?: string;
};

export function HeroCard({
  children,
  eyebrow,
  onPress,
  selected,
  accessibilityLabel,
}: HeroCardProps) {
  const shadow = useHighlightShadow();
  const surface = useSurfaceColor();

  const body = (
    <ShadowView shadow={shadow} radius={HERO_RADIUS} backgroundColor={surface}>
      <YStack
        borderRadius={HERO_RADIUS}
        padding="$xl"
        gap="$md"
        borderWidth={selected ? 2 : 1}
        borderColor={selected ? '$primary' : '$border'}
        overflow="hidden"
        position="relative"
      >
        <YStack gap="$md" zIndex={1}>
          {eyebrow ? (
            <Data
              fontWeight="700"
              letterSpacing={1.5}
              color="$primary"
              textTransform="uppercase"
            >
              {eyebrow}
            </Data>
          ) : null}
          {children}
        </YStack>
      </YStack>
    </ShadowView>
  );

  if (!onPress) return body;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => (pressed ? { opacity: 0.72 } : undefined)}
    >
      {body}
    </Pressable>
  );
}

/**
 * Pílula de metadado — duração, contagem, estado.
 *
 * Carrega o acento porque o que ela mostra é dado. Um rótulo de navegação
 * dentro de uma pílula dessas seria acento sem dado, e o sistema perde o sinal.
 */
export { Pill, PillText } from './Pill';
