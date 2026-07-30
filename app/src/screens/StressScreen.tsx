import { YStack } from '@tamagui/stacks';
import React, { useState } from 'react';
import { LayoutChangeEvent } from 'react-native';

import { Section } from '../components/Card';
import { DetailScreen } from '../components/DetailScreen';
import { MeasureButton } from '../components/MeasureButton';
import { BarChart } from '../components/charts/BarChart';
import { Data, Display, RatingText } from '../components/ui';
import { rateStress, shown, stateColor } from '../domain/ratings';
import { useBiometricStore } from '../store/biometric.store';
import { useTheme } from '../theme/ThemeProvider';

export function StressScreen() {
  const { colors } = useTheme();
  const latest = useBiometricStore((s) => s.latest);
  const byHour = useBiometricStore((s) => s.stressByHour);
  const [chartWidth, setChartWidth] = useState(0);
  if (!latest) return <DetailScreen title="Stress" children={null} />;

  const rating = rateStress(latest.stressScore);

  return (
    <DetailScreen title="Nível de stress">
      <YStack marginBottom="$xxl">
        <Display>{shown(latest.stressScore)}</Display>
        <Data marginTop="$sm">índice de 0 a 100</Data>
        <RatingText
          marginTop="$lg"
          color={rating.state === 'alert' ? '$destructive' : '$foreground'}
        >
          {rating.label}
        </RatingText>
      </YStack>

      <Section label="Ao longo do dia">
        <YStack onLayout={(e: LayoutChangeEvent) => setChartWidth(e.nativeEvent.layout.width)}>
          <BarChart
            width={chartWidth}
            height={150}
            max={100}
            reference={{ value: 40, label: 'recuperação' }}
            bars={byHour.map((h) => ({
              label: h.hour,
              value: h.value,
              color: stateColor(rateStress(h.value).state, colors),
            }))}
            id="stress"
          />
        </YStack>
        <Data marginTop="$md" lineHeight={17}>
          Cada barra é uma hora fechada — picos curtos são normais. O que importa é quanto tempo
          passou acima da linha.
        </Data>
      </Section>

      <MeasureButton kind="stress" />
    </DetailScreen>
  );
}
