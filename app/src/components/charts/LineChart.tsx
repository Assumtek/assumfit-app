import React, { useMemo } from 'react';
import Svg, { Circle, Defs, LinearGradient, Line, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';

import { GridPaper } from './GridPaper';
import { useTheme } from '../../theme/ThemeProvider';

export type Threshold = {
  value: number;
  label?: string;
  color?: string;
  /** Tracejada por padrão — limite de referência, não dado medido. */
  dashed?: boolean;
};

export type Band = {
  from: number;
  to: number;
  label?: string;
};

type Props = {
  data: number[];
  width: number;
  height?: number;
  color?: string;
  /** Preenche a área sob a linha. */
  area?: boolean;
  /** Linhas horizontais de referência clínica. */
  thresholds?: Threshold[];
  /** Faixa saudável sombreada ao fundo. */
  band?: Band;
  /** Força o domínio vertical em vez de derivar dos dados. */
  domain?: [number, number];
  /** Marca o último ponto — usado quando o dado é ao vivo. */
  markLast?: boolean;
  /** Rótulos do eixo X, distribuídos uniformemente. */
  xLabels?: string[];
  id?: string;
};

/**
 * Série temporal contínua. É o gráfico certo quando a métrica é amostrada ao
 * longo do tempo e a leitura que interessa é a tendência — HRV, SpO₂ noturno,
 * curva circadiana de temperatura.
 *
 * O TRAÇO É FINO DE PROPÓSITO, e é exceção deliberada ao resto do kit, onde
 * anéis, arcos e barras são grossos. Uma série de ~90 pontos com linha grossa
 * empasta os picos e vales — some justamente a variação, que aqui é o dado.
 * Linha fina é a convenção de registro de instrumento: eletrocardiograma,
 * sismógrafo, papel milimetrado. Não uniformizar com o resto.
 */
export function LineChart({
  data,
  width,
  height = 140,
  color,
  area = true,
  thresholds = [],
  band,
  domain,
  markLast = false,
  xLabels,
  id = 'line',
}: Props) {
  const { colors } = useTheme();
  color = color ?? colors.accent;
  const padBottom = xLabels ? 18 : 0;
  const plotH = height - padBottom;

  const geom = useMemo(() => {
    if (data.length < 2 || width <= 0) return null;

    const values = [...data, ...thresholds.map((t) => t.value)];
    if (band) values.push(band.from, band.to);
    const rawMin = domain ? domain[0] : Math.min(...values);
    const rawMax = domain ? domain[1] : Math.max(...values);
    const pad = (rawMax - rawMin) * 0.12 || 1;
    const min = domain ? rawMin : rawMin - pad;
    const max = domain ? rawMax : rawMax + pad;
    const span = max - min || 1;

    // Margem à direita para o marcador de último ponto não encostar na borda.
    const plotW = markLast ? width - 9 : width;
    const x = (i: number) => (i / (data.length - 1)) * plotW;
    const y = (v: number) => plotH - ((v - min) / span) * plotH;

    const line = data.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(2)} ${y(v).toFixed(2)}`).join(' ');
    return {
      line,
      areaPath: `${line} L${plotW} ${plotH} L0 ${plotH} Z`,
      y,
      lastX: x(data.length - 1),
      lastY: y(data[data.length - 1]),
    };
  }, [data, width, plotH, thresholds, band, domain, markLast]);

  if (!geom) return <Svg width={Math.max(width, 0)} height={height} />;

  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity={0.22} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </LinearGradient>
      </Defs>

      <GridPaper width={width} height={plotH} id={id} />

      {band ? (
        <Rect
          x={0}
          y={geom.y(band.to)}
          width={width}
          height={Math.max(0, geom.y(band.from) - geom.y(band.to))}
          fill={colors.accent}
          opacity={0.05}
        />
      ) : null}

      {thresholds.map((t, i) => (
        <React.Fragment key={i}>
          <Line
            x1={0}
            y1={geom.y(t.value)}
            x2={width}
            y2={geom.y(t.value)}
            stroke={t.color ?? colors.textFaint}
            strokeWidth={1.75}
            strokeDasharray={t.dashed === false ? undefined : '3 3'}
          />
          {t.label ? (
            <SvgText x={width - 2} y={geom.y(t.value) - 5} fill={colors.textFaint} fontSize={9} textAnchor="end">
              {t.label}
            </SvgText>
          ) : null}
        </React.Fragment>
      ))}

      {area ? <Path d={geom.areaPath} fill={`url(#${id}-fill)`} /> : null}
      <Path d={geom.line} stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" fill="none" />

      {markLast ? (
        <>
          <Circle cx={geom.lastX} cy={geom.lastY} r={8} fill={color} opacity={0.2} />
          <Circle cx={geom.lastX} cy={geom.lastY} r={3} fill={color} />
        </>
      ) : null}

      {xLabels?.map((label, i) => (
        <SvgText
          key={label + i}
          x={(i / (xLabels.length - 1)) * width}
          y={height - 4}
          fill={colors.textFaint}
          fontSize={9}
          textAnchor={i === 0 ? 'start' : i === xLabels.length - 1 ? 'end' : 'middle'}
        >
          {label}
        </SvgText>
      ))}
    </Svg>
  );
}
