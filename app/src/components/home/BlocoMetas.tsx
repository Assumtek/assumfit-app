import { XStack, YStack } from '@tamagui/stacks';
import React, { useEffect, useState } from 'react';
import { Pressable } from 'react-native';

import { ProgressRing } from '../ProgressRing';
import { Body, Data, Label, MetricSm, Skeleton } from '../ui';
import { caloriasAtivas, metaEfetiva } from '../../domain/dailyGoals';
import * as api from '../../services/api.service';
import { useBiometricStore } from '../../store/biometric.store';
import { useGoalsStore } from '../../store/goals.store';
import { useTheme } from '../../theme/ThemeProvider';

/** O anel de calorias do dia, para quem quer o número de movimento na home. */
export function BlocoMetas({ onAbrir }: { onAbrir: (rota: string) => void }) {
  const { colors } = useTheme();
  const activity = useBiometricStore((s) => s.activity);
  const metaPadrao = useGoalsStore((s) => s.metaPadraoKcal);
  const metaDeHoje = useGoalsStore((s) => s.metaDeHoje);
  const carregarMetas = useGoalsStore((s) => s.carregar);
  const [kcalDasSessoes, setKcalDasSessoes] = useState<number | null>(null);

  useEffect(() => {
    void carregarMetas();
  }, [carregarMetas]);

  useEffect(() => {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    api
      .fetchSportSessions(2)
      .then((sessoes) =>
        setKcalDasSessoes(
          sessoes
            .filter((s) => new Date(s.startedAt).getTime() >= hoje.getTime())
            .reduce((soma, s) => soma + (s.kcal ?? 0), 0),
        ),
      )
      .catch(() => setKcalDasSessoes(0));
  }, []);

  if (kcalDasSessoes == null) return <Skeleton lines={2} />;

  const hoje = new Date();
  const iso = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
  const meta = metaEfetiva(metaPadrao, metaDeHoje, iso);
  const ativas = caloriasAtivas(activity.steps ?? null, activity.activeKcal, kcalDasSessoes);
  const fracao = meta > 0 ? Math.min(1, ativas / meta) : 0;

  return (
    <Pressable
      onPress={() => onAbrir('DailyGoals')}
      accessibilityRole="button"
      accessibilityLabel={`Metas do dia: ${ativas} de ${meta} calorias ativas`}
      style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
    >
      <XStack alignItems="center" gap="$lg">
        <ProgressRing
          fraction={fracao}
          size={72}
          strokeWidth={8}
          color={fracao >= 1 ? colors.good : colors.accent}
        />
        <YStack flex={1} gap="$xs">
          <Label>movimento de hoje</Label>
          <MetricSm>
            {ativas} <Body color="$mutedForeground">de {meta} kcal</Body>
          </MetricSm>
          <Data>{fracao >= 1 ? 'Meta fechada.' : `Faltam ${Math.max(0, meta - ativas)} kcal.`}</Data>
        </YStack>
      </XStack>
    </Pressable>
  );
}
