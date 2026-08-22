import { Text } from '@tamagui/core';
import { YStack } from '@tamagui/stacks';
import React from 'react';
import Svg, { Circle } from 'react-native-svg';

import { useTheme } from '../theme/ThemeProvider';
import { Data } from './ui';

/**
 * O anel da água — o dia inteiro num círculo, como o do ciclo.
 *
 * Pedido da fundadora (ago/2026): a barra vira anel, e dentro dele a conta em
 * mililitros — "600 ml / 3000 ml" — sem "faltam X copos" e sem a fórmula da
 * meta embaixo. O número grande é o que já foi bebido; a meta é sub-label.
 * Só o arco carrega o acento: é o dado.
 */
const TAMANHO = 220;
const TRACO = 12;

export function WaterRing({ ml, metaMl }: { ml: number; metaMl: number }) {
  const { colors } = useTheme();
  const raio = (TAMANHO - TRACO) / 2;
  const centro = TAMANHO / 2;
  const circunferencia = 2 * Math.PI * raio;
  const fracao = metaMl > 0 ? Math.min(1, ml / metaMl) : 0;

  return (
    <YStack alignSelf="center" width={TAMANHO} height={TAMANHO} alignItems="center" justifyContent="center">
      <Svg width={TAMANHO} height={TAMANHO} style={{ position: 'absolute' }}>
        <Circle cx={centro} cy={centro} r={raio} stroke={colors.track} strokeWidth={TRACO} fill="none" />
        <Circle
          cx={centro}
          cy={centro}
          r={raio}
          stroke={colors.accent}
          strokeWidth={TRACO}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circunferencia} ${circunferencia}`}
          strokeDashoffset={circunferencia * (1 - fracao)}
          rotation={-90}
          origin={`${centro}, ${centro}`}
        />
      </Svg>
      <YStack alignItems="center" gap={4}>
        <Text fontSize={44} fontWeight="200" letterSpacing={-1.5} color="$foreground" fontVariant={['tabular-nums']}>
          {ml.toLocaleString('pt-BR')}
          <Text fontSize={18} fontWeight="300" color="$mutedForeground">
            {' '}ml
          </Text>
        </Text>
        <Data>de {metaMl.toLocaleString('pt-BR')} ml</Data>
      </YStack>
    </YStack>
  );
}
