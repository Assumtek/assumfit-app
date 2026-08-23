import { YStack } from '@tamagui/stacks';
import React from 'react';

import { EmptyMetric } from '../components/BandStatus';
import { HistoryRow, Section } from '../components/List';
import { DetailScreen } from '../components/DetailScreen';
import { MeasureButton } from '../components/MeasureButton';
import { Scale } from '../components/Scale';
import { DayChart } from '../components/charts/DayChart';
import { MeasuredAt } from '../components/MeasuredAt';
import { DayPickerRow, useHistoricoDoDia } from '../components/DayPicker';
import { BodyLarge, Data, Display, RatingText, SectionTitle } from '../components/ui';
import { rateSpo2, shown, stateColor } from '../domain/ratings';
import { useBiometricStore } from '../store/biometric.store';
import { useTheme } from '../theme/ThemeProvider';

export function OxygenScreen() {
  const { colors } = useTheme();
  const latest = useBiometricStore((s) => s.latest);
  const spo2History = useBiometricStore((s) => s.spo2History);
  const historico = useHistoricoDoDia((p) => p.spo2_pct, spo2History);
  if (!latest)
    return (
      <DetailScreen title="Oxigênio no sangue">
        <EmptyMetric measure="spo2" />
      </DetailScreen>
    );

  const rating = rateSpo2(latest.spo2Pct);
  const spo2 = shown(latest.spo2Pct);
  const color = stateColor(rating.state, colors);

  return (
    <DetailScreen title="Oxigênio no sangue">
      <YStack marginBottom="$xxl">
        <Display>{spo2}</Display>
        <Data marginTop="$sm">% de saturação</Data>
        {/* SpO₂ é medida em janelas espaçadas: o valor na tela pode ser de
            horas atrás, e sem a data ele se lê como agora. */}
        <MeasuredAt at={spo2History.length ? spo2History[spo2History.length - 1].at : latest.recordedAt} />
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
        As medições do dia. A série vem da memória do aparelho, medida nas
        janelas agendadas — ela já existia e nenhuma tela a usava; esta mostrava
        apenas a leitura de agora.

        A faixa de referência é a saudável (95–100%), não a média da pessoa: em
        oxigenação o normal é populacional, ao contrário do HRV, onde só a linha
        de base individual significa algo.
      */}
      <DayPickerRow
        selecionado={historico.dia}
        onSelecionar={historico.setDia}
        comDado={historico.comDado}
      />

      <YStack marginBottom="$xl">
        <BodyLarge marginBottom="$md">
          {historico.ehHoje ? 'Medições de hoje' : 'Medições do dia'}
        </BodyLarge>
        <DayChart
          serie={historico.pontos}
          dia={historico.dia}
          id="spo2-dia"
          band={{ from: 95, to: 100 }}
          vazio="A pulseira mede oxigenação nas janelas agendadas e quando você pede aqui. A curva do dia aparece a partir da segunda medição."
        />
      </YStack>

      <Section label="Agora">
        <HistoryRow time="Medição" fraction={rating.fraction} value={`${spo2}%`} color={color} last />
      </Section>

      {/* `oneKey`, não `spo2`: as duas levam os mesmos 30 s, e a combinada
          devolve batimento e pressão junto. Medir só oxigenação era jogar duas
          medições fora a cada toque. */}
      <MeasureButton kind="oneKey" />
    </DetailScreen>
  );
}
