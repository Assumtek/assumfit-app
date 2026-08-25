import { YStack } from '@tamagui/stacks';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView } from 'react-native';

import { Icon } from '../../components/Icon';
import { SwitchRow } from '../../components/List';
import { Body, Data, Label, SectionTitle } from '../../components/ui';
import { Card } from '../../components/ui/Card';
import { Sheet } from '../../components/ui/Dialog';
import {
  fetchSimilarExercises,
  type SimilarExercise,
  type WorkoutExercise,
} from '../../services/api.service';
import { ordenarSubstitutos, type MotivoDeTroca } from '../../domain/prescription';
import { useTheme } from '../../theme/ThemeProvider';

/**
 * Troca de exercício durante a execução.
 *
 * A troca é **local à sessão por padrão**: não reescreve o plano. Quem chegou e
 * encontrou a máquina ocupada precisa de uma alternativa agora, não de uma
 * prescrição nova, e alterar o plano por causa de uma máquina ocupada seria
 * deixar a academia decidir o treino das próximas quatro semanas.
 *
 * O que mudou em 24/08/2026, a pedido de um testador: existe um caso em que a
 * troca É para valer, e o app decidia por ele. "Ao trocar, perguntar se na
 * ficha para os próximos treinos desse dia trazer o que foi selecionado ou se
 * é especificamente para aquele treino" (Bruno). Agora quem decide é a pessoa,
 * num interruptor que fica ao lado da lista e cujo padrão continua sendo o
 * conservador: só hoje.
 *
 * A trava não afrouxou. O servidor só aceita fixar um substituto que ele mesmo
 * ofereceu como similar, o que mantém grupo muscular e tipo, e a porta para
 * prescrever qualquer coisa do catálogo continua sendo só o ajuste
 * conversacional, com o agente e as travas clínicas.
 */
export function ExerciseSwapSheet({
  exercise,
  motivo,
  onClose,
  onPick,
}: {
  exercise: WorkoutExercise;
  /** De Sinalizar: ordena a lista. `null` no botão Trocar, que não pergunta. */
  motivo?: MotivoDeTroca | null;
  onClose: () => void;
  onPick?: (replacement: SimilarExercise, tambemNoPlano: boolean) => void;
}) {
  const { colors } = useTheme();
  const [options, setOptions] = useState<SimilarExercise[] | null>(null);
  /*
   Padrão FALSO, e é uma decisão de produto, não um detalhe: a troca de hoje é
   o caso comum (máquina ocupada), e um padrão que reescreve o plano faria a
   academia decidir as próximas semanas sem ninguém pedir.
  */
  const [fixarNoPlano, setFixarNoPlano] = useState(false);
  /*
   A ordem é do MOTIVO. O servidor manda o mesmo equipamento primeiro; com a
   máquina ocupada é exatamente o que não serve, e quem não sabe executar
   quer o nível mais simples. Ordenar aqui não remove ninguém.
  */
  const ordenadas = options ? ordenarSubstitutos(options, motivo, exercise.equipment) : null;
  const legenda =
    motivo === 'equipamento'
      ? 'Mesmo músculo, outro equipamento primeiro.'
      : motivo === 'execucao'
        ? 'As versões mais simples primeiro.'
        : null;

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
          <YStack flex={1} gap={4}>
            <Label>trocar</Label>
            <SectionTitle numberOfLines={1}>{exercise.name}</SectionTitle>
          </YStack>
          <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Fechar">
            <Icon name="down" size={20} color={colors.textMuted} />
          </Pressable>
        </YStack>

        {legenda ? <Data>{legenda}</Data> : null}

        {ordenadas === null ? (
          <YStack paddingVertical="$xxl" alignItems="center">
            <ActivityIndicator color={colors.accent} />
          </YStack>
        ) : ordenadas.length === 0 ? (
          <Body paddingVertical="$lg">
            Não encontramos um substituto equivalente para este exercício.
          </Body>
        ) : (
          <ScrollView style={{ maxHeight: 320 }}>
            <YStack gap="$md">
              {ordenadas.map((option) => (
                <Card
                  key={option.id}
                  onPress={() => {
                    onPick?.(option, fixarNoPlano);
                    onClose();
                  }}
                  accessibilityLabel={option.name}
                >
                  <YStack flexDirection="row" alignItems="center" gap="$md">
                    <YStack flex={1} gap={4}>
                      <Body color="$foreground" numberOfLines={1}>
                        {option.name}
                      </Body>
                      <Data numberOfLines={1}>{option.equipment}</Data>
                    </YStack>
                    <Icon name="arrowRight" size={16} color={colors.textMuted} />
                  </YStack>
                </Card>
              ))}
            </YStack>
          </ScrollView>
        )}

        <SwitchRow
          title="Valer nos próximos treinos deste dia"
          subtitle={
            fixarNoPlano
              ? 'O exercício escolhido entra na ficha e volta nas próximas semanas.'
              : 'A troca vale só para hoje, seu plano continua o mesmo.'
          }
          value={fixarNoPlano}
          onValueChange={setFixarNoPlano}
          last
        />
      </>
    </Sheet>
  );
}
