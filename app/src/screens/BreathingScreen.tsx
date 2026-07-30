import { useNavigation } from '@react-navigation/native';
import { Text } from '@tamagui/core';
import { XStack, YStack } from '@tamagui/stacks';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '../components/Icon';
import { Body, Button, Data, Label } from '../components/ui';
import { useBiometricStore } from '../store/biometric.store';
import { useTheme } from '../theme/ThemeProvider';

/**
 * Respiração guiada — o destino do convite "seu ritmo está acelerado".
 *
 * Expiração mais longa que a inspiração (4 s dentro, 6 s fora), porque é a
 * expiração prolongada que ativa o parassimpático e baixa o batimento — a
 * respiração quadrada clássica acalma menos por minuto. Duas rodadas de um
 * minuto bastam para o efeito aparecer no próprio pulso.
 *
 * O batimento AO VIVO fica na tela de propósito: ver o número descer enquanto
 * respira é o que transforma o exercício de obrigação em evidência. Aqui o
 * valor pode aparecer — a tela está desbloqueada, na mão da pessoa; a regra de
 * não expor biometria é da TELA DE BLOQUEIO, não do app aberto.
 *
 * Sem promessa clínica em texto nenhum: é pausa de bem-estar, não tratamento.
 */

const INSPIRA_MS = 4000;
const EXPIRA_MS = 6000;
const DURACAO_TOTAL_MS = 2 * 60_000;

export function BreathingScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const latest = useBiometricStore((s) => s.latest);

  const [rodando, setRodando] = useState(false);
  const [fase, setFase] = useState<'inspira' | 'expira'>('inspira');
  const [restanteMs, setRestanteMs] = useState(DURACAO_TOTAL_MS);
  const escala = useRef(new Animated.Value(0.55)).current;
  const fim = useRef<number | null>(null);

  // O círculo cresce inspirando e encolhe expirando — o olho acompanha sem ler.
  useEffect(() => {
    if (!rodando) return;
    let vivo = true;

    const ciclo = () => {
      if (!vivo) return;
      setFase('inspira');
      Animated.timing(escala, {
        toValue: 1,
        duration: INSPIRA_MS,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (!finished || !vivo) return;
        setFase('expira');
        Animated.timing(escala, {
          toValue: 0.55,
          duration: EXPIRA_MS,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }).start(({ finished: f2 }) => {
          if (f2 && vivo) ciclo();
        });
      });
    };
    ciclo();
    return () => {
      vivo = false;
      escala.stopAnimation();
    };
  }, [rodando, escala]);

  // O relógio deriva de um alvo em epoch — a mesma regra de todos os timers
  // deste app: tela apagada no meio não perde tempo nenhum.
  useEffect(() => {
    if (!rodando) return;
    fim.current = Date.now() + restanteMs;
    const id = setInterval(() => {
      const falta = Math.max(0, (fim.current ?? 0) - Date.now());
      setRestanteMs(falta);
      if (falta <= 0) setRodando(false);
    }, 250);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rodando]);

  const terminado = restanteMs <= 0;
  const minutos = Math.floor(restanteMs / 60_000);
  const segundos = Math.ceil((restanteMs % 60_000) / 1000) % 60;

  return (
    <YStack flex={1} backgroundColor="$background" paddingTop={insets.top + 12}>
      <XStack alignItems="center" gap="$md" paddingHorizontal="$xl">
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={16}
          accessibilityRole="button"
          accessibilityLabel="Voltar"
        >
          <Icon name="back" size={20} color={colors.textMuted} />
        </Pressable>
        <YStack flex={1}>
          <Label>pausa</Label>
          <Text fontSize={20} fontWeight="700" color="$foreground" letterSpacing={-0.4}>
            Respiração guiada
          </Text>
        </YStack>
        {latest ? (
          <YStack alignItems="flex-end">
            <Text fontSize={22} fontWeight="300" color="$foreground" fontVariant={['tabular-nums']}>
              {Math.round(latest.heartRate)}
            </Text>
            <Data>bpm agora</Data>
          </YStack>
        ) : null}
      </XStack>

      <YStack flex={1} alignItems="center" justifyContent="center" gap="$xxl">
        <YStack width={260} height={260} alignItems="center" justifyContent="center">
          <Animated.View
            style={{
              width: 240,
              height: 240,
              borderRadius: 120,
              backgroundColor: 'rgba(135,123,240,0.16)',
              borderWidth: 1.5,
              borderColor: colors.accent,
              transform: [{ scale: escala }],
            }}
          />
          <YStack position="absolute" alignItems="center" gap="$xs">
            <Text fontSize={22} fontWeight="600" color="$foreground">
              {terminado ? 'Pronto' : rodando ? (fase === 'inspira' ? 'Inspire' : 'Solte devagar') : 'Quando quiser'}
            </Text>
            {rodando ? (
              <Data>
                {minutos}:{String(segundos).padStart(2, '0')}
              </Data>
            ) : null}
          </YStack>
        </YStack>

        <Body textAlign="center" maxWidth="80%">
          {terminado
            ? 'Duas rodadas completas. Repare no seu batimento — e repita quando precisar.'
            : 'Quatro segundos inspirando, seis soltando. É a expiração longa que desacelera o coração.'}
        </Body>
      </YStack>

      <YStack paddingHorizontal="$xl" paddingBottom={insets.bottom + 16} gap="$sm">
        {terminado ? (
          <Button title="Concluir" onPress={() => navigation.goBack()} />
        ) : (
          <Button
            title={rodando ? 'Pausar' : 'Começar'}
            icon={<Icon name={rodando ? 'pause' : 'play'} size={16} color={colors.ink} />}
            onPress={() => setRodando((r) => !r)}
          />
        )}
      </YStack>
    </YStack>
  );
}
