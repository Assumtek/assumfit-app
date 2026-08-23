import { XStack, YStack } from '@tamagui/stacks';
import { Body } from './ui';
import React from 'react';
import { Pressable } from 'react-native';

import { type ThemeMode, useTheme } from '../theme/ThemeProvider';

const OPTIONS: { mode: ThemeMode; label: string }[] = [
  { mode: 'system', label: 'Sistema' },
  { mode: 'light', label: 'Claro' },
  { mode: 'dark', label: 'Escuro' },
];

/**
 * Controle segmentado de tema.
 *
 * Três posições, não um interruptor de duas. Um toggle claro/escuro obriga a
 * pessoa a escolher um dos dois para sempre e quebra o "escurece à noite" do
 * aparelho — que é justamente o comportamento que um app de sono deveria
 * respeitar. `Sistema` precisa ser uma posição de primeira classe, e por isso
 * vem primeiro.
 *
 * A seleção é marcada por FUNDO tênue e peso de texto, não pelo acento: o roxo
 * pertence ao dado, e configuração não é dado.
 */
export function ThemeSwitch() {
  const { mode, setMode } = useTheme();

  return (
    <XStack
      borderRadius={8}
      borderWidth={1}
      borderColor="$border"
      overflow="hidden"
      accessibilityRole="radiogroup"
    >
      {OPTIONS.map((option) => {
        const selected = mode === option.mode;
        return (
          <Pressable
            key={option.mode}
            onPress={() => setMode(option.mode)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            style={({ pressed }) => [{ flex: 1 }, pressed && { opacity: 0.5 }]}
          >
            <YStack
              paddingVertical="$md"
              alignItems="center"
              backgroundColor={selected ? '$control' : 'transparent'}
            >
              <Body
                letterSpacing={-0.2}
                fontWeight={selected ? '600' : '400'}
                color={selected ? '$foreground' : '$mutedForeground'}
              >
                {option.label}
              </Body>
            </YStack>
          </Pressable>
        );
      })}
    </XStack>
  );
}
