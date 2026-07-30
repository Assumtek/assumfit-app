import { useNavigation } from '@react-navigation/native';
import { Text } from '@tamagui/core';
import { XStack, YStack } from '@tamagui/stacks';
import React, { useEffect, useState } from 'react';
import { Pressable, TextInput } from 'react-native';

import { DetailScreen } from '../../components/DetailScreen';
import { Icon } from '../../components/Icon';
import { Button, Card, Data, HeroCard, SectionTitle } from '../../components/ui';
import { achievementsFor, type Achievement } from '../../domain/achievements';
import { formatDuration, rateCompletion, rateEffort } from '../../domain/workout';
import { fetchExecutionHistory } from '../../services/api.service';
import { useWorkoutStore } from '../../store/workout.store';
import { useTheme } from '../../theme/ThemeProvider';

/**
 * Fim de treino: percepção de esforço, nota da sessão, resumo.
 *
 * O esforço é perguntado ANTES de mostrar o resultado. Ver "treino completo" na
 * tela muda a resposta de quem ia dizer que foi pesado — é o mesmo motivo pelo
 * qual nenhuma opção vem pré-marcada.
 *
 * Regra de ouro do design: o destaque é a avaliação em linguagem humana. A
 * porcentagem de conclusão fica de sub-label, nunca em corpo grande.
 */
