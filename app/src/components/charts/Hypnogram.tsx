import React from 'react';
import Svg, { Rect, Text as SvgText } from 'react-native-svg';

import type { SleepPhase, SleepSegment } from '../../domain/types';
import { GridPaper } from './GridPaper';
import { useTheme } from '../../theme/ThemeProvider';

type Props = {
  segments: SleepSegment[];
  width: number;
  height?: number;
  id?: string;
};

/** Ordem vertical do hipnograma: acordado em cima, profundo embaixo. */
const LANES: { phase: SleepPhase; label: string; opacity: number }[] = [
  { phase: 'awake', label: 'Acordado', opacity: 0.2 },
  { phase: 'rem', label: 'REM', opacity: 0.62 },
  { phase: 'light', label: 'Leve', opacity: 0.4 },
  { phase: 'deep', label: 'Profundo', opacity: 1 },
];

/**
 * Hipnograma — o gráfico canônico de sono, e o único que mostra o que importa
 * de verdade: a ARQUITETURA da noite. Totais em percentual escondem se o sono
 * profundo veio concentrado nos primeiros ciclos (fisiológico) ou espalhado
 * (fragmentado), e escondem quantas vezes a pessoa acordou.
 */
export function Hypnogram({ segments, width, height = 150, id = 'hypno' }: Props) {
  const { colors } = useTheme();
  const padBottom = 18;
  const padLeft = 58;
  const plotW = width - padLeft;
  const plotH = height - padBottom;
  if (width <= 0 || segments.length === 0) return <Svg width={Math.max(width, 0)} height={height} />;

  // `|| 1`: segmentos todos com 0 min fariam 0/0 → NaN, e NaN em geometria de
  // SVG é crash NATIVO (CALayerInvalidGeometry), não erro de JS.
  const total = segments.reduce((sum, s) => sum + s.minutes, 0) || 1;
  const laneH = plotH / LANES.length;

  let cursor = 0;
  const blocks = segments.map((segment, i) => {
    const x = padLeft + (cursor / total) * plotW;
    const w = Math.max(1, (segment.minutes / total) * plotW);
    cursor += segment.minutes;
    const laneIndex = LANES.findIndex((l) => l.phase === segment.phase);
    return { key: `${segment.phase}-${i}`, x, w, laneIndex, phase: segment.phase };
  });

  const hours = Math.round(total / 60);

  return (
    <Svg width={width} height={height}>
      <GridPaper width={plotW} height={plotH} x={padLeft} id={id} />

      {LANES.map((lane, i) => (
        <SvgText
          key={lane.phase}
          x={0}
          y={i * laneH + laneH / 2 + 3}
          fill={colors.textFaint}
          fontSize={9}
          textAnchor="start"
        >
          {lane.label}
        </SvgText>
      ))}

      {blocks.map((block) => {
        const lane = LANES[block.laneIndex];
        return (
          <Rect
            key={block.key}
            x={block.x}
            y={block.laneIndex * laneH + laneH / 2 - 5.5}
            width={block.w}
            height={11}
            rx={5.5}
            fill={colors.accent}
            opacity={lane.opacity}
          />
        );
      })}

      <SvgText x={padLeft} y={height - 4} fill={colors.textFaint} fontSize={9}>
        adormeceu
      </SvgText>
      <SvgText x={width - 2} y={height - 4} fill={colors.textFaint} fontSize={9} textAnchor="end">
        {hours}h depois
      </SvgText>
    </Svg>
  );
}
