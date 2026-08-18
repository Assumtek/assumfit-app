import { Text } from '@tamagui/core';
import { XStack, YStack } from '@tamagui/stacks';
import React, { useEffect, useState } from 'react';
import { LayoutChangeEvent, Pressable } from 'react-native';

import { Row, Section } from '../components/Card';
import { WaterReminder } from '../components/SedentaryReminder';
import { DetailScreen } from '../components/DetailScreen';
import { Icon } from '../components/Icon';
import { BarChart } from '../components/charts/BarChart';
import { Body, Button, Data, Display, Label, MetricSm, RatingText, SectionTitle } from '../components/ui';
import { Card } from '../components/ui/Card';
import { Sheet } from '../components/ui/Dialog';
import { MAX_ML, MIN_ML, STEP_ML, type Container } from '../domain/containers';
import * as api from '../services/api.service';
import { useHabitsStore } from '../store/habits.store';
import { useUserStore } from '../store/user.store';
import { useTheme } from '../theme/ThemeProvider';

/** `1500` → `1,5`. Vírgula, porque a tela é em português. */
const liters = (ml: number) => (ml / 1000).toFixed(1).replace('.', ',');

/**
 * Quanto falta, em linguagem humana.
 *
 * "Faltam 2500 ml" é número cru, e além disso não ajuda: ninguém tem noção de
 * quanto são 2500 ml. Traduzir para copos dá a única informação acionável —
 * quantas vezes ainda vai ser preciso levantar e beber.
 */
function remainingLabel(remainingMl: number, copoMl: number): string {
  if (remainingMl === 0) return 'Meta batida';
  const glasses = Math.ceil(remainingMl / copoMl);
  return `Faltam ${liters(remainingMl)} L — cerca de ${glasses} ${glasses === 1 ? 'copo' : 'copos'}`;
}

