import { useNavigation } from '@react-navigation/native';
import { Text } from '@tamagui/core';
import { XStack, YStack } from '@tamagui/stacks';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Pressable } from 'react-native';

import { DetailScreen } from '../components/DetailScreen';
import { Icon } from '../components/Icon';
import { ProgressRing } from '../components/ProgressRing';
import { Body, Button, Data, Display, Label, Metric, MetricSm, Title } from '../components/ui';
import {
  advance,
  clock,
  pause,
  progress,
  PROTOCOLS,
  remaining,
  resume,
  skip,
  startSession,
  type FocusSession,
} from '../domain/focus';
import { energyState } from '../domain/energy';
import { shown } from '../domain/ratings';
import { recordFocusSession } from '../services/focus.service';
import { useBiometricStore } from '../store/biometric.store';
import { useHabitsStore } from '../store/habits.store';
import { useTheme } from '../theme/ThemeProvider';

/**
 * Sessão de foco.
 *
 * O que separa isto de um cronômetro qualquer é que o protocolo vem da
 * fisiologia (ver `domain/focus.ts`) e que a leitura do wearable continua
 * visível durante o bloco: a frequência cardíaca subindo dentro de uma sessão
 * de concentração é informação, não enfeite.
 *
 * O relógio na tela é redesenhado por um `setInterval`, mas ele NÃO é a fonte
 * do tempo — só provoca o re-render. O tempo sai do instante de término, então
 * um tique perdido em segundo plano não atrasa a sessão.
 */
