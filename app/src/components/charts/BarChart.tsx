import React from 'react';
import Svg, { Line, Rect, Text as SvgText } from 'react-native-svg';

import { GridPaper } from './GridPaper';
import { useTheme } from '../../theme/ThemeProvider';

export type Bar = {
  label: string;
  value: number;
  color?: string;
};

type Props = {
  bars: Bar[];
  width: number;
  height?: number;
  max?: number;
  /** Linha de referência horizontal — média, meta, limite. */
  reference?: { value: number; label?: string };
  /** Mostra o rótulo a cada N barras, para não poluir. */
  labelEvery?: number;
  id?: string;
};

/**
 * Série discreta por intervalo. Certo quando cada valor é um balde fechado —
 * stress por hora, passos por dia — e a comparação entre baldes é a leitura.
 * Barra fina, não bloco: a densidade da malha é a régua.
 */
export function BarChart({ bars, width, height = 140, max, reference, labelEvery = 3, id = 'bars' }: Props) {
  const { colors } = useTheme();
  const padBottom = 18;
  const plotH = height - padBottom;
  if (width <= 0 || bars.length === 0) return <Svg width={Math.max(width, 0)} height={height} />;

  /*
   `|| 1`: série toda em zero é dado legítimo — treino só com peso do corpo
   soma séries mas não volume — e `0 / 0` vira NaN, que não fica no JS: desce
   ao `<Rect>` nativo e derruba o app com CALayerInvalidGeometry. O mesmo vale
   para valor não finito vindo da API, por isso o `y()` também se defende.
  */
  const top = (max ?? Math.max(...bars.map((b) => b.value), reference?.value ?? 0) * 1.15) || 1;
  const slot = width / bars.length;
  const barWidth = Math.min(slot * 0.55, 14);
  const y = (v: number) => plotH - ((Number.isFinite(v) && v > 0 ? v : 0) / top) * plotH;

  return (
    <Svg width={width} height={height}>
      <GridPaper width={width} height={plotH} id={id} />

      {reference ? (
        <>
          <Line
            x1={0}
            y1={y(reference.value)}
            x2={width}
            y2={y(reference.value)}
            stroke={colors.textFaint}
            strokeWidth={1.75}
            strokeDasharray="3 3"
          />
          {reference.label ? (
            <SvgText x={width - 2} y={y(reference.value) - 5} fill={colors.textFaint} fontSize={9} textAnchor="end">
              {reference.label}
            </SvgText>
          ) : null}
        </>
      ) : null}

      {bars.map((bar, i) => {
        const barY = y(bar.value);
        return (
          <Rect
            key={bar.label + i}
            x={i * slot + slot / 2 - barWidth / 2}
            y={barY}
            width={barWidth}
            height={Math.max(1, plotH - barY)}
            fill={bar.color ?? colors.accent}
            rx={barWidth / 2}
          />
        );
      })}

      {bars.map((bar, i) =>
        i % labelEvery === 0 ? (
          <SvgText
            key={`l-${bar.label}-${i}`}
            x={i * slot + slot / 2}
            y={height - 4}
            fill={colors.textFaint}
            fontSize={9}
            textAnchor="middle"
          >
            {bar.label}
          </SvgText>
        ) : null,
      )}
    </Svg>
  );
}
