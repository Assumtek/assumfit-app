import { XStack, YStack } from '@tamagui/stacks';
import React, { useState } from 'react';
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  useWindowDimensions,
} from 'react-native';

import { useTheme } from '../theme/ThemeProvider';
import { Icon } from './Icon';
import { Body, Data, Label, RatingText } from './ui';
import { Card } from './ui/Card';

export type HomeCard = {
  key: string;
  /** Rótulo da seção: treino, nutrição, saúde. */
  title: string;
  /** A manchete em linguagem humana — o destaque, como manda a regra de ouro. */
  headline: string;
  /** A frase da IA (ou do estado, enquanto ela não respondeu). */
  body: string;
  /** Linha de dado, opcional: "4 exercícios · ~45 min". */
  fact?: string | null;
  onPress: () => void;
};

/** Margem lateral da tela; o card seguinte espia por aqui. */
const SCREEN_PADDING = 24;
/** Quanto do próximo card fica visível — é o convite ao gesto. */
const PEEK = 28;
const GAP = 12;

/**
 * O carrossel de orientação da home: um card por assunto — treino, nutrição,
 * saúde — com texto gerado pela IA (decisão da fundadora, ago/2026).
 *
 * `snapToInterval` em vez de `pagingEnabled` porque o card é mais estreito que
 * a tela DE PROPÓSITO: a beirada do próximo aparecendo é o que diz "desliza"
 * sem precisar de seta nem tutorial. Os pontos embaixo são acromáticos — o
 * acento é do dado, não da navegação (regra 2).
 */
export function HomeCarousel({ cards }: { cards: HomeCard[] }) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const [pagina, setPagina] = useState(0);

  const cardWidth = width - SCREEN_PADDING * 2 - PEEK;
  const passo = cardWidth + GAP;

  const aoRolar = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const p = Math.round(e.nativeEvent.contentOffset.x / passo);
    if (p !== pagina && p >= 0 && p < cards.length) setPagina(p);
  };

  return (
    <YStack gap="$lg">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={passo}
        decelerationRate="fast"
        onScroll={aoRolar}
        scrollEventThrottle={64}
        // O carrossel sangra até a borda da tela; o conteúdo respeita a margem.
        style={{ marginHorizontal: -SCREEN_PADDING }}
        contentContainerStyle={{ paddingHorizontal: SCREEN_PADDING, gap: GAP }}
      >
        {cards.map((card) => (
          <Pressable
            key={card.key}
            onPress={card.onPress}
            accessibilityRole="button"
            accessibilityLabel={`${card.title}: ${card.headline}. ${card.body}`}
            style={({ pressed }) => [{ width: cardWidth }, pressed && { opacity: 0.6 }]}
          >
            <Card>
              {/* minHeight única no miolo: cards de altura diferente fariam o
                  conjunto pular a cada deslize. */}
              <YStack minHeight={132}>
                <XStack justifyContent="space-between" alignItems="center" marginBottom="$sm">
                  <Label>{card.title}</Label>
                  <Icon name="arrowRight" size={14} color={colors.textMuted} />
                </XStack>
                <RatingText numberOfLines={2}>{card.headline}</RatingText>
                <Body marginTop="$sm" numberOfLines={3} flexShrink={1}>
                  {card.body}
                </Body>
                {card.fact ? <Data marginTop="$md">{card.fact}</Data> : null}
              </YStack>
            </Card>
          </Pressable>
        ))}
      </ScrollView>

      {/* Um ponto por card, sem número nem seta: o indicador diz "há mais e
          você está aqui", e só. Acromático de propósito. */}
      <XStack gap="$sm" alignSelf="center" accessibilityElementsHidden>
        {cards.map((card, i) => (
          <YStack
            key={card.key}
            width={6}
            height={6}
            borderRadius={4}
            backgroundColor={i === pagina ? '$mutedForeground' : '$border'}
          />
        ))}
      </XStack>
    </YStack>
  );
}
