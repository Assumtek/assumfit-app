import { XStack, YStack } from '@tamagui/stacks';
import React from 'react';
import { Pressable } from 'react-native';

import { Label, MetricSm } from './ui';
import { ProgressRing } from './ProgressRing';

export type RingItem = {
  key: string;
  /** Nome embaixo do anel: Sono, Stress, Recuperação. */
  label: string;
  /** O número dentro do anel — já formatado; traço quando não medido. */
  value: string;
  /** 0..1. Zero desenha só o trilho, que é a cara honesta do não medido. */
  fraction: number;
  color: string;
  /** O que o VoiceOver fala — o trio anel+número+nome como um nó só. */
  accessibilityLabel: string;
  onPress: () => void;
};

/**
 * Os três indicadores principais do topo da home: anel, número dentro, nome
 * embaixo (decisão da fundadora, ago/2026 — Sono, Stress e Recuperação).
 *
 * Centralizado porque anel é simétrico por natureza (regra 5 do design); o
 * número dentro é `MetricSm` — peso leve, "número grande é instrumento". Cada
 * anel é porta para a própria tela: indicador que não abre nada ensina a não
 * tocar em indicador.
 */
export function HomeRings({ items }: { items: RingItem[] }) {
  return (
    <XStack justifyContent="space-between" paddingHorizontal="$sm">
      {items.map((item) => (
        <Pressable
          key={item.key}
          onPress={item.onPress}
          accessibilityRole="button"
          accessibilityLabel={item.accessibilityLabel}
          style={({ pressed }) => pressed && { opacity: 0.6 }}
        >
          <YStack alignItems="center" gap="$md">
            <ProgressRing fraction={item.fraction} color={item.color} size={88} strokeWidth={6}>
              <MetricSm>{item.value}</MetricSm>
            </ProgressRing>
            <Label>{item.label}</Label>
          </YStack>
        </Pressable>
      ))}
    </XStack>
  );
}
