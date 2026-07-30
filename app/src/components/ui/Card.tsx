import { Text } from '@tamagui/core';
import { LinearGradient } from '@tamagui/linear-gradient';
import { XStack, YStack } from '@tamagui/stacks';
import React from 'react';
import { Pressable } from 'react-native';

import { CORNER_HALO, RadialHalo } from './RadialHalo';
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
 *   1. `ShadowView` — sombra colorida, por fora do recorte;
 *   2. `YStack` com `overflow: hidden` — o recorte, que NÃO pode envolver a
 *      sombra (no iOS ele a corta e a peça fica chapada);
 *   3. `LinearGradient` de cima para baixo, tênue;
 *   4. `RadialHalo` no canto superior direito.
 *
 * O conteúdo vem por último, com `zIndex`, senão o halo o cobre.
 */

const RADIUS = 20;
const HERO_RADIUS = 24;

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
        <LinearGradient
          colors={['rgba(135,123,240,0.07)', 'rgba(135,123,240,0)']}
          locations={[0, 0.85]}
          start={[0, 0]}
          end={[0, 1]}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />
        {/* O halo sangra para fora do canto de propósito: contido, ele lê como
            um círculo desenhado em vez de luz. */}
        <YStack position="absolute" top={-40} right={-40} width={150} height={150} pointerEvents="none">
          <RadialHalo layers={CORNER_HALO} />
        </YStack>

        <YStack gap="$md" zIndex={1}>
          {eyebrow ? (
            <Text
              fontSize={11}
              fontWeight="700"
              letterSpacing={1.5}
              color="$primary"
              textTransform="uppercase"
            >
              {eyebrow}
            </Text>
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
export function Pill({ children }: { children: React.ReactNode }) {
  return (
    <XStack
      alignItems="center"
      gap={6}
      paddingHorizontal={10}
      paddingVertical={4}
      borderRadius={999}
      borderWidth={1}
      borderColor="rgba(135,123,240,0.40)"
      backgroundColor="rgba(135,123,240,0.15)"
    >
      {children}
    </XStack>
  );
}

export function PillText({ children }: { children: React.ReactNode }) {
  return (
    <Text fontSize={10.5} fontWeight="700" color="$primary" letterSpacing={0.5}>
      {children}
    </Text>
  );
}
