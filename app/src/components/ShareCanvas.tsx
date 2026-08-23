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
  onGuia,
  children,
}: {
  x: number;
  y: number;
  visivel: boolean;
  selecionado: boolean;
  onSelecionar: () => void;
  /** Guias de centro acesas enquanto o bloco está encaixado (vertical, horizontal). */
  onGuia?: (g: { v: boolean; h: boolean }) => void;
  children: React.ReactNode;
}) {
  const tamanho = useRef({ w: 0, h: 0 });
  const baseX = useRef(x);
  const baseY = useRef(y);
  const baseEscala = useRef(1);
  const baseGiro = useRef(0);

  const tx = useRef(new Animated.Value(x)).current;
  const ty = useRef(new Animated.Value(y)).current;
  const escala = useRef(new Animated.Value(1)).current;
  const giro = useRef(new Animated.Value(0)).current;

  /*
   `.runOnJS(true)` em TODOS os gestos deste arquivo, e não é opcional.

   O Reanimated está no binário — chega por dependência, não por escolha nossa
   — e, quando está, o gesture-handler entrega os callbacks ao runtime de
   worklets. Estes callbacks são closures comuns (mexem em estado do React):
   rodando lá, lançam, e em release o app fecha no primeiro toque num bloco.
   Foi o crash do "compartilhar minha saúde" e o do "incluir foto" (ago/2026),
   confirmado no dSYM: touchesBegan → sendEventForReanimated → WorkletRuntime.
  */
  /*
   Encaixe no centro, como o story do Instagram (pedido de testador, 22/08):
   perto do meio do canvas, o bloco gruda e a guia acende; o ângulo gruda em
   0° e 90°. O limiar é em pontos do canvas, não da tela.
  */
  const IMA = 10;
  const encaixe = (px: number, py: number) => {
    const { w, h } = tamanho.current;
    const cx = px + w / 2;
    const cy = py + h / 2;
    const v = w > 0 && Math.abs(cx - CANVAS_WIDTH / 2) < IMA;
    const hh = h > 0 && Math.abs(cy - CANVAS_HEIGHT / 2) < IMA;
    return { x: v ? CANVAS_WIDTH / 2 - w / 2 : px, y: hh ? CANVAS_HEIGHT / 2 - h / 2 : py, v, h: hh };
  };
  const arrastar = Gesture.Pan()
    .runOnJS(true)
    .onBegin(() => onSelecionar())
    .onUpdate((e) => {
      const p = encaixe(baseX.current + e.translationX, baseY.current + e.translationY);
      tx.setValue(p.x);
      ty.setValue(p.y);
      onGuia?.({ v: p.v, h: p.h });
    })
    .onEnd((e) => {
      const p = encaixe(baseX.current + e.translationX, baseY.current + e.translationY);
      baseX.current = p.x;
      baseY.current = p.y;
      onGuia?.({ v: false, h: false });
    });

  const beliscar = Gesture.Pinch()
    .runOnJS(true)
    .onUpdate((e) => {
      // Piso de 0,4 e teto de 3: abaixo disso o bloco some sem querer, acima
      // ele cobre o canvas inteiro e não há como pegá-lo de volta.
      escala.setValue(Math.min(3, Math.max(0.4, baseEscala.current * e.scale)));
    })
    .onEnd((e) => {
      baseEscala.current = Math.min(3, Math.max(0.4, baseEscala.current * e.scale));
    });

  const anguloEncaixado = (a: number) => {
    const passo = Math.PI / 2;
    const perto = Math.round(a / passo) * passo;
    return Math.abs(a - perto) < 0.08 ? perto : a;
  };
  const girar = Gesture.Rotation()
    .runOnJS(true)
    .onUpdate((e) => giro.setValue(anguloEncaixado(baseGiro.current + e.rotation)))
    .onEnd((e) => {
      baseGiro.current = anguloEncaixado(baseGiro.current + e.rotation);
    });

  const gesto = Gesture.Simultaneous(arrastar, beliscar, girar);

  if (!visivel) return null;

  return (
    <GestureDetector gesture={gesto}>
      <Animated.View
        onLayout={(e) => {
          tamanho.current = { w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height };
        }}
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
          borderRadius={8}
          padding={4}
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
    .runOnJS(true)
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
    .runOnJS(true)
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

/** As duas linhas de centro do canvas, acesas só enquanto um bloco está encaixado. */
export function GuiasDeCentro({ v, h }: { v: boolean; h: boolean }) {
  if (!v && !h) return null;
  return (
    <>
      {v ? <YStack position="absolute" left={CANVAS_WIDTH / 2 - 0.5} top={0} width={1} height={CANVAS_HEIGHT} backgroundColor="$primary" opacity={0.8} pointerEvents="none" /> : null}
      {h ? <YStack position="absolute" top={CANVAS_HEIGHT / 2 - 0.5} left={0} height={1} width={CANVAS_WIDTH} backgroundColor="$primary" opacity={0.8} pointerEvents="none" /> : null}
    </>
  );
}
