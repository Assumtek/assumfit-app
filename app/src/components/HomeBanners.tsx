import { Text } from '@tamagui/core';
import { XStack, YStack } from '@tamagui/stacks';
import { Body } from './ui';
import React, { useEffect, useRef, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { Icon } from './Icon';
import { ShadowView } from './ui/ShadowView';
import { useCardShadow } from './ui/elevation';

/**
 * O carrossel de banners do rodapé da home: fotografia de verdade, passando
 * sozinha a cada poucos segundos. O dedo manda mais que o relógio — arrastar
 * pausa o avanço até o gesto terminar.
 *
 * A foto ocupa a peça inteira e o texto assenta sobre um véu que escurece de
 * baixo para cima. É o véu que garante o contraste do texto sobre QUALQUER
 * foto — sem ele, uma imagem clara come a frase, e é assim que banner com
 * foto costuma falhar.
 *
 * Conteúdo mora AQUI, em código: banner de campanha remota é outra feature,
 * com outra infraestrutura. As fotos são do Unsplash (licença livre) e devem
 * ser trocadas por imagens próprias quando existirem.
 */
type Banner = {
  key: string;
  titulo: string;
  corpo: string;
  foto: number;
  rota: string;
};

const BANNERS: Banner[] = [
  {
    key: 'plano',
    titulo: 'Seu plano, gerado pela IA',
    corpo: 'Musculação e esporte na mesma semana, a partir da sua anamnese.',
    foto: require('../../assets/fotos/banner/academia.jpg'),
    rota: 'Plan',
  },
  {
    key: 'esporte',
    titulo: 'Corra com GPS e batimento',
    corpo: 'Percurso, ritmo e caloria, o mapa fica no seu histórico.',
    foto: require('../../assets/fotos/banner/corrida.jpg'),
    rota: 'Sport',
  },
  {
    key: 'progresso',
    titulo: 'Sua evolução em números',
    corpo: 'Volume, constância e a história de cada treino concluído.',
    foto: require('../../assets/fotos/banner/trilha.jpg'),
    rota: 'Progress',
  },
];

/** Intervalo do avanço automático. */
const PASSO_MS = 5000;
const ALTURA = 176;
const RAIO = 20;

/**
 * Branco sobre o véu, nos DOIS temas: a foto é escura por baixo do texto em
 * qualquer aparência, então a cor do tema não se aplica aqui — é tinta sobre
 * imagem, o mesmo caso do texto sobre o acento.
 */
const TINTA = '#FFFFFF';
const TINTA_FRACA = 'rgba(255,255,255,0.88)';

export function HomeBanners({ aoAbrir }: { aoAbrir: (rota: string) => void }) {
  const { width } = useWindowDimensions();
  const sombra = useCardShadow();
  // Página = largura útil da tela (24 de margem de cada lado da home).
  const larguraPagina = width - 48;

  const rolagem = useRef<ScrollView>(null);
  const paginaRef = useRef(0);
  const arrastando = useRef(false);
  const [pagina, setPagina] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      if (arrastando.current) return;
      const proxima = (paginaRef.current + 1) % BANNERS.length;
      rolagem.current?.scrollTo({ x: proxima * larguraPagina, animated: true });
      paginaRef.current = proxima;
      setPagina(proxima);
    }, PASSO_MS);
    return () => clearInterval(id);
  }, [larguraPagina]);

  const aoTerminarGesto = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const p = Math.max(
      0,
      Math.min(BANNERS.length - 1, Math.round(e.nativeEvent.contentOffset.x / larguraPagina)));
    paginaRef.current = p;
    setPagina(p);
    arrastando.current = false;
  };

  return (
    <YStack gap="$md">
      <ScrollView
        ref={rolagem}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScrollBeginDrag={() => {
          arrastando.current = true;
        }}
        onMomentumScrollEnd={aoTerminarGesto}
      >
        {BANNERS.map((banner) => (
          <Pressable
            key={banner.key}
            onPress={() => aoAbrir(banner.rota)}
            accessibilityRole="button"
            accessibilityLabel={`${banner.titulo}. ${banner.corpo}`}
            style={({ pressed }) => [{ width: larguraPagina }, pressed && { opacity: 0.85 }]}
          >
            <ShadowView shadow={sombra} radius={RAIO} backgroundColor="#000000">
              <YStack height={ALTURA} borderRadius={RAIO} overflow="hidden">
                <Image
                  source={banner.foto}
                  resizeMode="cover"
                  style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                  // A foto é decorativa: quem lê por voz recebe o rótulo do
                  // botão, e repetir a imagem só atrasaria a mesma frase.
                  accessibilityElementsHidden
                  importantForAccessibility="no"
                />
                <Veu largura={larguraPagina} altura={ALTURA} />

                <YStack flex={1} justifyContent="flex-end" padding="$lg" gap={4}>
                  <Text
                    fontSize={20}
                    fontWeight="800"
                    letterSpacing={-0.4}
                    numberOfLines={1}
                    style={{ color: TINTA }}
                  >
                    {banner.titulo}
                  </Text>
                  <XStack alignItems="center" gap="$sm">
                    <Body color="$foreground" flex={1} numberOfLines={2} style={{ color: TINTA_FRACA }}>
                      {banner.corpo}
                    </Body>
                    <Icon name="arrowRight" size={16} color={TINTA} />
                  </XStack>
                </YStack>
              </YStack>
            </ShadowView>
          </Pressable>
        ))}
      </ScrollView>

      {/* Indicador acromático, como o do carrossel de IA. */}
      <XStack justifyContent="center" gap="$sm">
        {BANNERS.map((banner, i) => (
          <YStack
            key={banner.key}
            width={8}
            height={8}
            borderRadius={4}
            backgroundColor={i === pagina ? '$mutedForeground' : '$track'}
          />
        ))}
      </XStack>
    </YStack>
  );
}

/**
 * O véu de legibilidade: transparente no topo, ink da marca no pé. Vai em SVG
 * porque o gradiente nativo custaria um rebuild de dev client — a mesma
 * escolha do halo dos cards.
 */
function Veu({ largura, altura }: { largura: number; altura: number }) {
  return (
    <Svg
      width={largura}
      height={altura}
      style={{ position: 'absolute', top: 0, left: 0 }}
      pointerEvents="none"
    >
      <Defs>
        <LinearGradient id="veu-banner" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#0E0A22" stopOpacity="0" />
          <Stop offset="0.45" stopColor="#0E0A22" stopOpacity="0.35" />
          <Stop offset="1" stopColor="#0E0A22" stopOpacity="0.92" />
        </LinearGradient>
      </Defs>
      <Rect x={0} y={0} width={largura} height={altura} fill="url(#veu-banner)" />
    </Svg>
  );
}
