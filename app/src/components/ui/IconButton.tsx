import { YStack } from '@tamagui/stacks';
import React from 'react';
import { Pressable } from 'react-native';

/**
 * Botão circular de controle (voltar, checklist, pausar) no cabeçalho de uma
 * tela de execução. O rótulo de acessibilidade é obrigatório: o botão é só
 * um glifo.
 */
export function IconButton({ children, onPress, label }: { children: React.ReactNode; onPress: () => void; label: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}>
      <YStack backgroundColor="$control" borderRadius={999} padding="$md">
        {children}
      </YStack>
    </Pressable>
  );
}
