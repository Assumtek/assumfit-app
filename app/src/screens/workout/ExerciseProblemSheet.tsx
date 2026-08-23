import { XStack, YStack } from '@tamagui/stacks';
import React from 'react';
import { Pressable } from 'react-native';

import { ActionRow } from '../../components/List';
import { Icon, type IconName } from '../../components/Icon';
import { Body, Data, Label, SectionTitle } from '../../components/ui';
import { Sheet } from '../../components/ui/Dialog';
import type { MotivoDeTroca } from '../../domain/prescription';
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
  /** O que a folha de troca faz de diferente com este motivo. */
  motivo?: MotivoDeTroca;
};

const MOTIVOS: Motivo[] = [
  /*
   Os dois primeiros levam à MESMA folha de troca, e o motivo é o que muda o
   que ela mostra. O detalhe de cada linha PROMETIA isso ("outro equipamento",
   "versão mais simples") e a folha entregava a mesma lista nas duas — o
   motivo nunca chegava a ela (Bruno, 22/08: "direciona sempre pra mesma tela
   final"). Agora chega, e ordena os substitutos.
  */
  {
    icone: 'dumbbell',
    titulo: 'Aparelho ocupado ou indisponível',
    detalhe: 'Sugere quem trabalha o mesmo músculo com outro equipamento.',
    acao: 'trocar',
    motivo: 'equipamento',
  },
  {
    icone: 'help',
    titulo: 'Não sei executar',
    detalhe: 'Sugere a versão mais simples do mesmo movimento.',
    acao: 'trocar',
    motivo: 'execucao',
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
  onTrocar: (motivo: MotivoDeTroca) => void;
  onPular: () => void;
}) {
  const { colors } = useTheme();

  return (
    <Sheet open={open} onClose={onClose}>
      <>
        <XStack alignItems="flex-start" gap="$md">
          <YStack flex={1} gap={4}>
            <Label>sinalizar</Label>
            <SectionTitle>O que houve com este exercício?</SectionTitle>
          </YStack>
          <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Fechar">
            <Icon name="down" size={20} color={colors.textMuted} />
          </Pressable>
        </XStack>

        <YStack>
          {MOTIVOS.map((motivo, i) => (
            <ActionRow
              key={motivo.titulo}
              icon={motivo.icone}
              title={motivo.titulo}
              subtitle={motivo.detalhe}
              onPress={motivo.acao === 'trocar' ? () => onTrocar(motivo.motivo ?? 'equipamento') : onPular}
              last={i === MOTIVOS.length - 1}
            />
          ))}
        </YStack>

        <Data>Sinalizar não altera seu plano, vale para a sessão de hoje.</Data>
      </>
    </Sheet>
  );
}