export function HabitsScreen() {
  const { colors } = useTheme();
  const today = useHabitsStore((s) => s.today);
  const week = useHabitsStore((s) => s.week);
  const goalMl = useHabitsStore((s) => s.goalMl);
  const addWater = useHabitsStore((s) => s.addWater);
  const undo = useHabitsStore((s) => s.undoLastPour);
  const hydrate = useHabitsStore((s) => s.hydrate);
  const containers = useHabitsStore((s) => s.containers);
  const setContainerMl = useHabitsStore((s) => s.setContainerMl);
  const [chartWidth, setChartWidth] = useState(0);
  const [ajustando, setAjustando] = useState(false);
  const refreshGoal = useHabitsStore((s) => s.refreshGoal);
  const goalReason = useHabitsStore((s) => s.goalReason);
  const user = useUserStore((s) => s.user);

  // Semana e dia vêm do servidor — é o que faz a água de ontem existir e a de
  // hoje sobreviver ao app fechar.
  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  /*
   A meta sai do PESO da pessoa e do treino de hoje. As duas fontes vêm de
   lugares diferentes (anamnese e histórico), e nenhuma delas é obrigatória:
   sem peso, a meta cai na referência por sexo e a tela diz isso.
  */
  useEffect(() => {
    let vivo = true;
    void (async () => {
      const inicioDoDia = new Date();
      inicioDoDia.setHours(0, 0, 0, 0);
      const [anamnese, execucoes, sessoes] = await Promise.all([
        api.fetchAnamnesis().catch(() => null),
        api.fetchExecutionHistory(1).catch(() => []),
        api.fetchSportSessions(1).catch(() => []),
      ]);
      if (!vivo) return;

      const respostas = anamnese?.answers as { weightKg?: number } | undefined;
      const peso = typeof respostas?.weightKg === 'number' ? respostas.weightKg : null;

      const vinculadas = new Set(
        sessoes.map((se) => se.workoutExecutionId).filter((id): id is string => !!id),
      );
      const minutos =
        execucoes
          .filter((e) => e.status === 'FINISHED' && new Date(e.startedAt) >= inicioDoDia)
          .filter((e) => !vinculadas.has(e.id))
          .reduce((soma, e) => soma + (e.durationSec ?? 0) / 60, 0) +
        sessoes
          .filter((se) => new Date(se.startedAt) >= inicioDoDia)
          .reduce((soma, se) => soma + se.durationS / 60, 0);

      refreshGoal({ weightKg: peso, sex: user.sex, activeMinToday: Math.round(minutos) });
    })();
    return () => {
      vivo = false;
    };
  }, [refreshGoal, user.sex]);

  const pct = Math.min(1, today.waterMl / goalMl);
  const remaining = Math.max(0, goalMl - today.waterMl);

  return (
    <DetailScreen title="Hábitos">
      {/*
        Respiro maior no topo porque o título da tela também é um rótulo em
        caixa alta: sem a distância, os dois se leem como um par gaguejado.
      */}
      <Label marginTop="$md" marginBottom="$md">
        água hoje
      </Label>

      {/* Número e unidade na mesma linha de base — a unidade é sub-label. */}
      <XStack alignItems="baseline" gap="$sm">
        <Display>{liters(today.waterMl)}</Display>
        <MetricSm color="$faint">L</MetricSm>
      </XStack>
      <RatingText marginTop="$md" marginBottom="$xxl">
        {remainingLabel(remaining, containers[0].ml)}
      </RatingText>

      {/* Aqui a barra de PREENCHIMENTO é a certa, ao contrário da energia na
          home: água acumula rumo a uma meta, e a meta é o fim da régua. A escala
          embaixo existe para a barra não flutuar sem referência — sem ela, um
          traço cheio pela metade não diz metade de quê. */}
      <YStack gap="$sm">
        <YStack height={6} borderRadius={3} backgroundColor="$track" overflow="hidden">
          <YStack height={6} borderRadius={3} backgroundColor="$primary" width={`${pct * 100}%`} />
        </YStack>
        <XStack justifyContent="space-between">
          <Data>0</Data>
          {/* A meta mostra DE ONDE veio: é a conta da pessoa, e ela pode
              conferir — sem isso, um número novo na tela é só um número. */}
          <Data>
            meta {liters(goalMl)} L{goalReason ? ` · ${goalReason}` : ' · referência'}
          </Data>
        </XStack>
      </YStack>

      <XStack gap="$sm" marginTop="$xl">
        {containers.map((pour) => (
          <YStack key={pour.key} flex={1}>
            {/* Card é o vocabulário de AÇÃO no novo sistema. Três colunas
                separadas só por um fio liam como tabela de dados, não como
                algo em que se toca. */}
            <Card
              onPress={() => addWater(pour.ml)}
              accessibilityLabel={`Adicionar ${pour.label}, ${pour.ml} mililitros`}
            >
              {/* Regra de ouro: o destaque é o recipiente, que é o que a pessoa
                  reconhece; o volume é o dado técnico e vai de sub-label. Você
                  toca em "copo", não em "+200". */}
              <YStack alignItems="center" gap="$xs">
                <Text fontSize={16} letterSpacing={-0.2} color="$foreground">
                  {pour.label}
                </Text>
                <Data>{pour.ml} ml</Data>
              </YStack>
            </Card>
          </YStack>
        ))}
      </XStack>

      {/* O ajuste fica ao lado do desfazer: os dois são correções do
          registro, e quem erra o volume percebe no mesmo instante em que
          erraria o toque. */}
      <XStack alignItems="center" justifyContent="space-between" gap="$md">
        {today.pours.length > 0 ? (
          <Pressable
          style={({ pressed }) => (pressed ? { opacity: 0.5 } : undefined)}
          onPress={undo}
          accessibilityRole="button"
        >
            <XStack alignItems="center" gap="$sm" paddingVertical="$lg">
              <Icon name="back" size={14} color={colors.textFaint} />
              <Data>Desfazer {today.pours[today.pours.length - 1]} ml</Data>
            </XStack>
          </Pressable>
        ) : (
          <Data paddingVertical="$lg" flexShrink={1}>
            Toque no recipiente que você acabou de beber.
          </Data>
        )}

        <Pressable
          onPress={() => setAjustando(true)}
          accessibilityRole="button"
          accessibilityLabel="Ajustar o volume dos recipientes"
          style={({ pressed }) => (pressed ? { opacity: 0.5 } : undefined)}
        >
          <XStack alignItems="center" gap="$sm" paddingVertical="$lg" flexShrink={0}>
            <Icon name="ruler" size={14} color={colors.textFaint} />
            <Data>Ajustar volumes</Data>
          </XStack>
        </Pressable>
      </XStack>

      {/*
        Só o lembrete de ÁGUA: o alerta de sedentarismo saiu daqui (decisão da
        fundadora, ago/2026) e continua inteiro na tela de Dispositivo, que é
        onde moram os controles do que a pulseira faz vibrar.
      */}
      <WaterReminder />

      <Section label="Últimos 7 dias">
        <YStack onLayout={(e: LayoutChangeEvent) => setChartWidth(e.nativeEvent.layout.width)}>
          <BarChart
            width={chartWidth}
            height={140}
            max={goalMl * 1.15}
            reference={{ value: goalMl, label: 'meta' }}
            bars={week.map((d) => ({ label: d.label, value: d.waterMl }))}
            labelEvery={1}
            id="water"
          />
        </YStack>
      </Section>

      <Section label="Hoje">
        <Row last>
          <Body flex={1}>Registros de água</Body>
          <MetricSm fontSize={17}>{today.pours.length}</MetricSm>
        </Row>
      </Section>

      {/* O ajuste dos recipientes: uma folha, porque é tarefa fechada e rara —
          entra, corrige o volume, sai. */}
      <Sheet open={ajustando} onClose={() => setAjustando(false)}>
        <YStack gap="$xs">
          <SectionTitle fontSize={18}>Volume dos recipientes</SectionTitle>
          <Data>
            Use a medida dos SEUS recipientes — é o que faz o total do dia ser o seu, e não uma
            média de fabricante.
          </Data>
        </YStack>

        {containers.map((c) => (
          <AjusteDeVolume
            key={c.key}
            container={c}
            onChange={(ml) => setContainerMl(c.key, ml)}
          />
        ))}

        <Button title="Pronto" onPress={() => setAjustando(false)} />
      </Sheet>
    </DetailScreen>
  );
}

