import { useNavigation } from '@react-navigation/native';
import { Text } from '@tamagui/core';
import { XStack, YStack } from '@tamagui/stacks';
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '../components/Icon';
import { PermissionGate, permissaoNegadaEm } from '../components/PermissionGate';
import { LogoType } from '../components/Logo';
import { Body, Data, Label } from '../components/ui';
import type { DiscoveredDevice } from '../services/ble';
import { useBiometricStore } from '../store/biometric.store';
import { useLifestyleStore } from '../store/lifestyle.store';
import { useTheme } from '../theme/ThemeProvider';

export function ConnectScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const devices = useBiometricStore((s) => s.devices);
  const connection = useBiometricStore((s) => s.connection);
  const startScan = useBiometricStore((s) => s.startScan);
  const connect = useBiometricStore((s) => s.connect);
  const connectError = useBiometricStore((s) => s.connectError);
  const connectionReason = useBiometricStore((s) => s.connectionReason);
  const skipBand = useBiometricStore((s) => s.skipBand);
  const loadLifestyle = useLifestyleStore((s) => s.load);

  useEffect(() => startScan(), [startScan]);

  /**
   * Pareou o aparelho, vai para o onboarding — se ainda não respondeu.
   *
   * Nesta ordem, e não antes de conectar: as perguntas de rotina só fazem
   * sentido depois de existir dado para elas personalizarem. Pedir "em que dias
   * você treina" a quem ainda nem viu o próprio HRV é cobrar antes de entregar.
   */
  useEffect(() => {
    if (connection !== 'connected') return;
    void loadLifestyle().then(() => {
      const pronto = useLifestyleStore.getState().completedAt !== null;
      navigation.reset({ index: 0, routes: [{ name: (pronto ? 'Main' : 'Onboarding') as never }] });
    });
  }, [connection, navigation, loadLifestyle]);

  const connecting = connection === 'connecting';

  /**
   * Só o que parece pulseira, como faz o app do fabricante.
   *
   * Antes a tela mostrava `devices[0]` — o PRIMEIRO que o rádio devolvesse, que
   * num ambiente com fone, TV e celular alheio praticamente nunca é a pulseira.
   *
   * O filtro tem uma ESCAPATÓRIA de propósito. O app do fabricante pode filtrar
   * com rigor porque sabe exatamente o que o próprio hardware anuncia; nós
   * ainda não — se o ANB-X1 não anunciar o serviço de frequência cardíaca nem
   * casar com os nomes conhecidos, um filtro fechado o esconderia e não haveria
   * como parear. Assim que o mapeamento confirmar o que ele anuncia, o filtro
   * fecha e este botão sai.
   *
   * RSSI é negativo: -40 é encostado, -90 é longe. Ordenar decrescente põe o
   * mais próximo no topo, e como o valor atualiza ao vivo, aproximar o celular
   * do pulso faz a pulseira subir na lista.
   */
  const [showAll, setShowAll] = useState(false);
  const ordered = [...devices].sort((a, b) => b.rssi - a.rssi);
  const likely = ordered.filter(isLikelyWatch);

  /**
   * Filtro que não achou nada mostra TUDO, em vez de lista vazia.
   *
   * A varredura real do ANB-X1 provou que a suposição do filtro estava errada:
   * ele não anuncia serviço nenhum e nem nome — aparece como anônimo, igual a
   * mais vinte aparelhos da vizinhança. Filtrar por serviço ou nome o eliminava
   * junto com o resto, e o resultado era uma tela vazia sem explicação, que é o
   * pior desfecho possível: a pessoa não tem como saber se o problema é a
   * pulseira, o Bluetooth ou o app.
   */
  const found = showAll || likely.length === 0 ? ordered : likely;
  const hidden = showAll ? 0 : ordered.length - likely.length;
  const filterFoundNothing = likely.length === 0 && ordered.length > 0;

  return (
    <YStack
      flex={1}
      backgroundColor="$background"
      paddingHorizontal={24}
      paddingTop={insets.top + 48}
      paddingBottom={insets.bottom + 32}
    >
      <LogoType height={18} />

      <YStack flex={1} justifyContent="center">
        <Text fontSize={34} fontWeight="700" letterSpacing={-1.2} lineHeight={40} color="$foreground">
          Aproxime a pulseira
        </Text>
        <Body marginTop="$lg" maxWidth="82%">
          Encoste o celular na pulseira. Se ela já estiver conectada ao Bluetooth do iPhone, aparece
          assim mesmo.
        </Body>
      </YStack>

      <YStack gap="$lg">
        <Label>
          {connecting
            ? 'Conectando'
            : found.length
              ? `${found.length} ${found.length === 1 ? 'aparelho' : 'aparelhos'} por perto`
              : 'Procurando'}
        </Label>

        {/* A pulseira anuncia anônima, sem serviço nem nome. Dizer isso poupa a
            pessoa de procurar um rótulo que não existe — o sinal é a única
            pista, e é por isso que a lista está ordenada por ele. */}
        {filterFoundNothing ? (
          <Data maxWidth="96%">
            Nenhum aparelho se identificou como pulseira. Ela costuma anunciar sem nome — encoste o
            celular no pulso e toque no primeiro da lista.
          </Data>
        ) : null}

        {/* Teto de altura na lista: com vinte aparelhos ela não pode comer a tela toda. */}
        {found.length ? (
          <ScrollView style={{ maxHeight: 240 }} showsVerticalScrollIndicator={false}>
            {found.map((item) => (
              <Pressable
                key={item.id}
                style={({ pressed }) => (pressed ? { opacity: 0.5 } : undefined)}
                onPress={() => !connecting && connect(item.id)}
                accessibilityRole="button"
                accessibilityLabel={`Conectar em ${item.name}`}
              >
                <XStack
                  alignItems="center"
                  paddingVertical="$xl"
                  borderTopWidth={1}
                  borderTopColor="$border"
                >
                  <YStack flex={1} gap="$xs">
                    <XStack alignItems="center" gap="$sm">
                      <Text fontSize={16} letterSpacing={-0.3} color="$foreground" numberOfLines={1}>
                        {item.name}
                      </Text>
                    {/* Quem anuncia Heart Rate é quase certamente um wearable.
                        Dica, não filtro: firmware que não anuncia serviço
                        continua na lista, só sem o destaque. */}
                      {item.alreadyConnected ? (
                        <Label fontSize={9} color="$primary">já conectado</Label>
                      ) : isWearable(item.serviceUUIDs) ? (
                        <Label fontSize={9} color="$primary">wearable</Label>
                      ) : null}
                    </XStack>
                    <Data>
                      {item.alreadyConnected
                        ? 'conectado ao sistema — sinal não medido'
                        : `${signalLabel(item.rssi)} · ${item.rssi} dBm`}
                    </Data>
                  </YStack>
                  <Icon name="arrowRight" size={18} color={connecting ? colors.textFaint : colors.text} />
                </XStack>
              </Pressable>
            ))}
          </ScrollView>
        ) : (
          <XStack alignItems="center" paddingVertical="$xl" borderTopWidth={1} borderTopColor="$border">
            <Data>{showAll ? 'Nenhum dispositivo por perto' : 'Nenhuma pulseira encontrada'}</Data>
          </XStack>
        )}

        {/* A mensagem do rádio, crua. Não é bonita, mas é a única coisa que
            distingue "fora de alcance" de "ocupado por outro app" — e cada uma
            pede uma ação diferente de quem está com o relógio na mão. O
            `connectionReason` cobre a falha que chega DEPOIS do connect — a
            entrega ao SDK recusada, o app do fabricante segurando a pulseira. */}
        {/*
          Permissão NEGADA não é mensagem de erro: é um beco sem saída, e a
          saída fica em outro app. Alguém recusou o acesso na abertura e
          acabou apagando e reinstalando o AssumFit para voltar a funcionar
          (ago/2026) — este bloco existe para que ninguém precise disso de
          novo.
        */}
        {permissaoNegadaEm(connectionReason) ? (
          <YStack marginTop="$md">
            <PermissionGate
              permissao={permissaoNegadaEm(connectionReason)!}
              onTentarDeNovo={() => startScan()}
            />
          </YStack>
        ) : connectError ?? (connection === 'error' ? connectionReason : null) ? (
          <Data color="$destructive">
            {connectError ?? connectionReason}
          </Data>
        ) : null}

        {/* Escapatória: sem ela, uma pulseira que não anuncia o serviço de
            frequência cardíaca ficaria invisível e sem caminho de pareamento. */}
        {!showAll && hidden > 0 ? (
          <Pressable
            style={({ pressed }) => [{ paddingVertical: 12 }, pressed && { opacity: 0.5 }]}
            onPress={() => setShowAll(true)}
            accessibilityRole="button"
          >
            <Data textDecorationLine="underline">
              Não achou? Mostrar todos os {ordered.length} aparelhos
            </Data>
          </Pressable>
        ) : null}

        {/*
          A porta de quem ainda não tem o aparelho — quem espera a entrega, ou
          o revisor da App Store, que nunca terá um. Sem ela esta tela é um
          beco: as telas de dentro já sabem viver sem medição (traço, nunca
          zero), então o que faltava era só deixar entrar.
        */}
        <Pressable
          style={({ pressed }) => [{ paddingVertical: 12 }, pressed && { opacity: 0.5 }]}
          onPress={() => {
            skipBand();
            navigation.reset({ index: 0, routes: [{ name: 'Main' as never }] });
          }}
          accessibilityRole="button"
          accessibilityLabel="Explorar o app sem a pulseira"
        >
          <Data textDecorationLine="underline">Ainda sem a pulseira? Explorar o app</Data>
        </Pressable>
      </YStack>
    </YStack>
  );
}

