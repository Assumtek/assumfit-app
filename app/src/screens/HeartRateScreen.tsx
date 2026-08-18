import { YStack } from '@tamagui/stacks';
import React from 'react';

import { EmptyMetric } from '../components/BandStatus';
import { Row, Section } from '../components/Card';
import { DetailScreen } from '../components/DetailScreen';
import { MeasureButton } from '../components/MeasureButton';
import { MeasuredAt } from '../components/MeasuredAt';
import { DayPickerRow, useHistoricoDoDia } from '../components/DayPicker';
import { DayChart } from '../components/charts/DayChart';
import { Body, Data, Display, MetricSm, RatingText, SectionTitle } from '../components/ui';
import { rateHeartRate } from '../domain/ratings';
import { useBiometricStore } from '../store/biometric.store';

/**
 * Frequência cardíaca — tela PRÓPRIA, separada da variabilidade.
 *
 * As duas moravam juntas porque os cards "HRV" e "coração" da home iam para o
 * mesmo lugar, e um título só com "HRV" fazia o toque em "coração" parecer rota
 * errada. Isso resolvia a navegação e criava um problema maior: são grandezas
 * diferentes, com fontes diferentes e cadências diferentes — batimento chega a
 * cada poucos segundos ao vivo e a cada 5 minutos no agendado; HRV vem de uma
 * janela por hora, e passa dias sem nenhuma.
 *
 * Juntá-las numa tela obrigava a pessoa a saber qual número é qual, e fazia a
 * idade de um valer pelo outro. O app do fabricante as separa, e é o certo.
 */
export function HeartRateScreen() {
  const latest = useBiometricStore((s) => s.latest);
  const hrHistory = useBiometricStore((s) => s.hrHistory);
  const historico = useHistoricoDoDia((p) => p.heart_rate, hrHistory);

  if (!latest)
    return (
      <DetailScreen title="Frequência cardíaca">
        <EmptyMetric measure="oneKey" />
      </DetailScreen>
    );

  const rating = rateHeartRate(latest.heartRate);
  /*
   Mínima e máxima do DIA, não das últimas trinta amostras.

   Trinta amostras é um recorte da estrutura de dados, não do tempo: com a
   leitura ao vivo correndo elas cobrem dois minutos, e a "mínima do dia"
   virava a mínima dos últimos dois minutos.
  */
  const valores = historico.pontos.map((p) => p.value);
  const min = valores.length ? Math.round(Math.min(...valores)) : '—';
  const max = valores.length ? Math.round(Math.max(...valores)) : '—';

  return (
    <DetailScreen title="Frequência cardíaca">
      <YStack marginBottom="$xxl">
        <Display>{Math.round(latest.heartRate)}</Display>
        <Data marginTop="$sm">bpm · batimentos por minuto</Data>
        <MeasuredAt at={latest.recordedAt} />
        <RatingText
          marginTop="$lg"
          color={rating.state === 'alert' ? '$destructive' : '$foreground'}
        >
          {rating.label}
        </RatingText>
      </YStack>

      <DayPickerRow
        selecionado={historico.dia}
        onSelecionar={historico.setDia}
        comDado={historico.comDado}
      />

      <YStack marginBottom="$xl">
        <SectionTitle fontSize={15} marginBottom="$md">
          {historico.ehHoje ? 'Medições de hoje' : 'Medições do dia'}
        </SectionTitle>
        <DayChart
          serie={historico.pontos}
          dia={historico.dia}
          id="hr-dia"
          vazio={
            historico.ehHoje
              ? 'A pulseira registra o batimento a cada 5 minutos enquanto estiver no pulso.'
              : 'Nenhuma medição de batimento neste dia — a pulseira provavelmente não estava no pulso.'
          }
        />
      </YStack>

      <Section label="No dia">
        {valores.length === 0 ? (
          <Row>
            <Body flex={1} lineHeight={18}>
              Sem leituras de hoje. Elas entram sozinhas enquanto a pulseira estiver no pulso e
              conectada.
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

      {/*
        `oneKey` e não uma medição só de batimento: é a medição de um toque do
        firmware, que traz batimento, oxigenação e pressão na mesma passada de
        ~30 s. Pedir só o batimento gastaria o mesmo tempo de sensor e traria um
        terço do resultado.
      */}
      <MeasureButton kind="oneKey" />
    </DetailScreen>
  );
}
