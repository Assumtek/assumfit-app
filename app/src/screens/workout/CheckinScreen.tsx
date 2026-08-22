import { useNavigation, useRoute } from '@react-navigation/native';
import { Text } from '@tamagui/core';
import { XStack, YStack } from '@tamagui/stacks';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable } from 'react-native';

import { DetailScreen } from '../../components/DetailScreen';
import { Icon } from '../../components/Icon';
import { Button, Card, HeroCard, Pill, PillText } from '../../components/ui';
import { sportForModality } from '../../domain/sport';
import { DAY_LABEL, workoutMeta } from '../../domain/workout';
import { fetchWorkout, type PlanDay } from '../../services/api.service';
import { useWorkoutStore } from '../../store/workout.store';
import { darkPalette } from '../../theme/palette';
import { useTheme } from '../../theme/ThemeProvider';

/**
 * Check-in: escolher o treino e começar.
 *
 * Estrutura portada do MUVX — hero do treino de hoje, lista abaixo, prévia de
 * exercícios sem sair da tela, barra fixa com o selecionado — agora com o
 * sistema visual de lá: sombra colorida, gradiente do topo, halo no canto,
 * pílula de duração. O acento é o roxo do AssumFit.
 *
 * Dois comportamentos que parecem detalhe e não são:
 *
 * 1. **Com sessão em andamento, a escolha some.** Oferecer "escolha outro
 *    treino" para quem já está no meio de um é oferecer perder o progresso.
 * 2. **O servidor é reconsultado ANTES de iniciar.** Sem isso, um toque durante
 *    o carregamento dispara um início que o servidor vai rejeitar, e o erro
 *    aparece para a pessoa como falha do app.
 */
