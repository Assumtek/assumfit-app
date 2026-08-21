import { XStack, YStack } from '@tamagui/stacks';
import React from 'react';
import { TextInput } from 'react-native';

import { Data } from './ui';
import { useTheme } from '../theme/ThemeProvider';

/**
 * O campo "ou digite" ao lado da roda de horas.
 *
 * A roda anda de 10 em 10 minutos; quem quer 07:55 não tinha como. Este campo
 * aceita o que `domain/horario.ts::normalizarHorario` entende — "7:55",
 * "0755", "19h30" — e quem decide se vale é o domínio, não a tela. Enquanto o
 * texto não é uma hora, a borda fica neutra e o botão continua usando a roda;
 * virou hora válida, o acento confirma e o botão passa a usar o digitado.
 */
export function HoraDigitada({
  valor,
  onChange,
  valido,
}: {
  valor: string;
  onChange: (texto: string) => void;
  valido: boolean;
}) {
  const { colors } = useTheme();
  return (
    <YStack marginTop="$lg" gap="$xs">
      <Data>Ou digite o horário</Data>
      <XStack alignItems="center" gap="$sm">
        <TextInput
          value={valor}
          onChangeText={onChange}
          placeholder="07:55"
          placeholderTextColor={colors.textMuted}
          keyboardType="numbers-and-punctuation"
          maxLength={5}
          accessibilityLabel="Horário digitado, no formato horas e minutos"
          style={{
            flex: 1,
            fontSize: 22,
            fontWeight: '300',
            color: colors.text,
            paddingVertical: 10,
            paddingHorizontal: 12,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: valido ? colors.accent : colors.hairline,
            backgroundColor: colors.ink2,
          }}
        />
      </XStack>
      {valor.length > 0 && !valido ? <Data>Use horas e minutos, como 07:55 ou 19h30.</Data> : null}
    </YStack>
  );
}
