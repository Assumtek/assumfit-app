import { Text } from '@tamagui/core';
import { XStack, YStack } from '@tamagui/stacks';
import React, { useState } from 'react';
import { LayoutChangeEvent } from 'react-native';

import { EmptyMetric } from '../components/BandStatus';
import { Row, Section } from '../components/Card';
import { DetailScreen } from '../components/DetailScreen';
import { MeasuredAt } from '../components/MeasuredAt';
import { MeasureButton } from '../components/MeasureButton';
import { ScatterPlot } from '../components/charts/ScatterPlot';
import { Body, Data, Display, RatingText } from '../components/ui';
import { pressureZones, ratePressure } from '../domain/ratings';
import { useBiometricStore } from '../store/biometric.store';

export function PressureScreen() {
  const latest = useBiometricStore((s) => s.latest);
  const history = useBiometricStore((s) => s.pressureHistory);
  // Hook antes de qualquer return condicional — do contrário a ordem muda
  // quando `latest` alterna entre nulo e presente.
  const [chartWidth, setChartWidth] = useState(0);

  if (!latest)
    return (
      <DetailScreen title="Pressão">
        {/*
          `oneKey`, igual ao botão do rodapé — as duas entradas da tela pediam
          grandezas DIFERENTES: o vazio pedia `bloodPressure` e o rodapé pedia a
          medição de um toque. A de um toque é a que este firmware entrega, e a
          pressão vem dentro dela; a porta dedicada responde vazio (documentado
          em CLAUDE.md, sondado nas quatro variantes do SDK).
        */}
        <EmptyMetric measure="oneKey" />
      </DetailScreen>
    );

  const rating = ratePressure(latest.bpSystolic, latest.bpDiastolic);

  return (
    <DetailScreen title="Pressão arterial">
      <YStack marginBottom="$xxl">
        <XStack alignItems="baseline" gap="$sm">
          <Display>{latest.bpSystolic}</Display>
          {/* A diastólica é menor de propósito: são um par, mas a sistólica é
              a que decide a faixa. */}
          <Text fontSize={34} fontWeight="300" color="$faint">
            /
          </Text>
          <Text
            fontSize={40}
            fontWeight="300"
            letterSpacing={-1.6}
            color="$mutedForeground"
            fontVariant={['tabular-nums']}
          >
            {latest.bpDiastolic}
          </Text>
        </XStack>
        <Data marginTop="$sm">mmHg · sistólica / diastólica</Data>
        <MeasuredAt at={latest.recordedAt} />
        <RatingText
          marginTop="$lg"
          color={rating.state === 'alert' ? '$destructive' : '$foreground'}
        >
          {rating.label}
        </RatingText>
      </YStack>

      <Section label="Sistólica × diastólica · 7 dias">
        <YStack onLayout={(e: LayoutChangeEvent) => setChartWidth(e.nativeEvent.layout.width)}>
          <ScatterPlot
            width={chartWidth}
            height={200}
            xDomain={[100, 150]}
            yDomain={[60, 100]}
            xLabel="sistólica →"
            yLabel="↑ diastólica"
            points={history.map((h) => ({ x: h.systolic, y: h.diastolic }))}
            current={
              latest.bpSystolic == null || latest.bpDiastolic == null
                ? undefined
                : { x: latest.bpSystolic, y: latest.bpDiastolic }
            }
            zones={[
              { label: 'ótima', xFrom: 100, xTo: 120, yFrom: 60, yTo: 80 },
              { label: 'elevada', xFrom: 130, xTo: 140, yFrom: 80, yTo: 90, abnormal: true },
              { label: 'alta', xFrom: 140, xTo: 150, yFrom: 90, yTo: 100, abnormal: true },
            ]}
            id="bp"
          />
        </YStack>
        <Data marginTop="$md" lineHeight={18}>
          Sistólica e diastólica não são duas séries: são um par, e o diagnóstico depende da
          combinação. Por isso o plano cartesiano, e não duas linhas lado a lado.
        </Data>
      </Section>

      <Section label="Faixas de referência">
        {pressureZones.map((zone, i) => {
          const current = zone.label === rating.zone.label;
          return (
            <Row key={zone.label} last={i === pressureZones.length - 1}>
              <YStack
                width={8}
                height={current ? 1.5 : 1}
                marginRight="$lg"
                backgroundColor={current ? '$primary' : '$borderStrong'}
              />
              <Body flex={1} color={current ? '$foreground' : '$faint'}>
                {zone.label}
              </Body>
              <Data color={current ? '$foreground' : '$faint'}>{zone.range}</Data>
            </Row>
          );
        })}
      </Section>

      <MeasureButton kind="oneKey" label="Medir pressão agora" />
    </DetailScreen>
  );
}
