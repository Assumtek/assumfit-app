import React from 'react';
import Svg, { Circle, Rect, Text as SvgText } from 'react-native-svg';

import { GridPaper } from './GridPaper';
import { useTheme } from '../../theme/ThemeProvider';

export type Point = { x: number; y: number };

export type Zone = {
  label: string;
  xFrom: number;
  xTo: number;
  yFrom: number;
  yTo: number;
  abnormal?: boolean;
};

type Props = {
  points: Point[];
  /** Último ponto, destacado como leitura atual. */
  current?: Point;
  zones?: Zone[];
  width: number;
  height?: number;
  xDomain: [number, number];
  yDomain: [number, number];
  xLabel?: string;
  yLabel?: string;
  id?: string;
};

/**
 * Dispersão em duas dimensões. É o gráfico certo para pressão arterial porque
 * sistólica e diastólica **não são duas séries independentes** — é um par, e o
 * diagnóstico depende da combinação. Duas linhas lado a lado escondem
 * exatamente a informação que importa; o plano cartesiano com as zonas
 * desenhadas mostra em que região o par caiu.
 */
export function ScatterPlot({
  points,
  current,
  zones = [],
  width,
  height = 190,
  xDomain,
  yDomain,
  xLabel,
  yLabel,
  id = 'scatter',
}: Props) {
  const { colors } = useTheme();
  const padBottom = 18;
  const padLeft = 26;
  const plotW = width - padLeft;
  const plotH = height - padBottom;
  if (width <= 0) return <Svg width={Math.max(width, 0)} height={height} />;

  const sx = (v: number) => padLeft + ((v - xDomain[0]) / (xDomain[1] - xDomain[0])) * plotW;
  const sy = (v: number) => plotH - ((v - yDomain[0]) / (yDomain[1] - yDomain[0])) * plotH;

  return (
    <Svg width={width} height={height}>
      <GridPaper width={plotW} height={plotH} x={padLeft} id={id} />

      {zones.map((zone) => {
        const x = sx(zone.xFrom);
        const y = sy(zone.yTo);
        return (
          <Rect
            key={zone.label}
            x={x}
            y={y}
            width={Math.max(0, sx(zone.xTo) - x)}
            height={Math.max(0, sy(zone.yFrom) - y)}
            fill={zone.abnormal ? colors.alert : colors.accent}
            opacity={zone.abnormal ? 0.06 : 0.1}
          />
        );
      })}

      {points.map((p, i) => (
        <Circle key={i} cx={sx(p.x)} cy={sy(p.y)} r={5} fill={colors.accent} opacity={0.5} />
      ))}

      {current ? (
        <>
          <Circle cx={sx(current.x)} cy={sy(current.y)} r={15} fill={colors.accent} opacity={0.2} />
          <Circle cx={sx(current.x)} cy={sy(current.y)} r={7} fill={colors.accent} />
        </>
      ) : null}

      {yLabel ? (
        <SvgText x={0} y={10} fill={colors.textFaint} fontSize={9}>
          {yLabel}
        </SvgText>
      ) : null}
      {xLabel ? (
        <SvgText x={width - 2} y={height - 4} fill={colors.textFaint} fontSize={9} textAnchor="end">
          {xLabel}
        </SvgText>
      ) : null}
    </Svg>
  );
}