/**
 * Heart Rate (0x180D). Qualquer wearable que meça batimento expõe este serviço,
 * e a maioria o anuncia no pacote de propaganda — é a pista mais confiável que
 * existe sem conhecer o hardware.
 */
const HEART_RATE_SERVICE = '180d';

/**
 * Nomes conhecidos de pulseira. Complementa o serviço porque parte dos firmwares
 * baratos não anuncia serviço nenhum, só o nome.
 */
const NAME_HINTS = ['anb', 'staranb', 'x1', 'band', 'watch', 'fit', 'h59', 'h5'];

export function isLikelyWatch(device: DiscoveredDevice): boolean {
  // Já conectado ao sistema entra sempre: ele veio de `connectedDevices`
  // justamente porque NÃO anuncia, então cobrar dele um serviço anunciado o
  // esconderia de novo — o oposto do motivo de tê-lo buscado.
  if (device.alreadyConnected) return true;
  const advertises = (device.serviceUUIDs ?? []).some((u) => u.toLowerCase().includes(HEART_RATE_SERVICE));
  const name = device.name.toLowerCase();
  return advertises || NAME_HINTS.some((hint) => name.includes(hint));
}

function isWearable(serviceUUIDs?: string[]): boolean {
  return (serviceUUIDs ?? []).some((u) => u.toLowerCase().includes(HEART_RATE_SERVICE));
}

/**
 * RSSI em palavra. O número sozinho não diz nada a quem não é de rádio, e a
 * distância é o que resolve a dúvida de qual aparelho é o do pulso.
 */
function signalLabel(rssi: number): string {
  if (rssi >= -55) return 'encostado';
  if (rssi >= -70) return 'perto';
  if (rssi >= -85) return 'a alguns metros';
  return 'longe';
}
