import { XStack, YStack } from '@tamagui/stacks';
import React from 'react';

import { useTheme } from '../theme/ThemeProvider';
import { Data, Label } from './ui';

type Props = {
  /** Posição do valor atual na régua, 0..1. */
  position: number;
  /** Marcas do eixo, da esquerda para a direita. */
  ticks: string[];
  color?: string;
  label?: string;
};

/**
 * Régua de referência. A faixa é neutra e só o marcador carrega cor — a
 * informação está na posição, não no fundo. Uma barra com gradiente
 * vermelho→verde seria leitura de semáforo.
 */
export function Scale({ position, ticks, color, label }: Props) {
  const { colors } = useTheme();
  color = color ?? colors.accent;
  const left: `${number}%` = `${Math.max(0, Math.min(1, position)) * 100}%`;

  return (
    <YStack>
      {label ? <Label marginBottom="$md">{label}</Label> : null}

      <YStack height={4} borderRadius={2} backgroundColor="$track" marginBottom="$sm">
        {ticks.map((_, i) => (
          <YStack
            key={i}
            position="absolute"
            top={-4}
            left={`${(i / (ticks.length - 1)) * 100}%`}
            width={1.5}
            height={10}
            backgroundColor="$border"
          />
        ))}
        <YStack
          position="absolute"
          top={-6}
          left={left}
          width={4}
          height={14}
          borderRadius={1.5}
          marginLeft={-1.5}
          style={{ backgroundColor: color }}
        />
      </YStack>

      <XStack justifyContent="space-between">
        {ticks.map((t, i) => (
          <Data
            key={t}
            textAlign={i === 0 ? 'left' : i === ticks.length - 1 ? 'right' : 'center'}
          >
            {t}
          </Data>
        ))}
      </XStack>
    </YStack>
  );
}
