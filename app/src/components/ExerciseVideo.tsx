import { YStack } from '@tamagui/stacks';
import { useVideoPlayer, VideoView } from 'expo-video';
import React, { useState } from 'react';
import { Image, Pressable, StyleSheet } from 'react-native';

import { Icon } from './Icon';
import { useTheme } from '../theme/ThemeProvider';

/**
 * O vídeo demonstrativo do exercício — do catálogo do MUVX, casado por id.
 *
 * Pedido de um testador e decisão da fundadora (22/08/2026). Nasce como a
 * thumbnail com um botão de play: ~14 MB por vídeo, e baixar sem pedir num
 * treino de oito exercícios é dado móvel que ninguém autorizou. Ao tocar, o
 * player entra no lugar, mudo e em laço — demonstração de execução não tem
 * áudio que importe, e o laço é o que deixa a pessoa olhar duas vezes.
 *
 * Sem vídeo, não renderiza nada: o exercício segue igual ao que era.
 */
export function ExerciseVideo({
  videoUrl,
  thumbnailUrl,
}: {
  videoUrl: string | null;
  thumbnailUrl: string | null;
}) {
  const { colors } = useTheme();
  const [tocando, setTocando] = useState(false);
  const player = useVideoPlayer(tocando && videoUrl ? videoUrl : null, (p) => {
    p.loop = true;
    p.muted = true;
    if (tocando) p.play();
  });

  if (!videoUrl) return null;

  return (
    <YStack marginTop="$lg" borderRadius={16} overflow="hidden" backgroundColor="$card" aspectRatio={16 / 9}>
      {tocando ? (
        <VideoView player={player} style={estilo.preencher} contentFit="cover" nativeControls={false} />
      ) : (
        <Pressable
          onPress={() => setTocando(true)}
          accessibilityRole="button"
          accessibilityLabel="Ver o vídeo de como fazer o exercício"
          style={estilo.preencher}
        >
          {thumbnailUrl ? <Image source={{ uri: thumbnailUrl }} style={estilo.preencher} resizeMode="cover" /> : null}
          <YStack style={estilo.centro}>
            <YStack
              width={52}
              height={52}
              borderRadius={28}
              alignItems="center"
              justifyContent="center"
              backgroundColor="$primary"
            >
              <Icon name="play" size={20} color={colors.ink} />
            </YStack>
          </YStack>
        </Pressable>
      )}
    </YStack>
  );
}

// Sem cor: só geometria. A cor vem dos tokens acima.
const estilo = StyleSheet.create({
  preencher: { width: '100%', height: '100%' },
  centro: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
});
