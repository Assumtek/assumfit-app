import { XStack } from '@tamagui/stacks';
import React from 'react';
import { ActivityIndicator, Pressable } from 'react-native';

import { stateColor, type Rating } from '../domain/ratings';
import { useTheme } from '../theme/ThemeProvider';
import { Card } from './ui/Card';
import { Data, Label, RatingText } from './ui';
import { ProgressRing } from './ProgressRing';

type Props = {
  label: string;
  rating: Rating;
  /**
   * A pulseira está medindo esta grandeza AGORA. Só muda algo enquanto não há
   * valor: o traço vira "medindo", que é a diferença entre vazio e a caminho.
   * Com valor na tela, medição em curso não apaga o que já foi medido.
   */
  pending?: boolean;
  onPress?: () => void;
};

/**
 * Célula do grid 2×2 da home.
 *
 * Passou a ser um `Card` com sombra em camadas — o mesmo do sistema de treino.
 * Antes era a `Surface` de relevo material, que funcionava no escuro e ficava
 * chapada no claro; a sombra resolve os dois.
 */
export function MetricBlock({ label, rating, pending, onPress }: Props) {
  const { colors } = useTheme();
  const medindo = pending === true && !rating.available;
  return (
    <Pressable
      style={({ pressed }) => [{ flex: 1 }, pressed && { opacity: 0.6 }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={medindo ? { busy: true } : undefined}
      accessibilityLabel={
        medindo ? `${label}: medindo agora` : `${label}: ${rating.label}, ${rating.detail}`
      }
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
          {medindo ? (
            // No lugar do anel, com o mesmo diâmetro: a troca não muda a
            // altura do card nem faz o grid respirar entre estados.
            <XStack width={32} height={32} alignItems="center" justifyContent="center">
              <ActivityIndicator size="small" color={colors.textMuted} />
            </XStack>
          ) : (
            <ProgressRing
              fraction={rating.fraction}
              color={stateColor(rating.state, colors)}
              size={32}
              strokeWidth={8}
            />
          )}
          <Data numberOfLines={1}>{medindo ? 'medindo agora' : rating.detail}</Data>
        </XStack>
      </Card>
    </Pressable>
  );
}
