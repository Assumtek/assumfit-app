import { XStack, YStack } from '@tamagui/stacks';
import React from 'react';
import { Pressable } from 'react-native';
import Svg, { ClipPath, Defs, Path, Rect } from 'react-native-svg';

import { calcBodyBattery } from '../domain/bodyBattery';
import { rateBodyBattery, stateColor } from '../domain/ratings';
import { useBiometricStore } from '../store/biometric.store';
import { useTheme } from '../theme/ThemeProvider';
import { Data, Label, MetricSm } from './ui';
import { Card } from './ui/Card';

/**
 * O raio oficial do Lucide (`zap`, caixa 24×24), no lugar da silhueta de
 * pilha desenhada à mão — o "algo pronto" pedido pela fundadora (ago/2026), e
 * um símbolo melhor: bateria do corpo é energia, não carga elétrica. Mesmo
 * truque da gota ao lado: caminho fechado como contorno E recorte, com a
 * energia subindo dentro da forma.
 */
const RAIO =
  'M15.914 4a1.5 1.5 0 00-2.474-1.561l-9 9A1.5 1.5 0 005.5 14h4.002a.5.5 0 01.471.666L8.086 20a1.5 1.5 0 002.475 1.56l9-9A1.5 1.5 0 0018.5 10h-3.997a.5.5 0 01-.472-.667z';

/** Limites verticais úteis do raio, em unidades da caixa de 24. */
const TOPO = 2;
const FUNDO = 22;

/** Mesma razão da gota: 64 px ÷ 24 ≈ 2,7×, e 0.75 vira o traço de ~2 px. */
const TRACO = 0.75;

/**
 * Bateria do corpo na metade direita (decisão da fundadora, ago/2026), par da
 * gota de água: entrada de um lado, reserva do outro.
 *
 * O número é CALCULADO do sono e do estresse do dia, não lido do aparelho — e
 * sem noite medida o card diz isso em vez de inventar carga (princípio 1:
 * medido ou traço).
 */
export function BodyBatteryCard({ onPress }: { onPress?: () => void }) {
  const { colors } = useTheme();
  const sleep = useBiometricStore((s) => s.sleep);
  const stressHistory = useBiometricStore((s) => s.stressHistory);

  const bateria = calcBodyBattery(sleep, stressHistory);
  const rating = bateria ? rateBodyBattery(bateria.current) : null;

  const fraction = bateria ? Math.min(1, bateria.current / 100) : 0;
  const nivel = FUNDO - fraction * (FUNDO - TOPO);
  const cor = rating ? stateColor(rating.state, colors) : colors.accent;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={
        bateria
          ? `Bateria do corpo: ${bateria.current} de 100, ${rating?.label ?? ''}`
          : 'Bateria do corpo: sem noite medida ainda'
      }
      style={({ pressed }) => pressed && { opacity: 0.6 }}
    >
      <Card>
        <Label marginBottom="$md">bateria do corpo</Label>
        <XStack alignItems="flex-end" gap="$md">
          <Svg width={64} height={64} viewBox="0 0 24 24">
            <Defs>
              <ClipPath id="raio">
                <Path d={RAIO} />
              </ClipPath>
            </Defs>
            <Path d={RAIO} fill={colors.track} />
            {bateria ? (
              <Rect
                x={0}
                y={nivel}
                width={24}
                height={FUNDO - nivel}
                fill={cor}
                clipPath="url(#raio)"
              />
            ) : null}
            <Path
              d={RAIO}
              fill="none"
              stroke={colors.textMuted}
              strokeWidth={TRACO}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </Svg>
          <YStack paddingBottom="$xs" flexShrink={1}>
            <MetricSm>{bateria ? bateria.current : '—'}</MetricSm>
            <Data marginTop="$xs">{bateria ? 'de 100 · reserva' : 'sem noite medida'}</Data>
          </YStack>
        </XStack>
      </Card>
    </Pressable>
  );
}
