import { XStack, YStack } from '@tamagui/stacks';
import React from 'react';
import { Pressable } from 'react-native';

import { Icon } from './Icon';
import { Row, Section } from './List';
import { Body, Data } from './ui';
import type { Indicador } from '../domain/homeIndicators';
import { useTheme } from '../theme/ThemeProvider';

/**
 * A lista dos cinco indicadores do dia: seta para cima (verde) ou para baixo
 * (vermelha), o nome e a frase. No lugar do carrossel (fundadora, 22/08/2026).
 *
 * Verde e vermelho aqui são a única exceção à regra do acento único: a
 * direção É a informação, e a pessoa lê a cor antes da palavra.
 */
export function IndicatorList({ itens, onAbrir }: { itens: Indicador[]; onAbrir: (rota: string) => void }) {
  const { colors } = useTheme();
  return (
    <Section label="Hoje">
      {itens.map((it, i) => (
        <Pressable key={it.key} onPress={() => onAbrir(it.rota)} accessibilityRole="button" accessibilityLabel={`${it.rotulo}: ${it.frase}`} style={({ pressed }) => (pressed ? { opacity: 0.5 } : undefined)}>
          <Row last={i === itens.length - 1}>
            <XStack width={24} alignItems="center" justifyContent="center">
              <Icon name={it.direcao === 'up' ? 'arrowUp' : 'arrowDown'} size={20} color={it.direcao === 'up' ? colors.good : colors.alert} strokeWidth={2.4} />
            </XStack>
            <YStack flex={1} gap={4}>
              <Body color="$foreground">{it.rotulo}</Body>
              <Data>{it.frase}</Data>
            </YStack>
            <Icon name="arrowRight" size={16} color={colors.textMuted} />
          </Row>
        </Pressable>
      ))}
    </Section>
  );
}
