import { XStack, YStack } from '@tamagui/stacks';
import React from 'react';

import { useTheme } from '../theme/ThemeProvider';
import { Body, Button, Data, Label, SectionTitle } from './ui';

/**
 * Agrupamento de conteúdo, separado por um fio.
 *
 * Não confundir com `components/ui/Card`: aquele é uma SUPERFÍCIE elevada, com
 * sombra e raio; este é uma SEÇÃO, que só separa. Os dois convivem porque
 * resolvem coisas diferentes — um card diz "isto é uma peça", uma seção diz
 * "daqui em diante é outro assunto". Usar card para tudo faz uma tela de
 * detalhe virar uma pilha de caixas.
 */
export function Section({
  title,
  label,
  children,
  divider = true,
}: {
  title?: string;
  label?: string;
  children?: React.ReactNode;
  divider?: boolean;
}) {
  return (
    <YStack
      paddingVertical="$xl"
      borderTopWidth={divider ? 1 : 0}
      borderTopColor="$border"
    >
      {label ? <Label marginBottom="$md">{label}</Label> : null}
      {title ? <SectionTitle marginBottom="$lg">{title}</SectionTitle> : null}
      {children}
    </YStack>
  );
}

/** Linha de lista, com divisória abaixo — exceto na última. */
export function Row({
  children,
  last = false,
  gap,
}: {
  children: React.ReactNode;
  last?: boolean;
  gap?: number;
}) {
  return (
    <YStack>
      {/*
        Distribui e SEPARA, e não é detalhe estético.

        Sem `justifyContent`, rótulo e valor ficavam encostados e o texto longo
        transbordava por cima do vizinho — era a sobreposição que aparecia no
        histórico e no ciclo. O `gap` mínimo garante que, mesmo quando os dois
        lados crescem, exista respiro entre eles em vez de colisão.

        Continua compatível com quem passa `flex: 1` no rótulo: aquele empurra o
        valor para a direita, este garante o intervalo.
      */}
      <XStack
        alignItems="center"
        justifyContent="space-between"
        paddingVertical="$lg"
        gap={gap ?? 12}
      >
        {children}
      </XStack>
      {!last ? <YStack height={1} backgroundColor="$border" /> : null}
    </YStack>
  );
}

/** Nota explicativa de fim de tela. Sem caixa, sem ícone — só texto contido. */
export function Note({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  /**
   * Saída para o estado descrito. Uma nota que pede uma providência sem
   * oferecer o caminho até ela é um beco: quem lê fica sabendo o que falta e
   * não tem como resolver.
   */
  action?: { label: string; onPress: () => void };
}) {
  return (
    <YStack paddingVertical="$xl" borderTopWidth={1} borderTopColor="$border">
      <Label marginBottom="$md">{title}</Label>
      <Body>{body}</Body>
      {action ? (
        <YStack alignSelf="flex-start" marginTop="$lg">
          <Button title={action.label} variant="secondary" size="md" onPress={action.onPress} />
        </YStack>
      ) : null}
    </YStack>
  );
}

/**
 * Linha de histórico: rótulo, régua fina proporcional, valor.
 * A régua é dataviz — por isso pode carregar o acento.
 */
export function HistoryRow({
  time,
  fraction,
  value,
  color,
  last = false,
}: {
  time: string;
  fraction: number;
  value: string;
  color?: string;
  last?: boolean;
}) {
  const { colors } = useTheme();
  color = color ?? colors.accent;
  return (
    <Row last={last} gap={16}>
      <Data width={64}>{time}</Data>
      <YStack flex={1} height={6} borderRadius={3} backgroundColor="$track" overflow="hidden">
        <YStack
          height={6}
          borderRadius={3}
          width={`${Math.max(0, Math.min(1, fraction)) * 100}%`}
          style={{ backgroundColor: color }}
        />
      </YStack>
      <Data minWidth={64} textAlign="right" color="$foreground">
        {value}
      </Data>
    </Row>
  );
}
