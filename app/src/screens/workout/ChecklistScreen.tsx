import { useNavigation } from '@react-navigation/native';
import { XStack, YStack } from '@tamagui/stacks';
import React, { useMemo } from 'react';

import { DetailScreen } from '../../components/DetailScreen';
import { Icon } from '../../components/Icon';
import { Body, Card, Data, Display, RatingText, SectionTitle } from '../../components/ui';
import { useWorkoutStore } from '../../store/workout.store';
import { useTheme } from '../../theme/ThemeProvider';
import { PHASE_COLOR, PHASE_NAME, type PhaseType } from './PhaseBar';

/**
 * Checklist do treino — a lista inteira, agrupada por fase.
 *
 * É o complemento da tela de execução, que mostra UM exercício por vez. Aquela
 * decisão é certa durante o treino e cega entre as séries: sem uma visão do
 * todo, não dá para saber quanto falta nem decidir se dá tempo de terminar.
 *
 * O progresso aqui é de SÉRIES concluídas, não de exercícios. Um exercício de
 * quatro séries com três feitas não é "não feito" — e um contador que só conta
 * exercício inteiro fica parado por vários minutos, o que faz a barra parecer
 * travada justamente quando a pessoa está trabalhando.
 */
export function ChecklistScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation<any>();
  const workout = useWorkoutStore((s) => s.workout);
  const progress = useWorkoutStore((s) => s.progress);

  const fases = useMemo(() => {
    return (workout?.phases ?? []).map((phase) => {
      const exercicios = phase.exercises.map((exercise) => {
        const sets = progress[exercise.id] ?? [];
        const feitas = sets.filter((s) => s.completed).length;
        return { exercise, feitas, total: sets.length || exercise.sets.length };
      });
      return {
        tipo: phase.type as PhaseType,
        exercicios,
        feitas: exercicios.reduce((n, e) => n + e.feitas, 0),
        total: exercicios.reduce((n, e) => n + e.total, 0),
      };
    });
  }, [workout, progress]);

  if (!workout) {
    return (
      <DetailScreen title="Checklist">
        <Body>Nenhum treino em andamento.</Body>
      </DetailScreen>
    );
  }

  const feitas = fases.reduce((n, f) => n + f.feitas, 0);
  const total = fases.reduce((n, f) => n + f.total, 0);
  const fracao = total > 0 ? feitas / total : 0;

  return (
    <DetailScreen title="Checklist">
      <YStack marginBottom="$xl">
        <Display>{Math.round(fracao * 100)}%</Display>
        <Data marginTop="$xs">
          {feitas} de {total} séries
        </Data>
        <RatingText marginTop="$sm">{incentivo(fracao)}</RatingText>

        <YStack height={5} borderRadius={3} backgroundColor="$track" marginTop="$md" overflow="hidden">
          <YStack
            height={5}
            borderRadius={3}
            backgroundColor="$primary"
            width={`${Math.max(fracao * 100, 1)}%`}
          />
        </YStack>
      </YStack>

      {fases.map((fase) => {
        const cor = PHASE_COLOR[fase.tipo];
        const completa = fase.total > 0 && fase.feitas === fase.total;
        return (
          <YStack key={fase.tipo} marginBottom="$xl">
            <XStack alignItems="center" justifyContent="space-between" marginBottom="$md">
              <XStack alignItems="center" gap="$sm">
                {/*
                  A cor da fase é valor calculado, não token: vai em `style`,
                  porque `backgroundColor` de token só aceita nome de token.
                */}
                <YStack width={3} height={16} borderRadius={2} style={{ backgroundColor: cor }} />
                <SectionTitle>{PHASE_NAME[fase.tipo]}</SectionTitle>
              </XStack>
              {completa ? (
                <XStack alignItems="center" gap="$xs">
                  <Icon name="check" size={13} color={colors.accent} />
                  <Data color="$primary">Concluída</Data>
                </XStack>
              ) : (
                <Data>
                  {fase.feitas}/{fase.total}
                </Data>
              )}
            </XStack>

            <YStack gap="$sm">
              {fase.exercicios.map(({ exercise, feitas: f, total: t }) => {
                const pronto = t > 0 && f === t;
                return (
                  /*
                    Tocar leva ATÉ o exercício, na tela de execução.

                    A lista era só leitura, e a pessoa tentava tocar para trocar
                    ou concluir — relatado em ago/2026. Repetir aqui os controles
                    da execução criaria dois lugares para a mesma coisa, que
                    divergem na primeira mudança; o checklist é o MAPA, e o que
                    falta a um mapa é poder ir ao ponto.
                  */
                  <Card
                    key={exercise.id}
                    selected={pronto}
                    accessibilityLabel={`${exercise.name}, ${f} de ${t} séries. Abrir na execução`}
                    onPress={() =>
                      navigation.navigate('Training', { exerciseId: exercise.id })
                    }
                  >
                    <XStack alignItems="center" gap="$md">
                      <YStack flex={1} minWidth={0} gap={2}>
                        <Body color="$foreground" numberOfLines={1}>
                          {exercise.name}
                        </Body>
                        <Data numberOfLines={1}>{resumo(t, exercise)}</Data>
                      </YStack>
                      <Data>
                        {f}/{t}
                      </Data>
                      <Icon
                        name="check"
                        size={16}
                        color={pronto ? colors.accent : colors.hairlineStrong}
                      />
                      {/* A seta diz que a linha é alvo — sem ela, o toque é uma
                          descoberta por tentativa. */}
                      <Icon name="arrowRight" size={15} color={colors.textMuted} strokeWidth={1.5} />
                    </XStack>
                  </Card>
                );
              })}
            </YStack>
          </YStack>
        );
      })}
    </DetailScreen>
  );
}

/**
 * Uma linha de incentivo, e ela é sobre ESFORÇO, não sobre corpo.
 *
 * "Bom começo" fala do que a pessoa fez; qualquer frase sobre resultado físico
 * seria promessa que um treino não cumpre.
 */
function incentivo(fracao: number): string {
  if (fracao >= 1) return 'Treino completo';
  if (fracao >= 0.75) return 'Reta final';
  if (fracao >= 0.4) return 'Metade do caminho';
  if (fracao > 0) return 'Bom começo';
  return 'Vamos começar';
}

function resumo(total: number, exercise: { sets: { repetitions?: string | number | null }[] }): string {
  const reps = exercise.sets[0]?.repetitions;
  const serie = `${total} ${total === 1 ? 'série' : 'séries'}`;
  return reps ? `${serie} · ${reps} reps` : serie;
}
