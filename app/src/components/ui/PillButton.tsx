import { XStack } from '@tamagui/stacks';
import React from 'react';
import { Pressable } from 'react-native';

import { Icon, type IconName } from '../Icon';
import { Body } from './Type';
import { useTheme } from '../../theme/ThemeProvider';

/**
 * Ação secundária em pílula contornada, com ícone: "Trocar", "Sinalizar".
 * Era local da tela de treino; subiu porque é a forma de toda ação pequena
 * ao lado de um título de seção.
 */
export function PillButton({ icone, rotulo, onPress }: { icone: IconName; rotulo: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button" accessibilityLabel={rotulo}>
      <XStack alignItems="center" gap="$sm" paddingHorizontal="$md" paddingVertical={12} borderRadius={999} borderWidth={1} borderColor="$border">
        <Icon name={icone} size={16} color={colors.textMuted} />
        <Body fontWeight="500">{rotulo}</Body>
      </XStack>
    </Pressable>
  );
}
