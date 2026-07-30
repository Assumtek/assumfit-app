import { YStack } from '@tamagui/stacks';
import React, { useState } from 'react';
import { LayoutChangeEvent } from 'react-native';

import { Note, Row, Section } from '../components/Card';
import { DetailScreen } from '../components/DetailScreen';
import { LineChart } from '../components/charts/LineChart';
import { Body, Data, Display, MetricSm, RatingText } from '../components/ui';
import { rateActivity } from '../domain/ratings';
import { useBiometricStore } from '../store/biometric.store';

export function ActivityScreen() {
  const activity = useBiometricStore((s) => s.activity);
  const stepsByHour = useBiometricStore((s) => s.stepsByHour);
  const [chartWidth, setChartWidth] = useState(0);
  const rating = rateActivity(activity);
  const remaining = Math.max(0, activity.goal - activity.steps);

  const rows = [
    { label: 'Distância', value: `${activity.distanceKm.toFixed(1).replace('.', ',')} km` },
    { label: 'Calorias ativas', value: `${activity.activeKcal} kcal` },
    { label: 'Minutos ativos', value: `${activity.activeMin} min` },
  ];

  return (
    <DetailScreen title="Atividade">
      <YStack marginBottom="$xxl">
        <Display>{activity.steps.toLocaleString('pt-BR')}</Display>
        <Data marginTop="$sm">passos de {activity.goal.toLocaleString('pt-BR')}</Data>
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
