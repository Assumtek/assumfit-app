import { useNavigation } from '@react-navigation/native';
import { Text } from '@tamagui/core';
import { XStack, YStack } from '@tamagui/stacks';
import React, { useEffect } from 'react';

import { DetailScreen, usePullRefresh } from '../../components/DetailScreen';
import { Icon } from '../../components/Icon';
import { Button, Card, Data, HeroCard, Pill, PillText, SectionTitle } from '../../components/ui';
import { QuickMenu } from './QuickMenu';
import { DAY_LABEL, WEEK_ORDER, workoutMeta } from '../../domain/workout';
import { useWorkoutStore } from '../../store/workout.store';
import { useTheme } from '../../theme/ThemeProvider';

/**
 * O plano da semana, a constância recente e o caminho para o check-in.
 *
 * A semana é uma régua de sete posições, não sete cartões. A régua mostra o
 * RITMO — quais dias treinam, quais descansam, onde está hoje —, que é a
 * informação que se procura ao abrir a tela.
 */
export function PlanScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation<any>();

  const plan = useWorkoutStore((s) => s.plan);
  const execution = useWorkoutStore((s) => s.execution);
  const loading = useWorkoutStore((s) => s.loading);
  const refresh = useWorkoutStore((s) => s.refresh);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const puxar = usePullRefresh(refresh);

  if (loading && !plan) {
    return (
      <DetailScreen title="Treino" refreshControl={puxar}>
        <Text fontSize={15} color="$mutedForeground">
          Carregando…
        </Text>
      </DetailScreen>
    );
  }

  if (!plan) {
    return (
      <DetailScreen title="Treino" refreshControl={puxar}>
        <YStack gap="$xl" paddingTop="$lg">
          <YStack gap="$xs">
            <Text fontSize={24} fontWeight="800" color="$foreground" letterSpacing={-0.5}>
              Você ainda não tem um plano
            </Text>
            <Text fontSize={14} color="$mutedForeground">
              Algumas perguntas sobre saúde e rotina, e o treino é montado a partir delas —
              respeitando o que você já respondeu no perfil.
            </Text>
          </YStack>
          <Button
            title="Montar meu treino"
            icon={<Icon name="dumbbell" size={16} color={colors.ink} />}
            onPress={() => navigation.navigate('Anamnesis')}
          />
        </YStack>
      </DetailScreen>
    );
  }

  const byDay = new Map(plan.days.map((d) => [d.dayOfWeek, d]));
  const todayWorkout = byDay.get(plan.today)?.workout ?? null;
  return (
    <DetailScreen title="Treino" refreshControl={puxar}>
      <YStack gap="$xl" paddingTop="$lg">
        <YStack gap="$md">
          <SectionTitle>Treino de hoje</SectionTitle>
        <HeroCard eyebrow={todayWorkout ? 'treino de hoje' : DAY_LABEL[plan.today]}>
          <XStack alignItems="flex-start" gap="$md">
            <YStack flex={1} gap={6} minWidth={0}>
              <Text fontSize={22} fontWeight="800" color="$foreground" letterSpacing={-0.5}>
                {todayWorkout ? todayWorkout.name : 'Dia de descanso'}
              </Text>
              <Text fontSize={13} color="$mutedForeground">
                {todayWorkout
                  ? workoutMeta(todayWorkout.muscleGroups, todayWorkout.exerciseCount)
                  : 'Recuperação é o que faz a adaptação acontecer.'}
              </Text>
            </YStack>
            {todayWorkout?.estimatedDuration ? (
              <Pill>
                <Icon name="clock" size={12} color={colors.accent} />
                <PillText>{todayWorkout.estimatedDuration} min</PillText>
              </Pill>
            ) : null}
          </XStack>

          {/*
            A ação mora DENTRO do card, e não abaixo dele.

            Card e botão soltos são duas peças que a pessoa precisa relacionar;
            juntos são uma coisa só — "este é o treino, comece por aqui". Foi a
            mudança que mais aproximou a tela da referência.
          */}
          <YStack marginTop="$lg">
            <Button
              title={
                execution ? 'Continuar treino' : todayWorkout ? 'Começar treino' : 'Treinar mesmo assim'
              }
              icon={<Icon name="play" size={16} color={colors.ink} />}
              onPress={() => navigation.navigate(execution ? 'Training' : 'Checkin')}
            />
          </YStack>
        </HeroCard>
        </YStack>

        <YStack gap="$md">
          <SectionTitle>Menu rápido</SectionTitle>
        {/*
          Menu rápido logo abaixo da ação principal, e acima da semana.

          Ele é NAVEGAÇÃO, e navegação vem antes de leitura: quem abriu a tela
          para ir ao histórico não deveria rolar a semana e a lista de treinos
          inteira até achar a porta.
        */}
        <QuickMenu />
        </YStack>

        {/*
          A semana como LISTA de dias, não como régua de traços.

          A régua mostrava o ritmo — quais dias treinam — e escondia o conteúdo:
          para saber o que é o treino de quinta era preciso rolar até a lista
          embaixo e cruzar na cabeça. A lista responde as duas perguntas no
          mesmo lugar, e o dia de descanso deixa de ser um traço apagado para
          virar uma afirmação.
        */}
        <YStack gap="$md">
          <SectionTitle>Sua semana</SectionTitle>
          {WEEK_ORDER.map((day) => {
            const entry = byDay.get(day);
            const hoje = day === plan.today;
            const treina = entry?.dayType === 'WORKOUT' && entry.workout;
            return (
              <Card key={day} selected={hoje}>
                <XStack alignItems="center" gap="$md">
                  {/* Barra de fase à esquerda: acento só no dia de hoje, e só
                      quando ele treina — é o único acento desta lista. */}
                  <YStack
                    width={3}
                    height={treina ? 34 : 18}
                    borderRadius={2}
                    backgroundColor={hoje && treina ? '$primary' : '$borderStrong'}
                  />
                  <YStack flex={1} minWidth={0} gap={2}>
                    <XStack alignItems="center" gap="$sm">
                      {/*
                        Token nos DOIS ramos, nunca `undefined`.

                        `color={undefined}` não deixa o padrão do `styled`
                        valer — ele o ANULA, e o `Text` do React Native cai no
                        preto. Num tema escuro isso é texto invisível, e o
                        typecheck não acusa porque `undefined` é um valor
                        legítimo para a prop.
                      */}
                      <Data color={hoje ? '$foreground' : '$faint'}>{DAY_LABEL[day]}</Data>
                      {hoje ? <Data color="$primary">hoje</Data> : null}
                    </XStack>
                    {treina ? (
                      <>
                        <Text fontSize={15} fontWeight="700" color="$foreground" numberOfLines={1}>
                          {entry!.workout!.name}
                        </Text>
                        <Data numberOfLines={1}>
                          {workoutMeta(entry!.workout!.muscleGroups, entry!.workout!.exerciseCount)}
                        </Data>
                      </>
                    ) : (
                      <XStack alignItems="center" gap="$sm">
                        <Icon name="moon" size={13} color={colors.textMuted} />
                        <Data>Descanso</Data>
                      </XStack>
                    )}
                  </YStack>
                  {treina && entry!.workout!.estimatedDuration ? (
                    <Data flexShrink={0}>{entry!.workout!.estimatedDuration} min</Data>
                  ) : null}
                </XStack>
              </Card>
            );
          })}
        </YStack>

        {/*
          A lista "Treinos" saiu.

          Ela repetia exatamente o que a semana agora mostra — mesmo nome, mesma
          meta, mesma duração — só que sem o dia. Dois blocos com o mesmo
          conteúdo fazem a pessoa procurar a diferença entre eles, e não há.
        */}

      </YStack>
    </DetailScreen>
  );
}
