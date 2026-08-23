import { useNavigation, useRoute } from '@react-navigation/native';
import { LinearGradient } from '@tamagui/linear-gradient';
import { XStack, YStack } from '@tamagui/stacks';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import React, { useRef, useState } from 'react';
import { Alert, Pressable, ScrollView } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { DetailScreen } from '../../components/DetailScreen';
import { Icon } from '../../components/Icon';
import { LogoType } from '../../components/Logo';
import { BlocoEditavel, CANVAS_HEIGHT, CANVAS_WIDTH, EXPORT_WIDTH, FotoDeFundo, GuiasDeCentro } from '../../components/ShareCanvas';
import { Button, Data, Heading, Label, Micro, Subtitle } from '../../components/ui';
import { formatDuration } from '../../domain/workout';

/**
 * Compartilhar o treino — canvas de story, como o `ShareAchievementsScreen`.
 *
 * O card é um CANVAS 9:16 (270×480 na tela, exportado em 1080×1920 — as
 * medidas do MUVX): cada bloco arrasta, belisca para redimensionar, gira com
 * dois dedos e liga/desliga nos chips. A instrução de lá vale aqui: "Arraste,
 * redimensione e oculte os blocos. Depois é só compartilhar onde quiser."
 *
 * **Nada sai do aparelho sozinho.** A imagem nasce local e só vai a algum
 * lugar no toque de compartilhar ou salvar. A foto de fundo idem.
 */

type Params = {
  workoutName?: string;
  durationSec?: number | null;
  exercises?: number | null;
  volumeKg?: number | null;
  /**
   * Uso GENÉRICO do canvas: qualquer tela manda um título e até três métricas
   * prontas ("82", "score de sono") e ganha o mesmo story — foi o pedido de
   * "compartilhar de forma instagramável" (ago/2026), que o treino e o esporte
   * já tinham e a saúde não.
   */
  titulo?: string;
  metricas?: { valor: string; rotulo: string }[];
  /**
   * O selo no topo do cartão. Era "TREINO CONCLUÍDO" fixo, e a atividade do
   * dia, a saúde e o progresso saíam com ele (testador, 22/08). Cada origem
   * manda o seu; sem selo, o uso genérico cai em "ASSUMFIT" e só o treino de
   * verdade diz "concluído".
   */
  selo?: string;
};

type BlocoId = 'selo' | 'nome' | 'duracao' | 'exercicios' | 'volume' | 'data' | 'marca';

const CHIPS: { id: BlocoId; rotulo: string }[] = [
  { id: 'selo', rotulo: 'Selo' },
  { id: 'nome', rotulo: 'Título' },
  { id: 'duracao', rotulo: 'Duração' },
  { id: 'exercicios', rotulo: 'Exerc.' },
  { id: 'volume', rotulo: 'Carga' },
  { id: 'data', rotulo: 'Data' },
  { id: 'marca', rotulo: 'AssumFit' },
];

/** Com métricas genéricas, os chips de Duração/Exerc./Carga passam a ter o rótulo de cada métrica. */
function chipGenerico(
  chip: { id: BlocoId; rotulo: string },
  metricas?: { valor: string; rotulo: string }[]): { id: BlocoId; rotulo: string } {
  if (!metricas) return chip;
  const i = (['duracao', 'exercicios', 'volume'] as BlocoId[]).indexOf(chip.id);
  if (i < 0) return chip;
  const m = metricas[i];
  return m ? { id: chip.id, rotulo: m.rotulo.charAt(0).toUpperCase() + m.rotulo.slice(1) } : chip;
}

/**
 * A foto entra REDIMENSIONADA — nunca a original.
 *
 * Uma foto de câmera tem 12 MP e mais; desenhada no canvas e depois capturada
 * em 1080×1920, ela estourava a memória e o app fechava "depois de alguns
 * segundos" (relato de testador, ago/2026). O story sai em 1080 de largura —
 * nada acima disso serve para nada. Falhou o preparo, vale a original: pior
 * do que o risco de memória é não ter foto nenhuma.
 */
async function fotoLeve(asset: { uri: string; width?: number }): Promise<string> {
  try {
    if ((asset.width ?? 0) <= 1080) return asset.uri;
    const renderizada = await ImageManipulator.manipulate(asset.uri).resize({ width: 1080 }).renderAsync();
    const pronta = await renderizada.saveAsync({ compress: 0.85, format: SaveFormat.JPEG });
    return pronta.uri;
  } catch {
    return asset.uri;
  }
}

