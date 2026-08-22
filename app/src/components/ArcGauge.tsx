import { YStack } from '@tamagui/stacks';
import React from 'react';
import Svg, { Path } from 'react-native-svg';

import { useTheme } from '../theme/ThemeProvider';

const W = 260;
const H = 148;
const R = 118;
const ARC = `M 6 ${H - 12} A ${R} ${R} 0 0 1 ${W - 6} ${H - 12}`;
const ARC_LENGTH = Math.PI * R;

type Props = {
  /** 0..1 — quanto do arco preencher. */
  fraction: number;
  color?: string;
  children?: React.ReactNode;
};

/**
 * Arco semicircular. Monocromático de propósito: o gradiente arco-íris
 * vermelho→verde é vocabulário de semáforo, não de instrumento. Quem informa
 * que o valor saiu da faixa é a cor de `alert`, passada por quem chama.
 */
export function ArcGauge({ fraction, color, children }: Props) {
  const { colors } = useTheme();
  // O padrão vem do tema, e tema é hook — não dá para escrever
  // `color = colors.accent` na assinatura, porque a lista de parâmetros é
  // avaliada antes do corpo, onde `colors` passa a existir. Mesmo motivo em
  // todo componente que aceita cor: o padrão desce uma linha.
  color = color ?? colors.accent;
  const offset = ARC_LENGTH * (1 - Math.max(0, Math.min(1, fraction)));

  return (
    <YStack alignItems="center">
      <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        <Path d={ARC} fill="none" stroke={colors.track} strokeWidth={8} />
        <Path
          d={ARC}
          fill="none"
          stroke={color}
          strokeWidth={8}
          strokeDasharray={ARC_LENGTH}
          strokeDashoffset={offset}
        />
      </Svg>
      <YStack position="absolute" bottom={8} alignItems="center">
        {children}
      </YStack>
    </YStack>
  );
}
