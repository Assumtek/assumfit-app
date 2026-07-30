import { Text } from '@tamagui/core';
import { XStack, YStack } from '@tamagui/stacks';
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';
import React, { useRef, useState } from 'react';
import { Alert, Pressable } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import Svg, { Circle, Polyline as SvgPolyline } from 'react-native-svg';

import type { GeoPoint, Sport } from '../domain/sport';
import { paceMinPerKm, sportClock } from '../domain/sport';
import { CANVAS_HEIGHT, CANVAS_WIDTH, EXPORT_WIDTH, FotoDeFundo } from './ShareCanvas';
import { Button, Data, Label } from './ui';
import { useTheme } from '../theme/ThemeProvider';

/**
 * O story da sessão — o desenho do caminho por cima da foto, como no Strava.
 *
 * O TRAÇADO é a estrela: a polyline do percurso vira desenho puro (sem mapa,
 * sem rua, sem endereço) projetado sobre a foto que a pessoa escolher. É
 * também a versão mais segura de compartilhar: o desenho solto não revela onde
 * a corrida aconteceu. Formato 9:16, exportado em 1080×1920 — o tamanho que o
 * Stories espera.
 */
export function SportShare({
  sport,
  elapsed,
  dist,
  kcal,
  avgHr,
  points,
  onClose,
}: {
  sport: Sport;
  elapsed: number;
  dist: number | null;
  kcal: number;
  avgHr: number | null;
  points: GeoPoint[];
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const canvas = useRef(null);
  const [foto, setFoto] = useState<string | null>(null);
  const [comTracado, setComTracado] = useState(points.length > 1);
  const [ocupado, setOcupado] = useState(false);

  const escolherFoto = async (camera: boolean) => {
    if (camera) {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return;
    }
    const opcoes: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.9 };
    const r = camera
      ? await ImagePicker.launchCameraAsync(opcoes)
      : await ImagePicker.launchImageLibraryAsync(opcoes);
    if (r.assets?.[0]?.uri) setFoto(r.assets[0].uri);
  };

  const compartilhar = async () => {
    setOcupado(true);
    try {
      const uri = await captureRef(canvas, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
        width: EXPORT_WIDTH,
      });
      await Sharing.shareAsync(uri, { mimeType: 'image/png' });
    } catch {
      Alert.alert('Não foi possível gerar a imagem', 'Tente de novo.');
    } finally {
      setOcupado(false);
    }
  };

  const pace = dist ? paceMinPerKm(dist, elapsed) : null;

  return (
    <YStack flex={1} alignItems="center" paddingTop="$md">
      {/* O canvas 9:16 — o que se vê é o que sai. */}
      <YStack
        ref={canvas}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        borderRadius={18}
        overflow="hidden"
        backgroundColor="$backgroundStrong"
        collapsable={false}
      >
        {foto ? <FotoDeFundo uri={foto} ativa={false} /> : null}

        {comTracado && points.length > 1 ? (
          <YStack position="absolute" top={70} left={0} right={0} alignItems="center">
            <Tracado points={points} width={CANVAS_WIDTH * 0.72} height={CANVAS_HEIGHT * 0.44} />
          </YStack>
        ) : null}

        {/* O rodapé de dados — os números medidos, com a marca discreta. */}
        <YStack position="absolute" left={14} right={14} bottom={14} gap={2}>
          <Text fontSize={9} fontWeight="700" letterSpacing={1.4} style={{ color: '#877BF0' }}>
            {sport.label.toUpperCase()}
          </Text>
          <XStack alignItems="baseline" gap={10}>
            <Text fontSize={28} fontWeight="200" style={{ color: '#FFFFFF' }}>
              {sportClock(elapsed)}
            </Text>
            {dist ? (
              <Text fontSize={15} fontWeight="300" style={{ color: '#FFFFFF' }}>
                {(dist / 1000).toFixed(2).replace('.', ',')} km
              </Text>
            ) : null}
          </XStack>
          <XStack gap={10}>
            {pace ? <Data fontSize={10} style={{ color: 'rgba(255,255,255,0.75)' }}>{pace}</Data> : null}
            <Data fontSize={10} style={{ color: 'rgba(255,255,255,0.75)' }}>~{kcal} kcal</Data>
            {avgHr ? (
              <Data fontSize={10} style={{ color: 'rgba(255,255,255,0.75)' }}>{avgHr} bpm</Data>
            ) : null}
          </XStack>
          <Text fontSize={10} fontWeight="700" letterSpacing={-0.4} marginTop={4} style={{ color: '#FFFFFF' }}>
            assum<Text fontSize={10} fontWeight="700" style={{ color: '#877BF0' }}>fit</Text>
          </Text>
        </YStack>
      </YStack>

      {/* Controles fora do canvas: nada disto sai na imagem. */}
      <XStack gap="$sm" marginTop="$lg" flexWrap="wrap" justifyContent="center">
        <Chip rotulo="Foto" onPress={() => void escolherFoto(false)} />
        <Chip rotulo="Câmera" onPress={() => void escolherFoto(true)} />
        {points.length > 1 ? (
          <Chip
            rotulo={comTracado ? 'Tirar traçado' : 'Mostrar traçado'}
            ativo={comTracado}
            onPress={() => setComTracado((v) => !v)}
          />
        ) : null}
      </XStack>

      <YStack width="100%" paddingHorizontal="$xl" gap="$md" marginTop="$lg">
        <Button title={ocupado ? 'Gerando…' : 'Compartilhar'} onPress={() => void compartilhar()} disabled={ocupado} />
        <Button title="Voltar" variant="ghost" onPress={onClose} />
      </YStack>
    </YStack>
  );
}