export function WorkoutShareScreen() {
  const navigation = useNavigation();
  const params = (useRoute().params ?? {}) as Params;

  // `captureRef` aceita qualquer host view; o tipo de instância do YStack não é
  // exportado, e tipar aqui não previne erro nenhum.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const canvas = useRef<any>(null);
  const [foto, setFoto] = useState<string | null>(null);
  const [visiveis, setVisiveis] = useState<Set<BlocoId>>(
    () => new Set<BlocoId>(['selo', 'nome', 'duracao', 'exercicios', 'data', 'marca']));
  const [selecionado, setSelecionado] = useState<BlocoId | null>(null);
  const [guia, setGuia] = useState({ v: false, h: false });
  const [ocupado, setOcupado] = useState(false);

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
    // canvas, com arrastar e zoom — igual ao MUVX. Recortar antes jogaria fora
    // as bordas que a pessoa ia usar ao reposicionar.
    const opcoes: ImagePicker.ImagePickerOptions = { quality: 0.9 };
    try {
      const r =
        origem === 'camera'
          ? await ImagePicker.launchCameraAsync(opcoes)
          : await ImagePicker.launchImageLibraryAsync({ ...opcoes, mediaTypes: ['images'] });
      if (!r.canceled && r.assets[0]) setFoto(await fotoLeve(r.assets[0]));
    } catch {
      Alert.alert(
        origem === 'camera' ? 'Não foi possível abrir a câmera' : 'Não foi possível abrir a galeria',
        'Tente de novo.');
    }
  };

  /**
   * Gera o PNG na resolução de exportação (1080 de largura — o iOS upscala o
   * snapshot do canvas de 270, fator 4 exato).
   *
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
    <DetailScreen title="Compartilhar">
      <Data marginBottom="$md">
        Arraste os blocos para reposicionar. Dois dedos redimensionam ou giram. Toque fora para
        tirar a seleção.
      </Data>

      {/* Os chips ligam e desligam blocos — publicar a carga é decisão, não padrão. */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
        <XStack gap="$sm">
          {CHIPS.map((chip) => chipGenerico(chip, params.metricas)).map((chip) => (
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
              /*
               O véu sobre a foto tem DOIS pesos: uniforme, para o título no
               alto, e mais denso embaixo, onde ficam os números. Com 0,45
               uniforme, foto de fundo claro deixava o texto branco ilegível
               (relato de testador, ago/2026). Gradiente vem do pacote que o
               HeroCard já usa — nada nativo novo.
              */
              <YStack position="absolute" top={0} left={0} right={0} bottom={0} pointerEvents="none">
                <YStack position="absolute" top={0} left={0} right={0} bottom={0} backgroundColor="rgba(14,10,34,0.5)" />
                <LinearGradient
                  colors={['rgba(14,10,34,0)', 'rgba(14,10,34,0.55)']}
                  locations={[0.45, 1]}
                  start={[0, 0]}
                  end={[0, 1]}
                  style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                />
              </YStack>
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
                  {params.selo ?? (params.titulo ? 'ASSUMFIT' : 'TREINO CONCLUÍDO')}
                </Micro>
              </XStack>
            </BlocoEditavel>

            <BlocoEditavel
              onGuia={setGuia}
              x={18}
              y={96}
              visivel={ver('nome')}
              selecionado={selecionado === 'nome'}
              onSelecionar={escolher('nome')}
            >
              <Heading
                fontWeight="800"
                color="#ECE7F4"
                letterSpacing={-0.6}
                maxWidth={CANVAS_WIDTH - 48}
              >
                {params.titulo ?? params.workoutName ?? 'Treino concluído'}
              </Heading>
            </BlocoEditavel>

            {(params.metricas ?? []).slice(0, 3).map((m, i) => (
              <BlocoEditavel
                onGuia={setGuia}
                key={m.rotulo}
                x={[18, 110, 190][i]}
                y={330}
                visivel={ver((['duracao', 'exercicios', 'volume'] as BlocoId[])[i])}
                selecionado={selecionado === (['duracao', 'exercicios', 'volume'] as BlocoId[])[i]}
                onSelecionar={escolher((['duracao', 'exercicios', 'volume'] as BlocoId[])[i])}
              >
                <Metrica valor={m.valor} rotulo={m.rotulo} />
              </BlocoEditavel>
            ))}

            {params.durationSec && !params.metricas ? (
              <BlocoEditavel
                onGuia={setGuia}
                x={18}
                y={330}
                visivel={ver('duracao')}
                selecionado={selecionado === 'duracao'}
                onSelecionar={escolher('duracao')}
              >
                <Metrica valor={formatDuration(params.durationSec)} rotulo="duração" />
              </BlocoEditavel>
            ) : null}

            {params.exercises && !params.metricas ? (
              <BlocoEditavel
                onGuia={setGuia}
                x={110}
                y={330}
                visivel={ver('exercicios')}
                selecionado={selecionado === 'exercicios'}
                onSelecionar={escolher('exercicios')}
              >
                <Metrica valor={String(params.exercises)} rotulo="exercícios" />
              </BlocoEditavel>
            ) : null}

            {params.volumeKg && !params.metricas ? (
              <BlocoEditavel
                onGuia={setGuia}
                x={190}
                y={330}
                visivel={ver('volume')}
                selecionado={selecionado === 'volume'}
                onSelecionar={escolher('volume')}
              >
                <Metrica valor={`${Math.round(params.volumeKg)} kg`} rotulo="carga" />
              </BlocoEditavel>
            ) : null}

            <BlocoEditavel
              onGuia={setGuia}
              x={18}
              y={402}
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
              y={430}
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
        <Button title="Agora não" variant="ghost" onPress={() => navigation.goBack()} />
      </YStack>
    </DetailScreen>
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
