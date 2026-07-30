import { XStack, YStack } from '@tamagui/stacks';
import React from 'react';
import { Pressable } from 'react-native';

import { stateColor, type Rating } from '../domain/ratings';
import { useTheme } from '../theme/ThemeProvider';
import { Card } from './ui/Card';
import { Data, Label, RatingText } from './ui';
import { ProgressRing } from './ProgressRing';

type Props = {
  label: string;
  rating: Rating;
  onPress?: () => void;
};

/**
 * Célula do grid 2×2 da home.
 *
 * Passou a ser um `Card` com sombra em camadas — o mesmo do sistema de treino.
 * Antes era a `Surface` de relevo material, que funcionava no escuro e ficava
 * chapada no claro; a sombra resolve os dois.
 */
export function MetricBlock({ label, rating, onPress }: Props) {
  const { colors } = useTheme();
  return (
    <Pressable
      style={({ pressed }) => [{ flex: 1 }, pressed && { opacity: 0.6 }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${rating.label}, ${rating.detail}`}
    >
      <Card>
        <Label marginBottom="$sm" numberOfLines={1}>
          {label}
        </Label>
        {/*
          A avaliação usa a cor do estado — `alert` só quando o valor saiu da
          faixa saudável, nunca para separar "bom" de "excelente".
        */}
        <RatingText
          numberOfLines={1}
          color={rating.state === 'alert' ? '$destructive' : '$foreground'}
        >
          {rating.label}
        </RatingText>
        <XStack alignItems="center" gap="$sm" marginTop="$md">
          <ProgressRing
            fraction={rating.fraction}
            color={stateColor(rating.state, colors)}
            size={30}
            strokeWidth={5}
          />
          <Data numberOfLines={1}>{rating.detail}</Data>
        </XStack>
      </Card>
    </Pressable>
  );
}