export function CheckinScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation<any>();
  const route = useRoute();

  const plan = useWorkoutStore((s) => s.plan);
  const execution = useWorkoutStore((s) => s.execution);
  const refresh = useWorkoutStore((s) => s.refresh);
  const start = useWorkoutStore((s) => s.start);
  const cancel = useWorkoutStore((s) => s.cancel);

  const [selected, setSelected] = useState<PlanDay | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [previews, setPreviews] = useState<Record<string, string[]>>({});
  const [loadingPreview, setLoadingPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const days = plan?.days ?? [];
  const todayDay = useMemo(
    () => days.find((d) => d.dayOfWeek === plan?.today && d.dayType === 'WORKOUT') ?? null,
    [days, plan?.today],
  );
  const isRestDay = Boolean(plan) && !todayDay;

  const others = useMemo(() => {
    const seen = new Set<string>();
    return days.filter((day) => {
      if (day.dayType !== 'WORKOUT' || !day.workout) return false;
      if (day.workout.id === todayDay?.workout?.id) return false;
      if (seen.has(day.workout.id)) return false;
      seen.add(day.workout.id);
      return true;
    });
  }, [days, todayDay]);

  /*
   Dia pedido pela tela de Treino ("fazer o de ontem que ficou") tem precedência
   sobre o de hoje: a pessoa acabou de escolher. Sem pedido, vale o hoje.
  */
  const diaPedido = (route.params as { dayOfWeek?: string } | undefined)?.dayOfWeek;
  useEffect(() => {
    const pedido = diaPedido
      ? days.find((d) => d.dayOfWeek === diaPedido && d.dayType === 'WORKOUT' && d.workout) ?? null
      : null;
    if (pedido) setSelected(pedido);
    else if (todayDay) setSelected(todayDay);
  }, [todayDay, diaPedido, days]);

  const togglePreview = useCallback(
    async (day: PlanDay) => {
      const workoutId = day.workout?.id;
      if (!workoutId) return;
      if (expandedId === workoutId) return setExpandedId(null);
      setExpandedId(workoutId);
      if (previews[workoutId]) return;

      setLoadingPreview(workoutId);
      try {
        const detail = await fetchWorkout(workoutId);
        setPreviews((prev) => ({
          ...prev,
          [workoutId]: detail.phases.flatMap((p) => p.exercises.map((e) => e.name)),
        }));
      } catch {
        setPreviews((prev) => ({ ...prev, [workoutId]: [] }));
      } finally {
        setLoadingPreview(null);
      }
    },
    [expandedId, previews],
  );

  const goToTraining = () => navigation.navigate('Training');

  const handleStart = async () => {
    if (!selected?.workout || busy) return;
    setBusy(true);
    setError(null);
    try {
      await refresh();
      if (useWorkoutStore.getState().execution) return goToTraining();
      await start(selected.workout.id, selected.id);
      goToTraining();
    } catch {
      setError('Não foi possível iniciar o treino. Tente de novo.');
    } finally {
      setBusy(false);
    }
  };

  // ---- Sessão em andamento: foco único -----------------------------------
  if (execution) {
    return (
      <DetailScreen title="Check-in">
        <YStack gap="$xl" paddingTop="$lg">
          <YStack gap="$xs">
            <Text fontSize={24} fontWeight="800" color="$foreground" letterSpacing={-0.5}>
              Você tem um treino em andamento
            </Text>
            <Text fontSize={14} color="$mutedForeground">
              Continue de onde parou, ou encerre para começar outro.
            </Text>
          </YStack>

          <HeroCard eyebrow="em andamento" selected>
            <Text fontSize={22} fontWeight="800" color="$foreground" letterSpacing={-0.5}>
              {execution.workoutName}
            </Text>
          </HeroCard>

          <YStack gap="$md">
            <Button
              title="Continuar treino"
              icon={<Icon name="play" size={16} color={colors.ink} />}
              onPress={goToTraining}
            />
            <Button
              title={busy ? 'Encerrando…' : 'Encerrar treino'}
              variant="secondary"
              loading={busy}
              onPress={async () => {
                setBusy(true);
                try {
                  await cancel();
                  await refresh();
                } finally {
                  setBusy(false);
                }
              }}
            />
          </YStack>
        </YStack>
      </DetailScreen>
    );
  }

  // ---- Sem plano ---------------------------------------------------------
  if (plan === null) {
    return (
      <DetailScreen title="Check-in">
        <YStack gap="$xl" paddingTop="$lg">
          <YStack gap="$xs">
            <Text fontSize={24} fontWeight="800" color="$foreground" letterSpacing={-0.5}>
              Você ainda não tem um plano
            </Text>
            <Text fontSize={14} color="$mutedForeground">
              Responda algumas perguntas sobre saúde e rotina, e o treino é montado a partir delas.
            </Text>
          </YStack>
          <Button
            title="Montar meu treino"
            icon={<Icon name="dumbbell" size={16} color={colors.ink} />}
            onPress={() => (navigation as any).push('Anamnesis')}
          />
        </YStack>
      </DetailScreen>
    );
  }

  return (
    <DetailScreen title="Check-in">
      <YStack gap="$xl" paddingTop="$lg">
        <YStack gap="$xs">
          <Text fontSize={24} fontWeight="800" color="$foreground" letterSpacing={-0.5}>
            Bora treinar?
          </Text>
          <Text fontSize={14} color="$mutedForeground">
            {DAY_LABEL[plan.today] ?? ''}
          </Text>
        </YStack>

        {isRestDay ? (
          <HeroCard eyebrow={DAY_LABEL[plan.today]}>
            <Text fontSize={20} fontWeight="800" color="$foreground" letterSpacing={-0.5}>
              Hoje é seu dia de descanso
            </Text>
            <Text fontSize={13} color="$mutedForeground">
              Recuperação é parte do treino. Quer treinar mesmo assim? Escolha um abaixo.
            </Text>
          </HeroCard>
        ) : null}

        {todayDay?.workout ? (
          <WorkoutOption
            hero
            day={todayDay}
            selected={selected?.id === todayDay.id}
            expanded={expandedId === todayDay.workout.id}
            loading={loadingPreview === todayDay.workout.id}
            names={previews[todayDay.workout.id]}
            onSelect={() => setSelected(todayDay)}
            onTogglePreview={() => togglePreview(todayDay)}
          />
        ) : null}

        {/*
          O selecionado e o "Iniciar treino" ficam ANTES da lista de outros
          treinos, não depois dela. Era o rodapé: com cinco cards expandíveis no
          meio, quem só queria começar o de hoje rolava a tela inteira para
          achar o botão (Bruno, 22/08). Agora a ordem é a da decisão — o treino
          de hoje, o botão de começar, e só então "ou escolha outro".
        */}
        {selected?.workout ? (
          <YStack gap="$md">
            <XStack alignItems="center" justifyContent="space-between" gap="$md">
              <YStack gap={2} flex={1}>
                <Text
                  fontSize={11}
                  fontWeight="700"
                  letterSpacing={1}
                  color="$mutedForeground"
                  textTransform="uppercase"
                >
                  selecionado
                </Text>
                <Text fontSize={15} fontWeight="700" color="$foreground" numberOfLines={1}>
                  {selected.workout.name}
                </Text>
              </YStack>
              {selected.workout.estimatedDuration ? (
                <Pill>
                  <Icon name="clock" size={12} color={colors.accent} />
                  <PillText>{selected.workout.estimatedDuration} min</PillText>
                </Pill>
              ) : null}
            </XStack>
            {/*
              Dia de esporte do plano tem DOIS jeitos válidos de acontecer — o
              treino guiado (blocos na tela) ou o cronômetro, que mede GPS,
              caloria e batimento e CONCLUI o dia do plano junto. Um ato, um
              registro.

              QUAL DELES É O PREENCHIDO decide o que a maioria vai fazer, e essa
              escolha estava errada: num dia de quadra, o guiado não mede nada —
              o treino é feito de blocos por tempo, e não há série para marcar.
              Em produção (ago/2026) uma sessão de tênis foi registrada com 65
              segundos porque a pessoa seguiu o botão que a tela destacou.

              Então a ordem se inverte no dia de esporte: o cronômetro vira a
              ação principal, o guiado desce a secundário. Nos demais dias nada
              muda — o guiado é quem mede.
            */}
            {(() => {
              const esporte = sportForModality(selected.workout.modality);
              const guiado = (
                <Button
                  key="guiado"
                  title={busy ? 'Preparando…' : esporte ? 'Abrir o treino guiado' : 'Iniciar treino'}
                  variant={esporte ? 'secondary' : 'primary'}
                  icon={
                    esporte ? undefined : <Icon name="play" size={16} color={darkPalette.ink} />
                  }
                  loading={busy}
                  onPress={handleStart}
                />
              );
              /*
               Ajustar o de hoje antes de começar — "hoje tenho só 30 minutos"
               (testador, 22/08). Abre o personal com a frase pronta; ele
               propõe o ajuste pontual e a pessoa confirma. Ação secundária:
               o caminho principal continua sendo começar.
              */
              const personal = (
                <Button
                  key="personal"
                  title="Ajustar o treino de hoje com o personal"
                  variant="ghost"
                  size="md"
                  onPress={() =>
                    (navigation as any).push('Personal', {
                      mensagemInicial: `Sobre o treino de hoje (${selected.workout!.name}): hoje tenho só 30 minutos. Dá para adaptar só o de hoje?`,
                    })
                  }
                />
              );
              if (!esporte) return [guiado, personal];

              const cronometro = (
                <Button
                  key="cronometro"
                  title={esporte.gps ? 'Registrar com GPS' : 'Registrar no cronômetro'}
                  icon={<Icon name="play" size={16} color={darkPalette.ink} />}
                  onPress={() =>
                    (navigation as any).navigate('Sport', {
                      vinculo: {
                        kind: esporte.kind,
                        workoutId: selected.workout!.id,
                        planDayId: selected.id,
                      },
                    })
                  }
                />
              );
              /*
               Esporte coletivo sem exercícios prescritos (futebol, vôlei…) não
               tem o que guiar: só registrar. Oferecer "abrir o treino guiado"
               num dia desses levava a uma tela vazia (testador, 22/08).
              */
              if (!selected.workout.exerciseCount) return [cronometro, personal];
              return [cronometro, guiado, personal];
            })()}
          </YStack>
        ) : null}

        {others.length > 0 ? (
          <YStack gap="$md">
            <Text fontSize={16} fontWeight="700" color="$foreground">
              {isRestDay ? 'Escolha um treino' : 'Ou escolha outro'}
            </Text>
            {others.map((day) => (
              <WorkoutOption
                key={day.id}
                day={day}
                selected={selected?.id === day.id}
                expanded={expandedId === day.workout!.id}
                loading={loadingPreview === day.workout!.id}
                names={previews[day.workout!.id]}
                onSelect={() => setSelected(day)}
                onTogglePreview={() => togglePreview(day)}
              />
            ))}
          </YStack>
        ) : null}

        {error ? (
          <Text fontSize={14} color="$destructive">
            {error}
          </Text>
        ) : null}

      </YStack>
    </DetailScreen>
  );
}

