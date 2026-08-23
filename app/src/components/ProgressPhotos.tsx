import { XStack, YStack } from '@tamagui/stacks';
import * as ImagePicker from 'expo-image-picker';
import React, { useEffect, useState } from 'react';
import { Alert, Image, Pressable, ScrollView } from 'react-native';

import { formatDateBR } from '../domain/birthDate';
import { useProgressPhotosStore, type FotoDeEvolucao } from '../store/progress-photos.store';
import { useTheme } from '../theme/ThemeProvider';
import { Body, Button, Data, Label } from './ui';

/**
 * A linha do tempo de fotos, e a comparação de duas delas lado a lado.
 *
 * Toque em uma foto para escolhê-la; em duas, e elas aparecem juntas, com as
 * datas — é a comparação que o testador pediu. Segurar remove. Nada aqui sai
 * do aparelho: são arquivos locais, como a foto de perfil.
 */
export function ProgressPhotos() {
  const { colors } = useTheme();
  const fotos = useProgressPhotosStore((s) => s.fotos);
  const carregar = useProgressPhotosStore((s) => s.carregar);
  const adicionar = useProgressPhotosStore((s) => s.adicionar);
  const remover = useProgressPhotosStore((s) => s.remover);
  const [escolhidas, setEscolhidas] = useState<string[]>([]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const pegar = async (origem: 'camera' | 'galeria') => {
    const perm =
      origem === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') return;
    const opcoes: ImagePicker.ImagePickerOptions = { quality: 0.9 };
    const r =
      origem === 'camera'
        ? await ImagePicker.launchCameraAsync(opcoes)
        : await ImagePicker.launchImageLibraryAsync({ ...opcoes, mediaTypes: ['images'] });
    if (!r.canceled && r.assets[0]) await adicionar(r.assets[0].uri, r.assets[0].width);
  };

  const nova = () =>
    Alert.alert('Foto de evolução', 'De onde vem a foto?', [
      { text: 'Câmera', onPress: () => void pegar('camera') },
      { text: 'Galeria', onPress: () => void pegar('galeria') },
      { text: 'Cancelar', style: 'cancel' },
    ]);

  const alternar = (f: FotoDeEvolucao) =>
    setEscolhidas((atual) =>
      atual.includes(f.nome) ? atual.filter((n) => n !== f.nome) : [...atual.slice(-1), f.nome]);

  const confirmarRemocao = (f: FotoDeEvolucao) =>
    Alert.alert('Remover esta foto?', formatDateBR(f.em.slice(0, 10)), [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Remover', style: 'destructive', onPress: () => { remover(f.nome); setEscolhidas((a) => a.filter((n) => n !== f.nome)); } },
    ]);

  const par = escolhidas.map((n) => fotos.find((f) => f.nome === n)).filter(Boolean) as FotoDeEvolucao[];

  return (
    <YStack gap="$md" marginTop="$xl">
      <XStack alignItems="center" justifyContent="space-between">
        <Label>fotos de evolução</Label>
        <Data>{fotos.length === 0 ? 'nenhuma ainda' : `${fotos.length} ${fotos.length === 1 ? 'foto' : 'fotos'}`}</Data>
      </XStack>

      {par.length === 2 ? (
        <XStack gap="$sm">
          {par.map((f) => (
            <YStack key={f.nome} flex={1} gap="$xs">
              <Image source={{ uri: f.uri }} style={{ width: '100%', aspectRatio: 3 / 4, borderRadius: 12 }} />
              <Data>{formatDateBR(f.em.slice(0, 10))}</Data>
            </YStack>
          ))}
        </XStack>
      ) : null}

      {fotos.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {fotos.map((f) => {
            const marcada = escolhidas.includes(f.nome);
            return (
              <Pressable
                key={f.nome}
                onPress={() => alternar(f)}
                onLongPress={() => confirmarRemocao(f)}
                accessibilityRole="imagebutton"
                accessibilityLabel={`Foto de ${formatDateBR(f.em.slice(0, 10))}${marcada ? ', escolhida' : ''}`}
              >
                <YStack gap={4} alignItems="center">
                  <Image
                    source={{ uri: f.uri }}
                    style={{
                      width: 72,
                      height: 96,
                      borderRadius: 12,
                      borderWidth: marcada ? 2 : 1,
                      borderColor: marcada ? colors.accent : colors.hairlineStrong,
                    }}
                  />
                  <Data>{formatDateBR(f.em.slice(0, 10)).slice(0, 5)}</Data>
                </YStack>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : (
        <Body>
          Tire uma foto de tempos em tempos, na mesma luz e posição. Toque em duas para ver lado a lado.
        </Body>
      )}

      <YStack alignSelf="flex-start">
        <Button title="Adicionar foto" variant="secondary" onPress={nova} />
      </YStack>
      {fotos.length > 0 && par.length < 2 ? <Data>Toque em duas fotos para comparar. Segure para remover.</Data> : null}
    </YStack>
  );
}
