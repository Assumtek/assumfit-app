import { XStack, YStack } from '@tamagui/stacks';
import React from 'react';
import { Pressable } from 'react-native';
import Svg, { ClipPath, Defs, Path, Rect } from 'react-native-svg';

import { useHabitsStore } from '../store/habits.store';
import { useTheme } from '../theme/ThemeProvider';
import { Data, Label, MetricSm } from './ui';
import { Card } from './ui/Card';

/**
 * A gota oficial do Lucide (`droplet`, caixa 24×24) — o "algo pronto" que a
 * fundadora pediu no lugar da garrafa desenhada à mão (ago/2026). O caminho é
 * fechado, então serve de contorno E de recorte: a água sobe dentro da própria
 * forma, sem vazar do desenho.
 */
const GOTA =
  'M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z';

/** Limites verticais úteis da gota, em unidades da caixa de 24. */
const TOPO = 2.5;
const FUNDO = 22;

/** 64 px de tela ÷ caixa de 24 ≈ 2,7×; 0.75 aqui vira o traço de ~2 px do sistema. */
const TRACO = 0.75;

/**
 * Água de hoje, com a gota como instrumento: o preenchimento é a fração da
 * meta, o percentual e a quantidade acompanham em texto. Meia tela de largura,
 * par da bateria do corpo ao lado.
 *
 * O preenchimento usa o acento, como anel e sparkline: a regra é uma só, o
 * acento é do dado. Azul de água introduziria uma segunda cor de dado que o
 * sistema não tem.
 */
export function WaterCard({ onPress }: { onPress?: () => void }) {
  const { colors } = useTheme();
  const waterMl = useHabitsStore((s) => s.today.waterMl);
  const goalMl = useHabitsStore((s) => s.goalMl);

  const fraction = goalMl > 0 ? Math.min(1, waterMl / goalMl) : 0;
  const pct = Math.round(fraction * 100);
  const litros = (ml: number) => (ml / 1000).toFixed(1).replace('.', ',');

  const nivel = FUNDO - fraction * (FUNDO - TOPO);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Água de hoje: ${pct} por cento da meta, ${litros(waterMl)} de ${litros(goalMl)} litros`}
      style={({ pressed }) => pressed && { opacity: 0.6 }}
    >
      <Card>
        <Label marginBottom="$md">água de hoje</Label>
        <XStack alignItems="flex-end" gap="$md">
          <Svg width={64} height={64} viewBox="0 0 24 24">
            <Defs>
              <ClipPath id="gota">
                <Path d={GOTA} />
              </ClipPath>
            </Defs>
            {/* Trilho: o interior vazio, na mesma cor de trilho dos anéis. */}
            <Path d={GOTA} fill={colors.track} />
            {/* A água: um retângulo cortado pela gota, do fundo ao nível. */}
            <Rect
              x={0}
              y={nivel}
              width={24}
              height={FUNDO - nivel}
              fill={colors.accent}
              clipPath="url(#gota)"
            />
            {/* Contorno por cima, para a borda continuar nítida com água atrás. */}
            <Path
              d={GOTA}
              fill="none"
              stroke={colors.textMuted}
              strokeWidth={TRACO}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </Svg>
          <YStack paddingBottom="$xs" flexShrink={1}>
            <MetricSm>{pct}%</MetricSm>
            <Data marginTop="$xs">
              {litros(waterMl)} de {litros(goalMl)} L
            </Data>
          </YStack>
        </XStack>
      </Card>
    </Pressable>
  );
}
