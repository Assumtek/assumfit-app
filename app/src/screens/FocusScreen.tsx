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
import {
  atualizarIlhaDeEsporte,
  encerrarIlhaDeEsporte,
  iniciarIlhaDeEsporte,
} from '../../modules/widgetbridge';
import { Row, Section } from '../components/Card';
import {
  fetchFocusSessions,
  recordFocusSession,
  type FocusHistoryItem,
} from '../services/focus.service';
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
  const [historico, setHistorico] = useState<FocusHistoryItem[]>([]);

  useEffect(() => {
    void fetchFocusSessions().then(setHistorico);
  }, []);
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
    const nova = startSession(level, stamp);
    setSession(nova);
    // O foco na ilha conta REGRESSIVO até o fim da fase — símbolo de cérebro,
    // não o corredor do esporte.
    iniciarIlhaDeEsporte(nova.protocol.label, stamp, {
      symbol: 'brain.head.profile',
      endsAtMs: stamp + remaining(nova, stamp),
    });
  }, [level]);

  /*
   A ilha acompanha a FASE, não o segundo: virou de foco para pausa (ou
   pausou/retomou), ela recebe o novo fim e o novo rótulo. Fora isso, o
   sistema conta sozinho.
  */
  useEffect(() => {
    if (!session) return;
    if (session.phase === 'done') {
      encerrarIlhaDeEsporte();
      void fetchFocusSessions().then(setHistorico);
      return;
    }
    const stamp = Date.now();
    const resta = remaining(session, stamp);
    atualizarIlhaDeEsporte({
      // Pausado, o congelado da ilha é o RESTANTE: início recuado por `resta`
      // faz o formatado (início→pausa) mostrar exatamente o que falta.
      startedAtMs: session.running ? stamp : stamp - resta,
      endsAtMs: session.running ? stamp + resta : null,
      pausedAtMs: session.running ? null : stamp,
      phase: session.phase === 'focus' ? 'FOCO' : 'PAUSA',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.phase, session?.running, session?.cycle]);

  // Encerrar a sessão (botão X) derruba a ilha junto.
  useEffect(() => {
    if (session === null) encerrarIlhaDeEsporte();
  }, [session]);

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

          {historico.length > 0 ? (
            <Section label="Últimas sessões">
              {historico.slice(0, 8).map((h, i) => (
                <Row key={`${h.endedAt}-${i}`} last={i === Math.min(historico.length, 8) - 1}>
                  <YStack flex={1} gap={2}>
                    <Body color="$foreground">{h.type}</Body>
                    <Data>{quandoFoco(h.endedAt)}</Data>
                  </YStack>
                  <YStack alignItems="flex-end" gap={2} flexShrink={0}>
                    <Data color="$foreground">{h.durationMin} min</Data>
                    {h.energyScoreAtStart != null ? (
                      <Data>energia {Math.round(h.energyScoreAtStart)} no início</Data>
                    ) : null}
                  </YStack>
                </Row>
              ))}
            </Section>
          ) : null}
        </>
      ) : (
        <>
          <YStack alignItems="center" paddingVertical="$xl">
            {/*
              A cara de pomodoro: anel GROSSO como mostrador, a fase num selo
              em caixa alta, e o tempo dominando o centro. A cor continua sendo
              a do sistema — o acento no foco, o neutro na pausa — porque o
              vermelho do tomate clássico aqui é a cor de "fora da faixa".
            */}
            <ProgressRing fraction={fraction} color={phaseColor} size={264} strokeWidth={12}>
              <YStack alignItems="center" gap="$sm">
                <YStack
                  paddingHorizontal={14}
                  paddingVertical={5}
                  borderRadius={999}
                  backgroundColor={session.phase === 'break' ? '$card' : '$primarySoft'}
                  borderWidth={1}
                  borderColor={session.phase === 'break' ? '$borderStrong' : '$primary'}
                >
                  <Label color={session.phase === 'break' ? '$mutedForeground' : '$primary'}>
                    {session.phase === 'focus' ? 'FOCO' : session.phase === 'break' ? 'PAUSA' : 'FIM'}
                  </Label>
                </YStack>
                <Display fontSize={64} lineHeight={70} letterSpacing={-3}>
                  {clock(left)}
                </Display>
                <Data>
                  bloco {Math.min(session.cycle, protocol.cycles)} de {protocol.cycles}
                </Data>
              </YStack>
            </ProgressRing>

            {/* Um ponto por bloco — o "quantos tomates faltam" do método. */}
            <XStack gap="$md" marginTop="$xl">
              {Array.from({ length: protocol.cycles }, (_, i) => {
                const feito = i < session.completed;
                const atual = i === Math.min(session.cycle, protocol.cycles) - 1 && session.phase !== 'done';
                return (
                  <YStack
                    key={i}
                    width={12}
                    height={12}
                    borderRadius={6}
                    backgroundColor={feito ? '$primary' : 'transparent'}
                    borderWidth={atual ? 2 : 1}
                    borderColor={feito || atual ? '$primary' : '$borderStrong'}
                  />
                );
              })}
            </XStack>
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
            /*
             Controles de TIMER, não links de texto: o do meio é o grande —
             pausa/retoma, que é o gesto repetido — e os dois dos lados são os
             raros. É a gramática de botões que todo pomodoro ensina.
            */
            <XStack justifyContent="center" alignItems="center" gap="$xxl" marginTop="$xxl">
              <BotaoRedondo
                icone="x"
                rotulo="Encerrar"
                onPress={() => setSession(null)}
                cor={colors.textMuted}
              />
              <Pressable
                onPress={() =>
                  setSession((s) => {
                    const stamp = Date.now();
                    setNow(stamp);
                    return s ? (s.running ? pause(s, stamp) : resume(s, stamp)) : s;
                  })
                }
                accessibilityRole="button"
                accessibilityLabel={session.running ? 'Pausar' : 'Retomar'}
                style={({ pressed }) => pressed && { opacity: 0.75 }}
              >
                <YStack
                  width={72}
                  height={72}
                  borderRadius={36}
                  backgroundColor="$primary"
                  alignItems="center"
                  justifyContent="center"
                >
                  <Icon name={session.running ? 'pause' : 'play'} size={26} color={colors.ink} />
                </YStack>
              </Pressable>
              <BotaoRedondo
                icone="skip"
                rotulo={session.phase === 'break' ? 'Pular pausa' : 'Pular bloco'}
                onPress={() =>
                  setSession((s) => {
                    const stamp = Date.now();
                    setNow(stamp);
                    return s ? skip(s, stamp) : s;
                  })
                }
                cor={colors.text}
              />
            </XStack>
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

function BotaoRedondo({
  icone,
  rotulo,
  onPress,
  cor,
}: {
  icone: 'x' | 'skip';
  rotulo: string;
  onPress: () => void;
  cor: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={rotulo}
      style={({ pressed }) => pressed && { opacity: 0.6 }}
    >
      <YStack
        width={52}
        height={52}
        borderRadius={26}
        borderWidth={1}
        borderColor="$borderStrong"
        alignItems="center"
        justifyContent="center"
      >
        <Icon name={icone} size={20} color={cor} />
      </YStack>
    </Pressable>
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

/** "hoje 14:20" ou "seg 09:10" — o suficiente para o histórico de foco. */
function quandoFoco(iso: string): string {
  const d = new Date(iso);
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === new Date().toDateString()) return `hoje ${hora}`;
  return `${d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')} ${hora}`;
}
