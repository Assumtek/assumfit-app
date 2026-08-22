import { Text } from '@tamagui/core';
import { YStack } from '@tamagui/stacks';
import { Data } from '../../components/ui';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, Vibration } from 'react-native';

import { Icon } from '../../components/Icon';
import { ble } from '../../services/ble';
import { useTheme } from '../../theme/ThemeProvider';

/**
 * O relógio de UMA série prescrita em segundos — no lugar do campo de reps.
 *
 * Prancha, isometria, "segure por 45 s": é força no plano, mas o que se
 * registra é tempo, não repetição (Bruno, 22/08). Segue as regras do relógio
 * de alongamento: alvo em epoch (a tela pode apagar), preparo de 3 s antes de
 * começar, e no fim vibram celular E pulseira. Ao zerar, a série é marcada
 * como concluída pelo chamador — e o descanso entre séries arma como sempre.
 */
export function SetTimer({
  seconds,
  label,
  onDone,
}: {
  seconds: number;
  label: string;
  onDone: () => void;
}) {
  const { colors } = useTheme();
  const [preparo, setPreparo] = useState<number | null>(null);
  const [restante, setRestante] = useState<number | null>(null);
  const alvo = useRef<number | null>(null);
  const terminou = useRef(false);

  useEffect(() => {
    if (preparo === null) return;
    if (preparo <= 0) {
      setPreparo(null);
      alvo.current = Date.now() + seconds * 1000;
      setRestante(seconds);
      return;
    }
    const id = setTimeout(() => setPreparo((p) => (p === null ? null : p - 1)), 1000);
    return () => clearTimeout(id);
  }, [preparo, seconds]);

  useEffect(() => {
    if (restante === null || alvo.current === null) return;
    const tique = () => {
      if (alvo.current === null) return;
      const faltam = Math.max(0, Math.ceil((alvo.current - Date.now()) / 1000));
      setRestante(faltam);
      if (faltam <= 0 && !terminou.current) {
        terminou.current = true;
        alvo.current = null;
        Vibration.vibrate([0, 200, 100, 200]);
        void ble.vibrate?.().catch(() => undefined);
        onDone();
      }
    };
    const id = setInterval(tique, 250);
    return () => clearInterval(id);
  }, [restante !== null, onDone]);

  const rodando = restante !== null;
  const texto =
    preparo !== null
      ? String(preparo)
      : rodando
        ? `${String(Math.floor(restante / 60)).padStart(2, '0')}:${String(restante % 60).padStart(2, '0')}`
        : `${seconds} s`;

  return (
    <YStack flex={1} gap="$xs">
      <Data color="$mutedForeground">
        {label}
      </Data>
      <Pressable
        onPress={() => {
          if (preparo !== null || rodando) return;
          setPreparo(3);
        }}
        accessibilityRole="button"
        accessibilityLabel={rodando ? 'Série em andamento' : 'Iniciar a série'}
      >
        <YStack
          backgroundColor="$card"
          borderRadius={12}
          borderWidth={1}
          borderColor={rodando || preparo !== null ? '$primary' : '$border'}
          minHeight={48}
          flexDirection="row"
          alignItems="center"
          justifyContent="center"
          gap="$xs"
        >
          {!rodando && preparo === null ? <Icon name="play" size={16} color={colors.accent} /> : null}
          <Text
            fontSize={18}
            fontWeight="600"
            fontVariant={['tabular-nums']}
            style={{ color: preparo !== null ? colors.textMuted : colors.text }}
          >
            {texto}
          </Text>
        </YStack>
      </Pressable>
    </YStack>
  );
}