/**
 * Uma linha de ajuste: o rótulo, o volume e os dois passos.
 *
 * Passo de 50 ml em vez de campo de texto: o teclado numérico cobriria a
 * própria folha, e ninguém sabe o volume do copo com precisão de mililitro —
 * sabe que é "um pouco mais que 200". Os limites travam nas pontas em vez de
 * aceitar e corrigir depois, que é o que faz o botão parecer quebrado.
 */
function AjusteDeVolume({
  container,
  onChange,
}: {
  container: Container;
  onChange: (ml: number) => void;
}) {
  const noMinimo = container.ml <= MIN_ML;
  const noMaximo = container.ml >= MAX_ML;

  return (
    <XStack alignItems="center" gap="$md">
      <YStack flex={1} gap={2}>
        <Body color="$foreground" textTransform="capitalize">
          {container.label}
        </Body>
        <Data>{container.ml} ml</Data>
      </YStack>

      <XStack alignItems="center" gap="$sm">
        <PassoDeVolume
          rotulo={`Diminuir ${container.label}`}
          icone="down"
          desativado={noMinimo}
          onPress={() => onChange(container.ml - STEP_ML)}
        />
        {/* Tabular para o número não tremer a cada toque. */}
        <Text
          fontSize={17}
          fontWeight="600"
          color="$foreground"
          fontVariant={['tabular-nums']}
          width={54}
          textAlign="center"
        >
          {container.ml}
        </Text>
        <PassoDeVolume
          rotulo={`Aumentar ${container.label}`}
          icone="up"
          desativado={noMaximo}
          onPress={() => onChange(container.ml + STEP_ML)}
        />
      </XStack>
    </XStack>
  );
}

function PassoDeVolume({
  rotulo,
  icone,
  desativado,
  onPress,
}: {
  rotulo: string;
  icone: 'up' | 'down';
  desativado: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={desativado}
      accessibilityRole="button"
      accessibilityLabel={rotulo}
      accessibilityState={{ disabled: desativado }}
      // 44 é o alvo mínimo da Apple, e um passo de volume é tocado em série.
      hitSlop={8}
      style={({ pressed }) => (pressed && !desativado ? { opacity: 0.6 } : undefined)}
    >
      <YStack
        width={40}
        height={40}
        borderRadius={20}
        borderWidth={1}
        borderColor="$borderStrong"
        alignItems="center"
        justifyContent="center"
        opacity={desativado ? 0.35 : 1}
      >
        <Icon name={icone} size={16} color={colors.text} />
      </YStack>
    </Pressable>
  );
}
