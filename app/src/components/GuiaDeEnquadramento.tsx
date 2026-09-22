import { XStack, YStack } from '@tamagui/stacks';
import React from 'react';
import Svg, { Circle, Line, Rect } from 'react-native-svg';

import { File, Paths } from 'expo-file-system';

import { useTheme } from '../theme/ThemeProvider';
import { Body, Button, Data, Label } from './ui';
import { Sheet } from './ui/Dialog';

/**
 * Como enquadrar a foto do prato.
 *
 * Pedido de testador: um molde na câmera mostrando o enquadramento certo. A
 * câmera que o app abre é a NATIVA do iOS, e sobre ela não se desenha nada:
 * um molde de verdade exigiria câmera própria (`expo-camera`), que é
 * dependência nativa e tela nova.
 *
 * Isto entrega a intenção do pedido, que é a foto sair melhor, pelo caminho
 * que existe: ensinar ANTES de abrir a câmera. Aparece uma vez, na primeira
 * foto, e depois só quando a pessoa pede, porque um passo a mais antes de cada
 * refeição é atrito diário para ensinar o que já foi aprendido.
 *
 * As três orientações não são genéricas: saíram do que a análise erra. Prato
 * cortado faz o modelo estimar porção sobre o que não vê; foto de lado esconde
 * a profundidade, que é como ele julga quantidade; e sombra sobre a comida
 * muda a cor, que é metade do reconhecimento.
 */
export function GuiaDeEnquadramento({ aberto, onFechar }: { aberto: boolean; onFechar: () => void }) {
  const { colors } = useTheme();
  return (
    <Sheet open={aberto} onClose={onFechar}>
      <YStack gap="$md">
        <Label>como enquadrar</Label>

        <XStack justifyContent="center" paddingVertical="$md">
          <Svg width={180} height={140} viewBox="0 0 180 140">
            {/* O quadro da foto, e o prato inteiro dentro dele com folga. */}
            <Rect
              x={8}
              y={8}
              width={164}
              height={124}
              rx={12}
              fill="none"
              stroke={colors.hairlineStrong}
              strokeWidth={2}
            />
            <Circle cx={90} cy={70} r={44} fill="none" stroke={colors.accent} strokeWidth={2} />
            <Circle cx={90} cy={70} r={28} fill="none" stroke={colors.accent} strokeWidth={1.5} opacity={0.5} />
            {/* Os cantos, que é onde a folga se lê. */}
            {[
              [20, 20, 20, 38],
              [20, 20, 38, 20],
              [160, 120, 160, 102],
              [160, 120, 142, 120],
            ].map(([x1, y1, x2, y2], i) => (
              <Line
                key={i}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={colors.textMuted}
                strokeWidth={1.5}
              />
            ))}
          </Svg>
        </XStack>

        <YStack gap="$sm">
          <Body color="$foreground">O prato inteiro no quadro, com folga nas bordas.</Body>
          <Data>Prato cortado faz a estimativa de porção cair sobre o que a foto não mostra.</Data>
        </YStack>
        <YStack gap="$sm">
          <Body color="$foreground">De cima, olhando o prato de frente.</Body>
          <Data>De lado, a altura da comida some, e é por ela que a quantidade é julgada.</Data>
        </YStack>
        <YStack gap="$sm">
          <Body color="$foreground">Sem sombra sobre a comida.</Body>
          <Data>A cor é metade do reconhecimento: na sombra, arroz e purê ficam iguais.</Data>
        </YStack>

        <Button title="Entendi" onPress={onFechar} />
      </YStack>
    </Sheet>
  );
}


/**
 * O guia já foi visto?
 *
 * Em arquivo, e não em estado: a pergunta volta na próxima abertura do app, e
 * ensinar de novo quem já aprendeu é o atrito que o guia existe para evitar.
 * Na dúvida (arquivo ilegível), ensina: repetir uma vez é melhor que nunca
 * mostrar a quem precisava.
 */
const ARQUIVO_GUIA = 'guia-enquadramento.v1.json';

export function jaViuOGuia(): boolean {
  try {
    return new File(Paths.document, ARQUIVO_GUIA).exists;
  } catch {
    return false;
  }
}

export function marcarGuiaVisto(): void {
  try {
    new File(Paths.document, ARQUIVO_GUIA).write(JSON.stringify({ em: Date.now() }));
  } catch {
    // Sem o registro, o pior caso é o guia aparecer de novo na próxima foto.
  }
}
