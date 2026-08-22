import { YStack } from '@tamagui/stacks';
import React, { useEffect, useRef } from 'react';
import { Animated } from 'react-native';

/**
 * Esqueleto de carregamento: blocos na forma do conteúdo que vai chegar,
 * pulsando devagar. No lugar de "Carregando…" em texto, que ocupa uma linha e
 * faz a tela pular quando o conteúdo entra.
 *
 * Cor por token (`$control`), sem gradiente de brilho: o pulso de opacidade
 * basta para dizer "ainda vem".
 */
export function Skeleton({
  lines = 3,
  height = 16,
  widths = ['72%', '100%', '56%'],
  gap = 12,
}: {
  lines?: number;
  height?: number;
  /** Larguras por linha, cíclicas: o esqueleto imita um parágrafo, não uma régua. */
  widths?: (string | number)[];
  gap?: number;
}) {
  const pulso = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const laco = Animated.loop(
      Animated.sequence([
        Animated.timing(pulso, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulso, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ]),
    );
    laco.start();
    return () => laco.stop();
  }, [pulso]);
  return (
    <Animated.View style={{ opacity: pulso }} accessibilityLabel="Carregando" accessibilityRole="progressbar">
      <YStack gap={gap}>
        {Array.from({ length: lines }, (_, i) => (
          <YStack key={i} height={height} width={widths[i % widths.length] as never} borderRadius={8} backgroundColor="$control" />
        ))}
      </YStack>
    </Animated.View>
  );
}