export function FocusScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation();
  const latest = useBiometricStore((s) => s.latest);
  const sleep = useBiometricStore((s) => s.sleep);
  const addFocusSession = useHabitsStore((s) => s.addFocusSession);

  const [session, setSession] = useState<FocusSession | null>(null);
  const [now, setNow] = useState(() => Date.now());
  // Quantos blocos já foram contabilizados, para não registrar o mesmo duas
  // vezes quando o efeito roda de novo por outro motivo.
  const counted = useRef(0);

  const energy = latest ? energyState({ reading: latest, sleep, hour: new Date(now).getHours() }) : null;
  const level = energy?.level ?? 'mid';
  const protocol = session?.protocol ?? PROTOCOLS[level];

  // Um tique por segundo basta: o relógio mostra segundos inteiros, e um
  // intervalo mais curto só gastaria bateria redesenhando o mesmo texto.
  useEffect(() => {
    if (!session?.running) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [session?.running]);

  // Voltar do segundo plano corrige o relógio no MESMO quadro, sem esperar o
  // próximo tique — caso contrário a tela reaparece com o tempo congelado.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') setNow(Date.now());
    });
    return () => sub.remove();
  }, []);

  // Virada de fase. Fica separado do tique porque `advance` devolve a mesma
  // referência quando nada mudou — o `setState` só dispara na virada.
  useEffect(() => {
    setSession((current) => (current ? advance(current, now) : current));
  }, [now]);

  useEffect(() => {
    if (!session || session.completed <= counted.current) return;
    counted.current = session.completed;
    addFocusSession();
    void recordFocusSession({
      type: session.protocol.label,
      durationMin: session.protocol.focusMin,
      energyScoreAtStart: energy?.score ?? null,
    });
  }, [session, addFocusSession, energy?.score]);

  const begin = useCallback(() => {
    counted.current = 0;
    const stamp = Date.now();
    setNow(stamp);
    setSession(startSession(level, stamp));
  }, [level]);

  const left = session ? remaining(session, now) : protocol.focusMin * 60_000;
  const fraction = session ? progress(session, now) : 0;
  const phaseColor = session?.phase === 'break' ? colors.textMuted : colors.accent;

  return (
    <DetailScreen title="Sessão de foco">
      {!session ? (
        <>
          <Title>{protocol.label}</Title>
          <Body marginTop="$md" marginBottom="$xxl" maxWidth="92%">
            {protocol.rationale}
          </Body>

          <XStack gap="$xxxl" marginBottom="$xxl">
            <Spec value={`${protocol.focusMin}`} unit="min de foco" />
            <Spec value={`${protocol.breakMin}`} unit="min de pausa" />
            <Spec value={`${protocol.cycles}`} unit="blocos" />
          </XStack>

          <YStack alignSelf="flex-start" marginBottom="$xxxl">
            <Button
              title="Começar"
              onPress={begin}
              icon={<Icon name="play" size={16} color={colors.ink} />}
            />
          </YStack>

        </>
      ) : (
        <>
          <YStack alignItems="center" paddingVertical="$xl">
            <ProgressRing fraction={fraction} color={phaseColor} size={232} strokeWidth={2}>
              <YStack alignItems="center" gap="$sm">
                <Label marginBottom="$xs">
                  {session.phase === 'focus' ? 'foco' : session.phase === 'break' ? 'pausa' : 'concluído'}
                </Label>
                <Display fontSize={62} lineHeight={66} letterSpacing={-3}>
                  {clock(left)}
                </Display>
                <Data>
                  bloco {Math.min(session.cycle, protocol.cycles)} de {protocol.cycles}
                </Data>
              </YStack>
            </ProgressRing>
          </YStack>

          {/* O dado do corpo continua correndo durante a sessão — é ele que
              transforma o cronômetro em instrumento. */}
          {latest ? (
            <XStack
              justifyContent="space-between"
              paddingTop="$xxl"
              marginTop="$xl"
              borderTopWidth={1}
              borderTopColor="$border"
            >
              <Vital value={Math.round(latest.heartRate)} unit="bpm" label="Coração" />
              <Vital value={latest.hrvMs} unit="ms" label="HRV" />
              <Vital
                value={session.completed}
                unit={session.completed === 1 ? 'bloco' : 'blocos'}
                label="Concluídos"
              />
            </XStack>
          ) : null}

          {session.phase === 'done' ? (
            <Controls>
              <Control label="Nova sessão" onPress={begin} />
              <Control label="Voltar" onPress={() => navigation.goBack()} />
            </Controls>
          ) : (
            <Controls>
              <Control
                label={session.running ? 'Pausar' : 'Retomar'}
                onPress={() =>
                  setSession((s) => {
                    const stamp = Date.now();
                    setNow(stamp);
                    return s ? (s.running ? pause(s, stamp) : resume(s, stamp)) : s;
                  })
                }
              />
              <Control
                label={session.phase === 'break' ? 'Pular pausa' : 'Pular bloco'}
                onPress={() =>
                  setSession((s) => {
                    const stamp = Date.now();
                    setNow(stamp);
                    return s ? skip(s, stamp) : s;
                  })
                }
              />
              <Control label="Encerrar" onPress={() => setSession(null)} />
            </Controls>
          )}
        </>
      )}
    </DetailScreen>
  );
}

function Spec({ value, unit }: { value: string; unit: string }) {
  return (
    <YStack gap="$xs">
      <Metric fontSize={36} lineHeight={38} letterSpacing={-1.6}>
        {value}
      </Metric>
      <Data>{unit}</Data>
    </YStack>
  );
}

function Vital({ value, unit, label }: { value: number | null; unit: string; label: string }) {
  return (
    <YStack gap="$sm">
      <Label>{label}</Label>
      <XStack alignItems="baseline" gap="$xs">
        <MetricSm>{shown(value)}</MetricSm>
        <Data>{unit}</Data>
      </XStack>
    </YStack>
  );
}

function Controls({ children }: { children: React.ReactNode }) {
  return (
    <XStack flexWrap="wrap" gap="$xl" marginTop="$xxxl">
      {children}
    </XStack>
  );
}

function Control({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      style={({ pressed }) => [{ paddingVertical: 8 }, pressed && { opacity: 0.5 }]}
      onPress={onPress}
      accessibilityRole="button"
    >
      <Text fontSize={14} color="$foreground">
        {label}
      </Text>
    </Pressable>
  );
}
