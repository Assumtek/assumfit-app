import { XStack, YStack } from '@tamagui/stacks';
import React from 'react';

import { ProgressRing } from './ProgressRing';
import { Micro } from './ui';
import type { DiaDaFita } from '../domain/dailyGoals';
import { useTheme } from '../theme/ThemeProvider';

type Props = {
  dias: DiaDaFita[];
  onPress?: () => void;
};

/**
 * A semana em sete anéis.
 *
 * Serve para uma coisa só: mostrar que ontem existiu. O anel de hoje sozinho
 * não diz se a pessoa vem se movendo ou se hoje é a exceção.
 *
 * O dia de hoje se marca pelo PESO do rótulo e pela cor de frente, não por um
 * fundo ou um traço colorido: o acento pertence ao dado (o anel), e gastá-lo
 * na navegação tira força de onde ele informa.
 */
export function WeekStrip({ dias, onPress }: Props) {
  const { colors } = useTheme();
  return (
    <XStack
      gap="$sm"
      justifyContent="space-between"
      onPress={onPress}
      pressStyle={onPress ? { opacity: 0.6 } : undefined}
    >
      {dias.map((d) => (
        <YStack key={d.day} alignItems="center" gap="$xs" flex={1}>
          <Micro color={d.hoje ? '$foreground' : '$mutedForeground'}>{d.letra}</Micro>
          <ProgressRing
            fraction={d.futuro ? 0 : d.fraction}
            size={28}
            strokeWidth={4}
            color={d.fraction >= 1 ? colors.good : colors.accent}
          />
        </YStack>
      ))}
    </XStack>
  );
}