export function TrainingFinishedScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation<any>();

  const finish = useWorkoutStore((s) => s.finish);
  const execution = useWorkoutStore((s) => s.execution);

  const [effort, setEffort] = useState<number | null>(null);
  const [rating, setRating] = useState<number | null>(null);
  const [conquistas, setConquistas] = useState<Achievement[]>([]);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    durationSec: number | null;
    completionPct: number | null;
    workoutName: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFinish = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await finish({ perceivedEffort: effort, rating, comment: comment || null }));
    } catch {
      setError('Não foi possível concluir a sessão. Tente de novo.');
    } finally {
      setBusy(false);
    }
  };

  // ---- Resumo, depois de concluído --------------------------------------
  /*
   As conquistas saem do histórico, e não do resultado da sessão.

   Sequência e marco dependem do que veio ANTES — o `finish` do servidor só
   conhece a sessão que acabou. A lista já inclui a de agora, porque ela foi
   gravada antes desta tela abrir.
  */
  useEffect(() => {
    if (!result) return;
    fetchExecutionHistory(365)
      .then((h) => setConquistas(achievementsFor(h, Date.now())))
      .catch(() => undefined);
  }, [result]);

  if (result) {
    const completion = rateCompletion(result.completionPct);
    const effortRating = rateEffort(effort);

    return (
      <DetailScreen title="Treino concluído">
        <YStack gap="$xl" paddingTop="$lg">
          <HeroCard eyebrow={result.workoutName}>
            <Text fontSize={44} fontWeight="300" color="$foreground" letterSpacing={-2}>
              {formatDuration(result.durationSec ?? 0)}
            </Text>
            <Text fontSize={20} fontWeight="700" color="$foreground">
              {completion.label}
            </Text>
            <Text fontSize={13} color="$mutedForeground">
              {completion.detail}
            </Text>
            <YStack height={6} borderRadius={3} backgroundColor="$track" overflow="hidden" marginTop="$sm">
              <YStack
                height={6}
                borderRadius={3}
                width={`${completion.fraction * 100}%`}
                backgroundColor="$primary"
              />
            </YStack>
          </HeroCard>

          {effortRating.available ? (
            <Card>
              <Text
                fontSize={11}
                fontWeight="700"
                letterSpacing={1.2}
                color="$mutedForeground"
                textTransform="uppercase"
              >
                esforço percebido
              </Text>
              <Text fontSize={18} fontWeight="700" color="$foreground" marginTop="$sm">
                {effortRating.label}
              </Text>
              <Text fontSize={13} color="$mutedForeground">
                {effortRating.detail}
              </Text>
            </Card>
          ) : null}

          {conquistas.length > 0 ? (
            <YStack gap="$md" marginTop="$md">
              <SectionTitle>Conquistas</SectionTitle>
              {conquistas.map((c) => (
                <Card key={c.key} selected={c.fresh}>
                  <XStack alignItems="center" gap="$md">
                    <Icon
                      name={c.fresh ? 'flame' : 'check'}
                      size={18}
                      color={c.fresh ? colors.accent : colors.textMuted}
                    />
                    <YStack flex={1} minWidth={0} gap={2}>
                      <Text fontSize={15} fontWeight="700" color="$foreground">
                        {c.title}
                      </Text>
                      <Text fontSize={12} color="$mutedForeground">
                        {c.detail}
                      </Text>
                    </YStack>
                    {c.fresh ? <Data color="$primary">novo</Data> : null}
                  </XStack>
                </Card>
              ))}
            </YStack>
          ) : null}

          {/*
            Compartilhar vem ANTES de "Pronto", e é secundário.

            Depois de "Pronto" ninguém volta — a tela sai da pilha e o treino
            vira histórico. Mas compartilhar também não pode ser a ação
            principal: o objetivo do app é a pessoa treinar, não publicar.
          */}
          <Button
            title="Compartilhar treino"
            variant="secondary"
            onPress={() =>
              navigation.navigate('WorkoutShare', {
                workoutName: result.workoutName,
                durationSec: result.durationSec,
                // Contagem e volume ainda não vêm do `finish` do servidor. O
                // card omite o bloco quando o valor falta, em vez de mostrar
                // zero — zero afirmaria que a pessoa não levantou nada.
                exercises: null,
                volumeKg: null,
              })
            }
          />

          <Button
            title="Pronto"
            icon={<Icon name="check" size={16} color={colors.ink} />}
            onPress={() => navigation.navigate('Main')}
          />

        </YStack>
      </DetailScreen>
    );
  }

  // ---- Antes de concluir -------------------------------------------------
  return (
    <DetailScreen title="Fim do treino">
      <YStack gap="$xl" paddingTop="$lg">
        <YStack gap="$xs">
          <Text fontSize={24} fontWeight="800" color="$foreground" letterSpacing={-0.5}>
            Como foi?
          </Text>
          <Text fontSize={14} color="$mutedForeground">
            {execution?.workoutName ?? 'Sua sessão'} — duas perguntas rápidas antes de fechar.
          </Text>
        </YStack>

        <Card>
          <Text
            fontSize={11}
            fontWeight="700"
            letterSpacing={1.2}
            color="$mutedForeground"
            textTransform="uppercase"
          >
            esforço percebido
          </Text>
          <Text fontSize={15} color="$foreground" marginTop="$sm" marginBottom="$md">
            Quanto este treino puxou?
          </Text>
          <Scale values={[2, 4, 6, 8, 10]} value={effort} onPick={setEffort} label="Esforço" />
          <XStack justifyContent="space-between" marginTop="$sm">
            <Text fontSize={12} color="$mutedForeground">
              leve
            </Text>
            <Text fontSize={12} color="$mutedForeground">
              no limite
            </Text>
          </XStack>
        </Card>

        <Card>
          <Text
            fontSize={11}
            fontWeight="700"
            letterSpacing={1.2}
            color="$mutedForeground"
            textTransform="uppercase"
          >
            nota da sessão
          </Text>
          <Text fontSize={15} color="$foreground" marginTop="$sm" marginBottom="$md">
            O treino de hoje serviu para você?
          </Text>
          <Scale values={[1, 2, 3, 4, 5]} value={rating} onPick={setRating} label="Nota" />
        </Card>

        <Card>
          <Text
            fontSize={11}
            fontWeight="700"
            letterSpacing={1.2}
            color="$mutedForeground"
            textTransform="uppercase"
          >
            observação
          </Text>
          <TextInput
            style={{
              color: colors.text,
              fontSize: 15,
              minHeight: 64,
              textAlignVertical: 'top',
              marginTop: 8,
            }}
            value={comment}
            onChangeText={setComment}
            placeholder="Algo que queira registrar (opcional)"
            placeholderTextColor={colors.textFaint}
            multiline
            accessibilityLabel="Observação sobre o treino"
          />
        </Card>

        {error ? (
          <Text fontSize={14} color="$destructive">
            {error}
          </Text>
        ) : null}

        <Button
          title={busy ? 'Concluindo…' : 'Concluir treino'}
          icon={<Icon name="check" size={16} color={colors.ink} />}
          loading={busy}
          onPress={handleFinish}
        />
      </YStack>
    </DetailScreen>
  );
}

/** Escala de resposta. Nenhum valor vem marcado — ver o cabeçalho da tela. */
function Scale({
  values,
  value,
  onPick,
  label,
}: {
  values: number[];
  value: number | null;
  onPick: (v: number) => void;
  label: string;
}) {
  return (
    <XStack gap="$sm">
      {values.map((v) => (
        <Pressable
          key={v}
          onPress={() => onPick(v)}
          accessibilityRole="radio"
          accessibilityState={{ selected: value === v }}
          accessibilityLabel={`${label} ${v}`}
          style={{ flex: 1 }}
        >
          <YStack
            alignItems="center"
            paddingVertical="$md"
            borderRadius={10}
            borderWidth={1}
            borderColor={value === v ? '$primary' : '$border'}
            backgroundColor={value === v ? 'rgba(135,123,240,0.15)' : 'transparent'}
          >
            <Text
              fontSize={14}
              fontWeight={value === v ? '700' : '400'}
              color={value === v ? '$primary' : '$mutedForeground'}
            >
              {v}
            </Text>
          </YStack>
        </Pressable>
      ))}
    </XStack>
  );
}
