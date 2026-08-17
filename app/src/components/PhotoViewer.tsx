import { XStack, YStack } from '@tamagui/stacks';
import { Asset } from 'expo-asset';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import React, { useEffect, useState } from 'react';
import { Alert, Image, Modal, Pressable, useWindowDimensions } from 'react-native';

import { Icon } from './Icon';
import { Button, Data } from './ui';
import { useTheme } from '../theme/ThemeProvider';

/**
 * A foto de uma sessão em tela cheia, com as mesmas ações do compartilhar:
 * salvar na galeria e enviar para outro app (pedido da fundadora, ago/2026).
 *
 * Aceita tanto asset empacotado (`require`) quanto arquivo do aparelho. O
 * caminho do asset passa por `Asset.downloadAsync()` porque um módulo
 * empacotado não é arquivo até ser materializado — sem isso, salvar e
 * compartilhar recebem um id numérico e falham.
 */
export function PhotoViewer({
  foto,
  legenda,
  onClose,
}: {
  foto: number | { uri: string } | null;
  legenda?: string;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const { width, height } = useWindowDimensions();
  const [uri, setUri] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    let vivo = true;
    if (!foto) return setUri(null);
    if (typeof foto === 'object') {
      setUri(foto.uri);
      return;
    }
    void Asset.fromModule(foto)
      .downloadAsync()
      .then((asset) => {
        if (vivo) setUri(asset.localUri ?? asset.uri);
      })
      .catch(() => vivo && setUri(null));
    return () => {
      vivo = false;
    };
  }, [foto]);

  const salvar = async () => {
    if (!uri) return;
    setOcupado(true);
    try {
      // Só escrita: o prompt do iOS fica em "adicionar fotos", sem pedir
      // acesso à galeria inteira para uma tarefa que só grava.
      const permissao = await MediaLibrary.requestPermissionsAsync(true);
      if (!permissao.granted) {
        Alert.alert('Permissão necessária', 'Autorize o acesso às fotos para salvar.');
        return;
      }
      await MediaLibrary.Asset.create(uri);
      Alert.alert('Salvo', 'A foto está na sua galeria.');
    } catch {
      Alert.alert('Não foi possível salvar', 'Tente de novo.');
    } finally {
      setOcupado(false);
    }
  };

  const compartilhar = async () => {
    if (!uri) return;
    setOcupado(true);
    try {
      if (!(await Sharing.isAvailableAsync())) return;
      await Sharing.shareAsync(uri, { mimeType: 'image/jpeg', UTI: 'public.jpeg' });
    } catch {
      Alert.alert('Não foi possível compartilhar', 'Tente de novo.');
    } finally {
      setOcupado(false);
    }
  };

  return (
    <Modal
      visible={foto !== null}
      animationType="fade"
      transparent
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Fundo opaco na cor da marca: foto sobre véu translúcido deixa o
          conteúdo de trás atravessar e some com o preto da imagem. */}
      <YStack flex={1} style={{ backgroundColor: '#0E0A22' }}>
        <XStack justifyContent="flex-end" paddingTop={insetsTopAproximado} paddingHorizontal="$xl">
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Fechar"
            hitSlop={12}
            style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
          >
            <Icon name="x" size={22} color="#ECE7F4" />
          </Pressable>
        </XStack>

        <YStack flex={1} alignItems="center" justifyContent="center" paddingHorizontal="$lg">
          {uri ? (
            <Image
              source={{ uri }}
              resizeMode="contain"
              style={{ width: width - 32, height: height * 0.6, borderRadius: 16 }}
            />
          ) : (
            <Data style={{ color: '#ECE7F4' }}>carregando foto…</Data>
          )}
          {legenda ? (
            <Data marginTop="$lg" style={{ color: 'rgba(236,231,244,0.75)' }}>
              {legenda}
            </Data>
          ) : null}
        </YStack>

        <YStack paddingHorizontal="$xl" paddingBottom="$xxxl" gap="$sm">
          <Button
            title="Salvar na galeria"
            icon={<Icon name="down" size={16} color={colors.ink} />}
            loading={ocupado}
            onPress={() => void salvar()}
          />
          <Button title="Compartilhar" variant="secondary" onPress={() => void compartilhar()} />
        </YStack>
      </YStack>
    </Modal>
  );
}

/**
 * O modal é uma janela nativa própria e não herda o provedor de safe area da
 * árvore; 64 cobre a ilha dinâmica de todos os iPhones com notch e sobra
 * pouco nos sem. É o único lugar do app onde a medida é chutada, e é por isso
 * que ela vive num nome, não solta no meio do JSX.
 */
const insetsTopAproximado = 64;
