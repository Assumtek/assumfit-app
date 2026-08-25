import { XStack, YStack } from '@tamagui/stacks';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus, Vibration } from 'react-native';

import { Icon } from '../../components/Icon';
import { Body, Button, Data, Display, Label, Subtitle } from '../../components/ui';
import { useTheme } from '../../theme/ThemeProvider';
import { ble } from '../../services/ble';
import { avisoNoPulsoLigado } from '../../store/avisosNoPulso.store';
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
 *
 * ## Três pedidos de um testador (Bruno, 22/08)
 *
 * - **Três segundos antes de começar.** Tocar em "Iniciar" com a mão na tela e
 *   só depois assumir a posição comia os primeiros segundos do alongamento. O
 *   preparo conta 3-2-1 e só então arma o alvo. Vale para o primeiro início e
 *   para o segundo lado; "Retomar" de uma pausa não espera — a posição já está.
 * - **A pulseira vibra no fim**, e não só o celular — o celular está no chão.
 *   É o mesmo `vibrate` do fim do descanso.
 * - **Dois lados.** Alongamento unilateral roda o relógio uma vez por membro:
 *   quem decide quantos lados é `domain/exerciseSides.ts`, pelo texto do
 *   exercício; o segundo lado só começa por toque, porque há uma troca de
 *   posição no meio.
 */
export function TimedExercise({
  name,
  seconds,
  description,
  phase,
  lados = 1,
}: {
  name: string;
  seconds: number;
  description?: string | null;
  phase: PhaseType;
  /** 1 ou 2 — alongamento unilateral roda o relógio uma vez por lado. */
  lados?: 1 | 2;
}) {
  const { colors } = useTheme();
  const cor = PHASE_COLOR[phase];

  const [restante, setRestante] = useState(seconds);
  const [rodando, setRodando] = useState(false);
  const [concluido, setConcluido] = useState(false);
  /** 3, 2, 1 enquanto prepara; `null` fora do preparo. */
  const [preparo, setPreparo] = useState<number | null>(null);
  /** Em qual lado está (1 ou 2) e se o lado atual já cumpriu o tempo. */
  const [lado, setLado] = useState<1 | 2>(1);
  const [ladoCumprido, setLadoCumprido] = useState(false);

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
    setPreparo(null);
    setLado(1);
    setLadoCumprido(false);
  }, [seconds, name]);

  const terminar = useCallback(() => {
    setRodando(false);
    setRestante(0);
    alvo.current = null;
    sobra.current = 0;
    void cancelTimedEnd().catch(() => undefined);
    // Último lado conclui o exercício; antes disso, só o lado — e a tela
    // oferece o outro.
    if (lado >= lados) setConcluido(true);
    else setLadoCumprido(true);
    /*
     Vibra uma vez, e o `ref` é o que garante o "uma".

     O tique roda a cada 250 ms e o estado leva um render para chegar; sem a
     trava, o fim do tempo dispara três ou quatro vibrações seguidas. Celular
     E pulseira: o celular costuma estar no chão durante o alongamento. Falha
     muda na pulseira — ela pode estar carregando.
    */
    if (!vibrou.current) {
      Vibration.vibrate([0, 200, 100, 200]);
      // Só com os avisos no pulso ligados (tela do dispositivo).
      if (avisoNoPulsoLigado()) void ble.vibrate?.().catch(() => undefined);
      vibrou.current = true;
    }
  }, [lado, lados]);

  /*
   O preparo: 3, 2, 1 — e só então o alvo é armado. É um relógio à parte,
   curto e de tela acesa, então um intervalo de um segundo basta; o instante
   real do exercício continua vindo do alvo em epoch.
  */
  useEffect(() => {
    if (preparo === null) return;
    if (preparo <= 0) {
      setPreparo(null);
      alvo.current = Date.now() + sobra.current;
      setRodando(true);
      void scheduleTimedEnd(Math.round(sobra.current / 1000), name).catch(() => undefined);
      return;
    }
    const id = setTimeout(() => setPreparo((p) => (p === null ? null : p - 1)), 1000);
    return () => clearTimeout(id);
  }, [preparo, name]);

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
    if (concluido || preparo !== null) return;
    if (rodando) {
      sobra.current = Math.max(0, (alvo.current ?? Date.now()) - Date.now());
      alvo.current = null;
      setRodando(false);
      void cancelTimedEnd().catch(() => undefined);
      return;
    }
    // Primeiro início passa pelo preparo; retomar de uma pausa, não.
    if (restante === seconds) {
      setPreparo(3);
      return;
    }
    alvo.current = Date.now() + sobra.current;
    setRodando(true);
    // Avisa mesmo com a tela apagada — um alongamento de 60 s é exatamente o
    // tempo em que o celular se apaga sozinho.
    void scheduleTimedEnd(Math.round(sobra.current / 1000), name).catch(() => undefined);
  };

  /** O segundo lado: relógio zerado, preparo de novo, vibração liberada. */
  const outroLado = () => {
    sobra.current = seconds * 1000;
    vibrou.current = false;
    setRestante(seconds);
    setLadoCumprido(false);
    setLado(2);
    setPreparo(3);
  };

  return (
    <YStack alignItems="center" paddingTop="$xl" gap="$md">
      <Subtitle fontWeight="500" color="$foreground" textAlign="center">
        {name}
      </Subtitle>

      <Label>{lados === 2 ? `${formatarAlvo(seconds)} · cada lado` : formatarAlvo(seconds)}</Label>

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
      <Display
        fontWeight="200"
        letterSpacing={-2.5}
        marginTop="$xl"
        fontVariant={['tabular-nums']}
        style={{ color: concluido ? colors.textMuted : cor }}
      >
        {preparo !== null ? String(preparo) : formatarRelogio(restante)}
      </Display>
      {preparo !== null ? (
        <Data>prepare-se</Data>
      ) : lados === 2 && !concluido ? (
        <Data>{ladoCumprido ? 'primeiro lado cumprido' : `lado ${lado} de 2`}</Data>
      ) : null}

      {/* Só o controle do RELÓGIO: concluir, pular e finalizar moram no
          rodapé de ações da tela, o mesmo dos exercícios de série. */}
      <YStack width="100%" marginTop="$xl" gap="$sm">
        {ladoCumprido ? (
          <Button
            title="Outro lado"
            icon={<Icon name="swap" size={16} color={colors.ink} />}
            onPress={outroLado}
          />
        ) : !concluido ? (
          <Button
            title={
              preparo !== null
                ? 'Prepare-se…'
                : rodando
                  ? 'Pausar'
                  : restante === seconds
                    ? 'Iniciar'
                    : 'Retomar'
            }
            icon={<Icon name={rodando ? 'pause' : 'play'} size={16} color={colors.ink} />}
            onPress={alternar}
            disabled={preparo !== null}
          />
        ) : null}
      </YStack>

      {concluido ? (
        <XStack alignItems="center" gap="$xs" marginTop="$sm">
          <Icon name="check" size={16} color={colors.accent} />
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
