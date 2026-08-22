import { YStack } from '@tamagui/stacks';
import React from 'react';
import Svg, { Circle } from 'react-native-svg';

import { useTheme } from '../theme/ThemeProvider';

type Props = {
  /** 0..1 */
  fraction: number;
  color?: string;
  size?: number;
  /** Fino de propósito: o anel é instrumento, não gráfico decorativo. */
  strokeWidth?: number;
  children?: React.ReactNode;
};

/** Anel de progresso. Traço fino, trilho quase invisível, começa no topo. */
export function ProgressRing({ fraction, color, size = 44, strokeWidth = 6, children }: Props) {
  const { colors } = useTheme();
  color = color ?? colors.accent;
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - Math.max(0, Math.min(1, fraction)));

  return (
    <YStack width={size} height={size}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={colors.track}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="butt"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      {children ? (
        <YStack
          position="absolute"
          top={0}
          left={0}
          right={0}
          bottom={0}
          alignItems="center"
          justifyContent="center"
        >
          {children}
        </YStack>
      ) : null}
    </YStack>
  );
}
