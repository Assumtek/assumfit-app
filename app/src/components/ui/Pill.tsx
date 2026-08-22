import { Text } from '@tamagui/core';
import { XStack } from '@tamagui/stacks';
import React from 'react';

/**
 * A pílula: rótulo curto dentro de uma cápsula.
 *
 * Havia duas, uma em `ui/Card` (acento, para etiqueta de dado) e outra em
 * `MeasureButton` (controle, para botão de medir), com o mesmo formato e cores
 * diferentes. Uma só, com variante: `accent` é etiqueta, `control` é botão.
 */
export function Pill({
  children,
  variant = 'accent',
  muted,
}: {
  children: React.ReactNode;
  variant?: 'accent' | 'control';
  /** Só em `control`: aparência apagada quando a ação não está disponível. */
  muted?: boolean;
}) {
  if (variant === 'control') {
    return (
      <XStack
        alignItems="center"
        gap="$sm"
        paddingVertical="$sm"
        paddingHorizontal="$lg"
        borderRadius={999}
        borderWidth={1}
        borderColor={muted ? '$border' : '$borderStrong'}
        backgroundColor="$control"
        alignSelf="flex-start"
      >
        {children}
      </XStack>
    );
  }
  return (
    <XStack
      alignItems="center"
      gap={8}
      paddingHorizontal={12}
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
    <Text fontSize={10} fontWeight="700" color="$primary" letterSpacing={0.5}>
      {children}
    </Text>
  );
}
