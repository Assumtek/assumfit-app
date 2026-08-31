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
/**
 * Folga lateral do controle.
 *
 * Tira a trilha da faixa em que o iOS escuta o gesto de voltar, e é DESCONTADA
 * da conta: o que se mede no `onLayout` é a caixa inteira, e o que a pessoa
 * arrasta é a trilha de dentro. Sem descontar, o polegar não alcançava as
 * pontas da escala.
 */
const FOLGA_LATERAL = 20;

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
  // `locationX` é relativo à caixa inteira; a trilha começa depois da folga.
  const escolher = (x: number) =>
    onPick(valorDaPosicao(x - FOLGA_LATERAL, larguraRef.current, faixa));

  const gestos = React.useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      /*
       CAPTURA o gesto, e não o devolve.

       O arrasto da esquerda para a direita é também o gesto de voltar do iOS, e
       perto da borda quem ganhava era a navegação: puxar o slider fazia a tela
       sair (Bruno, 27/08/2026). Capturar na descida e recusar o pedido de
       término é o que mantém o movimento no controle que a pessoa está tocando.
      */
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderTerminationRequest: () => false,
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
          const util = Math.max(0, e.nativeEvent.layout.width - FOLGA_LATERAL * 2);
          larguraRef.current = util;
          setLargura(util);
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
        // Alvo de toque generoso na vertical; a folga lateral é a do gesto.
        style={{ paddingVertical: 16, paddingHorizontal: FOLGA_LATERAL }}
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

      {/*
        Cada marca fica na POSIÇÃO do seu valor, não distribuída no espaço.

        Com `space-between` a régua desenhava intervalos iguais para valores que
        não são igualmente espaçados, e ainda ignorava a folga lateral da
        trilha: o polegar do 8 caía em cima do número 9. O testador descreveu
        como o slider "funcionando, mas com comportamento estranho", e era a
        régua que estava mentindo, não o controle.
      */}
      <YStack height={16} marginHorizontal={FOLGA_LATERAL}>
        {largura > 0
          ? marcas.map((m) => (
              <Micro
                key={m}
                color="$mutedForeground"
                position="absolute"
                width={28}
                textAlign="center"
                left={fracaoDoValor(m, faixa) * largura - 14}
              >
                {m}
              </Micro>
            ))
          : null}
      </YStack>

      <XStack justifyContent="space-between" marginHorizontal={FOLGA_LATERAL}>
        <Micro color="$mutedForeground">{legendaMin}</Micro>
        <Micro color="$mutedForeground">{legendaMax}</Micro>
      </XStack>
    </YStack>
  );
}
