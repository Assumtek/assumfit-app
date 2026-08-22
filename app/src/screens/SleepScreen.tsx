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
import { Body, Data, Display, MetricSm, RatingText } from '../components/ui';
import { rateSleep } from '../domain/ratings';
import { horaLocal, trechosAcordado } from '../domain/sleep';
import type { SleepPhase } from '../domain/types';
import { useBiometricStore } from '../store/biometric.store';
import * as api from '../services/api.service';
import { useLifestyleStore } from '../store/lifestyle.store';

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
  const acordadas = trechosAcordado(sleep);

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
        {/*
          As DUAS pontas da noite. O rótulo dizia só o dia em que começou, e a
          fundadora leu "20/08" como a noite anterior quando era a de 20 para 21
          (ago/2026); um testador, antes, tinha lido o contrário. Dormiu X,
          acordou Y resolve as duas leituras.
        */}
        <Data marginTop="$xs">noite de {formatDateBR(sleep.date).slice(0, 5)} para {formatDateBR(diaSeguinte(sleep.date))}</Data>
        {/* Início e fim com relógio — pedido de um testador (22/08). Só quando
            a noite veio com janela; sem ela, a linha não aparece em vez de
            inventar hora. */}
        {sleep.startAt != null && sleep.endAt != null ? (
          <Data marginTop="$xs">dormiu {horaLocal(sleep.startAt)} · acordou {horaLocal(sleep.endAt)}</Data>
        ) : null}
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

      {/*
        Quando levantou durante a noite, com relógio. A seção só existe se
        houve levantada: "nenhuma" como linha seria ruído numa noite inteira.
      */}
      {acordadas.length > 0 ? (
        <YStack marginBottom="$xl">
          <Section label="Acordou durante a noite">
            {acordadas.map((t, i) => (
              <Row key={t.startAt} last={i === acordadas.length - 1}>
                <Body flex={1}>
                  {horaLocal(t.startAt)} → {horaLocal(t.endAt)}
                </Body>
                <Data>{t.minutes >= 60 ? `${Math.floor(t.minutes / 60)}h ${String(t.minutes % 60).padStart(2, '0')}m` : `${t.minutes} min`}</Data>
              </Row>
            ))}
          </Section>
        </YStack>
      ) : null}

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
        Oxigênio durante a noite SAIU desta tela (decisão da fundadora, 21/08).
        A pulseira raramente entrega a série noturna de SpO₂, e a seção vivia
        entre dois estados ruins: gráfico vazio ou um aviso de "sem medição"
        que lia como defeito. O oxigênio continua com tela própria.
      */}
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
            time={`${formatDateBR(n.date.slice(0, 10)).slice(0, 2)}→${formatDateBR(diaSeguinte(n.date.slice(0, 10))).slice(0, 5)}`}
            fraction={(n.sleepScore ?? 0) / 100}
            value={`${n.sleepScore} · ${duracao(n.sleepMinutes ?? 0)}`}
            last={i === noites.length - 1}
          />
        </Pressable>
      ))}
    </Section>
  );
}

/** `2026-08-20` → `2026-08-21`, em calendário local. */
function diaSeguinte(iso: string): string {
  const [a, m, d] = iso.split('-').map(Number);
  const x = new Date(a, m - 1, d + 1);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}
