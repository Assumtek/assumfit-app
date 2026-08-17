import { useNavigation } from '@react-navigation/native';
import { Text } from '@tamagui/core';
import { XStack, YStack } from '@tamagui/stacks';
import React from 'react';
import { Pressable } from 'react-native';

import { Icon, type IconName } from '../../components/Icon';
import { useTheme } from '../../theme/ThemeProvider';

/**
 * Os quatro destinos do módulo de treino.
 *
 * Eram quatro cartões quadrados de 96 pt em carrossel horizontal — pesados,
 * com sombra e borda cada um, e um deles sempre cortado na margem. Para
 * QUATRO destinos fixos, o carrossel não tinha o que revelar: só escondia o
 * quarto item e cobrava um gesto para nada.
 *
 * Agora são quatro colunas fixas de disco e rótulo, a gramática de ação rápida
 * que o iOS usa em toda parte: alvo redondo, ícone monolinear centrado,
 * palavra embaixo. Sem cartão, sem sombra, sem corte — mais leve, e todos os
 * quatro visíveis de uma vez.
 */

type Item = { icone: IconName; rotulo: string; rota: string };

const ITENS: Item[] = [
  { icone: 'calendar', rotulo: 'Histórico', rota: 'WorkoutHistory' },
  { icone: 'ruler', rotulo: 'Anamnese', rota: 'AnamnesisHistory' },
  { icone: 'pulse', rotulo: 'Personal', rota: 'Personal' },
  { icone: 'up', rotulo: 'Progresso', rota: 'Progress' },
];

/** 56 pt: acima do alvo mínimo de 44 da Apple, com folga para o dedo. */
const DISCO = 56;

export function QuickMenu() {
  const navigation = useNavigation<any>();

  return (
    <XStack justifyContent="space-between">
      {ITENS.map((item) => (
        <Botao key={item.rota} item={item} onPress={() => navigation.push(item.rota)} />
      ))}
    </XStack>
  );
}

function Botao({ item, onPress }: { item: Item; onPress: () => void }) {
  const { colors } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={item.rotulo}
      style={({ pressed }) => [{ flex: 1 }, pressed && { opacity: 0.6 }]}
    >
      <YStack alignItems="center" gap="$sm">
        <YStack
          width={DISCO}
          height={DISCO}
          borderRadius={DISCO / 2}
          borderWidth={1}
          borderColor="$border"
          backgroundColor="$card"
          alignItems="center"
          justifyContent="center"
        >
          {/* Ícone acromático: estes quatro são navegação, e o acento
              pertence ao dado — a mesma regra do resto do sistema. */}
          <Icon name={item.icone} size={21} color={colors.textMuted} strokeWidth={1.5} />
        </YStack>
        <Text fontSize={12} color="$mutedForeground" numberOfLines={1}>
          {item.rotulo}
        </Text>
      </YStack>
    </Pressable>
  );
}
