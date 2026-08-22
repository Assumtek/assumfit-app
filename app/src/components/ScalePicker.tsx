import { XStack, YStack } from '@tamagui/stacks';
import { Body } from './ui';
import React from 'react';
import { Pressable } from 'react-native';

/**
 * Escala de resposta do "como foi" — esforço percebido, nota da sessão.
 * Nenhum valor vem marcado: resposta pré-selecionada vira resposta não dada.
 *
 * Extraída do fim de treino guiado quando o registro de esporte passou a
 * fazer a mesma pergunta (ago/2026) — uma escala, duas telas.
 */
export function ScalePicker({
  values,
  value,
  onPick,
  label,
}: {
  values: number[];
  value: number | null;
  onPick: (v: number) => void;
  label: string;
}) {
  return (
    <XStack gap="$sm">
      {values.map((v) => (
        <Pressable
          key={v}
          onPress={() => onPick(v)}
          accessibilityRole="radio"
          accessibilityState={{ selected: value === v }}
          accessibilityLabel={`${label} ${v}`}
          style={{ flex: 1 }}
        >
          <YStack
            alignItems="center"
            paddingVertical="$md"
            borderRadius={12}
            borderWidth={1}
            borderColor={value === v ? '$primary' : '$border'}
            backgroundColor={value === v ? 'rgba(135,123,240,0.15)' : 'transparent'}
          >
            <Body
              fontWeight={value === v ? '700' : '400'}
              color={value === v ? '$primary' : '$mutedForeground'}
            >
              {v}
            </Body>
          </YStack>
        </Pressable>
      ))}
    </XStack>
  );
}
