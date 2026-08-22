import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, LayoutChangeEvent, Pressable, StyleSheet, View } from 'react-native';

import { LogoMark, LogoType } from '../components/Logo';
import { space } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';

const MARK_SIZE = 62;
/** Altura do logotipo. O manual usa a marca e o nome opticamente alinhados. */
const TYPE_HEIGHT = 30;
/** Distância entre a marca e o logotipo no lockup final. */
const GAP = 16;

type Props = { onFinish: () => void };

/**
 * Intro: a marca gira entrando, desliza para a esquerda e revela o nome.
 *
 * A composição é um lockup [marca · assumfit] centralizado. O truque para a
 * marca parecer centralizada ANTES de o nome existir é deslocá-la para a
 * direita por metade da largura do que ainda está escondido, e animar esse
 * deslocamento até zero. Por isso o nome é medido antes de a sequência começar:
 * sem a medida, a marca saltaria ao assentar.
 *
 * Toda a animação usa `useNativeDriver`. Rotação, escala, translação e
 * opacidade são as propriedades que o driver nativo aceita — a sequência foi
 * desenhada em cima delas de propósito, para rodar a 60fps fora da thread de
 * JavaScript justamente quando o app está mais ocupado, que é no boot.
 *
 * Marca e logotipo vêm dos vetores oficiais em `components/Logo.tsx`. O nome é
 * desenhado, não texto: a identidade usa uma sans geométrica que não está
 * instalada no app, e a fonte do sistema produziria outro desenho de letra.
 */
export function IntroScreen({ onFinish }: Props) {
  const { colors } = useTheme();
  const styles = useSheet();
  const spin = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(0)).current;
  const reveal = useRef(new Animated.Value(0)).current;
  const tagline = useRef(new Animated.Value(0)).current;
  const fadeOut = useRef(new Animated.Value(1)).current;

  const [wordWidth, setWordWidth] = useState(0);
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);
  const finished = useRef(false);

  const exit = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    Animated.timing(fadeOut, {
      toValue: 0,
      duration: 400,
      easing: Easing.in(Easing.ease),
      useNativeDriver: true,
    }).start(onFinish);
  }, [fadeOut, onFinish]);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then(setReduceMotion)
      .catch(() => setReduceMotion(false));
  }, []);

  useEffect(() => {
    // Espera a medição do nome: animar antes faria a marca saltar ao assentar.
    if (reduceMotion === null || wordWidth === 0) return;

    // Movimento reduzido não é preferência estética: giro e deslize são gatilho
    // de enxaqueca vestibular, e isto é um app de saúde.
    if (reduceMotion) {
      [spin, slide, reveal, tagline].forEach((v) => v.setValue(1));
      const t = setTimeout(exit, 900);
      return () => clearTimeout(t);
    }

    const sequence = Animated.sequence([
      // 1. A marca entra girando e assenta.
      Animated.timing(spin, {
        toValue: 1,
        duration: 900,
        easing: Easing.bezier(0.22, 1, 0.36, 1),
        useNativeDriver: true,
      }),
      Animated.delay(220),
      // 2. Desliza para a esquerda enquanto o nome é revelado ao lado.
      Animated.parallel([
        Animated.timing(slide, {
          toValue: 1,
          duration: 680,
          easing: Easing.bezier(0.33, 0, 0.15, 1),
          useNativeDriver: true,
        }),
        Animated.timing(reveal, {
          toValue: 1,
          duration: 720,
          delay: 120,
          easing: Easing.bezier(0.33, 0, 0.15, 1),
          useNativeDriver: true,
        }),
      ]),
      // 3. A tagline fecha.
      Animated.timing(tagline, {
        toValue: 1,
        duration: 460,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.delay(700),
    ]);

    /*
     Sai QUANDO A ANIMAÇÃO ACABA — ou quando ela é interrompida. A versão
     anterior só saía em `finished: true`; um diálogo do sistema, uma ligação
     ou uma notificação tocada durante os três segundos da intro deixavam
     `finished: false`, `exit` nunca rodava e a marca ficava parada por cima do
     app, engolindo toques, até alguém descobrir o "pular" invisível (achado na
     rodada de testes de 22/08/2026). O teto de 6 s cobre o que mais possa
     travar a sequência: a intro é abertura, não porta.
    */
    sequence.start(() => exit());
    const teto = setTimeout(exit, 6000);
    return () => {
      sequence.stop();
      clearTimeout(teto);
    };
  }, [reduceMotion, wordWidth, spin, slide, reveal, tagline, exit]);

  // Deslocamento inicial: metade do que ainda está escondido, para a marca
  // nascer opticamente no centro da tela.
  const offset = (wordWidth + GAP) / 2;

  const markStyle = {
    opacity: spin.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0, 1, 1] }),
    transform: [
      { translateX: slide.interpolate({ inputRange: [0, 1], outputRange: [offset, 0] }) },
      { scale: spin.interpolate({ inputRange: [0, 1], outputRange: [0.62, 1] }) },
      { rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['-300deg', '0deg'] }) },
    ],
  };

  return (
    <Animated.View style={[styles.root, { opacity: fadeOut }]}>
      <Pressable style={StyleSheet.absoluteFill} onPress={exit} accessibilityLabel="Pular introdução" />

      <View style={styles.stage} pointerEvents="none">
        <View style={styles.lockup}>
          <Animated.View style={markStyle}>
            {/* `bleed` dá área para a marca girar sem ser cortada nas pontas. */}
            <LogoMark size={MARK_SIZE} color={colors.text} bleed={0.22} />
          </Animated.View>

          <View style={styles.wordClip} onLayout={(e: LayoutChangeEvent) => setWordWidth(e.nativeEvent.layout.width)}>
            {/* O nome desliza para dentro do recorte, vindo da esquerda.
                A versão anterior punha por cima uma cortina da cor do fundo —
                que aparecia como retângulo sempre que a composição não estivesse
                exatamente sobre aquela cor. Mover o próprio logotipo dentro do
                clip não pinta nada, então não há o que vazar. */}
            <Animated.View
              style={{
                transform: [
                  { translateX: reveal.interpolate({ inputRange: [0, 1], outputRange: [-(wordWidth || 1), 0] }) },
                ],
                opacity: reveal.interpolate({ inputRange: [0, 0.12, 1], outputRange: [0, 1, 1] }),
              }}
            >
              <LogoType height={TYPE_HEIGHT} />
            </Animated.View>
          </View>
        </View>

        <Animated.Text style={[styles.tagline, { opacity: tagline }]}>o corpo sabe antes de você</Animated.Text>
      </View>
    </Animated.View>
  );
}

/**
 * A intro fica em estilo bruto do React Native, e não em props do Tamagui.
 *
 * Ela é uma composição ANIMADA: tudo aqui vive dentro de `Animated.View`, que
 * recebe transform e opacity interpolados. Props tipadas não alcançam esses
 * nós — e é a mesma razão de `Surface.tsx` também ter ficado de fora.
 */
function useSheet() {
  const { colors } = useTheme();
  return React.useMemo(
    () =>
      ({
        root: {
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: colors.ink,
          zIndex: 10,
        },
        stage: { flex: 1, alignItems: 'center', justifyContent: 'center' },
        lockup: { flexDirection: 'row', alignItems: 'center', gap: GAP },
        wordClip: { overflow: 'hidden' },
        tagline: {
          marginTop: 32,
          letterSpacing: 2,
          fontSize: 11,
          fontWeight: '500',
          color: colors.textFaint,
        },
      }) as const,
    [colors],
  );
}