/**
 * O percurso como DESENHO puro: polyline branca com halo, sem mapa embaixo.
 * A projeção corrige a longitude pelo cosseno da latitude para a forma do
 * trajeto não sair achatada.
 */
function Tracado({ points, width, height }: { points: GeoPoint[]; width: number; height: number }) {
  const lats = points.map((p) => p.lat);
  const lons = points.map((p) => p.lon);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLon = Math.min(...lons), maxLon = Math.max(...lons);
  const fator = Math.cos(((minLat + maxLat) / 2) * (Math.PI / 180));

  const spanLat = Math.max(maxLat - minLat, 1e-5);
  const spanLon = Math.max((maxLon - minLon) * fator, 1e-5);
  const escala = Math.min((width - 16) / spanLon, (height - 16) / spanLat);

  const coords = points.map((p) => {
    const x = ((p.lon - minLon) * fator * escala) + (width - spanLon * escala) / 2;
    const y = height - (((p.lat - minLat) * escala) + (height - spanLat * escala) / 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const [x0, y0] = coords[0].split(',').map(Number);
  const [xf, yf] = coords[coords.length - 1].split(',').map(Number);

  return (
    <Svg width={width} height={height}>
      {/* Halo escuro por baixo: o traçado precisa ler sobre QUALQUER foto. */}
      <SvgPolyline points={coords.join(' ')} fill="none" stroke="rgba(0,0,0,0.45)" strokeWidth={7} strokeLinejoin="round" strokeLinecap="round" />
      <SvgPolyline points={coords.join(' ')} fill="none" stroke="#FFFFFF" strokeWidth={3.5} strokeLinejoin="round" strokeLinecap="round" />
      <Circle cx={x0} cy={y0} r={5} fill="#877BF0" stroke="#FFFFFF" strokeWidth={1.5} />
      <Circle cx={xf} cy={yf} r={5} fill="#FFFFFF" />
    </Svg>
  );
}

function Chip({ rotulo, onPress, ativo }: { rotulo: string; onPress: () => void; ativo?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => pressed && { opacity: 0.6 }}>
      <YStack
        paddingHorizontal={14}
        paddingVertical={7}
        borderRadius={999}
        borderWidth={1}
        borderColor={ativo ? '$primary' : '$borderStrong'}
        backgroundColor={ativo ? '$primarySoft' : 'transparent'}
      >
        <Label fontSize={11}>{rotulo}</Label>
      </YStack>
    </Pressable>
  );
}
