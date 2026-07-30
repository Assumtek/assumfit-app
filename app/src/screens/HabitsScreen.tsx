import { Text } from '@tamagui/core';
import { XStack, YStack } from '@tamagui/stacks';
import React, { useEffect, useState } from 'react';
import { LayoutChangeEvent, Pressable } from 'react-native';

import { Row, Section } from '../components/Card';
import { SedentaryReminder, WaterReminder } from '../components/SedentaryReminder';
import { DetailScreen } from '../components/DetailScreen';
import { Icon } from '../components/Icon';
import { BarChart } from '../components/charts/BarChart';
import { Body, Data, Display, Label, MetricSm, RatingText } from '../components/ui';
import { Card } from '../components/ui/Card';
import { useHabitsStore } from '../store/habits.store';
import { useTheme } from '../theme/ThemeProvider';

/** Incrementos que correspondem a recipientes reais, não a números redondos. */
const POURS = [
  { ml: 200, label: 'copo' },
  { ml: 500, label: 'garrafa' },
  { ml: 750, label: 'squeeze' },
];

/** `1500` → `1,5`. Vírgula, porque a tela é em português. */
const liters = (ml: number) => (ml / 1000).toFixed(1).replace('.', ',');

/**
 * Quanto falta, em linguagem humana.
 *
 * "Faltam 2500 ml" é número cru, e além disso não ajuda: ninguém tem noção de
 * quanto são 2500 ml. Traduzir para copos dá a única informação acionável —
 * quantas vezes ainda vai ser preciso levantar e beber.
 */
function remainingLabel(remainingMl: number): string {
  if (remainingMl === 0) return 'Meta batida';
  const glasses = Math.ceil(remainingMl / POURS[0].ml);
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
  const [chartWidth, setChartWidth] = useState(0);

  // Semana e dia vêm do servidor — é o que faz a água de ontem existir e a de
  // hoje sobreviver ao app fechar.
  useEffect(() => {
    void hydrate();
  }, [hydrate]);

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
        {remainingLabel(remaining)}
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
          <Data>meta {liters(goalMl)} L</Data>
        </XStack>
      </YStack>

      <XStack gap="$sm" marginTop="$xl">
        {POURS.map((pour) => (
          <YStack key={pour.ml} flex={1}>
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
        <Data paddingVertical="$lg">Toque no recipiente que você acabou de beber.</Data>
      )}

      {/*
        O alerta de sedentarismo aparece AQUI porque é aqui que se procura por
        ele: levantar da cadeira é hábito, como beber água — a pessoa não sabe
        (nem deveria precisar saber) que quem vibra é o firmware. A tela de
        Dispositivo mantém o mesmo controle, e é o MESMO componente: duas
        cópias de um interruptor é onde uma passa a mentir sobre a outra.
      */}
      <SedentaryReminder />
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
        <Row>
          <Body flex={1}>Registros de água</Body>
          <MetricSm fontSize={17}>{today.pours.length}</MetricSm>
        </Row>
        <Row last>
          <Body flex={1}>Sessões de foco</Body>
          <MetricSm fontSize={17}>{today.focusSessions}</MetricSm>
        </Row>
      </Section>

    </DetailScreen>
  );
}
