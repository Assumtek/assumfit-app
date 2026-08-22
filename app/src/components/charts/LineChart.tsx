import React, { useMemo, useRef, useState } from 'react';
import { PanResponder, View } from 'react-native';
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
  /**
   * Como ler um valor quando a pessoa ARRASTA o dedo sobre a curva (o "Stocks"
   * da Apple — pedido de testador, ago/2026). Sem isto, o valor sai cru com
   * uma casa. Os números do eixo vertical usam a mesma função.
   */
  formatValue?: (v: number) => string;
  /** Esconde os números do eixo vertical (mín e máx à esquerda). */
  hideAxis?: boolean;
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
  formatValue,
  hideAxis = false,
}: Props) {
  const { colors } = useTheme();
  color = color ?? colors.accent;
  const fmt = (v: number) => (formatValue ? formatValue(v) : Number.isInteger(v) ? String(v) : v.toFixed(1).replace('.', ','));
  /*
   ARRASTAR para ler cada medição.

   O dedo escolhe o ponto mais próximo no eixo X; uma linha vertical e o valor
   aparecem enquanto ele estiver ali, e somem ao soltar. É o gesto do Stocks e
   dos relógios de corrida — e o pedido veio com a observação certa: em série
   de 90 pontos a curva diz a forma, não o número.
  */
  const [scrub, setScrub] = useState<number | null>(null);
  const larguraRef = useRef(width);
  larguraRef.current = width;
  const pontosRef = useRef(data.length);
  pontosRef.current = data.length;
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => setScrub(indiceEm(e.nativeEvent.locationX, larguraRef.current, pontosRef.current)),
      onPanResponderMove: (e) => setScrub(indiceEm(e.nativeEvent.locationX, larguraRef.current, pontosRef.current)),
      onPanResponderRelease: () => setScrub(null),
      onPanResponderTerminate: () => setScrub(null),
    })).current;
  const padBottom = xLabels ? 18 : 0;
  const plotH = height - padBottom;

  const geom = useMemo(() => {
    /*
     UMA medição também desenha.

     A curva exigia dois pontos — "um ponto é um valor, não uma linha" — e o
     raciocínio está certo para a LINHA e errado para a tela: quem acabou de
     medir quer ver onde caiu, e um vazio explicado no lugar do gráfico faz a
     primeira medição parecer perdida. Com um ponto só, desenhamos o ponto: sem
     traço e sem área, porque não há trajeto entre medições que não existem.
    */
    if (data.length < 1 || width <= 0) return null;

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
    // Ponto único vai à DIREITA, onde mora o mais recente em qualquer série —
    // centralizá-lo sugeriria meio-dia, ou meio período, que ele não é.
    const x = (i: number) => (data.length === 1 ? plotW : (i / (data.length - 1)) * plotW);
    const y = (v: number) => plotH - ((v - min) / span) * plotH;

    const line =
      data.length === 1
        ? ''
        : data
            .map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(2)} ${y(v).toFixed(2)}`)
            .join(' ');
    return {
      line,
      // Área sob um ponto só seria um triângulo que não representa nada.
      areaPath: data.length === 1 ? '' : `${line} L${plotW} ${plotH} L0 ${plotH} Z`,
      y,
      x,
      min,
      max,
      lastX: x(data.length - 1),
      lastY: y(data[data.length - 1]),
    };
  }, [data, width, plotH, thresholds, band, domain, markLast]);

  if (!geom) return <Svg width={Math.max(width, 0)} height={height} />;
  const i = scrub != null && data.length > 0 ? Math.min(data.length - 1, Math.max(0, scrub)) : null;
  return (
    <View {...pan.panHandlers} style={{ width, height }}>
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
            <SvgText x={width - 2} y={geom.y(t.value) - 5} fill={colors.textFaint} fontSize={10} textAnchor="end">
              {t.label}
            </SvgText>
          ) : null}
        </React.Fragment>
      ))}

      {area && geom.areaPath ? <Path d={geom.areaPath} fill={`url(#${id}-fill)`} /> : null}
      {geom.line ? (
        <Path
          d={geom.line}
          stroke={color}
          strokeWidth={4}
          strokeLinejoin="round"
          strokeLinecap="round"
          fill="none"
        />
      ) : null}

      {markLast || data.length === 1 ? (
        <>
          <Circle cx={geom.lastX} cy={geom.lastY} r={8} fill={color} opacity={0.2} />
          <Circle cx={geom.lastX} cy={geom.lastY} r={3} fill={color} />
        </>
      ) : null}

      {xLabels?.map((label, k) => (
        <SvgText
          key={label + k}
          x={(k / (xLabels.length - 1)) * width}
          y={height - 4}
          fill={colors.textFaint}
          fontSize={10}
          textAnchor={k === 0 ? 'start' : k === xLabels.length - 1 ? 'end' : 'middle'}
        >
          {label}
        </SvgText>
      ))}
      {/* Eixo vertical: o máximo no alto e o mínimo embaixo, à esquerda — o
          suficiente para a curva ter escala sem virar planilha. */}
      {!hideAxis && data.length > 1 ? (
        <>
          <SvgText x={2} y={10} fill={colors.textFaint} fontSize={10} textAnchor="start">
            {fmt(domain ? geom.max : Math.max(...data))}
          </SvgText>
          <SvgText x={2} y={plotH - 3} fill={colors.textFaint} fontSize={10} textAnchor="start">
            {fmt(domain ? geom.min : Math.min(...data))}
          </SvgText>
        </>
      ) : null}
      {i != null ? (
        <>
          <Line x1={geom.x(i)} y1={0} x2={geom.x(i)} y2={plotH} stroke={colors.text} strokeWidth={1} opacity={0.5} />
          <Circle cx={geom.x(i)} cy={geom.y(data[i])} r={4} fill={color} stroke={colors.ink} strokeWidth={4} />
          <SvgText
            x={Math.min(Math.max(geom.x(i), 28), width - 28)}
            y={Math.max(12, geom.y(data[i]) - 12)}
            fill={colors.text}
            fontSize={12}
            fontWeight="600"
            textAnchor="middle"
          >
            {fmt(data[i])}
          </SvgText>
        </>
      ) : null}
    </Svg>
    </View>
  );
}

/** O índice do ponto mais próximo do dedo. */
function indiceEm(x: number, width: number, n: number): number {
  if (n <= 1 || width <= 0) return 0;
  return Math.round((Math.min(Math.max(x, 0), width) / width) * (n - 1));
}
