import { Text } from '@tamagui/core';
import { YStack } from '@tamagui/stacks';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, Share } from 'react-native';

import { Note, Section } from '../components/Card';
import { DetailScreen } from '../components/DetailScreen';
import { Body, Data } from '../components/ui';
import { ble, usingRealDevice, type GattNotification, type GattService } from '../services/ble';
import { useBiometricStore } from '../store/biometric.store';
import { useTheme } from '../theme/ThemeProvider';

/**
 * Diagnóstico GATT — a ferramenta de mapeamento dos UUIDs proprietários.
 *
 * Existe porque o caminho alternativo é ruim: abrir o nRF Connect, ler UUIDs de
 * 36 caracteres na tela do celular e transcrever à mão para o `staranb.ts`, com
 * o erro de digitação praticamente garantido em algum deles — e um UUID errado
 * não dá erro, só devolve vazio para sempre.
 *
 * Aqui a lista sai do MESMO aparelho já conectado pelo app, com botão de
 * compartilhar que copia tudo em texto. O que aparece sem nome do Bluetooth SIG
 * é justamente o que estamos procurando.
 *
 * É tela de desenvolvimento: só aparece com `EXPO_PUBLIC_BLE=real`, e nunca
 * entra no caminho de quem assina.
 */
export function GattScreen() {
  const { colors } = useTheme();
  const connection = useBiometricStore((s) => s.connection);
  const [services, setServices] = useState<GattService[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [feed, setFeed] = useState<GattNotification[]>([]);
  const stopListening = useRef<(() => void) | null>(null);
  const listening = stopListening.current !== null;

  // Cancela a assinatura ao sair: notificação continuando com a tela fechada
  // gasta bateria e enche memória sem ninguém olhando.
  useEffect(() => () => stopListening.current?.(), []);

  /**
   * Escuta TODAS as características notificáveis.
   *
   * O H59 não expõe frequência cardíaca padrão — ele conversa por canais
   * seriais proprietários. Sem documentação, a única forma de descobrir o
   * formato é ver os bytes que ele empurra sozinho.
   */
  const toggleListen = async () => {
    if (stopListening.current) {
      stopListening.current();
      stopListening.current = null;
      setFeed((f) => [...f]);
      return;
    }
    setError(null);
    try {
      if (!ble.listenAll) throw new Error('O serviço em uso não escuta GATT.');
      const stop = await ble.listenAll((data) =>
        // Teto de 200: um canal serial pode despejar dezenas por segundo, e
        // guardar tudo derruba a tela antes de a informação ser útil.
        setFeed((f) => [data, ...f].slice(0, 200)),
      );
      stopListening.current = stop;
      setFeed([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao escutar');
    }
  };

  const inspect = async () => {
    setBusy(true);
    setError(null);
    try {
      /*
       Três serviços, não dois — a mensagem antiga só conhecia dois.

       Ela dizia "você está no mock" para QUALQUER serviço sem `inspect`, e
       desde que o SDK do fabricante entrou isso virou mentira: ele controla o
       rádio por conta própria e não expõe GATT, sem nada a ver com o simulado.
       Acusar o mock manda a investigação para o lado errado — foi o que
       aconteceu.
       */
      if (!ble.inspect) {
        throw new Error(
          usingRealDevice
            ? 'O SDK do fabricante controla o rádio e não expõe GATT. Para inspecionar o protocolo, suba o Metro com EXPO_PUBLIC_BLE=gatt.'
            : 'Você está no wearable simulado. Suba o Metro com EXPO_PUBLIC_BLE=real.',
        );
      }
      setServices(await ble.inspect());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao inspecionar');
    } finally {
      setBusy(false);
    }
  };

  /** Texto plano, para colar num chat ou mandar para o fabricante. */
  const asText = () =>
    (services ?? [])
      .map((s) => {
        const head = `${s.uuid}${s.known ? `  (${s.known})` : '  ← PROPRIETÁRIO'}`;
        const chars = s.characteristics
          .map((c) => {
            const props = [c.notifiable && 'notify', c.readable && 'read', c.writable && 'write']
              .filter(Boolean)
              .join(',');
            return `    ${c.uuid}${c.known ? ` (${c.known})` : ' ←'}  [${props}]${c.sample ? `  = ${c.sample}` : ''}`;
          })
          .join('\n');
        return `${head}\n${chars}`;
      })
      .join('\n\n');

  const proprietary = (services ?? []).filter((s) => !s.known).length;

  return (
    <DetailScreen title="Diagnóstico GATT">
      {!usingRealDevice ? (
        <Note
          title="Você está no wearable simulado"
          body="Suba o Metro com EXPO_PUBLIC_BLE=real e rode num aparelho físico. O simulador não tem Bluetooth — o CoreBluetooth reporta 'unsupported' e não faz ponte com o rádio do Mac."
        />
      ) : null}

      <Body marginBottom="$xl" maxWidth="96%">
        Conecte o relógio pela tela de dispositivo e inspecione. O que aparecer sem nome do
        Bluetooth SIG é proprietário — é o que falta mapear em <Mono>staranb.ts</Mono>.
      </Body>

      <YStack gap="$md" marginBottom="$xl">
        <GattAction
          label={busy ? 'Lendo…' : 'Inspecionar aparelho'}
          onPress={() => void inspect()}
          disabled={busy || connection !== 'connected'}
        />
        <GattAction
          label={listening ? 'Parar de escutar' : 'Escutar notificações'}
          onPress={() => void toggleListen()}
          disabled={connection !== 'connected'}
        />

        {services || feed.length ? (
          <Pressable
            style={({ pressed }) => [{ paddingVertical: 8 }, pressed && { opacity: 0.5 }]}
            onPress={() => void Share.share({ message: feed.length ? feedAsText(feed) : asText() })}
            accessibilityRole="button"
          >
            <Data textDecorationLine="underline">Compartilhar como texto</Data>
          </Pressable>
        ) : null}
      </YStack>

      {connection !== 'connected' ? (
        <Data marginBottom="$lg">Nenhum aparelho conectado.</Data>
      ) : null}
      {error ? (
        <Data color="$destructive" marginBottom="$lg">
          {error}
        </Data>
      ) : null}

      {feed.length ? (
        <Section label={`recebido · ${feed.length} quadros`}>
          {feed.slice(0, 40).map((n, i) => (
            <YStack key={`${n.at}-${i}`} gap={2} paddingVertical="$sm" borderTopWidth={1} borderTopColor="$border">
              <Mono color="$primary">{n.charUuid.slice(0, 8)}</Mono>
              <Mono selectable>{n.hex}</Mono>
              {/* O ASCII ao lado poupa decodificação manual: nome e versão do
                  firmware chegam como texto puro nesses canais. */}
              <Mono color="$faint">{n.ascii}</Mono>
            </YStack>
          ))}
        </Section>
      ) : null}

      {services ? (
        <>
          <Data marginBottom="$lg">
            {services.length} serviços · {proprietary} proprietário{proprietary === 1 ? '' : 's'}
          </Data>

          {services.map((service) => (
            <Section key={service.uuid} label={service.known ?? 'proprietário'}>
              <Mono marginBottom="$md" color={service.known ? '$mutedForeground' : '$primary'}>
                {service.uuid}
              </Mono>

              {service.characteristics.map((c) => (
                <YStack key={c.uuid} gap="$xs" paddingVertical="$md" borderTopWidth={1} borderTopColor="$border">
                  <Mono color={c.known ? '$mutedForeground' : '$primary'}>{c.uuid}</Mono>
                  <Data>
                    {c.known ?? 'sem nome padrão'} ·{' '}
                    {[c.notifiable && 'notifica', c.readable && 'lê', c.writable && 'escreve']
                      .filter(Boolean)
                      .join(' · ') || 'sem propriedades'}
                  </Data>
                  {/* A amostra em hexadecimal é o que permite reconhecer o dado
                      sem documentação: um byte entre 90 e 100 é SpO₂; dois
                      bytes perto de 3700 são temperatura em centésimos. */}
                  {c.sample ? (
                    <Mono color="$foreground" selectable>
                      {c.sample}
                    </Mono>
                  ) : null}
                </YStack>
              ))}
            </Section>
          ))}
        </>
      ) : null}

      <Note
        title="Depois de mapear"
        body="Preencha os UUIDs em staranb.ts, escreva o parser de cada característica e valide o HRV contra um Polar H10 em repouso. Sem essa comparação, um RMSSD plausível mas errado envenena a linha de base e o score inteiro, sem nada na tela acusar."
      />
    </DetailScreen>
  );
}

/** Os quadros recebidos, em texto, para colar num chat ou mandar ao fabricante. */
function feedAsText(feed: GattNotification[]): string {
  return feed
    .map((n) => `${new Date(n.at).toISOString().slice(11, 23)}  ${n.charUuid}  ${n.hex}  |${n.ascii}|`)
    .join('\n');
}

/**
 * UUID em monoespaçada.
 *
 * Fonte proporcional é ilegível para comparar identificadores: os dígitos têm
 * larguras diferentes e duas linhas quase iguais deixam de se alinhar, que é
 * exatamente a comparação que esta tela existe para permitir.
 */
function Mono({
  children,
  color = '$mutedForeground',
  selectable,
  marginBottom,
}: {
  children: React.ReactNode;
  color?: string;
  selectable?: boolean;
  marginBottom?: string;
}) {
  return (
    <Text
      fontSize={11}
      color={color as never}
      selectable={selectable}
      marginBottom={marginBottom as never}
      // `Menlo` não é token do tema: é uma fonte do sistema pedida por esta
      // tela só, e declará-la no config faria uma monoespaçada existir para o
      // app inteiro sem ninguém usar.
      style={{ fontFamily: 'Menlo' }}
    >
      {children}
    </Text>
  );
}

/** Ação da tela de diagnóstico. Pílula preenchida, como o resto do sistema. */
function GattAction({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      style={({ pressed }) => [{ alignSelf: 'flex-start' }, pressed && { opacity: 0.5 }]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
    >
      <YStack
        paddingVertical={14}
        paddingHorizontal="$xl"
        borderRadius={999}
        backgroundColor={disabled ? '$control' : '$primary'}
      >
        <Text fontSize={15} fontWeight="700" color={disabled ? '$faint' : '$primaryForeground'}>
          {label}
        </Text>
      </YStack>
    </Pressable>
  );
}
