import { useRoute } from '@react-navigation/native';
import { YStack } from '@tamagui/stacks';
import { useChartWidth } from '../components/charts/useChartWidth';
import React, { useEffect, useMemo, useState } from 'react';

import { Note, Section } from '../components/List';
import { DetailScreen } from '../components/DetailScreen';
import { LineChart } from '../components/charts/LineChart';
import { Body, Data, Display, RatingText, Readout, ReadoutCluster, Skeleton } from '../components/ui';
import { pontosDoDia } from '../domain/dayHistory';
import {
  rateHeartRate,
  rateHrv,
  ratePressure,
  rateSleep,
  rateSpo2,
  rateStress,
  ratingTextColor,
  type Rating,
} from '../domain/ratings';
import * as api from '../services/api.service';
import { SleepNightDetail, diaSeguinte } from '../components/SleepNightDetail';
import { useBiometricStore } from '../store/biometric.store';
import { useHistoryStore } from '../store/history.store';
import { useTheme } from '../theme/ThemeProvider';

/**
 * Um indicador, num dia passado — a tela completa, para revisitar.
 *
 * Pedido da fundadora (ago/2026): "no histórico, salvar a tela completa de
 * cada indicador". Nada precisa ser salvo à parte: o servidor já guarda as
 * leituras por hora de 30 dias e o resumo por dia. Esta tela recompõe, para a
 * data escolhida, o que a tela ao vivo mostra — avaliação em palavra, a curva
 * do dia e os três números que a resumem. Sono e pressão vêm só do resumo
 * diário (o servidor não tem as fases nem a série de pressão).
 */
export type MetricaDoDia = 'hr' | 'hrv' | 'spo2' | 'stress' | 'pressure' | 'sleep' | 'steps';

const TITULO: Record<MetricaDoDia, string> = {
  hr: 'Coração',
  hrv: 'HRV',
  spo2: 'Oxigênio',
  stress: 'Estresse',
  pressure: 'Pressão',
  sleep: 'Sono',
  steps: 'Passos',
};

const UNIDADE: Record<MetricaDoDia, string> = {
  hr: 'bpm',
  hrv: 'ms',
  spo2: '%',
  stress: '',
  pressure: 'mmHg',
  sleep: '',
  steps: 'passos',
};

