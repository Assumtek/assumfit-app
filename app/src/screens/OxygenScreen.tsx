import { YStack } from '@tamagui/stacks';
import React from 'react';

import { HistoryRow, Section } from '../components/Card';
import { DetailScreen } from '../components/DetailScreen';
import { MeasureButton } from '../components/MeasureButton';
import { Scale } from '../components/Scale';
import { Data, Display, RatingText } from '../components/ui';
import { rateSpo2, shown, stateColor } from '../domain/ratings';
import { useBiometricStore } from '../store/biometric.store';
import { useTheme } from '../theme/ThemeProvider';

export function OxygenScreen() {
  const { colors } = useTheme();
  const latest = useBiometricStore((s) => s.latest);
  if (!latest) return <DetailScreen title="Oxigênio" children={null} />;

  const rating = rateSpo2(latest.spo2Pct);
  const spo2 = shown(latest.spo2Pct);
  const color = stateColor(rating.state, colors);

  return (
    <DetailScreen title="Oxigênio no sangue">
      <YStack marginBottom="$xxl">
        <Display>{spo2}</Display>
        <Data marginTop="$sm">% de saturação</Data>
        <RatingText
          marginTop="$lg"
          color={rating.state === 'alert' ? '$destructive' : '$foreground'}
        >
          {rating.label}
        </RatingText>
      </YStack>

      <Scale
        label="Referência clínica"
        position={rating.fraction}
        ticks={['85', '90', '95', '100']}
        color={color}
      />

      {/*
        Só a medição de agora. As quatro linhas que existiam aqui — "30 min: 97%",
        "1 h: 98%", "Sono: 96%" — eram números escritos à mão, e apareciam iguais
        para qualquer pessoa. O histórico de verdade está na aba Histórico, que
        lê do banco.
      */}
      <Section label="Agora">
        <HistoryRow time="Medição" fraction={rating.fraction} value={`${spo2}%`} color={color} last />
      </Section>

      <MeasureButton kind="spo2" />
    </DetailScreen>
  );
}
