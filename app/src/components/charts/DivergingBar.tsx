import React from 'react';
import Svg, { Line, Rect, Text as SvgText } from 'react-native-svg';

import { GridPaper } from './GridPaper';
import { useTheme } from '../../theme/ThemeProvider';

export type DivergingItem = {
  label: string;
  /** Negativo puxa para a esquerda (rejuvenesce), positivo para a direita. */
  value: number;
  display: string;
};

type Props = {
  items: DivergingItem[];
  width: number;
  rowHeight?: number;
  id?: string;
};

/**
 * Barras divergentes a partir de um eixo central.
 *
 * É a forma certa para a idade biológica porque o cálculo é literalmente uma
 * soma de desvios com sinal: cada fator empurra a idade para baixo ou para
 * cima. Barra empilhada ou pizza perderiam o sinal, que é a informação inteira.
 * O comprimento é o peso em anos; o lado é a direção.
 */
export function DivergingBar({ items, width, rowHeight = 40, id = 'diverge' }: Props) {
  const { colors } = useTheme();
  const padLeft = 108;
  const padRight = 52;
  const plotW = width - padLeft - padRight;
  const height = items.length * rowHeight + 16;
  if (width <= 0 || items.length === 0) return <Svg width={Math.max(width, 0)} height={height} />;

  const maxAbs = Math.max(...items.map((i) => Math.abs(i.value)), 0.5);
  const center = padLeft + plotW / 2;
  const scale = (v: number) => (Math.abs(v) / maxAbs) * (plotW / 2);

  return (
    <Svg width={width} height={height}>
      <GridPaper width={plotW} height={height - 16} x={padLeft} id={id} />

      {/* Eixo zero: a idade cronológica. */}
      <Line x1={center} y1={0} x2={center} y2={height - 16} stroke={colors.hairlineStrong} strokeWidth={1.5} />

      {items.map((item, i) => {
        const y = i * rowHeight + rowHeight / 2;
        const w = scale(item.value);
        const rejuvenates = item.value <= 0;
        return (
          <React.Fragment key={item.label}>
            <SvgText x={0} y={y + 3} fill={colors.text} fontSize={11}>
              {item.label}
            </SvgText>
            <Rect
              x={rejuvenates ? center - w : center}
              y={y - 6.5}
              width={Math.max(4, w)}
              height={13}
              rx={6.5}
              fill={rejuvenates ? colors.accent : colors.alert}
            />
            <SvgText
              x={width - 2}
              y={y + 3}
              fill={rejuvenates ? colors.text : colors.alert}
              fontSize={11}
              textAnchor="end"
            >
              {item.display}
            </SvgText>
          </React.Fragment>
        );
      })}

      <SvgText x={center - 4} y={height - 2} fill={colors.textFaint} fontSize={9} textAnchor="end">
        rejuvenesce
      </SvgText>
      <SvgText x={center + 4} y={height - 2} fill={colors.textFaint} fontSize={9}>
        envelhece
      </SvgText>
    </Svg>
  );
}
