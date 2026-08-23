import { XStack, YStack } from '@tamagui/stacks';
import { useChartWidth } from './useChartWidth';
import React, { useState } from 'react';

import { useTheme } from '../../theme/ThemeProvider';
import { Data } from '../ui';

export type MeterZone = {
  /** Limite superior da faixa, na mesma unidade do valor. */
  upTo: number;
  label: string;
};

type Props = {
  value: number;
  min?: number;
  max?: number;
  zones: MeterZone[];
  color?: string;
};

/**
 * Indicador linear com marcador — a régua de um instrumento.
 *
 * Existe porque barra de preenchimento e indicador dizem coisas diferentes, e
 * confundir os dois faz o app afirmar o que não quis. Preenchimento comunica
 * ACÚMULO: passos rumo à meta, água bebida no dia, algo que cresce e enche.
 * Energia não acumula — ela é uma POSIÇÃO numa escala que vai e volta ao longo
 * do dia. Marcador sobre régua com faixas nomeadas mostra onde o valor caiu e
 * quanto falta para mudar de faixa; barra cheia sugeriria que 100 é a meta.
 *
 * Os limites das faixas são os MESMOS que decidem o rótulo em `energy.ts`.
 * Se divergirem, a tela vai dizer "nível médio" com o marcador na faixa alta.
 */
export function Meter({ value, min = 0, max = 100, zones, color }: Props) {
  const { colors } = useTheme();
  color = color ?? colors.accent;
  const [width, onLayoutWidth] = useChartWidth();

  const clamped = Math.max(min, Math.min(max, value));
  const position = (clamped - min) / (max - min || 1);

  return (
    <YStack>
      <YStack
        height={8}
        borderRadius={4}
        backgroundColor="$track"
        justifyContent="center"
        onLayout={onLayoutWidth}
      >
        {/* Divisórias entre faixas. A última não desenha: é a borda da régua. */}
        {zones.slice(0, -1).map((zone) => (
          <YStack
            key={zone.label}
            position="absolute"
            top={0}
            bottom={0}
            width={1}
            opacity={0.9}
            backgroundColor="$background"
            left={`${((zone.upTo - min) / (max - min)) * 100}%`}
          />
        ))}

        {/* Trilho percorrido, discreto: dá a direção da leitura sem virar
            preenchimento — por isso opacidade baixa e não a cor cheia. */}
        <YStack
          position="absolute"
          left={0}
          top={0}
          bottom={0}
          borderRadius={4}
          width={`${position * 100}%`}
          opacity={0.28}
          style={{ backgroundColor: color }}
        />

        {width > 0 ? (
          <YStack
            position="absolute"
            top={-8}
            width={4}
            height={16}
            borderRadius={1.5}
            marginLeft={-1.5}
            left={position * width}
            style={{ backgroundColor: color }}
          />
        ) : null}
      </YStack>

      <XStack justifyContent="space-between" marginTop="$md">
        {zones.map((zone, i) => {
          const active = clamped <= zone.upTo && (i === 0 || clamped > zones[i - 1].upTo);
          // A faixa ativa se distingue por COR E PESO: só cor some para quem
          // não a separa, e o peso sobrevive ao modo de alto contraste.
          return (
            <Data
              key={zone.label}
              fontWeight={active ? '700' : '400'}
              color={active ? '$foreground' : '$faint'}
            >
              {zone.label}
            </Data>
          );
        })}
      </XStack>
    </YStack>
  );
}
