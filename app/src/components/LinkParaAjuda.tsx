import { XStack } from '@tamagui/stacks';
import { useNavigation } from '@react-navigation/native';
import React from 'react';
import { Pressable } from 'react-native';

import { Icon } from './Icon';
import { Data } from './ui';
import { useTheme } from '../theme/ThemeProvider';

/**
 * "Como isto é medido", da tela de métrica para a Ajuda.
 *
 * A regra do produto não mudou: o método mora na Ajuda, e a tela de métrica
 * carrega no máximo uma frase de abertura. O que faltava era o CAMINHO, e a
 * falta dele apareceu como pergunta: um testador olhou a tela de estresse e
 * perguntou "como é feita essa medição de uma forma mais didática?" (Leonardo,
 * 24/08/2026), sem saber que a resposta já estava escrita a duas telas dali.
 *
 * Discreto de propósito: é porta, não conteúdo.
 */
export function LinkParaAjuda({ rotulo = 'Como isto é medido' }: { rotulo?: string }) {
  const { colors } = useTheme();
  const navigation = useNavigation<any>();
  return (
    <Pressable
      onPress={() => navigation.push('Help')}
      accessibilityRole="button"
      accessibilityLabel={`${rotulo}, abrir a ajuda`}
      style={({ pressed }) => (pressed ? { opacity: 0.5 } : undefined)}
    >
      <XStack alignItems="center" gap="$sm" paddingVertical="$sm">
        <Icon name="help" size={14} color={colors.textMuted} strokeWidth={1.5} />
        <Data>{rotulo}</Data>
      </XStack>
    </Pressable>
  );
}
