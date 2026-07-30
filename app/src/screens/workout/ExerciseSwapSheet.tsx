import { YStack } from '@tamagui/stacks';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView } from 'react-native';

import { Icon } from '../../components/Icon';
import { Body, Data, Label, SectionTitle } from '../../components/ui';
import { Card } from '../../components/ui/Card';
import { Sheet } from '../../components/ui/Dialog';
import {
  fetchSimilarExercises,
  type SimilarExercise,
  type WorkoutExercise,
} from '../../services/api.service';
import { useTheme } from '../../theme/ThemeProvider';

/**
 * Troca de exercício durante a execução.
 *
 * A troca é **local à sessão**: não reescreve o plano. Quem chegou e encontrou
 * a máquina ocupada precisa de uma alternativa agora, não de uma prescrição
 * nova — e alterar o plano por causa de uma máquina ocupada seria deixar a
 * academia decidir o treino das próximas quatro semanas.
 *
 * Para mudar o plano de verdade existe o ajuste conversacional, que passa pelo
 * agente e pelas mesmas travas clínicas.
 */
export function ExerciseSwapSheet({
  exercise,
  onClose,
  onPick,
}: {
  exercise: WorkoutExercise;
  onClose: () => void;
  onPick?: (replacement: SimilarExercise) => void;
}) {
  const { colors } = useTheme();
  const [options, setOptions] = useState<SimilarExercise[] | null>(null);

  useEffect(() => {
    let alive = true;
    fetchSimilarExercises(exercise.exerciseId)
      .then((rows) => alive && setOptions(rows))
      .catch(() => alive && setOptions([]));
    return () => {
      alive = false;
    };
  }, [exercise.exerciseId]);

  return (
    <Sheet open onClose={onClose}>
      <>
        <YStack flexDirection="row" alignItems="flex-start" gap="$md">
          <YStack flex={1} gap={2}>
            <Label>trocar</Label>
            <SectionTitle numberOfLines={1}>{exercise.name}</SectionTitle>
          </YStack>
          <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Fechar">
            <Icon name="down" size={18} color={colors.textMuted} />
          </Pressable>
        </YStack>

        {options === null ? (
          <YStack paddingVertical="$xxl" alignItems="center">
            <ActivityIndicator color={colors.accent} />
          </YStack>
        ) : options.length === 0 ? (
          <Body paddingVertical="$lg">
            Não encontramos um substituto equivalente para este exercício.
          </Body>
        ) : (
          <ScrollView style={{ maxHeight: 320 }}>
            <YStack gap="$md">
              {options.map((option) => (
                <Card
                  key={option.id}
                  onPress={() => {
                    onPick?.(option);
                    onClose();
                  }}
                  accessibilityLabel={option.name}
                >
                  <YStack flexDirection="row" alignItems="center" gap="$md">
                    <YStack flex={1} gap={2}>
                      <Body color="$foreground" numberOfLines={1}>
                        {option.name}
                      </Body>
                      <Data numberOfLines={1}>{option.equipment}</Data>
                    </YStack>
                    <Icon name="arrowRight" size={14} color={colors.textMuted} />
                  </YStack>
                </Card>
              ))}
            </YStack>
          </ScrollView>
        )}

        <Data>A troca vale só para hoje — seu plano continua o mesmo.</Data>
      </>
    </Sheet>
  );
}
