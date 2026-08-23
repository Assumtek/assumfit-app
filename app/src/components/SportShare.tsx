import { XStack, YStack } from '@tamagui/stacks';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import React, { useRef, useState } from 'react';
import { Alert, Pressable, ScrollView } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import Svg, { Circle, Polyline as SvgPolyline } from 'react-native-svg';

import type { GeoPoint, Sport } from '../domain/sport';
import { paceMinPerKm, sportClock } from '../domain/sport';
import { Icon } from './Icon';
import { LogoType } from './Logo';
import { BlocoEditavel, CANVAS_HEIGHT, CANVAS_WIDTH, EXPORT_WIDTH, FotoDeFundo, GuiasDeCentro } from './ShareCanvas';
import { Button, Data, Heading, Label, Micro, Subtitle } from './ui';

/**
 * O story da sessão — o MESMO canvas editável do fim de treino da Musculação:
 * blocos que arrastam, beliscam e giram, chips que ligam e desligam, foto de
 * fundo opcional. A diferença é a estrela: o TRAÇADO do percurso, desenho puro
 * sem mapa, sem rua e sem endereço — o papel do Strava, na versão que não
 * revela onde a corrida aconteceu.
 *
 * **Nada sai do aparelho sozinho.** A imagem nasce local e só vai a algum
 * lugar no toque de compartilhar ou salvar. Batimento e caloria começam
 * DESLIGADOS: publicar dado de saúde é decisão, não padrão.
 */

type BlocoId =
  | 'selo'
  | 'modalidade'
  | 'tracado'
  | 'tempo'
  | 'distancia'
  | 'ritmo'
  | 'kcal'
  | 'bpm'
  | 'data'
  | 'marca';

