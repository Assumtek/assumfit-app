import { styled } from '@tamagui/core';
import { XStack, YStack } from '@tamagui/stacks';
import React from 'react';
import { ActivityIndicator, Pressable, Switch } from 'react-native';

import { Icon, type IconName } from './Icon';

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
      <YStack flex={1} height={8} borderRadius={4} backgroundColor="$track" overflow="hidden">
        <YStack
          height={8}
          borderRadius={4}
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

/** Rótulo e valor de uma linha de propriedades (Perfil, Configurações, Pulseira). */
export const RowLabel = styled(Body, { flex: 1 });
export const RowValue = styled(Data, { fontSize: 14, color: '$foreground' });

/**
 * Linha de AÇÃO: ícone opcional, título, subtítulo e algo à direita, que por
 * padrão é a seta. Serve para navegar, disparar e também para listar uma
 * decisão sem ação (sem `onPress`, a linha é estática).
 *
 * Era desenhada à mão em 27 arquivos (Pressable + Row + Icon + YStack + seta),
 * e cada cópia escolhia o próprio espaçamento. Agora o espaçamento é um só.
 */
export function ActionRow({
  icon,
  leading,
  title,
  subtitle,
  right = 'chevron',
  busy = false,
  onPress,
  disabled,
  last = false,
  destructive = false,
}: {
  icon?: IconName;
  /** Elemento à esquerda quando não é um glifo do sistema (ícone de app, por exemplo). */
  leading?: React.ReactNode;
  title: string;
  subtitle?: string | null;
  right?: 'chevron' | 'none' | React.ReactNode;
  /** Troca o elemento da direita por um indicador de atividade. */
  busy?: boolean;
  onPress?: () => void;
  disabled?: boolean;
  last?: boolean;
  destructive?: boolean;
}) {
  const { colors } = useTheme();
  const direita = busy ? (
    <ActivityIndicator size="small" color={colors.accent} />
  ) : right === 'chevron' ? (
    <Icon name="arrowRight" size={16} color={colors.textMuted} />
  ) : right === 'none' ? null : (
    right
  );
  const conteudo = (
    <Row last={last}>
      {leading ?? (icon ? <Icon name={icon} size={16} color={destructive ? colors.alert : colors.text} /> : null)}
      <YStack flex={1} gap={4}>
        <Body color={destructive ? '$destructive' : '$foreground'}>{title}</Body>
        {subtitle ? <Data>{subtitle}</Data> : null}
      </YStack>
      {direita}
    </Row>
  );
  if (!onPress) return conteudo;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed }) => (pressed ? { opacity: 0.5 } : undefined)}
    >
      {conteudo}
    </Pressable>
  );
}

/** Linha com interruptor: título, subtítulo de estado e o `Switch` à direita. */
export function SwitchRow({
  icon,
  leading,
  title,
  subtitle,
  value,
  onValueChange,
  disabled,
  last = false,
}: {
  icon?: IconName;
  leading?: React.ReactNode;
  title: string;
  subtitle?: string | null;
  value: boolean;
  onValueChange: (v: boolean) => void;
  disabled?: boolean;
  last?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Row last={last}>
      {leading ?? (icon ? <Icon name={icon} size={16} color={colors.text} /> : null)}
      <YStack flex={1} gap={4} paddingRight="$md">
        <Body color="$foreground">{title}</Body>
        {subtitle ? <Data>{subtitle}</Data> : null}
      </YStack>
      <Switch value={value} onValueChange={onValueChange} trackColor={{ true: colors.accent }} disabled={disabled} />
    </Row>
  );
}
