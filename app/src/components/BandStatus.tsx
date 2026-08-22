import { XStack, YStack } from '@tamagui/stacks';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator } from 'react-native';

import type { MeasurableKind, SyncStep } from '../services/ble';
import { horaLocal } from '../domain/sleep';
import { useBiometricStore } from '../store/biometric.store';
import { useTheme } from '../theme/ThemeProvider';
import { Body, Data } from './ui';
import { MeasureButton } from './MeasureButton';

/** Depois de quanto tempo "conectando" merece uma explicação melhor. */
const CONNECTING_SLOW_MS = 12_000;

/**
 * O nome de cada etapa, na língua de quem usa.
 *
 * Não é o nome da consulta do SDK: `getSpo2History` não diz nada a ninguém, e
 * "oxigenação" diz tudo. A ordem é a mesma em que a ponte pergunta.
 */
export const SYNC_LABEL: Record<SyncStep, string> = {
  heartRate: 'Batimentos do dia',
  hrv: 'Variabilidade cardíaca',
  stress: 'Estresse',
  spo2: 'Oxigenação',
  pressure: 'Pressão',
  steps: 'Passos',
  sleep: 'Sono da noite',
  memory: 'Noites guardadas na pulseira',
};

/** As grandezas da leitura do dia, na ordem — a lista que a tela mostra. */
export const SYNC_ORDER: SyncStep[] = ['heartRate', 'hrv', 'stress', 'spo2', 'pressure', 'steps'];

const MEASURE_LABEL: Record<MeasurableKind, string> = {
  oneKey: 'Medindo batimento, oxigênio e pressão…',
  oneKeyFull: 'Medindo tudo o que a pulseira aceitar…',
  hrv: 'Medindo variabilidade…',
  spo2: 'Medindo oxigênio…',
  bloodPressure: 'Medindo pressão…',
  stress: 'Medindo estresse…',
};

/**
 * A frase que preenche a espera — derivada do que o serviço está FAZENDO.
 *
 * Entre "conectou" e a primeira leitura existe até um minuto de trabalho real:
 * entrega ao SDK, varredura da memória, medições em série num sensor só. A
 * tela dizia "aguardando", que é indistinguível de travado — e travado é onde
 * a pessoa desiste. A frase certa custa o dado que o serviço já tinha.
 *
 * `busy` diz se há trabalho em andamento (a linha mostra o indicador) ou se a
 * espera é passiva (pulseira fora do pulso, por exemplo — indicador mentiria
 * progresso).
 */
export function useBandStatus(): { text: string | null; busy: boolean } {
  const connection = useBiometricStore((s) => s.connection);
  const reason = useBiometricStore((s) => s.connectionReason);
  const bandActivity = useBiometricStore((s) => s.bandActivity);
  const measuring = useBiometricStore((s) => s.measuring);
  const ultimaLeituraEm = useBiometricStore((s) => s.latest?.recordedAt ?? null);

  /*
   O relógio da paciência: "conectando" além de ~12 s quase sempre é alcance
   ou rádio, e a frase deve mudar de "aguarde" para "faça algo". O estado
   reinicia a contagem a cada transição — reconectar zera a paciência.
   */
  const [lenta, setLenta] = useState(false);
  useEffect(() => {
    setLenta(false);
    if (connection !== 'connecting') return;
    const timer = setTimeout(() => setLenta(true), CONNECTING_SLOW_MS);
    return () => clearTimeout(timer);
  }, [connection]);

  if (connection === 'connecting') {
    return lenta
      ? {
          text: 'A pulseira está demorando a responder, aproxime-a do celular.',
          busy: true,
        }
      : { text: 'Conectando à pulseira…', busy: true };
  }

  if (connection === 'error') {
    // O motivo vem do serviço quando ele sabe ("feche o app do fabricante…");
    // sem motivo, a frase genérica ainda diz o que fazer.
    return {
      text: reason ?? 'A conexão falhou. Tente reconectar.',
      busy: false,
    };
  }

  if (connection !== 'connected') return { text: null, busy: false };

  if (measuring) return { text: MEASURE_LABEL[measuring], busy: true };
  if (bandActivity?.kind === 'measure')
    return { text: MEASURE_LABEL[bandActivity.what], busy: true };
  if (bandActivity?.kind === 'sync') {
    // "Lendo a memória da pulseira…" durante quarenta segundos é a mesma frase
    // parada — e frase parada lê como travado. Nomear a grandeza que está
    // chegando transforma a mesma espera em progresso visível.
    const { step, done, total } = bandActivity;
    const sufixo = total > 1 ? ` · ${done} de ${total}` : '';
    return { text: `${SYNC_LABEL[step]}${sufixo}`, busy: true };
  }

  /*
   Com leitura chegando, a linha DIZ que está chegando. Ficava em "esperando a
   primeira leitura" para sempre quando o serviço não narra etapas (mock, GATT
   próprio) — mesmo com a Home já mostrando estresse e recuperação. Achado na
   rodada de testes de 22/08.
  */
  if (ultimaLeituraEm != null) {
    return { text: `Conectada, última leitura às ${horaLocal(ultimaLeituraEm)}.`, busy: false };
  }

  return {
    text: 'Conectada, esperando a primeira leitura do sensor.',
    busy: false,
  };
}

/** A linha de estado: indicador discreto + frase, alinhados à esquerda. */
export function BandStatusLine(props: React.ComponentProps<typeof XStack>) {
  const { colors } = useTheme();
  const { text, busy } = useBandStatus();
  if (!text) return null;

  return (
    <XStack
      alignItems="center"
      gap="$sm"
      accessibilityLiveRegion="polite"
      accessible
      accessibilityLabel={text}
      {...props}
    >
      {busy ? <ActivityIndicator size="small" color={colors.textMuted} /> : null}
      <Data flexShrink={1}>{text}</Data>
    </XStack>
  );
}

/**
 * O estado vazio das telas de métrica — no lugar do `children={null}`.
 *
 * O beco sem saída clássico: a pessoa abre Oxigênio antes da primeira leitura
 * e encontra uma tela com título e nada. O vazio certo diz de onde o número
 * vai vir, narra o que está acontecendo agora e, onde a medição sob demanda
 * existe, oferece o botão dela.
 */
export function EmptyMetric({ measure }: { measure?: MeasurableKind }) {
  const connection = useBiometricStore((s) => s.connection);

  return (
    <YStack>
      <Body maxWidth="92%">
        {connection === 'connected'
          ? 'Ainda não há medição desta métrica. Ela entra sozinha assim que a pulseira medir, mantenha-a firme no pulso.'
          : 'Sem medição ainda. Os números desta tela vêm da pulseira; conecte-a para começar.'}
      </Body>
      <BandStatusLine marginTop="$lg" />
      {measure && connection === 'connected' ? <MeasureButton kind={measure} /> : null}
    </YStack>
  );
}
