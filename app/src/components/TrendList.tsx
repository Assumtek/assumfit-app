import { XStack, YStack } from '@tamagui/stacks';
import React from 'react';

import { Icon } from './Icon';
import { Row, RowValue, Section } from './List';
import { Body, Data } from './ui';
import type { LinhaDeTendencia } from '../domain/trend';
import { useTheme } from '../theme/ThemeProvider';

/**
 * As tendências, uma por linha.
 *
 * A seta segue a regra dos indicadores do dia: verde quando a mudança foi no
 * sentido que a métrica melhora, vermelha quando foi no outro. Estável recebe
 * um traço horizontal, não uma seta apagada, porque "não mudou" é resposta,
 * não ausência de resposta.
 *
 * Métrica que ainda não tem série suficiente aparece assim mesmo, com o que
 * falta: esconder daria a impressão de que o app não mede aquilo.
 */
export function TrendList({
  linhas,
  label = 'Tendências',
}: {
  linhas: LinhaDeTendencia[];
  label?: string;
}) {
  const { colors } = useTheme();
  if (linhas.length === 0) return null;
  return (
    <Section label={label}>
      {linhas.map((l, i) => {
        const cor =
          l.estado === 'acumulando'
            ? colors.textMuted
            : l.bom == null
              ? colors.textMuted
              : l.bom
                ? colors.good
                : colors.alert;
        const icone =
          l.estado === 'sobe' ? 'arrowUp' : l.estado === 'desce' ? 'arrowDown' : 'minus';
        return (
          <Row key={l.chave} last={i === linhas.length - 1}>
            <XStack width={24} alignItems="center" justifyContent="center">
              <Icon name={icone} size={20} color={cor} strokeWidth={2.4} />
            </XStack>
            <YStack flex={1} gap={4}>
              <Body color="$foreground">{l.rotulo}</Body>
              <Data>{l.frase}</Data>
            </YStack>
            <RowValue>{l.valor}</RowValue>
          </Row>
        );
      })}
    </Section>
  );
}
