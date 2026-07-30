import { YStack } from '@tamagui/stacks';
import React, { useRef } from 'react';
import { Animated } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

/**
 * O canvas editável do card de compartilhar — a peça central do desenho do
 * MUVX, portada sem o Reanimated.
 *
 * Lá, cada bloco é um `EditableBlock` com worklets do Reanimated. Aqui os
 * mesmos gestos — arrastar, beliscar para escalar, girar com dois dedos —
 * rodam nos callbacks do gesture-handler no thread JS, movendo `Animated.Value`
 * do próprio React Native. Para meia dúzia de blocos num canvas de 270 pontos,
 * a diferença não existe aos olhos; a dependência nativa a menos existe no
 * build. É a mesma troca que a sidebar já fez.
 *
 * ## As medidas são as do MUVX
 *
 * Canvas 270×480 (9:16 — o formato de story) e exportação em 1080×1920. O
 * fator é exatamente 4: o `captureRef` recebe a largura final e o iOS upscala
 * o snapshot, então o que se vê é o que sai.
 */

export const CANVAS_WIDTH = 270;
export const CANVAS_HEIGHT = 480;
export const EXPORT_WIDTH = 1080;
export const EXPORT_HEIGHT = 1920;

/**
 * Um bloco que a pessoa move, escala e gira.
 *
 * A base acumulada vive em REFS e o valor animado é `base + delta do gesto` —
 * é o que faz o segundo arrasto partir de onde o primeiro parou, em vez de
 * voltar ao ponto inicial. `flattenOffset` faria o mesmo com mais cerimônia.
 */
export function BlocoEditavel({
  x,
  y,
  visivel,
  selecionado,
  onSelecionar,
  children,
}: {
  x: number;
  y: number;
  visivel: boolean;
  selecionado: boolean;
  onSelecionar: () => void;
  children: React.ReactNode;
}) {
  const baseX = useRef(x);
  const baseY = useRef(y);
  const baseEscala = useRef(1);
  const baseGiro = useRef(0);

  const tx = useRef(new Animated.Value(x)).current;
  const ty = useRef(new Animated.Value(y)).current;
  const escala = useRef(new Animated.Value(1)).current;
  const giro = useRef(new Animated.Value(0)).current;

  const arrastar = Gesture.Pan()
    .onBegin(() => onSelecionar())
    .onUpdate((e) => {
      tx.setValue(baseX.current + e.translationX);
      ty.setValue(baseY.current + e.translationY);
    })
    .onEnd((e) => {
      baseX.current += e.translationX;
      baseY.current += e.translationY;
    });

  const beliscar = Gesture.Pinch()
    .onUpdate((e) => {
      // Piso de 0,4 e teto de 3: abaixo disso o bloco some sem querer, acima
      // ele cobre o canvas inteiro e não há como pegá-lo de volta.
      escala.setValue(Math.min(3, Math.max(0.4, baseEscala.current * e.scale)));
    })
    .onEnd((e) => {
      baseEscala.current = Math.min(3, Math.max(0.4, baseEscala.current * e.scale));
    });

  const girar = Gesture.Rotation()
    .onUpdate((e) => giro.setValue(baseGiro.current + e.rotation))
    .onEnd((e) => {
      baseGiro.current += e.rotation;
    });

  const gesto = Gesture.Simultaneous(arrastar, beliscar, girar);

  if (!visivel) return null;

  return (
    <GestureDetector gesture={gesto}>
      <Animated.View
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          transform: [
            { translateX: tx },
            { translateY: ty },
            { scale: escala },
            {
              rotate: giro.interpolate({
                inputRange: [-Math.PI, Math.PI],
                outputRange: ['-3.14159rad', '3.14159rad'],
              }),
            },
          ],
        }}
      >
        {/*
          A borda de seleção fica FORA da captura: quem gera o PNG esconde a
          seleção antes (via `onSelecionar(null)` no pai). Aqui ela só orienta o
          dedo — sem ela, não dá para saber qual bloco vai responder ao gesto.
        */}
        <YStack
          borderWidth={selecionado ? 1 : 0}
          borderColor="$primary"
          borderRadius={6}
          padding={2}
        >
          {children}
        </YStack>
      </Animated.View>
    </GestureDetector>
  );
}

/**
 * Foto de fundo com arrastar e zoom, recortada pelo canvas.
 *
 * Os gestos dela só valem quando NENHUM bloco está selecionado — senão todo
 * ajuste fino de bloco arrasta a foto junto, que é o defeito clássico de canvas
 * com camadas.
 */
export function FotoDeFundo({ uri, ativa }: { uri: string; ativa: boolean }) {
  const baseX = useRef(0);
  const baseY = useRef(0);
  const baseZoom = useRef(1);

  const tx = useRef(new Animated.Value(0)).current;
  const ty = useRef(new Animated.Value(0)).current;
  const zoom = useRef(new Animated.Value(1)).current;

  const arrastar = Gesture.Pan()
    .enabled(ativa)
    .onUpdate((e) => {
      tx.setValue(baseX.current + e.translationX);
      ty.setValue(baseY.current + e.translationY);
    })
    .onEnd((e) => {
      baseX.current += e.translationX;
      baseY.current += e.translationY;
    });

  const beliscar = Gesture.Pinch()
    .enabled(ativa)
    .onUpdate((e) => zoom.setValue(Math.min(4, Math.max(1, baseZoom.current * e.scale))))
    .onEnd((e) => {
      baseZoom.current = Math.min(4, Math.max(1, baseZoom.current * e.scale));
    });

  return (
    <GestureDetector gesture={Gesture.Simultaneous(arrastar, beliscar)}>
      <Animated.Image
        source={{ uri }}
        resizeMode="cover"
        style={{
          position: 'absolute',
          width: CANVAS_WIDTH,
          height: CANVAS_HEIGHT,
          transform: [{ translateX: tx }, { translateY: ty }, { scale: zoom }],
        }}
      />
    </GestureDetector>
  );
}
