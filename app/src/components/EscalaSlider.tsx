import { XStack, YStack } from '@tamagui/stacks';
import React from 'react';
import { PanResponder, View } from 'react-native';

import { fracaoDoValor, marcasDaEscala, valorDaPosicao, type FaixaDaEscala } from '../domain/escala';
import { Metric, Micro } from './ui';

/**
 * Slider de escala inteira, para esforço percebido e afins.
 *
 * Substitui os botões de dois em dois a pedido de um testador: "quanto este
 * treino puxou está de 2 em 2, seria legal ter um slider" (Leonardo,
 * 25/08/2026). Ele tem razão de método, e não só de gosto: a escala de esforço
 * percebido é de UM em um, e oferecer só os pares empurra a resposta para o
 * vizinho em vez de registrar o que a pessoa sentiu.
 *
 * **Sem dependência nativa.** `PanResponder` e um `onLayout` bastam, e o
 * projeto evita módulo nativo que obrigue a rebuildar o dev client por um
 * controle desta simplicidade. A aritmética inteira mora em `domain/escala.ts`,
 * onde as bordas são testáveis sem montar árvore React.
 *
 * **Nada vem marcado.** Como nos botões que ele substitui: resposta
 * pré-selecionada é resposta não dada, e num campo de percepção isso
 * contaminaria o dado que a pergunta existe para colher.
 */
export function EscalaSlider({
  faixa,
  value,
  onPick,
  label,
  legendaMin,
  legendaMax,
}: {
  faixa: FaixaDaEscala;
  value: number | null;
  onPick: (v: number) => void;
  label: string;
  legendaMin: string;
  legendaMax: string;
}) {
  const [largura, setLargura] = React.useState(0);
  const larguraRef = React.useRef(0);
  const escolher = (x: number) => onPick(valorDaPosicao(x, larguraRef.current, faixa));

  const gestos = React.useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // `locationX` é relativo à trilha, que é exatamente o que a conta espera.
      onPanResponderGrant: (e) => escolher(e.nativeEvent.locationX),
      onPanResponderMove: (e) => escolher(e.nativeEvent.locationX),
    })).current;

  const marcas = marcasDaEscala(faixa);
  const fracao = value == null ? 0 : fracaoDoValor(value, faixa);

  return (
    <YStack gap="$md">
      <YStack alignItems="center">
        {/* Sem valor, um traço: o número só aparece quando a pessoa responde. */}
        <Metric maxFontSizeMultiplier={1.4}>{value == null ? '–' : String(value)}</Metric>
      </YStack>

      <View
        {...gestos.panHandlers}
        onLayout={(e) => {
          larguraRef.current = e.nativeEvent.layout.width;
          setLargura(e.nativeEvent.layout.width);
        }}
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ min: faixa.minimo, max: faixa.maximo, now: value ?? undefined }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => {
          const atual = value ?? faixa.minimo;
          const passo = e.nativeEvent.actionName === 'increment' ? 1 : -1;
          onPick(Math.max(faixa.minimo, Math.min(faixa.maximo, atual + passo)));
        }}
        // Alvo de toque generoso: a trilha é fina, o dedo não é.
        style={{ paddingVertical: 16 }}
      >
        <YStack height={6} borderRadius={3} backgroundColor="$muted" justifyContent="center">
          <YStack
            height={6}
            borderRadius={3}
            backgroundColor="$primary"
            width={value == null ? 0 : Math.max(6, fracao * largura)}
          />
          {value != null && largura > 0 ? (
            <YStack
              position="absolute"
              left={Math.max(0, fracao * largura - 14)}
              width={28}
              height={28}
              borderRadius={14}
              backgroundColor="$primary"
            />
          ) : null}
        </YStack>
      </View>

      <XStack justifyContent="space-between">
        {marcas.map((m) => (
          <Micro key={m} color="$mutedForeground">
            {m}
          </Micro>
        ))}
      </XStack>

      <XStack justifyContent="space-between">
        <Micro color="$mutedForeground">{legendaMin}</Micro>
        <Micro color="$mutedForeground">{legendaMax}</Micro>
      </XStack>
    </YStack>
  );
}
