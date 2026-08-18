import { XStack, YStack } from '@tamagui/stacks';
import React, { useState } from 'react';
import { LayoutChangeEvent, Pressable } from 'react-native';

import { EmptyMetric } from '../components/BandStatus';
import { Note, Row, Section } from '../components/Card';
import { DetailScreen } from '../components/DetailScreen';
import { MeasureButton } from '../components/MeasureButton';
import { LineChart } from '../components/charts/LineChart';
import { Body, Data, Display, MetricSm, RatingText } from '../components/ui';
import { rateHrv, shown } from '../domain/ratings';
import { faixaInicial, FAIXAS, noPeriodo, rotulosDoPeriodo, type Faixa } from '../domain/series';
import { useBiometricStore } from '../store/biometric.store';

export function HrvScreen() {
  const latest = useBiometricStore((s) => s.latest);
  const hrvHistory = useBiometricStore((s) => s.hrvHistory);
  const hrHistory = useBiometricStore((s) => s.hrHistory);
  /*
   A aba inicial é decidida pelo DADO, uma vez.

   Num `useState` com inicializador preguiçoso de propósito: recalcular a cada
   render arrancaria a aba da mão de quem acabou de tocar em outra.
  */
  const [range, setRange] = useState<Faixa>(() => faixaInicial(hrvHistory));
  const [chartWidth, setChartWidth] = useState(0);

  if (!latest)
    return (
      <DetailScreen title="Coração e HRV">
        <EmptyMetric measure="hrv" />
      </DetailScreen>
    );

  const rating = rateHrv(latest.hrvMs);
  const serie = noPeriodo(hrvHistory, range);
  /*
   A linha de base é da JANELA em vista, não da série inteira.

   É o que dá sentido a trocar de aba: a média de sete dias comparada com as
   últimas seis horas responde "hoje está diferente do meu normal?", e uma
   média fixa responderia sempre a mesma coisa em qualquer aba.
  */
  const baseline = serie.length
    ? serie.reduce((soma, p) => soma + p.value, 0) / serie.length
    : latest.hrvMs;
  const recent = hrHistory.slice(-30).map((p) => p.value);
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
        {FAIXAS.map((r) => {
          // Faixa sem curva fica visivelmente indisponível em vez de levar a um
          // vazio: o controle passa a informar onde há dado antes do toque.
          const vazia = noPeriodo(hrvHistory, r).length < 2;
          return (
            <Pressable
              key={r}
              onPress={() => setRange(r)}
              hitSlop={10}
              accessibilityRole="tab"
              accessibilityState={{ selected: range === r, disabled: vazia }}
            >
              <Data
                letterSpacing={1}
                color={range === r ? '$foreground' : vazia ? '$faint' : '$mutedForeground'}
              >
                {r}
              </Data>
            </Pressable>
          );
        })}
      </XStack>

      <YStack
        marginBottom="$md"
        onLayout={(e: LayoutChangeEvent) => setChartWidth(e.nativeEvent.layout.width)}
      >
        {/*
          Curva só existe com pelo menos DOIS pontos — um ponto é um valor, não
          uma linha. O `LineChart` devolvia `null` nesse caso e a tela ficava
          com um vazio silencioso onde deveria haver gráfico: quem abria não
          sabia se o app estava carregando, quebrado ou sem dado. Agora a
          ausência é dita, com o caminho para resolvê-la logo abaixo.
        */}
        {serie.length >= 2 ? (
          <LineChart
            data={serie.map((p) => p.value)}
            width={chartWidth}
            height={150}
            markLast
            // Sem HRV medido não há média pessoal, e faixa de referência
            // desenhada sobre nada seria decoração enganosa.
            band={baseline == null ? undefined : { from: baseline * 0.85, to: baseline * 1.15 }}
            thresholds={baseline == null ? [] : [{ value: baseline, label: 'sua média' }]}
            xLabels={rotulosDoPeriodo(serie)}
            id="hrv"
          />
        ) : (
          <Note
            title={serie.length === 1 ? 'Uma medição nesta faixa' : 'Sem série nesta faixa'}
            body={
              hrvHistory.length >= 2
                ? 'Há medições fora deste período. Toque numa faixa mais larga para ver a curva.'
                : 'A pulseira registra HRV nas medições agendadas e quando você mede aqui. A curva aparece a partir da segunda leitura.'
            }
          />
        )}
      </YStack>
      {serie.length >= 2 ? (
        <Data marginBottom="$sm" lineHeight={17}>
          A faixa é a sua linha de base — HRV só significa alguma coisa contra ela, nunca em valor
          absoluto.
        </Data>
      ) : null}

      <Section label="Frequência cardíaca">
        {recent.length === 0 ? (
          <Row>
            <Body flex={1} lineHeight={18}>
              Sem leituras recentes de batimento. Elas entram sozinhas enquanto a pulseira estiver
              no pulso e conectada.
            </Body>
          </Row>
        ) : null}
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
