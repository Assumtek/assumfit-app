import { YStack } from '@tamagui/stacks';
import React, { useMemo, useState } from 'react';
import { LayoutChangeEvent } from 'react-native';

import { Section } from '../components/Card';
import { DetailScreen } from '../components/DetailScreen';
import { MeasureButton } from '../components/MeasureButton';
import { DivergingBar } from '../components/charts/DivergingBar';
import { LineChart } from '../components/charts/LineChart';
import { Body, Data, Display, RatingText, SectionTitle } from '../components/ui';
import { calcBioAge, formatYears } from '../domain/bioAge';
import { deepSleepPct, useBiometricStore } from '../store/biometric.store';
import { useUserStore } from '../store/user.store';

export function BioAgeScreen() {
  const latest = useBiometricStore((s) => s.latest);
  const sleep = useBiometricStore((s) => s.sleep);
  const user = useUserStore((s) => s.user);
  const age = useUserStore((s) => s.age());
  const [chartWidth, setChartWidth] = useState(0);

  // Tendência de 30 dias — vem do backend a partir do M3.
  const trend = useMemo(() => Array.from({ length: 30 }, (_, i) => 28.5 - i * 0.027), []);

  if (!latest) return <DetailScreen title="Idade biológica" children={null} />;

  const bio = calcBioAge({
    realAge: age,
    sex: user.sex,
    hrvMs: latest.hrvMs,
    restingHr: latest.heartRate,
    spo2Pct: latest.spo2Pct,
    deepSleepPct: sleep ? deepSleepPct(sleep) : null,
    // Esta pulseira não tem sensor de temperatura — antes ia 0,8 fixo aqui.
    tempRangeC: null,
  });

  const deltaText =
    bio.delta > 0
      ? `${bio.delta} ${bio.delta === 1 ? 'ano' : 'anos'} abaixo da idade real`
      : bio.delta < 0
        ? `${Math.abs(bio.delta)} ${Math.abs(bio.delta) === 1 ? 'ano' : 'anos'} acima da idade real`
        : 'igual à idade real';

  return (
    <DetailScreen title="Idade biológica">
      <YStack marginBottom="$xxl">
        <Display>{bio.bioAge}</Display>
        <Data marginTop="$sm">anos · idade real {bio.realAge}</Data>
        <RatingText marginTop="$lg">{deltaText}</RatingText>
      </YStack>

      <Section label="Composição">
        <YStack onLayout={(e: LayoutChangeEvent) => setChartWidth(e.nativeEvent.layout.width)}>
          <DivergingBar
            width={chartWidth}
            items={bio.factors.map((f) => ({
              label: f.label,
              value: f.years,
              display: formatYears(f.years),
            }))}
            id="factors"
          />
        </YStack>
        <Data marginTop="$md" lineHeight={17}>
          O cálculo é uma soma de desvios com sinal — por isso barras a partir de um eixo central, e
          não pizza ou empilhado, que perderiam a direção de cada fator.
        </Data>
      </Section>

      <Section label="Maior alavanca">
        <SectionTitle fontSize={18} marginBottom="$md">
          Dormir antes das 22h30
        </SectionTitle>
        <Body>
          Nas noites em que você dormiu mais cedo, o HRV da manhã seguinte foi consistentemente
          maior. É o hábito com maior efeito sobre os seus números — mais que qualquer outro fator
          desta lista.
        </Body>
      </Section>

      <Section label="Tendência · 30 dias">
        <YStack onLayout={(e: LayoutChangeEvent) => setChartWidth(e.nativeEvent.layout.width)}>
          <LineChart
            data={trend}
            width={chartWidth}
            height={110}
            xLabels={['30 dias', '15', 'hoje']}
            id="bioTrend"
          />
        </YStack>
        <Data marginTop="$sm">−0,8 ano no mês</Data>
      </Section>

      <MeasureButton kind="oneKey" label="Atualizar medidas" />
    </DetailScreen>
  );
}