/**
 * Uma opção de treino — hero para o de hoje, card comum para os outros.
 *
 * O anel de seleção ganha o traço de confirmação preenchido com o acento. É a
 * única exceção à regra de que o acento é do dado: aqui ele marca escolha, e
 * sem cor o estado selecionado some no meio de quatro cards iguais.
 */
function WorkoutOption({
  hero,
  day,
  selected,
  expanded,
  loading,
  names,
  onSelect,
  onTogglePreview,
}: {
  hero?: boolean;
  day: PlanDay;
  selected: boolean;
  expanded: boolean;
  loading: boolean;
  names?: string[];
  onSelect: () => void;
  onTogglePreview: () => void;
}) {
  const { colors } = useTheme();
  const workout = day.workout!;
  const Wrapper = hero ? HeroCard : Card;

  return (
    <Wrapper
      eyebrow={hero ? 'treino de hoje' : undefined}
      selected={selected}
      onPress={onSelect}
      accessibilityLabel={workout.name}
    >
      <XStack alignItems="flex-start" gap="$md">
        <YStack flex={1} gap={6} minWidth={0}>
          <Text
            fontSize={hero ? 22 : 16}
            fontWeight={hero ? '800' : '700'}
            color="$foreground"
            letterSpacing={hero ? -0.5 : 0}
            numberOfLines={2}
          >
            {workout.name}
          </Text>
          <Text fontSize={13} color="$mutedForeground" numberOfLines={1}>
            {workoutMeta(workout.muscleGroups, workout.exerciseCount)}
          </Text>
        </YStack>

        <YStack alignItems="flex-end" gap={10}>
          <YStack
            width={24}
            height={24}
            borderRadius={999}
            alignItems="center"
            justifyContent="center"
            borderWidth={selected ? 0 : 1.5}
            borderColor="$borderStrong"
            backgroundColor={selected ? '$primary' : 'transparent'}
          >
            {selected ? <Icon name="check" size={13} color={colors.ink} /> : null}
          </YStack>
          {hero && workout.estimatedDuration ? (
            <Pill>
              <Icon name="clock" size={12} color={colors.accent} />
              <PillText>{workout.estimatedDuration} min</PillText>
            </Pill>
          ) : null}
        </YStack>
      </XStack>

      {/* Prévia dentro do card, separada por uma divisória própria — sair da
          tela para ver o que tem dentro de um treino é atrito puro. */}
      <Pressable onPress={onTogglePreview} hitSlop={6} accessibilityRole="button">
        <XStack
          alignItems="center"
          gap={4}
          paddingTop="$md"
          marginTop="$sm"
          borderTopWidth={1}
          borderTopColor="$border"
        >
          <Text fontSize={12} color="$mutedForeground" fontWeight="500">
            {expanded ? 'Ocultar exercícios' : 'Ver exercícios'}
          </Text>
          <Icon name={expanded ? 'up' : 'down'} size={12} color={colors.textMuted} />
        </XStack>
      </Pressable>

      {expanded ? (
        <YStack gap="$sm" marginTop="$md">
          {loading ? (
            <ActivityIndicator color={colors.accent} />
          ) : names && names.length > 0 ? (
            names.map((name, i) => (
              <XStack key={`${name}-${i}`} alignItems="center" gap="$sm">
                <Text fontSize={13} color="$mutedForeground" width={20}>
                  {i + 1}.
                </Text>
                <Text fontSize={14} color="$foreground" flex={1} numberOfLines={1}>
                  {name}
                </Text>
              </XStack>
            ))
          ) : (
            <Text fontSize={13} color="$mutedForeground">
              Nenhum exercício encontrado.
            </Text>
          )}
        </YStack>
      ) : null}
    </Wrapper>
  );
}
