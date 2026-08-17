import { Text } from '@tamagui/core';
import { XStack } from '@tamagui/stacks';
import React from 'react';
import { Pressable, useWindowDimensions } from 'react-native';

import type { MovementWeek as MovementWeekData } from '../domain/movement';
import { DAY_SHORT } from '../domain/workout';
import { useTheme } from '../theme/ThemeProvider';
import { BarChart } from './charts/BarChart';
import { Icon } from './Icon';
import { Data, Label } from './ui';
import { Card } from './ui/Card';

/**
 * A agenda de movimento (decisão da fundadora, ago/2026): não o que está
 * PLANEJADO, mas o que foi FEITO — a sequência à la Duolingo com a chama, e o
 * corpo como GRÁFICO DE BARRAS da mesma família dos demais (malha de fundo,
 * barra fina): eixo é o dia da semana, coluna é a duração em minutos.
 *
 * O acento continua sendo do dado: aqui o dado é o movimento realizado.
 */
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function MovementWeek({
  semana,
  onPress,
}: {
  semana: MovementWeekData;
  onPress?: () => void;
}) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const { streak, hojeFeito, dias } = semana;

  // Largura útil: tela − margem da tela (24×2) − respiro interno do card.
  const chartW = width - 48 - 40;

  const barras = dias.map((d) => ({
    label: cap(DAY_SHORT[d.weekday]),
    value: d.minutos,
    color: colors.accent,
  }));

  const feitosNaSemana = dias.filter((d) => d.feito);
  const resumo = feitosNaSemana
    .map((d) => `${DAY_SHORT[d.weekday]} ${d.minutos} minutos`)
    .join(', ');

  // Uma linha de estado, nunca rodapé fixo: só fala quando há o que dizer.
  const nota = hojeFeito
    ? null
    : streak > 0
      ? 'Mova-se hoje para manter a sequência.'
      : 'Treino ou esporte registrado acende o dia.';

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Agenda de movimento: sequência de ${streak} ${streak === 1 ? 'dia' : 'dias'}. ${
        feitosNaSemana.length > 0
          ? `Nesta semana: ${resumo}.`
          : 'Nenhum dia com movimento nesta semana ainda.'
      }`}
      style={({ pressed }) => pressed && { opacity: 0.6 }}
    >
      <Card>
        <XStack justifyContent="space-between" alignItems="center" marginBottom="$lg">
          <Label>agenda de movimento</Label>
          <XStack alignItems="center" gap={5}>
            <Icon
              name="flame"
              size={15}
              color={streak > 0 ? colors.accent : colors.textMuted}
              strokeWidth={1.5}
            />
            <Text
              fontSize={13}
              fontWeight="700"
              color={streak > 0 ? '$primary' : '$mutedForeground'}
            >
              {streak} {streak === 1 ? 'dia' : 'dias'}
            </Text>
          </XStack>
        </XStack>

        {/* Teto de 30 min no eixo: numa semana cujo único registro são 5
            minutos, a barra não encosta no topo gritando mais que merece. */}
        <BarChart
          bars={barras}
          width={chartW}
          height={110}
          max={Math.max(...dias.map((d) => d.minutos), 30) * 1.15}
          labelEvery={1}
          id="movimento-semana"
        />

        {nota ? <Data marginTop="$md">{nota}</Data> : null}
      </Card>
    </Pressable>
  );
}
