import { XStack, YStack } from '@tamagui/stacks';
import * as ImagePicker from 'expo-image-picker';
import React, { useEffect, useState } from 'react';
import { Alert, Image, Pressable, ScrollView } from 'react-native';

import { formatDateBR } from '../domain/birthDate';
import * as api from '../services/api.service';
import { ANGULOS, useProgressPhotosStore, type AnguloDaFoto, type FotoDeEvolucao } from '../store/progress-photos.store';
import { useTheme } from '../theme/ThemeProvider';
import { Body, Button, Data, Label } from './ui';

/**
 * A linha do tempo de fotos, e a comparação de duas delas lado a lado.
 *
 * Toque em uma foto para escolhê-la; em duas, e elas aparecem juntas, com as
 * datas, que é a comparação que o testador pediu. Segurar remove.
 *
 * As fotos ficam na CONTA desde 01/09/2026, não mais só no aparelho: é o que
 * permite trocar de celular sem perder a linha do tempo, e não dá para refazer
 * a foto de três meses atrás. Por serem foto de corpo, têm consentimento
 * próprio, pedido na primeira, e revogar apaga todas.
 */
export function ProgressPhotos() {
  const { colors } = useTheme();
  const fotos = useProgressPhotosStore((s) => s.fotos);
  const carregar = useProgressPhotosStore((s) => s.carregar);
  const adicionar = useProgressPhotosStore((s) => s.adicionar);
  const remover = useProgressPhotosStore((s) => s.remover);
  const esquecerAsDaConta = useProgressPhotosStore((s) => s.esquecerAsDaConta);
  const [escolhidas, setEscolhidas] = useState<string[]>([]);
  /**
   * Se a pessoa consentiu em guardar as fotos na conta.
   *
   * Governa a existência do botão de revogar: oferecer "parar de guardar" a
   * quem nunca começou é ruído, e esconder de quem começou é descumprir a
   * promessa feita no consentimento.
   */
  const [consentido, setConsentido] = useState(false);

  useEffect(() => {
    void api.fetchProgressPhotoConsent().then(setConsentido);
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  /*
   Ângulo antes da foto, e várias da galeria de uma vez: uma avaliação tem
   frente, lado e costas, e comparar frente de hoje com costas de ontem não
   diz nada (Bruno, 22/08). A câmera tira uma por vez; a galeria aceita até
   três, todas com o ângulo escolhido.
  */
  /*
   O consentimento vem ANTES da primeira foto.

   Foto de corpo passou a ser guardada na nuvem (01/09/2026), e ela descreve
   saúde e identifica a pessoa sozinha: por isso finalidade própria, separada
   da biometria, e pedida aqui, no momento em que a pessoa entende para que
   serve. Recusar não quebra nada, só não guarda.
  */
  const garantirConsentimento = async (): Promise<boolean> => {
    if (await api.fetchProgressPhotoConsent()) {
      setConsentido(true);
      return true;
    }
    return new Promise((resolve) => {
      Alert.alert(
        'Guardar suas fotos na nuvem',
        'Suas fotos de evolução ficam na sua conta, criptografadas, e só você as vê. É o que permite trocar de celular sem perder a linha do tempo. Você pode revogar quando quiser, e revogar apaga as fotos.',
        [
          { text: 'Agora não', style: 'cancel', onPress: () => resolve(false) },
          {
            text: 'Concordo',
            onPress: () => {
              api
                .setProgressPhotoConsent(true)
                .then((ok) => {
                  setConsentido(ok);
                  resolve(ok);
                })
                .catch(() => resolve(false));
            },
          },
        ],
      );
    });
  };

  /**
   * Revoga o consentimento e apaga as fotos, no servidor e no bucket.
   *
   * A confirmação repete o custo antes do toque final: são fotos que não dá
   * para refazer, e a linha do tempo do corpo é o conteúdo que mais dói perder.
   */
  const revogar = () => {
    Alert.alert(
      'Parar de guardar suas fotos?',
      'Suas fotos de evolução são apagadas da sua conta, em definitivo. As que estão só neste aparelho continuam aqui. Você pode voltar a guardar depois, mas as apagadas não voltam.',
      [
        { text: 'Manter', style: 'cancel' },
        {
          text: 'Apagar minhas fotos',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                await api.setProgressPhotoConsent(false);
                setConsentido(false);
                esquecerAsDaConta();
              } catch {
                // Sem rede, nada foi apagado: a tela continua como está, e a
                // pessoa tenta de novo. Dizer "apagado" sem ter apagado seria
                // a pior falha possível aqui.
              }
            })();
          },
        },
      ]);
  };

  const pegar = async (origem: 'camera' | 'galeria', angulo: AnguloDaFoto) => {
    if (!(await garantirConsentimento())) return;
    const perm =
      origem === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') return;
    const opcoes: ImagePicker.ImagePickerOptions = { quality: 0.9 };
    const r =
      origem === 'camera'
        ? await ImagePicker.launchCameraAsync(opcoes)
        : await ImagePicker.launchImageLibraryAsync({ ...opcoes, mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: 3 });
    if (r.canceled) return;
    for (const a of r.assets) await adicionar(a.uri, a.width, angulo);
  };

  const escolherAngulo = (origem: 'camera' | 'galeria') =>
    Alert.alert('Qual ângulo?', 'Frente, lado ou costas. Dá para comparar depois pelo mesmo ângulo.', [
      ...ANGULOS.map((a) => ({ text: a.label, onPress: () => void pegar(origem, a.key) })),
      { text: 'Cancelar', style: 'cancel' as const },
    ]);
  const nova = () =>
    Alert.alert('Foto de evolução', 'De onde vem a foto?', [
      { text: 'Câmera', onPress: () => escolherAngulo('camera') },
      { text: 'Galeria (até 3)', onPress: () => escolherAngulo('galeria') },
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
              <Data>{formatDateBR(f.em.slice(0, 10))}{f.angulo ? ` · ${rotuloDoAngulo(f.angulo)}` : ''}</Data>
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
                accessibilityLabel={`Foto de ${formatDateBR(f.em.slice(0, 10))}${f.angulo ? `, ${rotuloDoAngulo(f.angulo)}` : ''}${marcada ? ', escolhida' : ''}`}
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
                  {f.angulo ? <Data>{rotuloDoAngulo(f.angulo)}</Data> : null}
                </YStack>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : (
        <Body>
          Tire fotos de tempos em tempos, na mesma luz e posição: frente, lado e costas. Toque em duas do mesmo ângulo para ver lado a lado.
        </Body>
      )}

      <XStack alignItems="center" gap="$md" flexWrap="wrap">
        <Button title="Adicionar foto" variant="secondary" onPress={nova} />
        {/*
          A revogação PROMETIDA no consentimento, executável aqui.

          A LGPD é explícita (Art. 8º §5º): revogar tem que ser tão fácil
          quanto consentir. Consentir é um toque num alerta, então revogar não
          pode exigir escrever para o suporte. Só aparece para quem consentiu,
          e é o mesmo desenho do registro de ciclo.
        */}
        {consentido ? (
          <Button title="Parar de guardar" variant="ghost" onPress={revogar} />
        ) : null}
      </XStack>
      {fotos.length > 0 && par.length < 2 ? <Data>Toque em duas fotos do mesmo ângulo para comparar. Segure para remover.</Data> : null}
      {par.length === 2 && par[0].angulo && par[1].angulo && par[0].angulo !== par[1].angulo ? (
        <Data>Ângulos diferentes: a comparação vale mais entre duas fotos de {rotuloDoAngulo(par[0].angulo).toLowerCase()}.</Data>
      ) : null}
    </YStack>
  );
}

function rotuloDoAngulo(a: AnguloDaFoto): string {
  return ANGULOS.find((x) => x.key === a)?.label ?? a;
}
