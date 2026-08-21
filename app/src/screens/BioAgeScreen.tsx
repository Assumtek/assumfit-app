import { useNavigation } from '@react-navigation/native';
import { YStack } from '@tamagui/stacks';
import React, { useCallback, useEffect, useState } from 'react';
import { LayoutChangeEvent } from 'react-native';

import { EmptyMetric } from '../components/BandStatus';
import { Note, Row, Section } from '../components/Card';
import { DetailScreen } from '../components/DetailScreen';
import { MeasureButton } from '../components/MeasureButton';
import { DivergingBar } from '../components/charts/DivergingBar';
import { Button, Body, Data, Display, MetricSm, RatingText } from '../components/ui';
import { formatYears } from '../domain/bioAge';
import { useBioAge } from '../hooks/useBioAge';
import * as api from '../services/api.service';
import { deepSleepPct, useBiometricStore } from '../store/biometric.store';
import { useUserStore } from '../store/user.store';

/**
 * Idade biológica — idade fisiológica estimada a partir de literatura.
 *
 * A tela mudou junto com o cálculo (ago/2026). Duas coisas saíram daqui, e a
 * razão é a mesma: eram afirmações que ninguém mediu.
 *
 * 1. A **tendência de 30 dias** era uma reta gerada em código
 *    (`28.5 - i * 0.027`) — um gráfico de saúde inteiramente fabricado.
 * 2. A **"maior alavanca"** dizia, com texto fixo, que dormir antes das 22h30
 *    aumentava o HRV DESTA pessoa. Nenhuma correlação individual foi calculada.
 *
 * No lugar entrou o que o cálculo realmente produz: o VO₂máx estimado, a
 * decomposição por marcador e as fontes de onde cada número saiu.
 */
