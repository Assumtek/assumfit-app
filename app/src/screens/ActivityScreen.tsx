import { useNavigation } from '@react-navigation/native';
import { XStack, YStack } from '@tamagui/stacks';
import React, { useEffect, useState } from 'react';
import { LayoutChangeEvent, Pressable } from 'react-native';

import { Note, Row, Section } from '../components/Card';
import { DetailScreen } from '../components/DetailScreen';
import { Icon } from '../components/Icon';
import { BarChart } from '../components/charts/BarChart';
import { LineChart } from '../components/charts/LineChart';
import { MeasuredAt } from '../components/MeasuredAt';
import { Body, Data, Display, MetricSm, RatingText } from '../components/ui';
import { rateActivity } from '../domain/ratings';
import { caloriasDoDia, distanciaDoDia } from '../domain/activityEstimates';
import { treinoConta } from '../domain/movement';
import * as api from '../services/api.service';
import { useBiometricStore } from '../store/biometric.store';
import { useTheme } from '../theme/ThemeProvider';

export function ActivityScreen() {
  const navigation = useNavigation<any>();
  const { colors } = useTheme();
  const activity = useBiometricStore((s) => s.activity);

  /*
   Minutos ativos são os de TREINO e ESPORTE registrados hoje — a pulseira não
   manda esse número no bloco de passos (só passos, distância e calorias), e o
   campo ficava em zero para sempre. Sessão vinculada a uma execução conta uma
   vez só, a mesma regra da agenda de movimento e da bateria.
  */
  const [minutosHoje, setMinutosHoje] = useState<number | null>(null);
  /*
   Os últimos 7 dias, do servidor: a pulseira só guarda o dia; o histórico
   por dia mora no resumo diário. "Ver atividade dos últimos dias, não só do
   dia" (Leonardo, 22/08).
  */
  const [dias, setDias] = useState<api.DailySummary[] | null>(null);
  const [larguraDias, setLarguraDias] = useState(0);
  useEffect(() => {
    let vivo = true;
    api
      .fetchDailyHistory(7)
      .then((rows) => vivo && setDias(rows))
      .catch(() => vivo && setDias([]));
    return () => {
      vivo = false;
    };
  }, []);
  useEffect(() => {
    let vivo = true;
    const inicioDoDia = new Date();
    inicioDoDia.setHours(0, 0, 0, 0);
    void Promise.all([
      api.fetchExecutionHistory(1).catch(() => []),
      api.fetchSportSessions(1).catch(() => []),
    ]).then(([execucoes, sessoes]) => {
      if (!vivo) return;
      const vinculadas = new Set(
        sessoes.map((se) => se.workoutExecutionId).filter((id): id is string => !!id));
      const minutos =
        execucoes
          .filter((e) => treinoConta(e) && new Date(e.startedAt) >= inicioDoDia)
          .filter((e) => !vinculadas.has(e.id))
          .reduce((soma, e) => soma + (e.durationSec ?? 0) / 60, 0) +
        sessoes
          .filter((se) => new Date(se.startedAt) >= inicioDoDia)
          .reduce((soma, se) => soma + se.durationS / 60, 0);
      setMinutosHoje(Math.round(minutos));
    });
    return () => {
      vivo = false;
    };
  }, []);
  const latest = useBiometricStore((s) => s.latest);
  const stepsByHour = useBiometricStore((s) => s.stepsByHour);
  const [chartWidth, setChartWidth] = useState(0);
  const rating = rateActivity(activity);
  const remaining = Math.max(0, activity.goal - activity.steps);

  /*
   Distância e calorias vêm da pulseira no mesmo evento dos passos — mas há
   firmware que quase não emite esse evento (a memória traz só os passos). Sem
   eles, a tela dizia "0,0 km" ao lado de milhares de passos. Quando a pulseira
   não mandou, ESTIMA pelos passos e diz que é estimativa: 0,75 m por passo e
   ~0,04 kcal por passo são as aproximações de pedômetro, não medição.
  */
  /*
   E quando a pulseira MANDOU, mas o valor não cabe nos passos (1.253 passos,
   3,2 km e 886.149 kcal — testador, 22/08), também estima: quem decide é
   `domain/activityEstimates.ts`, por passo.
  */
  const distancia = distanciaDoDia(activity.steps, activity.distanceKm * 1000);
  const calorias = caloriasDoDia(activity.steps, activity.activeKcal);
  const estimado = activity.steps > 0 && (distancia.fonte === 'estimada' || calorias.fonte === 'estimada');
  const rows = [
    { label: distancia.fonte === 'pulseira' ? 'Distância' : 'Distância (estimada)', value: `${distancia.valor.toFixed(1).replace('.', ',')} km` },
    { label: calorias.fonte === 'pulseira' ? 'Calorias ativas' : 'Calorias (estimadas)', value: `${calorias.valor} kcal` },
    { label: 'Minutos ativos', value: `${minutosHoje ?? activity.activeMin} min` },
  ];

  return (
    <DetailScreen title="Atividade">
      <YStack marginBottom="$xxl">
        {/* Compartilhar a atividade do dia como story — ícone discreto, como na Saúde. */}
        <XStack justifyContent="flex-end">
          <Pressable
            onPress={() =>
              navigation.push('WorkoutShare', {
                selo: 'ATIVIDADE DO DIA',
                titulo: 'Minha atividade hoje',
                metricas: [
                  { valor: activity.steps.toLocaleString('pt-BR'), rotulo: 'passos' },
                  activity.steps > 0 ? { valor: distancia.valor.toFixed(1).replace('.', ','), rotulo: 'km' } : null,
                  activity.steps > 0 ? { valor: String(calorias.valor), rotulo: 'kcal' } : null,
                ].filter(Boolean),
              })
            }
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Compartilhar minha atividade"
            style={({ pressed }) => (pressed ? { opacity: 0.5 } : undefined)}
          >
            <Icon name="share" size={18} color={colors.textMuted} strokeWidth={2} />
          </Pressable>
        </XStack>
        <Display>{activity.steps.toLocaleString('pt-BR')}</Display>
        <Data marginTop="$sm">passos de {activity.goal.toLocaleString('pt-BR')}</Data>
        {/* Passos vêm da pulseira e param quando ela sai do pulso — a hora da
            última leitura é o que distingue "andei pouco" de "não estava com
            ela". */}
        <MeasuredAt at={latest?.recordedAt} prefixo="atualizado" />
        <RatingText marginTop="$lg">{rating.label}</RatingText>
      </YStack>

      {/* Aqui a barra de PREENCHIMENTO é a certa: passos acumulam rumo a uma
          meta, e a meta é o fim da régua. */}
      <YStack height={6} borderRadius={4} backgroundColor="$track">
        <YStack
          height={6}
          borderRadius={4}
          backgroundColor="$primary"
          width={`${rating.fraction * 100}%`}
        />
      </YStack>
      <Data marginTop="$sm">{Math.round(rating.fraction * 100)}% da meta</Data>

      <Section label="Acúmulo do dia">
        <YStack onLayout={(e: LayoutChangeEvent) => setChartWidth(e.nativeEvent.layout.width)}>
          <LineChart
            data={stepsByHour}
            width={chartWidth}
            height={150}
            domain={[0, activity.goal]}
            thresholds={[{ value: activity.goal, label: 'meta' }]}
            xLabels={['06h', '12h', '18h', '22h']}
            id="steps"
          />
        </YStack>
        <Data marginTop="$md" lineHeight={18}>
          Curva acumulada, não barras por hora: o que interessa é se você chega à meta antes do dia
          acabar.
        </Data>
      </Section>

      {dias && dias.length > 0 ? (
        <Section label="Últimos 7 dias">
          <YStack onLayout={(e: LayoutChangeEvent) => setLarguraDias(e.nativeEvent.layout.width)}>
            <BarChart
              width={larguraDias}
              height={140}
              max={Math.max(activity.goal * 1.15, ...dias.map((d) => d.steps ?? 0))}
              reference={{ value: activity.goal, label: 'meta' }}
              bars={dias.map((d) => ({ label: d.day.slice(8, 10), value: d.steps ?? 0 }))}
              labelEvery={1}
              id="steps-week"
            />
          </YStack>
        </Section>
      ) : null}

      <Section label="Resumo do dia">
        {estimado ? (
          <Data marginBottom="$sm">Sua pulseira não enviou distância e calorias hoje; os valores marcados são estimados pelos passos.</Data>
        ) : null}
        {rows.map((row, i) => (
          <Row key={row.label} last={i === rows.length - 1}>
            <Body flex={1}>{row.label}</Body>
            <MetricSm fontSize={18}>{row.value}</MetricSm>
          </Row>
        ))}
      </Section>

      <Note
        title={remaining > 0 ? 'Faltam passos' : 'Meta batida'}
        body={
          remaining > 0
            ? `${remaining.toLocaleString('pt-BR')} passos até a meta. Caminhar depois do almoço ajuda duas vezes: fecha o número e suaviza o vale de energia da tarde.`
            : 'Movimento distribuído ao longo do dia sustenta melhor a energia do que uma única sessão longa.'
        }
      />
    </DetailScreen>
  );
}
