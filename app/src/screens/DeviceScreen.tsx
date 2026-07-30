import { useNavigation } from '@react-navigation/native';
import React from 'react';
import { Pressable } from 'react-native';

import { YStack } from '@tamagui/stacks';

import { Note, Row, Section } from '../components/Card';
import { ble } from '../services/ble';
import { DetailScreen } from '../components/DetailScreen';
import { SedentaryReminder } from '../components/SedentaryReminder';
import { Body, Button, Data } from '../components/ui';
import { useBiometricStore } from '../store/biometric.store';

export function DeviceScreen() {
  const navigation = useNavigation();
  const connection = useBiometricStore((s) => s.connection);
  const battery = useBiometricStore((s) => s.batteryPct);
  const latest = useBiometricStore((s) => s.latest);
  const disconnect = useBiometricStore((s) => s.disconnect);
  const pairedDeviceId = useBiometricStore((s) => s.pairedDeviceId);

  const onDisconnect = async () => {
    await disconnect();
    navigation.reset({ index: 0, routes: [{ name: 'Connect' as never }] });
  };

  const [localizando, setLocalizando] = React.useState(false);
  const localizar = async () => {
    setLocalizando(true);
    try {
      await ble.findDevice?.();
    } finally {
      // Segura o rótulo "Vibrando…" o tempo da vibração — o retorno do SDK
      // chega antes de o motor parar, e o botão voltando na hora parece falha.
      setTimeout(() => setLocalizando(false), 2500);
    }
  };

  /*
   Quem entrou por "Explorar sem pulseira" chega aqui SEM aparelho — e a tela
   de aparelho pareado mentiria um Staranb desconectado. Este é o caminho de
   volta para o pareamento quando a pulseira chegar.
  */
  if (!pairedDeviceId && connection !== 'connected') {
    return (
      <DetailScreen title="Dispositivo">
        <Note
          title="Nenhuma pulseira pareada"
          body="Você está usando o app sem a pulseira. Quando ela chegar, conecte aqui — as medições começam sozinhas e preenchem as telas."
        />
        <YStack marginTop="$xl">
          <Button
            title="Conectar pulseira"
            onPress={() => navigation.navigate('Connect' as never)}
          />
        </YStack>
      </DetailScreen>
    );
  }

  const rows = [
    { label: 'Modelo', value: 'AssumFit Watch' },
    { label: 'Identificador', value: 'E4:C3:B2:A1:00:1F' },
    { label: 'Estado', value: connection === 'connected' ? 'Conectado' : 'Desconectado' },
    { label: 'Bateria', value: battery != null ? `${battery}%` : '—' },
    { label: 'Origem dos dados', value: latest?.source === 'mock' ? 'Simulado' : 'Sensor' },
  ];

  return (
    <DetailScreen title="Dispositivo">
      <Section label="Dispositivo pareado" divider={false}>
        {rows.map((row, i) => (
          <Row key={row.label} last={i === rows.length - 1}>
            <Body flex={1}>{row.label}</Body>
            <Data fontSize={13} color="$foreground">
              {row.value}
            </Data>
          </Row>
        ))}
      </Section>

      {/*
        Localizar: a pulseira vibra até a pessoa achá-la. Só aparece conectada —
        fora de alcance o rádio não entrega o comando, e um botão que não faz
        nada ensina a desconfiar dos outros.
      */}
      {connection === 'connected' ? (
        <YStack marginTop="$xl">
          <Button
            title={localizando ? 'Vibrando…' : 'Localizar pulseira'}
            variant="secondary"
            onPress={() => void localizar()}
            disabled={localizando}
          />
        </YStack>
      ) : null}

      {/* O mesmo componente que Hábitos usa — ver SedentaryReminder.tsx. */}
      <SedentaryReminder />

      {/*
        Só quando a fonte É o mock. Este texto ficava fixo — escrito quando o
        gerador era o único wearable — e afirmava "dados simulados" para quem
        estava com a pulseira real no pulso. Num produto de saúde, dizer que o
        dado é falso quando ele é real é tão grave quanto o contrário.
      */}
      {latest?.source === 'mock' ? (
        <Note
          title="Wearable simulado"
          body="O app está lendo de um gerador de dados, não do hardware. Suba o Metro com EXPO_PUBLIC_BLE=real para usar a pulseira."
        />
      ) : null}

      <Pressable
        style={({ pressed }) => [{ paddingVertical: 24 }, pressed && { opacity: 0.5 }]}
        onPress={onDisconnect}
        accessibilityRole="button"
      >
        <Body color="$destructive">Desconectar dispositivo</Body>
      </Pressable>
    </DetailScreen>
  );
}
