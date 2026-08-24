import { XStack, YStack } from '@tamagui/stacks';
import { useChartWidth } from '../components/charts/useChartWidth';
import React, { useEffect, useState } from 'react';

import { EmptyMetric } from '../components/BandStatus';
import { Row, Section } from '../components/List';
import { DetailScreen } from '../components/DetailScreen';
import { LinkParaAjuda } from '../components/LinkParaAjuda';
import { MeasuredAt } from '../components/MeasuredAt';
import { MeasureButton } from '../components/MeasureButton';
import { ScatterPlot } from '../components/charts/ScatterPlot';
import { Body, Data, Display, Headline, Metric, RatingText } from '../components/ui';
import { nomeDoPeriodo, PeriodTabs, PERIODOS } from '../components/PeriodTabs';
import { pressureZones, quemPuxaAPressao, ratePressure } from '../domain/ratings';
import * as api from '../services/api.service';
import { useBiometricStore } from '../store/biometric.store';

export function PressureScreen() {
  const latest = useBiometricStore((s) => s.latest);
  const history = useBiometricStore((s) => s.pressureHistory);
  // Hook antes de qualquer return condicional — do contrário a ordem muda
  // quando `latest` alterna entre nulo e presente.
  const [chartWidth, onLayoutChartWidth] = useChartWidth();
  const [periodo, setPeriodo] = useState(PERIODOS.semana.dias);
  /*
   As aferições do PERÍODO vêm do servidor; o histórico local guarda só as
   últimas do aparelho, e era ele que o rótulo "7 dias" descrevia sem ser
   verdade. Sem rede, o local continua desenhando o que tem.
  */
  const [doServidor, setDoServidor] = useState<{ x: number; y: number }[] | null>(null);
  useEffect(() => {
    let vivo = true;
    api
      .fetchDailyHistory(periodo)
      .then((dias) => {
        if (!vivo) return;
        setDoServidor(
          dias
            .filter((d) => d.bp_systolic != null && d.bp_diastolic != null)
            .map((d) => ({ x: d.bp_systolic as number, y: d.bp_diastolic as number })),
        );
      })
      .catch(() => vivo && setDoServidor(null));
    return () => {
      vivo = false;
    };
  }, [periodo]);

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
  const explicacao = quemPuxaAPressao(latest.bpSystolic, latest.bpDiastolic);

  return (
    <DetailScreen title="Pressão arterial">
      <YStack marginBottom="$xxl">
        <XStack alignItems="baseline" gap="$sm">
          <Display>{latest.bpSystolic}</Display>
          {/* A diastólica é menor de propósito: são um par, mas a sistólica é
              a que decide a faixa. */}
          <Headline fontWeight="300" color="$faint">
            /
          </Headline>
          <Metric
            fontWeight="300"
            letterSpacing={-1.6}
            color="$mutedForeground"
            fontVariant={['tabular-nums']}
          >
            {latest.bpDiastolic}
          </Metric>
        </XStack>
        <Data marginTop="$sm">mmHg · sistólica / diastólica</Data>
        <MeasuredAt at={latest.recordedAt} />
        <RatingText
          marginTop="$lg"
          color={rating.state === 'alert' ? '$destructive' : '$foreground'}
        >
          {rating.label}
        </RatingText>
        {/*
          Qual dos dois números decidiu a faixa. Sem isto, 117 por 85 aparece
          como "Elevada" e a pessoa olha o 117, que é ótimo, sem entender.
        */}
        {explicacao ? <Body marginTop="$sm">{explicacao}</Body> : null}
      </YStack>

      <Section label={`Sistólica × diastólica · ${nomeDoPeriodo(periodo).toLowerCase()}`}>
        <PeriodTabs
          opcoes={[PERIODOS.semana, PERIODOS.mes, PERIODOS.trimestre, PERIODOS.ano]}
          valor={periodo}
          onChange={setPeriodo}
        />
        <YStack onLayout={onLayoutChartWidth}>
          <ScatterPlot
            width={chartWidth}
            height={200}
            xDomain={[100, 150]}
            yDomain={[60, 100]}
            xLabel="sistólica →"
            yLabel="↑ diastólica"
            points={
              doServidor && doServidor.length > 0
                ? doServidor
                : history.map((h) => ({ x: h.systolic, y: h.diastolic }))
            }
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
        <LinkParaAjuda />
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