export function SportShare({
  sport,
  elapsed,
  dist,
  kcalFaixa,
  avgHr,
  points,
  onClose,
}: {
  sport: Sport;
  elapsed: number;
  dist: number | null;
  /** A faixa honesta ("294–417"), já formatada pelo domínio. */
  kcalFaixa: string;
  avgHr: number | null;
  points: GeoPoint[];
  onClose: () => void;
}) {
  // `captureRef` aceita qualquer host view; o tipo de instância do YStack não é
  // exportado, e tipar aqui não previne erro nenhum.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const canvas = useRef<any>(null);
  const [foto, setFoto] = useState<string | null>(null);
  const [visiveis, setVisiveis] = useState<Set<BlocoId>>(
    () =>
      new Set<BlocoId>([
        'selo',
        'modalidade',
        'tracado',
        'tempo',
        'distancia',
        'ritmo',
        'data',
        'marca',
      ]));
  const [selecionado, setSelecionado] = useState<BlocoId | null>(null);
  const [guia, setGuia] = useState({ v: false, h: false });
  const [ocupado, setOcupado] = useState(false);

  const pace = dist ? paceMinPerKm(dist, elapsed) : null;
  const temTracado = points.length > 1;

  // Só chip de bloco que EXISTE nesta sessão: sem GPS não há traçado a ligar.
  const chips: { id: BlocoId; rotulo: string }[] = [
    { id: 'selo', rotulo: 'Selo' },
    { id: 'modalidade', rotulo: 'Modalidade' }, ...(temTracado ? [{ id: 'tracado' as const, rotulo: 'Traçado' }] : []),
    { id: 'tempo', rotulo: 'Tempo' }, ...(dist ? [{ id: 'distancia' as const, rotulo: 'Km' }] : []), ...(pace ? [{ id: 'ritmo' as const, rotulo: 'Ritmo' }] : []),
    { id: 'kcal', rotulo: 'Kcal' }, ...(avgHr ? [{ id: 'bpm' as const, rotulo: 'Bpm' }] : []),
    { id: 'data', rotulo: 'Data' },
    { id: 'marca', rotulo: 'AssumFit' },
  ];

  const alternar = (id: BlocoId) =>
    setVisiveis((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(id)) proximo.delete(id);
      else proximo.add(id);
      return proximo;
    });

  const escolherFoto = async (origem: 'camera' | 'galeria') => {
    const permissao =
      origem === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissao.granted) {
      Alert.alert('Permissão necessária', 'Autorize nas Configurações do sistema.');
      return;
    }
    // Sem recorte forçado: a foto entra INTEIRA e o enquadramento é feito no
    // canvas, com arrastar e zoom.
    const opcoes: ImagePicker.ImagePickerOptions = { quality: 0.9 };
    try {
      const r =
        origem === 'camera'
          ? await ImagePicker.launchCameraAsync(opcoes)
          : await ImagePicker.launchImageLibraryAsync({ ...opcoes, mediaTypes: ['images'] });
      if (!r.canceled && r.assets[0]) setFoto(r.assets[0].uri);
    } catch {
      Alert.alert(
        origem === 'camera' ? 'Não foi possível abrir a câmera' : 'Não foi possível abrir a galeria',
        'Tente de novo.');
    }
  };

  /**
   * A seleção é limpa ANTES da captura, e o snapshot espera um quadro — sem
   * isso a borda roxa de seleção sai impressa no story.
   */
  const gerar = async (): Promise<string | null> => {
    setSelecionado(null);
    await new Promise((r) => setTimeout(r, 50));
    try {
      return await captureRef(canvas, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
        width: EXPORT_WIDTH,
      });
    } catch {
      Alert.alert('Não foi possível gerar a imagem', 'Tente de novo.');
      return null;
    }
  };

  const compartilhar = async () => {
    setOcupado(true);
    try {
      const uri = await gerar();
      if (!uri) return;
      if (!(await Sharing.isAvailableAsync())) return;
      await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png' });
    } catch {
      Alert.alert('Não foi possível compartilhar', 'Tente de novo.');
    } finally {
      setOcupado(false);
    }
  };

  const salvar = async () => {
    setOcupado(true);
    try {
      const permissao = await MediaLibrary.requestPermissionsAsync(true);
      if (!permissao.granted) {
        Alert.alert('Permissão necessária', 'Autorize o acesso às fotos para salvar.');
        return;
      }
      const uri = await gerar();
      if (!uri) return;
      // API de classes do expo-media-library 57 — `saveToLibraryAsync` da
      // raiz virou ERRO em agosto/2026, e era o "crash" do salvar.
      await MediaLibrary.Asset.create(uri);
      Alert.alert('Salvo', 'O story está na sua galeria.');
    } catch {
      Alert.alert('Não foi possível salvar', 'Tente de novo.');
    } finally {
      setOcupado(false);
    }
  };

  const dataDeHoje = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' });
  const ver = (id: BlocoId) => visiveis.has(id);
  const escolher = (id: BlocoId) => () => setSelecionado(id);

  return (
    <YStack>
      <Data marginBottom="$md">
        Arraste os blocos para reposicionar. Dois dedos redimensionam ou giram. Toque fora para
        tirar a seleção.
      </Data>

      {/* Os chips ligam e desligam blocos — publicar batimento é decisão, não padrão. */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
        <XStack gap="$sm">
          {chips.map((chip) => (
            <Pressable
              key={chip.id}
              onPress={() => alternar(chip.id)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: ver(chip.id) }}
              style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
            >
              <XStack
                alignItems="center"
                gap="$xs"
                paddingVertical="$sm"
                paddingHorizontal="$md"
                borderRadius={999}
                borderWidth={1}
                borderColor={ver(chip.id) ? '$primary' : '$borderStrong'}
                backgroundColor={ver(chip.id) ? '$primarySoft' : 'transparent'}
              >
                <Icon name={ver(chip.id) ? 'check' : 'down'} size={12} />
                <Data color="$foreground">
                  {chip.rotulo}
                </Data>
              </XStack>
            </Pressable>
          ))}
        </XStack>
      </ScrollView>

      {/* O CANVAS. Tudo dentro deste YStack vira o story de 1080×1920. */}
      <YStack alignItems="center">
        <Pressable onPress={() => setSelecionado(null)}>
          <YStack
            ref={canvas}
            collapsable={false}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            borderRadius={16}
            overflow="hidden"
            backgroundColor="#0E0A22"
          >
            {foto ? <FotoDeFundo uri={foto} ativa={selecionado === null} /> : null}
            <GuiasDeCentro v={guia.v} h={guia.h} />
            {foto ? (
              <YStack
                position="absolute"
                top={0}
                left={0}
                right={0}
                bottom={0}
                backgroundColor="rgba(14,10,34,0.45)"
                pointerEvents="none"
              />
            ) : null}

            <BlocoEditavel
              onGuia={setGuia}
              x={18}
              y={64}
              visivel={ver('selo')}
              selecionado={selecionado === 'selo'}
              onSelecionar={escolher('selo')}
            >
              <XStack
                paddingVertical={4}
                paddingHorizontal={12}
                borderRadius={999}
                backgroundColor="rgba(135,123,240,0.28)"
                borderWidth={1}
                borderColor="rgba(135,123,240,0.55)"
              >
                <Micro fontWeight="800" letterSpacing={1.2} color="#ECE7F4">
                  SESSÃO CONCLUÍDA
                </Micro>
              </XStack>
            </BlocoEditavel>

            <BlocoEditavel
              onGuia={setGuia}
              x={18}
              y={96}
              visivel={ver('modalidade')}
              selecionado={selecionado === 'modalidade'}
              onSelecionar={escolher('modalidade')}
            >
              <Heading
                fontWeight="800"
                color="#ECE7F4"
                letterSpacing={-0.6}
                maxWidth={CANVAS_WIDTH - 48}
              >
                {sport.label}
              </Heading>
            </BlocoEditavel>

            {temTracado ? (
              <BlocoEditavel
                onGuia={setGuia}
                x={38}
                y={128}
                visivel={ver('tracado')}
                selecionado={selecionado === 'tracado'}
                onSelecionar={escolher('tracado')}
              >
                <Tracado points={points} width={CANVAS_WIDTH * 0.72} height={CANVAS_HEIGHT * 0.39} />
              </BlocoEditavel>
            ) : null}

            <BlocoEditavel
              onGuia={setGuia}
              x={18}
              y={330}
              visivel={ver('tempo')}
              selecionado={selecionado === 'tempo'}
              onSelecionar={escolher('tempo')}
            >
              <Metrica valor={sportClock(elapsed)} rotulo="tempo" />
            </BlocoEditavel>

            {dist ? (
              <BlocoEditavel
                onGuia={setGuia}
                x={103}
                y={330}
                visivel={ver('distancia')}
                selecionado={selecionado === 'distancia'}
                onSelecionar={escolher('distancia')}
              >
                <Metrica valor={`${(dist / 1000).toFixed(2).replace('.', ',')} km`} rotulo="distância" />
              </BlocoEditavel>
            ) : null}

            {pace ? (
              <BlocoEditavel
                onGuia={setGuia}
                x={188}
                y={330}
                visivel={ver('ritmo')}
                selecionado={selecionado === 'ritmo'}
                onSelecionar={escolher('ritmo')}
              >
                <Metrica valor={pace} rotulo="ritmo" />
              </BlocoEditavel>
            ) : null}

            <BlocoEditavel
              onGuia={setGuia}
              x={18}
              y={372}
              visivel={ver('kcal')}
              selecionado={selecionado === 'kcal'}
              onSelecionar={escolher('kcal')}
            >
              <Metrica valor={`${kcalFaixa} kcal`} rotulo="estimadas" />
            </BlocoEditavel>

            {avgHr ? (
              <BlocoEditavel
                onGuia={setGuia}
                x={128}
                y={372}
                visivel={ver('bpm')}
                selecionado={selecionado === 'bpm'}
                onSelecionar={escolher('bpm')}
              >
                <Metrica valor={`${avgHr} bpm`} rotulo="médio" />
              </BlocoEditavel>
            ) : null}

            <BlocoEditavel
              onGuia={setGuia}
              x={18}
              y={410}
              visivel={ver('data')}
              selecionado={selecionado === 'data'}
              onSelecionar={escolher('data')}
            >
              <Data color="rgba(236,231,244,0.75)">
                {dataDeHoje}
              </Data>
            </BlocoEditavel>

            <BlocoEditavel
              onGuia={setGuia}
              x={18}
              y={436}
              visivel={ver('marca')}
              selecionado={selecionado === 'marca'}
              onSelecionar={escolher('marca')}
            >
              <LogoType height={16} color="#ECE7F4" />
            </BlocoEditavel>
          </YStack>
        </Pressable>
      </YStack>

      <Label marginTop="$xl" marginBottom="$md">
        imagem de fundo
      </Label>
      <XStack gap="$sm">
        <YStack flex={1}>
          <Button
            title="Tirar foto"
            variant="secondary"
            size="md"
            onPress={() => void escolherFoto('camera')}
          />
        </YStack>
        <YStack flex={1}>
          <Button
            title="Galeria"
            variant="secondary"
            size="md"
            onPress={() => void escolherFoto('galeria')}
          />
        </YStack>
        {foto ? (
          <YStack flex={1}>
            <Button title="Remover" variant="ghost" size="md" onPress={() => setFoto(null)} />
          </YStack>
        ) : null}
      </XStack>

      <YStack gap="$sm" marginTop="$xl">
        <Button title="Compartilhar" loading={ocupado} onPress={() => void compartilhar()} />
        <Button title="Salvar na galeria" variant="secondary" onPress={() => void salvar()} />
        <Button title="Agora não" variant="ghost" onPress={onClose} />
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
      <SvgPolyline points={coords.join(' ')} fill="none" stroke="rgba(0,0,0,0.45)" strokeWidth={8} strokeLinejoin="round" strokeLinecap="round" />
      <SvgPolyline points={coords.join(' ')} fill="none" stroke="#FFFFFF" strokeWidth={3.5} strokeLinejoin="round" strokeLinecap="round" />
      <Circle cx={x0} cy={y0} r={5} fill="#877BF0" stroke="#FFFFFF" strokeWidth={4} />
      <Circle cx={xf} cy={yf} r={5} fill="#FFFFFF" />
    </Svg>
  );
}

/** Um número do story. Branco fixo: o canvas é escuro nos dois temas. */
function Metrica({ valor, rotulo }: { valor: string; rotulo: string }) {
  return (
    <YStack>
      <Subtitle fontWeight="300" color="#ECE7F4" fontVariant={['tabular-nums']}>
        {valor}
      </Subtitle>
      <Micro letterSpacing={1} color="rgba(236,231,244,0.7)" textTransform="uppercase">
        {rotulo}
      </Micro>
    </YStack>
  );
}
