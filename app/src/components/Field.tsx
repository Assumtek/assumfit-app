import { Text } from '@tamagui/core';
import { XStack, YStack } from '@tamagui/stacks';
import React from 'react';
import { Pressable, TextInput, TextInputProps } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';
import { Icon } from './Icon';
import { Body, Data, Label } from './ui';

type FieldProps = TextInputProps & {
  label: string;
  error?: string;
  hint?: string;
};

/**
 * Campo de texto. Sem caixa: rótulo, valor e a linha embaixo.
 *
 * Autocorreção e verificação ortográfica vêm DESLIGADAS por padrão. Num
 * formulário de credencial elas não ajudam e chegam a impedir o login: o iOS
 * capitaliza a primeira letra e "troca" domínios que julga errados, e o usuário
 * não tem como perceber, porque a senha aparece mascarada. Quem precisar de
 * autocorreção passa a prop explicitamente.
 */
export function Field({ label, error, hint, style, ...rest }: FieldProps) {
  const { colors } = useTheme();
  return (
    <YStack marginBottom="$xl" gap="$sm">
      <Label>{label}</Label>
      <TextInput
        placeholderTextColor={colors.textFaint}
        selectionColor={colors.accent}
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        {...rest}
        style={[
          {
            fontSize: 17,
            fontWeight: '400',
            color: colors.text,
            paddingVertical: 12,
            borderBottomWidth: 1,
            borderBottomColor: error ? colors.alert : colors.hairlineStrong,
          },
          style,
        ]}
      />
      {error ? <Data color="$destructive">{error}</Data> : hint ? <Data>{hint}</Data> : null}
    </YStack>
  );
}

/**
 * Consentimento.
 *
 * A LGPD exige manifestação **específica e destacada** para dado sensível
 * (Art. 11), então cada finalidade é uma escolha separada e nenhuma vem
 * pré-marcada. Aceitar tudo num único "li e concordo" não constitui
 * consentimento válido para biometria.
 */
export function Checkbox({
  checked,
  onToggle,
  title,
  body,
  required,
}: {
  checked: boolean;
  onToggle: () => void;
  title: string;
  body: string;
  required?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
    >
      <XStack gap="$lg" paddingVertical="$lg">
        <YStack
          width={20}
          height={20}
          borderRadius={4}
          borderWidth={checked ? 0 : 1}
          borderColor="$borderStrong"
          alignItems="center"
          justifyContent="center"
          marginTop={2}
          backgroundColor={checked ? '$primary' : 'transparent'}
        >
          {checked ? <Icon name="check" size={12} color={colors.ink} strokeWidth={2.5} /> : null}
        </YStack>
        <YStack flex={1} gap="$xs">
          <Text fontSize={14} color="$foreground">
            {title}
            {required ? (
              <Text fontSize={12} color="$faint">
                {' · obrigatório'}
              </Text>
            ) : null}
          </Text>
          <Body>{body}</Body>
        </YStack>
      </XStack>
    </Pressable>
  );
}
