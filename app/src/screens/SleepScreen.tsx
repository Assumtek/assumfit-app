import { YStack } from '@tamagui/stacks';
import React, { useState } from 'react';
import { LayoutChangeEvent } from 'react-native';

import { Note, Row, Section } from '../components/Card';
import { SyncSleepButton } from '../components/MeasureButton';
import { SleepPlanner } from '../components/SleepPlanner';
import { DetailScreen } from '../components/DetailScreen';
import { Hypnogram } from '../components/charts/Hypnogram';
import { LineChart } from '../components/charts/LineChart';
import { Body, Data, Display, MetricSm, RatingText } from '../components/ui';
import { rateSleep } from '../domain/ratings';
import type { SleepPhase } from '../domain/types';
import { useBiometricStore } from '../store/biometric.store';
import { useLifestyleStore } from '../store/lifestyle.store';
import { useTheme } from '../theme/ThemeProvider';

/**
 * As fases são um único matiz em quatro valores. Quatro cores diferentes
 * transformariam a barra em gráfico de pizza colorido; a variação de valor
 * mantém a leitura de instrumento.
 */
const PHASES: { key: SleepPhase; label: string; opacity: number }[] = [
  { key: 'deep', label: 'Profundo', opacity: 1 },
  { key: 'rem', label: 'REM', opacity: 0.66 },
  { key: 'light', label: 'Leve', opacity: 0.38 },
  { key: 'awake', label: 'Acordado', opacity: 0.16 },
];

export function SleepScreen() {
  const { colors } = useTheme();
  const sleep = useBiometricStore((s) => s.sleep);
  const rating = rateSleep(sleep?.score ?? null, sleep?.totalMin ?? null);
  const [chartWidth, setChartWidth] = useState(0);
  // A hora habitual de dormir vem do perfil de rotina, quando respondida.
  const bedtime = useLifestyleStore((st) => st.answers.bedtime ?? null);

  /*
   Sem noite medida, a tela DIZ isso.

   Antes havia uma noite de exemplo no store — score 82, hipnograma completo —
   que aparecia igual para quem nunca dormiu com a pulseira. Num produto de
   saúde, número plausível que ninguém mediu é pior que tela vazia: não há como
   distinguir os dois olhando, e a pessoa tira conclusão sobre o próprio sono a
   partir de dado que não é dela.
   */
  if (!sleep) {
    return (
      <DetailScreen title="Sono">
        <Note
          title="Nenhuma noite registrada"
          body="A pulseira precisa ser usada durante o sono. Na manhã seguinte, os estágios aparecem aqui."
        />
        {/*
          Sono não tem "medir agora": ele se mede DORMINDO, e um botão que
          prometesse medição instantânea seria mentira de interface. O que cabe
          aqui é buscar de novo o que a pulseira já gravou.
        */}
        <SyncSleepButton />

        {/* O planejador NÃO depende de noite medida: ele é fisiologia, não
            leitura da pulseira. Quem ainda não dormiu com o aparelho é
            exatamente quem chega aqui procurando a que horas deitar. */}
        <SleepPlanner horaDeDormirHabitual={bedtime} />
      </DetailScreen>
    );
  }

  const duration = (min: number) => {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
  };
  const pct = (min: number) => Math.round((min / sleep.totalMin) * 100);

  return (
    <DetailScreen title="Sono">
      <YStack marginBottom="$xxl">
        <Display>{sleep.score}</Display>
        <Data marginTop="$sm">score · {duration(sleep.totalMin)} de sono</Data>
        <RatingText
          marginTop="$lg"
          color={rating.state === 'alert' ? '$destructive' : '$foreground'}
        >
          {rating.label}
        </RatingText>
      </YStack>

      <YStack onLayout={(e: LayoutChangeEvent) => setChartWidth(e.nativeEvent.layout.width)}>
        <Hypnogram segments={sleep.segments} width={chartWidth} />
      </YStack>
      <Data marginTop="$md" marginBottom="$sm" lineHeight={17}>
        A ordem importa mais que o total: profundo concentrado nos primeiros ciclos é o padrão
        fisiológico.
      </Data>

      <Section label="Fases da noite">
        {PHASES.map((p, i) => (
          <Row key={p.key} last={i === PHASES.length - 1}>
            <YStack
              width={8}
              height={2}
              backgroundColor="$primary"
              marginRight="$md"
              opacity={p.opacity}
            />
            <Body flex={1}>{p.label}</Body>
            <Data marginRight="$xl">{duration(sleep.phases[p.key])}</Data>
            <MetricSm fontSize={17} minWidth={48} textAlign="right">
              {pct(sleep.phases[p.key])}%
            </MetricSm>
          </Row>
        ))}
      </Section>

      <Section label="Oxigênio durante a noite">
        <LineChart
          data={sleep.spo2Night}
          width={chartWidth}
          height={120}
          domain={[92, 100]}
          thresholds={[{ value: 95, label: 'limite', color: colors.alert }]}
          xLabels={['início', 'meio', 'fim']}
          id="spo2night"
        />
      </Section>

      <SleepPlanner horaDeDormirHabitual={bedtime} />
    </DetailScreen>
  );
}
