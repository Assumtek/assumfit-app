import { Text } from '@tamagui/core';
import { XStack, YStack } from '@tamagui/stacks';
import React from 'react';
import { ActivityIndicator, Pressable } from 'react-native';

import type { MeasurableKind } from '../services/ble';
import { useBiometricStore } from '../store/biometric.store';
import { useTheme } from '../theme/ThemeProvider';
import { Icon } from './Icon';
import { Body } from './ui';

/**
 * A pílula do botão.
 *
 * Era `Glass` — a camada de vidro nativo. Com o novo sistema visual, ação usa
 * superfície com contorno: o vidro ficou reservado para o painel lateral e a
 * barra, que flutuam sobre o conteúdo. Um botão em linha não flutua.
 */
function Pill({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <XStack
      alignItems="center"
      gap="$sm"
      paddingVertical="$sm"
      paddingHorizontal="$lg"
      borderRadius={999}
      borderWidth={1}
      borderColor={muted ? '$border' : '$borderStrong'}
      backgroundColor="$control"
      // Largura do conteúdo: a composição é assimétrica, o botão não atravessa
      // a tela nem centraliza.
      alignSelf="flex-start"
    >
      {children}
    </XStack>
  );
}

/**
 * "Medir agora" — o mesmo botão em toda tela de saúde.
 *
 * A pulseira transmite batimento sozinha, mas SpO₂, pressão, estresse e HRV só
 * existem quando alguém pede. Antes isso acontecia uma vez, ao conectar, e não
 * havia como repetir: olhar um número, desconfiar dele e querer medir de novo é
 * exatamente o que a pessoa tenta fazer numa tela dessas.
 *
 * Componente único, e não um botão por tela, porque o estado de "medindo" é do
 * APARELHO, não da tela: é um sensor óptico só, e duas medições simultâneas
 * disputariam o mesmo hardware. Com o estado no store, abrir outra tela durante
 * uma medição mostra o mesmo andamento em vez de oferecer um segundo disparo.
 */
export function MeasureButton({ kind, label }: { kind: MeasurableKind; label?: string }) {
  const { colors } = useTheme();

  const measuring = useBiometricStore((s) => s.measuring);
  const measureError = useBiometricStore((s) => s.measureError);
  const measureNow = useBiometricStore((s) => s.measureNow);
  const connection = useBiometricStore((s) => s.connection);
  const bandActivity = useBiometricStore((s) => s.bandActivity);

  /*
   A medição AUTOMÁTICA (a varredura pós-conexão) ocupa o mesmo sensor que a
   pedida no botão. Sem contá-la, o botão oferecia um disparo que ia falhar —
   e a tela dizia traço enquanto a pulseira já media exatamente esta grandeza.
   */
  const automatica = bandActivity?.kind === 'measure' ? bandActivity.what : null;
  const desteBotao = measuring === kind || automatica === kind;
  const ocupado = measuring !== null || automatica !== null;
  const conectado = connection === 'connected';

  return (
    <YStack marginTop="$lg">
      <Pressable
        onPress={() => void measureNow(kind)}
        // Desabilitado enquanto QUALQUER medição roda, não só a desta tela.
        disabled={ocupado || !conectado}
        accessibilityRole="button"
        accessibilityState={{ disabled: ocupado || !conectado, busy: desteBotao }}
        accessibilityLabel={desteBotao ? 'Medindo, aguarde' : (label ?? 'Medir agora')}
        style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
      >
        <Pill muted={!conectado}>
          {desteBotao ? (
            <ActivityIndicator size="small" color={colors.textMuted} />
          ) : (
            <Icon name="pulse" size={16} color={conectado ? colors.text : colors.textMuted} />
          )}
          <Text fontSize={14} color={conectado ? '$foreground' : '$mutedForeground'}>
            {desteBotao ? 'Medindo…' : (label ?? 'Medir agora')}
          </Text>
        </Pill>
      </Pressable>

      {/*
        A explicação fica ABAIXO do botão, em texto secundário.

        Sem isto o toque não produzia efeito visível quando a pulseira estava
        desconectada, e a pessoa não tinha como saber por quê — foi o que
        aconteceu comigo hoje mais de uma vez, em outros caminhos silenciosos.
      */}
      {!conectado ? (
        <Body marginTop="$sm">Conecte a pulseira para medir.</Body>
      ) : desteBotao ? (
        <Body marginTop="$sm">
          A medição leva alguns segundos. Mantenha a pulseira firme no pulso.
        </Body>
      ) : measureError ? (
        <Body marginTop="$sm">{measureError}</Body>
      ) : null}
    </YStack>
  );
}

/**
 * "Buscar noite" — o par do `MeasureButton` para o sono.
 *
 * Sono não tem medição sob demanda: ele se mede DORMINDO. Um botão "medir
 * agora" numa tela de sono prometeria algo que o hardware não faz, então o que
 * cabe é reler o que a pulseira já gravou — útil de manhã, quando a noite
 * terminou mas o app ainda não perguntou.
 */
export function SyncSleepButton() {
  const { colors } = useTheme();
  const [buscando, setBuscando] = React.useState(false);
  const connectHealth = useBiometricStore((s) => s.connectHealth);
  const connection = useBiometricStore((s) => s.connection);

  const conectado = connection === 'connected';

  return (
    <YStack marginTop="$lg">
      <Pressable
        onPress={() => {
          setBuscando(true);
          void connectHealth().finally(() => setBuscando(false));
        }}
        disabled={buscando}
        accessibilityRole="button"
        accessibilityState={{ disabled: buscando, busy: buscando }}
        style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
      >
        <Pill>
          {buscando ? (
            <ActivityIndicator size="small" color={colors.textMuted} />
          ) : (
            <Icon name="moon" size={16} color={colors.text} />
          )}
          <Text fontSize={14} color="$foreground">
            {buscando ? 'Buscando…' : 'Buscar noite'}
          </Text>
        </Pill>
      </Pressable>
      <Body marginTop="$sm">
        {conectado
          ? 'Busca o sono na pulseira e, se não houver, no app Saúde.'
          : 'Sem a pulseira conectada, busca apenas no app Saúde.'}
      </Body>
    </YStack>
  );
}
