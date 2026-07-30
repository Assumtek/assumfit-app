import { XStack, YStack } from '@tamagui/stacks';
import React, { useState } from 'react';
import { LayoutChangeEvent, Pressable } from 'react-native';

import { Row, Section } from '../components/Card';
import { DetailScreen } from '../components/DetailScreen';
import { MeasureButton } from '../components/MeasureButton';
import { LineChart } from '../components/charts/LineChart';
import { Body, Data, Display, MetricSm, RatingText } from '../components/ui';
import { rateHrv, shown } from '../domain/ratings';
import { useBiometricStore } from '../store/biometric.store';

const RANGES = ['1H', '6H', '24H', '7D'] as const;

export function HrvScreen() {
  const latest = useBiometricStore((s) => s.latest);
  const hrvHistory = useBiometricStore((s) => s.hrvHistory);
  const hrHistory = useBiometricStore((s) => s.hrHistory);
  const [range, setRange] = useState<(typeof RANGES)[number]>('1H');
  const [chartWidth, setChartWidth] = useState(0);

  if (!latest) return <DetailScreen title="Coração e HRV" children={null} />;

  const rating = rateHrv(latest.hrvMs);
  const baseline = hrvHistory.length
    ? hrvHistory.reduce((a, b) => a + b, 0) / hrvHistory.length
    : latest.hrvMs;
  const recent = hrHistory.slice(-30);
  const min = recent.length ? Math.round(Math.min(...recent)) : '—';
  const max = recent.length ? Math.round(Math.max(...recent)) : '—';

  return (
    // O título assume os DOIS nomes: os cards "HRV" e "Coração" da home
    // desembocam aqui, e a tela mostra variabilidade E frequência de repouso.
    // Com só "HRV", o toque em "Coração" parecia rota errada.
    <DetailScreen title="Coração e HRV">
      <YStack marginBottom="$xxl">
        <Display>{shown(latest.hrvMs)}</Display>
        <Data marginTop="$sm">ms · variabilidade cardíaca</Data>
        <RatingText
          marginTop="$lg"
          color={rating.state === 'alert' ? '$destructive' : '$foreground'}
        >
          {rating.label}
        </RatingText>
      </YStack>

      <XStack gap="$xl" marginBottom="$lg">
        {RANGES.map((r) => (
          <Pressable key={r} onPress={() => setRange(r)} hitSlop={10} accessibilityRole="tab">
            <Data letterSpacing={1} color={range === r ? '$foreground' : '$faint'}>
              {r}
            </Data>
          </Pressable>
        ))}
      </XStack>

      <YStack
        marginBottom="$md"
        onLayout={(e: LayoutChangeEvent) => setChartWidth(e.nativeEvent.layout.width)}
      >
        <LineChart
          data={hrvHistory}
          width={chartWidth}
          height={150}
          markLast
          // Sem HRV medido não há média pessoal, e faixa de referência
          // desenhada sobre nada seria decoração enganosa.
          band={baseline == null ? undefined : { from: baseline * 0.85, to: baseline * 1.15 }}
          thresholds={baseline == null ? [] : [{ value: baseline, label: 'sua média' }]}
          xLabels={['1h atrás', '30 min', 'agora']}
          id="hrv"
        />
      </YStack>
      <Data marginBottom="$sm" lineHeight={17}>
        A faixa é a sua linha de base — HRV só significa alguma coisa contra ela, nunca em valor
        absoluto.
      </Data>

      <Section label="Frequência cardíaca">
        <Row>
          <Body flex={1}>Mínima</Body>
          <MetricSm fontSize={17}>{min} bpm</MetricSm>
        </Row>
        <Row>
          <Body flex={1}>Atual</Body>
          <MetricSm fontSize={17}>{Math.round(latest.heartRate)} bpm</MetricSm>
        </Row>
        <Row last>
          <Body flex={1}>Máxima</Body>
          <MetricSm fontSize={17}>{max} bpm</MetricSm>
        </Row>
      </Section>

      <MeasureButton kind="hrv" />
    </DetailScreen>
  );
}
