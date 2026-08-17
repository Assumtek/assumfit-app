import { Text } from '@tamagui/core';
import { XStack, YStack } from '@tamagui/stacks';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus, Vibration } from 'react-native';

import { Icon } from '../../components/Icon';
import { Body, Button, Data, Label } from '../../components/ui';
import { useTheme } from '../../theme/ThemeProvider';
import { cancelTimedEnd, scheduleTimedEnd } from '../../services/notifications.service';
import { PHASE_COLOR, type PhaseType } from './PhaseBar';

/**
 * Exercício medido em TEMPO, não em séries.
 *
 * Alongamento e mobilidade não têm carga nem repetição para registrar — têm uma
 * duração a cumprir. Mostrá-los com o cartão de séries obriga a inventar campos
 * ("peso: 0, reps: 0"), que é o que a tela fazia e o que fazia o alongamento
 * parecer um exercício de força mal preenchido.
 *
 * ## O relógio é um ALVO em epoch, não um contador
 *
 * Três coisas dependem disso, e nenhuma é exceção:
 *
 * 1. a tela apaga durante um alongamento de 60 segundos — é o caso normal;
 * 2. o app vai para segundo plano quando alguém troca de música;
 * 3. voltar recalcula em vez de retomar de onde parou.
 *
 * Um `setInterval` que decrementa perde tempo em todos os três, e o erro é
 * sempre para menos: o alongamento termina antes da hora e ninguém percebe.
 */
export function TimedExercise({
  name,
  seconds,
  description,
  phase,
}: {
  name: string;
  seconds: number;
  description?: string | null;
  phase: PhaseType;
}) {
  const { colors } = useTheme();
  const cor = PHASE_COLOR[phase];

  const [restante, setRestante] = useState(seconds);
  const [rodando, setRodando] = useState(false);
  const [concluido, setConcluido] = useState(false);

  /** Instante-alvo enquanto roda. `null` quando parado. */
  const alvo = useRef<number | null>(null);
  /** O que sobrava quando pausou — é daqui que o retomar parte. */
  const sobra = useRef(seconds * 1000);
  const vibrou = useRef(false);
  const appState = useRef(AppState.currentState);

  // Trocar de exercício zera tudo. Sem isto, o alongamento seguinte herda o
  // relógio do anterior e começa já terminado.
  useEffect(() => {
    alvo.current = null;
    sobra.current = seconds * 1000;
    vibrou.current = false;
    setRestante(seconds);
    setRodando(false);
    setConcluido(false);
  }, [seconds, name]);

  const terminar = useCallback(() => {
    setRodando(false);
    setConcluido(true);
    setRestante(0);
    alvo.current = null;
    sobra.current = 0;
    void cancelTimedEnd().catch(() => undefined);
    /*
     Vibra uma vez, e o `ref` é o que garante o "uma".

     O tique roda a cada 250 ms e o estado leva um render para chegar; sem a
     trava, o fim do tempo dispara três ou quatro vibrações seguidas.
    */
    if (!vibrou.current) {
      Vibration.vibrate([0, 200, 100, 200]);
      vibrou.current = true;
    }
  }, []);

  useEffect(() => {
    if (!rodando) return;
    const tique = () => {
      if (alvo.current === null) return;
      const faltam = Math.max(0, Math.ceil((alvo.current - Date.now()) / 1000));
      setRestante(faltam);
      if (faltam <= 0) terminar();
    };
    tique();
    // 250 ms e não 1000: com um segundo cheio, o número muda até um segundo
    // depois do instante real e o fim parece atrasado.
    const id = setInterval(tique, 250);
    return () => clearInterval(id);
  }, [rodando, terminar]);

  // Voltar do segundo plano recalcula na hora, sem esperar o próximo tique.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (proximo: AppStateStatus) => {
      if (appState.current.match(/inactive|background/) && proximo === 'active' && alvo.current) {
        const faltam = Math.max(0, Math.ceil((alvo.current - Date.now()) / 1000));
        setRestante(faltam);
        if (faltam <= 0) terminar();
      }
      appState.current = proximo;
    });
    return () => sub.remove();
  }, [terminar]);

  const alternar = () => {
    if (concluido) return;
    if (rodando) {
      sobra.current = Math.max(0, (alvo.current ?? Date.now()) - Date.now());
      alvo.current = null;
      setRodando(false);
      void cancelTimedEnd().catch(() => undefined);
      return;
    }
    alvo.current = Date.now() + sobra.current;
    setRodando(true);
    // Avisa mesmo com a tela apagada — um alongamento de 60 s é exatamente o
    // tempo em que o celular se apaga sozinho.
    void scheduleTimedEnd(Math.round(sobra.current / 1000), name).catch(() => undefined);
  };

  return (
    <YStack alignItems="center" paddingTop="$xl" gap="$md">
      <Text fontSize={20} fontWeight="500" color="$foreground" textAlign="center">
        {name}
      </Text>

      <Label>{formatarAlvo(seconds)}</Label>

      {description ? (
        <Body textAlign="center" marginTop="$sm" maxWidth="92%">
          {description}
        </Body>
      ) : null}

      {/*
        O relógio carrega a cor da FASE, não o acento do app.

        É a mesma cor da régua de fases no topo, e é ela que diz de relance que
        este bloco é alongamento e não treino. Cor calculada vai em `style` —
        `color` de token só aceita nome de token.
      */}
      <Text
        fontSize={64}
        fontWeight="200"
        letterSpacing={-2.5}
        marginTop="$xl"
        fontVariant={['tabular-nums']}
        style={{ color: concluido ? colors.textMuted : cor }}
      >
        {formatarRelogio(restante)}
      </Text>

      {/* Só o controle do RELÓGIO: concluir, pular e finalizar moram no
          rodapé de ações da tela, o mesmo dos exercícios de série. */}
      <YStack width="100%" marginTop="$xl" gap="$sm">
        {!concluido ? (
          <Button
            title={rodando ? 'Pausar' : restante === seconds ? 'Iniciar' : 'Retomar'}
            icon={<Icon name={rodando ? 'pause' : 'play'} size={16} color={colors.ink} />}
            onPress={alternar}
          />
        ) : null}
      </YStack>

      {concluido ? (
        <XStack alignItems="center" gap="$xs" marginTop="$sm">
          <Icon name="check" size={13} color={colors.accent} />
          <Data color="$primary">tempo cumprido</Data>
        </XStack>
      ) : null}
    </YStack>
  );
}

/** `90` → `01:30`. Largura fixa para o número não tremer a cada segundo. */
function formatarRelogio(segundos: number): string {
  const s = Math.max(0, segundos);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** O alvo em linguagem humana, como sub-rótulo — nunca o número cru sozinho. */
function formatarAlvo(segundos: number): string {
  if (segundos % 60 === 0) {
    const min = segundos / 60;
    return `${min} ${min === 1 ? 'minuto' : 'minutos'}`;
  }
  return `${segundos} segundos`;
}
