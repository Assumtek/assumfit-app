import { YStack } from '@tamagui/stacks';
import React from 'react';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';

import { useTheme } from '../../theme/ThemeProvider';

/**
 * A curva de energia do DIA — as 24 horas que o modelo calcula desde sempre e
 * a tela nunca mostrava.
 *
 * "Seu corpo decide o dia" precisa da curva para ser verdade: sem ela, a home
 * responde "o que fazer agora" e cala sobre o resto do dia. O AGORA é o ponto
 * cheio; o que já passou fica mais apagado que o que ainda vem — o olho vai
 * direto para o trecho que ainda dá para planejar.
 */
export function DayCurve({
  data,
  hour,
  width,
  height = 44,
}: {
  /** 24 valores, um por hora (0–23), na escala 0–100. */
  data: number[];
  /** Hora local corrente — o marcador. */
  hour: number;
  width: number;
  height?: number;
}) {
  const { colors } = useTheme();
  if (width <= 0 || data.length < 2) return <YStack width={width} height={height} />;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = Math.max(max - min, 10);
  const meio = (min + max) / 2;
  const lo = meio - span / 2 - span * 0.15;
  const hi = meio + span / 2 + span * 0.15;

  const x = (h: number) => (h / (data.length - 1)) * (width - 8) + 4;
  const y = (v: number) => height - ((v - lo) / (hi - lo)) * height;

  const caminho = (de: number, ate: number) =>
    data
      .slice(de, ate + 1)
      .map((v, i) => `${i === 0 ? 'M' : 'L'}${x(de + i).toFixed(2)} ${y(v).toFixed(2)}`)
      .join(' ');

  const agora = Math.min(Math.max(hour, 0), data.length - 1);

  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id="diaFill" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={colors.accent} stopOpacity={0.14} />
          <Stop offset="1" stopColor={colors.accent} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      {/* O futuro preenchido; o passado é só traço apagado. */}
      <Path
        d={`${caminho(agora, data.length - 1)} L${x(data.length - 1)} ${height} L${x(agora)} ${height} Z`}
        fill="url(#diaFill)"
      />
      <Path d={caminho(0, agora)} stroke={colors.accent} strokeOpacity={0.35} strokeWidth={1.5} fill="none" strokeLinecap="round" />
      <Path d={caminho(agora, data.length - 1)} stroke={colors.accent} strokeWidth={1.5} fill="none" strokeLinecap="round" />
      <Circle cx={x(agora)} cy={y(data[agora])} r={3.5} fill={colors.accent} />
    </Svg>
  );
}
