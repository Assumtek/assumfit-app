import { YStack } from '@tamagui/stacks';
import { useChartWidth } from '../components/charts/useChartWidth';
import React, { useState } from 'react';

import { EmptyMetric } from '../components/BandStatus';
import { Section, Row } from '../components/List';
import { DetailScreen } from '../components/DetailScreen';
import { LinkParaAjuda } from '../components/LinkParaAjuda';
import { MeasuredAt } from '../components/MeasuredAt';
import { DayPickerRow, useHistoricoDoDia } from '../components/DayPicker';
import { DayChart } from '../components/charts/DayChart';
import { MeasureButton } from '../components/MeasureButton';
import { BarChart } from '../components/charts/BarChart';
import { Body, Data, Display, RatingText } from '../components/ui';
import { rateStress, shown, stateColor } from '../domain/ratings';
import { medicoesDistintas } from '../domain/series';
import { horaLocal } from '../domain/sleep';
import { useBiometricStore } from '../store/biometric.store';
import { useTheme } from '../theme/ThemeProvider';

export function StressScreen() {
  const { colors } = useTheme();
  const latest = useBiometricStore((s) => s.latest);
  const byHour = useBiometricStore((s) => s.stressByHour);
  const stressHistory = useBiometricStore((s) => s.stressHistory);
  const historico = useHistoricoDoDia((p) => p.stress_score, stressHistory);
  /* Só o que é medição de verdade: o firmware reemite o último valor sem parar. */
  const medicoes = React.useMemo(() => medicoesDistintas(stressHistory), [stressHistory]);
  const [chartWidth, onLayoutChartWidth] = useChartWidth();
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
        <Body marginTop="$md">O firmware da pulseira converte a variabilidade entre batimentos numa escala de 0 a 100. É carga do sistema nervoso: treino pesado e dia tenso dão número parecido, e humor não entra na conta.</Body>
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
        <YStack onLayout={onLayoutChartWidth}>
          <BarChart
            width={chartWidth}
            height={152}
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
        <Data marginTop="$md" lineHeight={18}>
          Cada barra é uma hora fechada, picos curtos são normais. O que importa é quanto tempo
          passou acima da linha.
        </Data>
        <LinkParaAjuda />
      </Section>
      )}

      {/*
        As MEDIÇÕES, uma a uma.

        O gráfico agrega por hora e fica com a última de cada, e quem mede três
        vezes seguidas vê uma barra só: "sempre vejo somente a última que foi
        feita e não consigo ver as outras" (Henrique, 06/09/2026). A lista
        responde a isso sem desfazer o gráfico, que continua servindo para ler
        o dia inteiro de relance.

        Repetição do firmware não entra: a pulseira reemite o último valor a
        cada evento do fluxo contínuo, e listar isso encheria a tela com a
        mesma medição centenas de vezes.
      */}
      {historico.ehHoje && medicoes.length > 1 ? (
        <Section label="Medições de hoje">
          {medicoes.map((m, i) => (
            <Row key={m.at} last={i === medicoes.length - 1}>
              <Body flex={1}>{horaLocal(m.at)}</Body>
              <Body color="$foreground" fontWeight="600" fontVariant={['tabular-nums']}>
                {Math.round(m.value)}
              </Body>
              <Body color="$mutedForeground" marginLeft="$sm">
                {rateStress(m.value).label.toLowerCase()}
              </Body>
            </Row>
          ))}
        </Section>
      ) : null}

      <MeasureButton kind="stress" />
    </DetailScreen>
  );
}
