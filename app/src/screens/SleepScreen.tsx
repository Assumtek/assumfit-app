import { YStack } from '@tamagui/stacks';
import { useNavigation } from '@react-navigation/native';
import { useChartWidth } from '../components/charts/useChartWidth';
import React, { useEffect, useState } from 'react';
import { Pressable } from 'react-native';

import { HistoryRow, Note, Row, Section } from '../components/List';
import { SyncSleepButton } from '../components/MeasureButton';
import { SleepNightDetail, diaSeguinte } from '../components/SleepNightDetail';
import { SleepPlanner } from '../components/SleepPlanner';
import { DetailScreen, usePullRefresh } from '../components/DetailScreen';
import { formatDateBR } from '../domain/birthDate';
import { Body, Data, Display, MetricSm, RatingText } from '../components/ui';
import { useBiometricStore } from '../store/biometric.store';
import * as api from '../services/api.service';
import { useLifestyleStore } from '../store/lifestyle.store';

/**
 * As fases são um único matiz em quatro valores. Quatro cores diferentes
 * transformariam a barra em gráfico de pizza colorido; a variação de valor
 * mantém a leitura de instrumento.
 */

export function SleepScreen() {
  const sleep = useBiometricStore((s) => s.sleep);
  const connectHealth = useBiometricStore((s) => s.connectHealth);
  // Puxar para atualizar busca a noite de novo — "opção de atualização em
  // todas as telas" (testador, 21/08). É o mesmo caminho do botão de buscar.
  const puxar = usePullRefresh(async () => {
    await connectHealth();
  });
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

  return (
    <DetailScreen title="Sono" refreshControl={puxar}>
      <SleepNightDetail sleep={sleep} />

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
            .sort((a, b) => (a.date < b.date ? 1 : -1)));
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
