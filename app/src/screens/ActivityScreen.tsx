import { useNavigation } from '@react-navigation/native';
import { XStack, YStack } from '@tamagui/stacks';
import React, { useEffect, useState } from 'react';
import { LayoutChangeEvent, Pressable } from 'react-native';

import { Note, Row, Section } from '../components/Card';
import { DetailScreen } from '../components/DetailScreen';
import { Icon } from '../components/Icon';
import { LineChart } from '../components/charts/LineChart';
import { MeasuredAt } from '../components/MeasuredAt';
import { Body, Data, Display, MetricSm, RatingText } from '../components/ui';
import { rateActivity } from '../domain/ratings';
import * as api from '../services/api.service';
import { useBiometricStore } from '../store/biometric.store';
import { useTheme } from '../theme/ThemeProvider';

export function ActivityScreen() {
  const navigation = useNavigation<any>();
  const { colors } = useTheme();
  const activity = useBiometricStore((s) => s.activity);

  /*
   Minutos ativos são os de TREINO e ESPORTE registrados hoje — a pulseira não
   manda esse número no bloco de passos (só passos, distância e calorias), e o
   campo ficava em zero para sempre. Sessão vinculada a uma execução conta uma
   vez só, a mesma regra da agenda de movimento e da bateria.
  */
  const [minutosHoje, setMinutosHoje] = useState<number | null>(null);
  useEffect(() => {
    let vivo = true;
    const inicioDoDia = new Date();
    inicioDoDia.setHours(0, 0, 0, 0);
    void Promise.all([
      api.fetchExecutionHistory(1).catch(() => []),
      api.fetchSportSessions(1).catch(() => []),
    ]).then(([execucoes, sessoes]) => {
      if (!vivo) return;
      const vinculadas = new Set(
        sessoes.map((se) => se.workoutExecutionId).filter((id): id is string => !!id),
      );
      const minutos =
        execucoes
          .filter((e) => e.status === 'FINISHED' && new Date(e.startedAt) >= inicioDoDia)
          .filter((e) => !vinculadas.has(e.id))
          .reduce((soma, e) => soma + (e.durationSec ?? 0) / 60, 0) +
        sessoes
          .filter((se) => new Date(se.startedAt) >= inicioDoDia)
          .reduce((soma, se) => soma + se.durationS / 60, 0);
      setMinutosHoje(Math.round(minutos));
    });
    return () => {
      vivo = false;
    };
  }, []);
  const latest = useBiometricStore((s) => s.latest);
  const stepsByHour = useBiometricStore((s) => s.stepsByHour);
  const [chartWidth, setChartWidth] = useState(0);
  const rating = rateActivity(activity);
  const remaining = Math.max(0, activity.goal - activity.steps);

  const rows = [
    { label: 'Distância', value: `${activity.distanceKm.toFixed(1).replace('.', ',')} km` },
    { label: 'Calorias ativas', value: `${activity.activeKcal} kcal` },
    { label: 'Minutos ativos', value: `${minutosHoje ?? activity.activeMin} min` },
  ];

  return (
    <DetailScreen title="Atividade">
      <YStack marginBottom="$xxl">
        {/* Compartilhar a atividade do dia como story — ícone discreto, como na Saúde. */}
        <XStack justifyContent="flex-end">
          <Pressable
            onPress={() =>
              navigation.push('WorkoutShare', {
                titulo: 'Minha atividade hoje',
                metricas: [
                  { valor: activity.steps.toLocaleString('pt-BR'), rotulo: 'passos' },
                  activity.distanceKm > 0 ? { valor: activity.distanceKm.toFixed(1).replace('.', ','), rotulo: 'km' } : null,
                  activity.activeKcal > 0 ? { valor: String(activity.activeKcal), rotulo: 'kcal' } : null,
                ].filter(Boolean),
              })
            }
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Compartilhar minha atividade"
            style={({ pressed }) => (pressed ? { opacity: 0.5 } : undefined)}
          >
            <Icon name="share" size={18} color={colors.textMuted} strokeWidth={1.5} />
          </Pressable>
        </XStack>
        <Display>{activity.steps.toLocaleString('pt-BR')}</Display>
        <Data marginTop="$sm">passos de {activity.goal.toLocaleString('pt-BR')}</Data>
        {/* Passos vêm da pulseira e param quando ela sai do pulso — a hora da
            última leitura é o que distingue "andei pouco" de "não estava com
            ela". */}
        <MeasuredAt at={latest?.recordedAt} prefixo="atualizado" />
        <RatingText marginTop="$lg">{rating.label}</RatingText>
      </YStack>

      {/* Aqui a barra de PREENCHIMENTO é a certa: passos acumulam rumo a uma
          meta, e a meta é o fim da régua. */}
      <YStack height={6} borderRadius={3} backgroundColor="$track">
        <YStack
          height={6}
          borderRadius={3}
          backgroundColor="$primary"
          width={`${rating.fraction * 100}%`}
        />
      </YStack>
      <Data marginTop="$sm">{Math.round(rating.fraction * 100)}% da meta</Data>

      <Section label="Acúmulo do dia">
        <YStack onLayout={(e: LayoutChangeEvent) => setChartWidth(e.nativeEvent.layout.width)}>
          <LineChart
            data={stepsByHour}
            width={chartWidth}
            height={150}
            domain={[0, activity.goal]}
            thresholds={[{ value: activity.goal, label: 'meta' }]}
            xLabels={['06h', '12h', '18h', '22h']}
            id="steps"
          />
        </YStack>
        <Data marginTop="$md" lineHeight={17}>
          Curva acumulada, não barras por hora: o que interessa é se você chega à meta antes do dia
          acabar.
        </Data>
      </Section>

      <Section label="Resumo do dia">
        {rows.map((row, i) => (
          <Row key={row.label} last={i === rows.length - 1}>
            <Body flex={1}>{row.label}</Body>
            <MetricSm fontSize={17}>{row.value}</MetricSm>
          </Row>
        ))}
      </Section>

      <Note
        title={remaining > 0 ? 'Faltam passos' : 'Meta batida'}
        body={
          remaining > 0
            ? `${remaining.toLocaleString('pt-BR')} passos até a meta. Caminhar depois do almoço ajuda duas vezes: fecha o número e suaviza o vale de energia da tarde.`
            : 'Movimento distribuído ao longo do dia sustenta melhor a energia do que uma única sessão longa.'
        }
      />
    </DetailScreen>
  );
}
