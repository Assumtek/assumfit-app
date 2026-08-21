import { YStack } from '@tamagui/stacks';
import { useNavigation } from '@react-navigation/native';
import React, { useEffect, useState } from 'react';
import { LayoutChangeEvent, Pressable } from 'react-native';

import { HistoryRow, Note, Row, Section } from '../components/Card';
import { SyncSleepButton } from '../components/MeasureButton';
import { SleepPlanner } from '../components/SleepPlanner';
import { DetailScreen, usePullRefresh } from '../components/DetailScreen';
import { formatDateBR } from '../domain/birthDate';
import { Hypnogram } from '../components/charts/Hypnogram';
import { LineChart } from '../components/charts/LineChart';
import { Body, Data, Display, MetricSm, RatingText } from '../components/ui';
import { rateSleep } from '../domain/ratings';
import type { SleepPhase } from '../domain/types';
import { useBiometricStore } from '../store/biometric.store';
import * as api from '../services/api.service';
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
  const connectHealth = useBiometricStore((s) => s.connectHealth);
  // Puxar para atualizar busca a noite de novo — "opção de atualização em
  // todas as telas" (testador, 21/08). É o mesmo caminho do botão de buscar.
  const puxar = usePullRefresh(async () => {
    await connectHealth();
  });
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
      <DetailScreen title="Sono" refreshControl={puxar}>
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

        <UltimasNoites />

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
    <DetailScreen title="Sono" refreshControl={puxar}>
      <YStack marginBottom="$xxl">
        <Display>{sleep.score}</Display>
        <Data marginTop="$sm">score · {duration(sleep.totalMin)} de sono</Data>
        {/*
          A DATA da noite, não uma hora.

          `SleepSegment` guarda duração e fase, nunca instante — carimbar um
          horário de despertar aqui seria invenção. E a data importa: uma noite
          de quatro dias atrás exibida sem ela se lê como a de ontem, que foi o
          que o app do fabricante mostrava.
        */}
        <Data marginTop="$xs">noite de {formatDateBR(sleep.date)}</Data>
        <RatingText
          marginTop="$lg"
          color={rating.state === 'alert' ? '$destructive' : '$foreground'}
        >
          {rating.label}
        </RatingText>
        {/* Uma frase de abertura: o que este número É. O método inteiro fica na
            Ajuda — pedido dos testadores (ago/2026), que queriam entender a
            métrica sem sair da tela. */}
        <Body marginTop="$md">O score nasce das fases medidas: metade é quanto você dormiu, um quarto é o sono profundo, o resto é REM e continuidade — uma noite longa e picada pode pontuar menos que uma curta e inteira.</Body>
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

      {/*
        A seção só existe quando HÁ medição.

        Ela desenhava um gráfico permanentemente vazio: a noite vem da pulseira
        sem SpO₂, e ninguém preenchia o campo. Área em branco sob o título
        "Oxigênio durante a noite" não lê como ausência — lê como oxigênio que
        deu zero, que numa tela de saúde é a leitura mais alarmante possível.
      */}
      {sleep.spo2Night.length >= 2 ? (
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
      ) : (
        <Section label="Oxigênio durante a noite">
          <Row last>
            <Body flex={1}>
              Sem medição de oxigênio nesta noite. A pulseira mede em janelas
              agendadas — se o monitoramento estiver desligado, não há o que mostrar.
            </Body>
          </Row>
        </Section>
      )}

      <UltimasNoites />

      <SleepPlanner horaDeDormirHabitual={bedtime} />
    </DetailScreen>
  );
}

/**
 * As últimas noites, uma por linha.
 *
 * Pedido de quem testa (ago/2026): "daria pra ver dia a dia o histórico?". O
 * servidor já guardava cada noite em `daily_habits`; faltava a porta. A régua
 * é o score (0–100) e o valor é a duração — as duas grandezas que `rateSleep`
 * exige para avaliar uma noite, lado a lado. Noite sem medição simplesmente não
 * aparece: traço numa lista de noites leria como noite em claro.
 */
function UltimasNoites() {
  const navigation = useNavigation<any>();
  const [noites, setNoites] = useState<api.DailyHabitRow[] | null>(null);

  useEffect(() => {
    let vivo = true;
    api
      .fetchHabitsHistory(14)
      .then((linhas) => {
        if (!vivo) return;
        setNoites(
          linhas
            .filter((l) => l.sleepScore != null && l.sleepMinutes != null)
            .sort((a, b) => (a.date < b.date ? 1 : -1)),
        );
      })
      .catch(() => vivo && setNoites([]));
    return () => {
      vivo = false;
    };
  }, []);

  if (!noites || noites.length === 0) return null;

  const duracao = (min: number) => `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`;

  return (
    <Section label="Últimas noites">
      {noites.map((n, i) => (
        <Pressable
          key={n.date}
          onPress={() => navigation.push('MetricDay', { metric: 'sleep', dia: n.date.slice(0, 10) })}
          accessibilityRole="button"
          accessibilityLabel={`Noite de ${formatDateBR(n.date.slice(0, 10))}, score ${n.sleepScore}. Abrir o detalhe`}
          style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
        >
          <HistoryRow
            time={formatDateBR(n.date.slice(0, 10)).slice(0, 5)}
            fraction={(n.sleepScore ?? 0) / 100}
            value={`${n.sleepScore} · ${duracao(n.sleepMinutes ?? 0)}`}
            last={i === noites.length - 1}
          />
        </Pressable>
      ))}
    </Section>
  );
}
