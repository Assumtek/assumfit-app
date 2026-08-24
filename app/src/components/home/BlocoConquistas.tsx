import { XStack, YStack } from '@tamagui/stacks';
import React, { useEffect, useState } from 'react';

import { Icon } from '../Icon';
import { Row, RowValue, Section } from '../List';
import { Body, Data, Skeleton } from '../ui';
import { achievementsFor, type Achievement } from '../../domain/achievements';
import { frescor } from '../../domain/ratings';
import * as api from '../../services/api.service';
import { useTheme } from '../../theme/ThemeProvider';

/**
 * As conquistas, fora da tela de fim de treino.
 *
 * Elas existiam e só apareciam no minuto seguinte a um treino terminar: quem
 * não treinou hoje nunca as via. Aqui ficam as três mais recentes, sem
 * medalha desenhada, porque a conquista é sobre esforço, e uma insígnia
 * dourada promete outra coisa.
 */
export function BlocoConquistas() {
  const { colors } = useTheme();
  const [conquistas, setConquistas] = useState<Achievement[] | null>(null);

  useEffect(() => {
    api
      .fetchExecutionHistory(365)
      .then((h) => setConquistas(achievementsFor(h, Date.now())))
      .catch(() => setConquistas([]));
  }, []);

  if (conquistas == null) return <Skeleton lines={2} />;
  if (conquistas.length === 0) return null;

  const tres = conquistas.slice(0, 3);
  return (
    <Section label="Conquistas">
      {tres.map((c, i) => (
        <Row key={c.key} last={i === tres.length - 1}>
          <XStack width={24} alignItems="center" justifyContent="center">
            <Icon name="check" size={18} color={colors.accent} strokeWidth={2} />
          </XStack>
          <YStack flex={1} gap={4}>
            <Body color="$foreground">{c.title}</Body>
            <Data>{c.detail}</Data>
          </YStack>
          {/*
            QUANDO foi. Sem isso, uma conquista antiga na home de hoje lê como
            "você treinou hoje", que foi exatamente o relato (Bruno, 23/08).
          */}
          <RowValue>{frescor(c.at ?? undefined, Date.now()) ?? '–'}</RowValue>
        </Row>
      ))}
    </Section>
  );
}