export function MetricDayScreen() {
  const { colors } = useTheme();
  const { metric, dia } = (useRoute().params ?? {}) as { metric: MetricaDoDia; dia: string };
  const serie = useHistoryStore((s) => s.serie);
  /*
   A noite inteira, quando está neste aparelho: `dia` é a manhã, a noite é a
   que começou na véspera. Sem ela, fica o resumo do servidor (score e
   minutos), e a tela diz por quê.
  */
  const noite = useBiometricStore((s) => s.sleepNights).find((n) => diaSeguinte(n.date) === dia || n.date === dia) ?? null;
  const carregar = useHistoryStore((s) => s.load);
  const [resumo, setResumo] = useState<api.DailySummary | null | undefined>(undefined);
  const [largura, onLayoutLargura] = useChartWidth();

  useEffect(() => {
    void carregar();
    api
      .fetchDailyHistory(30)
      .then((dias) => setResumo(dias.find((d) => d.day === dia) ?? null))
      .catch(() => setResumo(null));
  }, [carregar, dia]);

  const pontos = useMemo(() => {
    const extrai: Partial<Record<MetricaDoDia, (p: api.HourlyPoint) => number | null>> = {
      hr: (p) => p.heart_rate,
      hrv: (p) => p.hrv_ms,
      spo2: (p) => p.spo2_pct,
      stress: (p) => p.stress_score,
      steps: (p) => p.steps,
    };
    const f = extrai[metric];
    return f ? pontosDoDia(serie, dia, f) : [];
  }, [serie, dia, metric]);

  const valores = pontos.map((p) => p.value);
  const acumulado =
    metric === 'steps' ? valores.reduce<number[]>((acc, v) => [...acc, (acc[acc.length - 1] ?? 0) + v], []) : valores;
  const media = valores.length ? Math.round(valores.reduce((s, v) => s + v, 0) / valores.length) : null;
  const minimo = valores.length ? Math.round(Math.min(...valores)) : null;
  const maximo = valores.length ? Math.round(Math.max(...valores)) : null;

  const avaliacao: Rating | null = (() => {
    if (!resumo) return null;
    switch (metric) {
      case 'hr':
        return rateHeartRate(resumo.heart_rate);
      case 'hrv':
        return rateHrv(resumo.hrv_ms);
      case 'spo2':
        return rateSpo2(resumo.spo2_pct);
      case 'stress':
        return rateStress(resumo.stress_score);
      case 'pressure':
        return ratePressure(resumo.bp_systolic, resumo.bp_diastolic);
      case 'sleep':
        return rateSleep(resumo.sleep_score, resumo.sleep_minutes);
      default:
        return null;
    }
  })();

  const numeroGrande = (() => {
    if (!resumo) return null;
    switch (metric) {
      case 'hr':
        return resumo.heart_rate;
      case 'hrv':
        return resumo.hrv_ms;
      case 'spo2':
        return resumo.spo2_pct;
      case 'stress':
        return resumo.stress_score;
      case 'sleep':
        return resumo.sleep_score;
      case 'steps':
        return resumo.steps;
      case 'pressure':
        return resumo.bp_systolic != null && resumo.bp_diastolic != null ? null : null;
    }
  })();

  const data = new Date(`${dia}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  const horas = pontos.length ? [new Date(pontos[0].at).getHours() + 'h', new Date(pontos[pontos.length - 1].at).getHours() + 'h'] : [];

  return (
    <DetailScreen title={TITULO[metric] ?? 'Indicador'}>
      <Data marginTop="$md">{data}</Data>
      {resumo === undefined ? (
        <YStack marginTop="$xl"><Skeleton lines={3} /></YStack>
      ) : metric === 'sleep' && noite ? (
        <SleepNightDetail sleep={noite} />
      ) : !resumo ? (
        <Note title="Sem medição neste dia" body="Os dias com medição aparecem marcados na faixa do histórico." />
      ) : (
        <>
          <YStack marginTop="$md" marginBottom="$xl">
            {metric === 'pressure' ? (
              <Display>
                {resumo.bp_systolic ?? '–'}/{resumo.bp_diastolic ?? '–'}
              </Display>
            ) : (
              <Display>{numeroGrande != null ? numeroGrande.toLocaleString('pt-BR') : '–'}</Display>
            )}
            <Data marginTop="$sm">
              {metric === 'sleep'
                ? `score · ${resumo.sleep_minutes != null ? `${Math.floor(resumo.sleep_minutes / 60)}h${String(resumo.sleep_minutes % 60).padStart(2, '0')} de sono` : 'duração não registrada'}`
                : metric === 'steps'
                  ? 'passos no dia'
                  : `${UNIDADE[metric]} · média do dia`}
            </Data>
            {avaliacao?.available ? (
              <RatingText marginTop="$lg" style={{ color: ratingTextColor(avaliacao.state, colors) }}>
                {avaliacao.label}
              </RatingText>
            ) : null}
          </YStack>

          {acumulado.length >= 2 ? (
            <Section label={metric === 'steps' ? 'Acumulado ao longo do dia' : 'Ao longo do dia'}>
              <YStack onLayout={onLayoutLargura}>
                {largura > 0 ? (
                  <LineChart
                    data={acumulado}
                    width={largura}
                    height={140}
                    thresholds={metric === 'spo2' ? [{ value: 95, label: 'limite', color: colors.alert }] : undefined}
                    domain={metric === 'spo2' ? [88, 100] : metric === 'stress' ? [0, 100] : undefined}
                    xLabels={horas}
                    id={`dia-${metric}`}
                  />
                ) : null}
              </YStack>
            </Section>
          ) : metric === 'sleep' ? (
            <Body marginTop="$md">Desta noite o servidor guarda só o score e a duração. As fases e os horários ficam no aparelho que sincronizou a noite; as últimas sete noites voltam da memória da pulseira na próxima sincronização.</Body>
          ) : metric !== 'pressure' ? (
            <Body marginTop="$md">Poucas medições neste dia para desenhar a curva.</Body>
          ) : null}

          {media != null && metric !== 'steps' ? (
            <YStack marginTop="$xl">
              <ReadoutCluster>
                <Readout valor={String(media)} unidade={UNIDADE[metric]} rotulo="média" />
                <Readout valor={String(minimo)} unidade={UNIDADE[metric]} rotulo="mínima" />
                <Readout valor={String(maximo)} unidade={UNIDADE[metric]} rotulo="máxima" />
              </ReadoutCluster>
            </YStack>
          ) : null}
        </>
      )}
    </DetailScreen>
  );
}
