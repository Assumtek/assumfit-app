import { YStack } from '@tamagui/stacks';
import React, { useCallback, useEffect, useState } from 'react';
import { LayoutChangeEvent } from 'react-native';

import { EmptyMetric } from '../components/BandStatus';
import { Note, Row, Section } from '../components/Card';
import { DetailScreen } from '../components/DetailScreen';
import { MeasureButton } from '../components/MeasureButton';
import { DivergingBar } from '../components/charts/DivergingBar';
import { Body, Data, Display, MetricSm, RatingText } from '../components/ui';
import { calcBioAge, formatYears } from '../domain/bioAge';
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
  const latest = useBiometricStore((s) => s.latest);
  const sleep = useBiometricStore((s) => s.sleep);
  const user = useUserStore((s) => s.user);
  const age = useUserStore((s) => s.age());
  const [chartWidth, setChartWidth] = useState(0);

  /**
   * As duas entradas que não vêm da pulseira: o IMC (declarado na anamnese) e
   * os minutos de movimento da semana (o que foi registrado). `null` enquanto
   * não carrega — o cálculo sabe seguir sem eles.
   */
  const [imc, setImc] = useState<number | null>(null);
  const [minutosAtivos, setMinutosAtivos] = useState<number | null>(null);

  const carregar = useCallback(async () => {
    const desde = Date.now() - 7 * 86_400_000;
    const [anamnese, execucoes, sessoes] = await Promise.all([
      api.fetchAnamnesis().catch(() => null),
      api.fetchExecutionHistory(7).catch(() => []),
      api.fetchSportSessions(7).catch(() => []),
    ]);

    // O tipo das respostas é aberto (o grafo de perguntas evolui sem passar
    // por aqui), então peso e altura são estreitados antes de virar conta.
    const respostas = anamnese?.answers as { weightKg?: number; heightCm?: number } | undefined;
    const peso = typeof respostas?.weightKg === 'number' ? respostas.weightKg : null;
    const altura = typeof respostas?.heightCm === 'number' ? respostas.heightCm : null;
    if (peso && altura && altura >= 100) setImc(peso / (altura / 100) ** 2);

    // Sessão vinculada a uma execução é o mesmo ato: vale a sessão, e a
    // execução sai da soma — a mesma regra da agenda de movimento.
    const vinculadas = new Set(
      sessoes.map((s) => s.workoutExecutionId).filter((id): id is string => !!id),
    );
    const minTreino = execucoes
      .filter((e) => e.status === 'FINISHED' && Date.parse(e.startedAt) >= desde)
      .filter((e) => !vinculadas.has(e.id))
      .reduce((soma, e) => soma + (e.durationSec ?? 0) / 60, 0);
    const minEsporte = sessoes
      .filter((s) => Date.parse(s.startedAt) >= desde)
      .reduce((soma, s) => soma + s.durationS / 60, 0);
    setMinutosAtivos(Math.round(minTreino + minEsporte));
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (!latest)
    return (
      <DetailScreen title="Idade biológica">
        <EmptyMetric />
      </DetailScreen>
    );

  const bio = calcBioAge({
    realAge: age,
    sex: user.sex,
    hrvMs: latest.hrvMs,
    restingHr: latest.heartRate,
    deepSleepPct: sleep ? deepSleepPct(sleep) : null,
    bmi: imc,
    weeklyActiveMin: minutosAtivos,
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
                value: f.years,
                display: formatYears(f.years),
              }))}
            id="factors"
          />
        </YStack>
        <Data marginTop="$md" lineHeight={17}>
          Cada barra é a idade que aquele marcador sugere, comparada à sua idade real. Para a
          esquerda, mais jovem.
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
          title="Responda a anamnese para afinar o número"
          body="Sem peso e altura, o cálculo usa um IMC médio no lugar do seu — o resto continua sendo medida sua."
        />
      ) : null}

      {/*
        As fontes na TELA, não só no código: este número diz a alguém que o
        corpo dela tem outra idade, e quem afirma isso precisa dizer com base
        em quê. Explicação de método completa fica na Ajuda.
      */}
      <Section label="De onde vem este número">
        <Row>
          <Body flex={1} lineHeight={18}>
            A aptidão sai de uma equação que estima o VO₂máx sem teste de esforço, a partir de
            sexo, idade, IMC, frequência cardíaca de repouso e movimento da semana.
          </Body>
        </Row>
        <Row>
          <Data flex={1} lineHeight={17}>
            Jurca R, et al. Assessing cardiorespiratory fitness without performing exercise testing.
            Am J Prev Med. 2005;29(3):185-193.
          </Data>
        </Row>
        <Row>
          <Data flex={1} lineHeight={17}>
            Kaminsky LA, Arena R, Myers J. Reference standards for cardiorespiratory fitness. Mayo
            Clin Proc. 2015;90(11):1515-1523 — as medianas por idade e sexo.
          </Data>
        </Row>
        <Row>
          <Data flex={1} lineHeight={17}>
            Natarajan A, et al. Heart rate variability with photoplethysmography in 8 million
            individuals. Lancet Digit Health. 2020;2(12):e650-e657 — a curva de HRV por idade.
          </Data>
        </Row>
        <Row last>
          <Data flex={1} lineHeight={17}>
            Ohayon MM, et al. Meta-analysis of quantitative sleep parameters. Sleep.
            2004;27(7):1255-1273 — o sono profundo esperado por idade.
          </Data>
        </Row>
      </Section>

      <MeasureButton kind="oneKey" label="Atualizar medidas" />
    </DetailScreen>
  );
}
