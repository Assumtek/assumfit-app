import { XStack, YStack } from '@tamagui/stacks';
import React from 'react';
import { Pressable } from 'react-native';

import { Icon, type IconName } from '../../components/Icon';
import { Body, Data, Label, SectionTitle } from '../../components/ui';
import { Sheet } from '../../components/ui/Dialog';
import { useTheme } from '../../theme/ThemeProvider';

/**
 * "Sinalizar problema" — o que fazer quando o exercício não dá para executar.
 *
 * Existe porque a alternativa é a pessoa simplesmente pular sem dizer nada, e
 * aí o plano nunca aprende. Cada motivo leva a uma saída diferente:
 *
 * - **máquina ocupada** troca por equivalente, local à sessão;
 * - **dor ou desconforto** pula, e não troca — insistir numa variação do mesmo
 *   movimento é exatamente o que não se deve sugerir a quem sentiu dor;
 * - **não sei executar** troca por um equivalente, que costuma ser mais simples.
 *
 * A separação entre dor e os outros dois não é detalhe de interface: é a única
 * decisão clínica desta tela, e ela é conservadora de propósito.
 */

type Motivo = {
  icone: IconName;
  titulo: string;
  detalhe: string;
  acao: 'trocar' | 'pular';
};

const MOTIVOS: Motivo[] = [
  {
    icone: 'dumbbell',
    titulo: 'Aparelho ocupado ou indisponível',
    detalhe: 'Troca por um equivalente, só para hoje.',
    acao: 'trocar',
  },
  {
    icone: 'help',
    titulo: 'Não sei executar',
    detalhe: 'Troca por uma alternativa mais direta.',
    acao: 'trocar',
  },
  {
    icone: 'flag',
    titulo: 'Senti dor ou desconforto',
    detalhe: 'Pula o exercício. Não sugerimos variação do mesmo movimento.',
    acao: 'pular',
  },
];

export function ExerciseProblemSheet({
  open,
  onClose,
  onTrocar,
  onPular,
}: {
  open: boolean;
  onClose: () => void;
  onTrocar: () => void;
  onPular: () => void;
}) {
  const { colors } = useTheme();

  return (
    <Sheet open={open} onClose={onClose}>
      <>
        <XStack alignItems="flex-start" gap="$md">
          <YStack flex={1} gap={2}>
            <Label>sinalizar</Label>
            <SectionTitle>O que houve com este exercício?</SectionTitle>
          </YStack>
          <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Fechar">
            <Icon name="down" size={18} color={colors.textMuted} />
          </Pressable>
        </XStack>

        <YStack>
          {MOTIVOS.map((motivo, i) => (
            <Pressable
              key={motivo.titulo}
              onPress={motivo.acao === 'trocar' ? onTrocar : onPular}
              accessibilityRole="button"
              style={({ pressed }) => (pressed ? { opacity: 0.5 } : undefined)}
            >
              <XStack
                alignItems="center"
                gap="$md"
                paddingVertical="$lg"
                borderBottomWidth={i === MOTIVOS.length - 1 ? 0 : 1}
                borderBottomColor="$border"
              >
                <Icon name={motivo.icone} size={18} color={colors.textMuted} />
                <YStack flex={1} gap={2}>
                  <Body color="$foreground">{motivo.titulo}</Body>
                  <Data>{motivo.detalhe}</Data>
                </YStack>
                <Icon name="arrowRight" size={14} color={colors.textMuted} />
              </XStack>
            </Pressable>
          ))}
        </YStack>

        <Data>Sinalizar não altera seu plano — vale para a sessão de hoje.</Data>
      </>
    </Sheet>
  );
}
