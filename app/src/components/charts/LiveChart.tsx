import { XStack, YStack } from '@tamagui/stacks';
import React, { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';

import { useTheme } from '../../theme/ThemeProvider';
import { Data } from '../ui';
import { GridPaper } from './GridPaper';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

type Props = {
  data: number[];
  width: number;
  height?: number;
  color?: string;
  label?: string;
  id?: string;
};

/**
 * Gráfico ao vivo da home.
 *
 * O ponto da animação não é enfeite: sem ela, um valor parado e um valor
 * atualizando são visualmente idênticos, e o usuário não sabe se o wearable
 * ainda está lendo. O halo pulsando na ponta da série é o sinal de que o dado
 * é corrente — o mesmo papel do LED piscando num monitor de UTI.
 *
 * Usa `Animated` nativo com `useNativeDriver` na opacidade, então o pulso roda
 * fora da thread de JS e não engasga quando chega leitura nova.
 */
export function LiveChart({ data, width, height = 88, color, label, id = 'live' }: Props) {
  const { colors } = useTheme();
  color = color ?? colors.accent;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 900, easing: Easing.in(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  if (width <= 0 || data.length < 2) return <YStack width={width} height={height} />;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pad = span * 0.15;
  const lo = min - pad;
  const hi = max + pad;

  // O halo do pulso tem raio 9; sem esta margem ele sai cortado na borda.
  const plotW = Math.max(1, width - 11);
  const x = (i: number) => (i / (data.length - 1)) * plotW;
  const y = (v: number) => height - ((v - lo) / (hi - lo)) * height;

  const line = data.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(2)} ${y(v).toFixed(2)}`).join(' ');
  const area = `${line} L${plotW} ${height} L0 ${height} Z`;
  const lastX = x(data.length - 1);
  const lastY = y(data[data.length - 1]);

  return (
    <YStack>
      <YStack width={width} height={height}>
        <Svg width={width} height={height}>
          <Defs>
            <LinearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={color} stopOpacity={0.24} />
              <Stop offset="1" stopColor={color} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <GridPaper width={width} height={height} cell={10} id={id} />
          <Path d={area} fill={`url(#${id}-fill)`} />
          <Path d={line} stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" fill="none" />
          <AnimatedCircle
            cx={lastX}
            cy={lastY}
            r={9}
            fill={color}
            opacity={pulse.interpolate({ inputRange: [0, 1], outputRange: [0.32, 0] })}
          />
          <Circle cx={lastX} cy={lastY} r={3} fill={color} />
        </Svg>
      </YStack>
      {label ? (
        <XStack alignItems="center" gap="$sm" marginTop="$sm">
          <LiveDot color={color} />
          <Data>{label}</Data>
        </XStack>
      ) : null}
    </YStack>
  );
}

/** Ponto piscando: "estou recebendo dado agora". */
export function LiveDot({ color, size = 5 }: { color?: string; size?: number }) {
  const { colors } = useTheme();
  color = color ?? colors.accent;
  const blink = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(blink, { toValue: 0.15, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(blink, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [blink]);

  return (
    <Animated.View
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, opacity: blink }}
    />
  );
}