export function BioAgeScreen() {
  const navigation = useNavigation<any>();
  const latest = useBiometricStore((s) => s.latest);
  const sleep = useBiometricStore((s) => s.sleep);
  const user = useUserStore((s) => s.user);
  const age = useUserStore((s) => s.age());
  const [chartWidth, setChartWidth] = useState(0);
  const [referencias, setReferencias] = useState(false);

  /**
   * As duas entradas que não vêm da pulseira: o IMC (declarado na anamnese) e
   * os minutos de movimento da semana (o que foi registrado). `null` enquanto
   * não carrega — o cálculo sabe seguir sem eles.
   */
  // Montagem compartilhada com o card da tela Saúde — ver `useBioAge`.
  const { bio: bioCalculada, imc, minutosAtivos, recarregar: carregar } = useBioAge();

  if (!latest)
    return (
      <DetailScreen title="Idade biológica">
        <EmptyMetric />
      </DetailScreen>
    );

  const bio = bioCalculada!;

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

      {/* O VO₂máx é o eixo do cálculo, e por isso aparece como número próprio:
          é ele que a pessoa move treinando, e o que muda a idade de volta. */}
      <Section label="Aptidão cardiorrespiratória">
        <Row>
          <Body flex={1}>VO₂máx estimado</Body>
          <MetricSm fontSize={17}>{bio.vo2max?.toFixed(1).replace('.', ',')}</MetricSm>
        </Row>
        <Row last>
          <Body flex={1}>Movimento nos últimos 7 dias</Body>
          <MetricSm fontSize={17}>
            {minutosAtivos == null ? '—' : `${minutosAtivos} min`}
          </MetricSm>
        </Row>
      </Section>

      <Section label="Composição">
        <YStack onLayout={(e: LayoutChangeEvent) => setChartWidth(e.nativeEvent.layout.width)}>
          <DivergingBar
            width={chartWidth}
            items={bio.factors
              // A atividade entra pela aptidão; mostrá-la com zero ano ao lado
              // das outras barras sugeriria que ela não conta.
              .filter((f) => f.key !== 'activity')
              .map((f) => ({
                label: f.label,
                // A CONTRIBUIÇÃO (anos × peso), não a idade sugerida: é o número
                // que soma o desvio. Um testador somou as idades sugeridas
                // (+7,8) contra um título de +2 e leu como inconsistência.
                value: f.contribution,
                display: formatYears(f.contribution),
              }))}
            id="factors"
          />
        </YStack>
        <Data marginTop="$md" lineHeight={17}>
          Cada barra é quanto aquele marcador puxa a sua idade — já com o peso dele na conta
          (aptidão {Math.round((bio.factors.find((f) => f.key === 'fitness')?.weight ?? 0) * 100)}%,
          HRV {Math.round((bio.factors.find((f) => f.key === 'hrv')?.weight ?? 0) * 100)}%, sono{' '}
          {Math.round((bio.factors.find((f) => f.key === 'sleep')?.weight ?? 0) * 100)}%). As barras
          somam o desvio do título; para a esquerda, mais jovem.
        </Data>
      </Section>

      <Section label="Suas medidas">
        {bio.factors.map((f, i) => (
          <Row key={f.key} last={i === bio.factors.length - 1}>
            <YStack flex={1} gap={2}>
              <Body color="$foreground">{f.label}</Body>
              <Data>{f.reference}</Data>
            </YStack>
            <MetricSm fontSize={15}>{f.value}</MetricSm>
          </Row>
        ))}
      </Section>

      {imc == null ? (
        <Note
          title="Falta o seu peso e a sua altura"
          body="Sem eles, o cálculo usa um IMC médio no lugar do seu — o resto continua sendo medida sua. Os dois são perguntas da anamnese."
          action={{ label: 'Responder anamnese', onPress: () => navigation.push('Anamnesis') }}
        />
      ) : null}

      {/*
        As fontes na TELA, não só no código: este número diz a alguém que o
        corpo dela tem outra idade, e quem afirma isso precisa dizer com base
        em quê. Explicação de método completa fica na Ajuda.
      */}
      <Section label="De onde vem este número">
        <Body lineHeight={18}>
          A aptidão sai de uma equação que estima o VO₂máx sem teste de esforço, a partir de
          sexo, idade, IMC, frequência cardíaca de repouso e movimento da semana.
        </Body>
        {/*
          As quatro referências ficam DOBRADAS. Abertas por padrão ocupavam uma
          tela inteira de citação acadêmica que ninguém lia, e soterravam o
          botão de atualizar (crítica de um testador, ago/2026). Nada sai: quem
          quer conferir, abre — e sem divisória entre uma e outra, que é peso
          visual sem informação.
        */}
        <YStack alignSelf="flex-start" marginTop="$md">
          <Button
            title={referencias ? 'Ocultar referências' : 'Ver referências científicas (4)'}
            variant="ghost"
            onPress={() => setReferencias((r) => !r)}
          />
        </YStack>
        {referencias ? (
          <YStack gap="$md" marginTop="$sm">
            <Data lineHeight={17}>
              Jurca R, et al. Assessing cardiorespiratory fitness without performing exercise testing.
              Am J Prev Med. 2005;29(3):185-193.
            </Data>
            <Data lineHeight={17}>
              Kaminsky LA, Arena R, Myers J. Reference standards for cardiorespiratory fitness. Mayo
              Clin Proc. 2015;90(11):1515-1523 — as medianas por idade e sexo.
            </Data>
            <Data lineHeight={17}>
              Natarajan A, et al. Heart rate variability with photoplethysmography in 8 million
              individuals. Lancet Digit Health. 2020;2(12):e650-e657 — a curva de HRV por idade.
            </Data>
            <Data lineHeight={17}>
              Ohayon MM, et al. Meta-analysis of quantitative sleep parameters. Sleep.
              2004;27(7):1255-1273 — o sono profundo esperado por idade.
            </Data>
          </YStack>
        ) : null}
      </Section>

      <MeasureButton kind="oneKey" label="Atualizar medidas" />
    </DetailScreen>
  );
}
