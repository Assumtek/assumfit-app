import { YStack } from '@tamagui/stacks';
import React, { useState } from 'react';
import { LayoutChangeEvent } from 'react-native';

import { EmptyMetric } from '../components/BandStatus';
import { Section } from '../components/Card';
import { DetailScreen } from '../components/DetailScreen';
import { MeasuredAt } from '../components/MeasuredAt';
import { DayPickerRow, useHistoricoDoDia } from '../components/DayPicker';
import { DayChart } from '../components/charts/DayChart';
import { MeasureButton } from '../components/MeasureButton';
import { BarChart } from '../components/charts/BarChart';
import { Body, Data, Display, RatingText } from '../components/ui';
import { rateStress, shown, stateColor } from '../domain/ratings';
import { useBiometricStore } from '../store/biometric.store';
import { useTheme } from '../theme/ThemeProvider';

export function StressScreen() {
  const { colors } = useTheme();
  const latest = useBiometricStore((s) => s.latest);
  const byHour = useBiometricStore((s) => s.stressByHour);
  const stressHistory = useBiometricStore((s) => s.stressHistory);
  const historico = useHistoricoDoDia((p) => p.stress_score, stressHistory);
  const [chartWidth, setChartWidth] = useState(0);
  if (!latest)
    return (
      <DetailScreen title="Stress">
        <EmptyMetric measure="stress" />
      </DetailScreen>
    );

  const rating = rateStress(latest.stressScore);

  return (
    <DetailScreen title="Nível de stress">
      <YStack marginBottom="$xxl">
        <Display>{shown(latest.stressScore)}</Display>
        <Data marginTop="$sm">índice de 0 a 100</Data>
        <MeasuredAt at={latest.recordedAt} />
        <RatingText
          marginTop="$lg"
          color={rating.state === 'alert' ? '$destructive' : '$foreground'}
        >
          {rating.label}
        </RatingText>
        {/* Uma frase de abertura: o que este número É. O método inteiro fica na
            Ajuda — pedido dos testadores (ago/2026), que queriam entender a
            métrica sem sair da tela. */}
        <Body marginTop="$md">O firmware da pulseira converte a variabilidade entre batimentos numa escala de 0 a 100. É carga do sistema nervoso, não humor — treino pesado e dia tenso dão número parecido.</Body>
      </YStack>

      <DayPickerRow
        selecionado={historico.dia}
        onSelecionar={historico.setDia}
        comDado={historico.comDado}
      />

      {/*
        Dia passado desenha CURVA, hoje desenha barras por hora.

        Não é inconsistência: as barras vêm de `stressByHour`, que só existe
        para o dia corrente — a memória da pulseira é lida por dia e o servidor
        agrega por hora. Forçar barras num dia passado exigiria remontar o
        agrupamento a partir de outra fonte, com outro significado.
      */}
      {!historico.ehHoje ? (
        <YStack marginBottom="$xl">
          <DayChart
            serie={historico.pontos}
            dia={historico.dia}
            id="stress-dia"
            thresholds={[{ value: 40, label: 'recuperação' }]}
            vazio="Nenhuma medição de estresse neste dia."
          />
        </YStack>
      ) : (
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
      )}

      <MeasureButton kind="stress" />
    </DetailScreen>
  );
}
