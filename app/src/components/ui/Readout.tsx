import { XStack, YStack } from '@tamagui/stacks';
import React from 'react';

import { Data, MetricSm } from './Type';

/**
 * O MOSTRADOR — a leitura de um número medido, e o agrupamento deles.
 *
 * É a peça que faz o módulo de treino ler como instrumento: os mesmos três
 * mostradores acompanham a pessoa do início da sessão até o registro no
 * histórico, na mesma ordem e no mesmo lugar. Antes cada tela montava o seu
 * trio à mão, e distância aparecia à esquerda numa e no meio noutra — o olho
 * perdia a referência exatamente onde ela mais valia.
 *
 * O agrupamento tem aresta de hairline em cima, embaixo e entre as células: é
 * o que o transforma em UMA faixa de instrumento em vez de três pilhas soltas
 * flutuando lado a lado. Cartão aqui seria caixa onde a linha basta.
 *
 * `valor` já chega formatado, e traço (`—`) é um valor legítimo: medido ou
 * traço, nunca zero inventado.
 */

export function Readout({
  valor,
  unidade,
  rotulo,
}: {
  valor: string;
  unidade?: string;
  rotulo: string;
}) {
  return (
    // Um nó só para o VoiceOver: sem o agrupamento, cada mostrador eram três
    // paradas, e o trio custava nove gestos.
    <YStack
      flex={1}
      alignItems="center"
      gap={3}
      accessible
      accessibilityLabel={`${valor}${unidade ? ` ${unidade}` : ''}, ${rotulo}`}
    >
      <XStack alignItems="baseline" gap={3}>
        <MetricSm fontSize={26}>{valor}</MetricSm>
        {unidade ? <Data>{unidade}</Data> : null}
      </XStack>
      <Data fontSize={11} numberOfLines={1}>
        {rotulo}
      </Data>
    </YStack>
  );
}

/** A faixa de instrumento: mostradores separados por hairline, entre arestas. */
export function ReadoutCluster({ children }: { children: React.ReactNode }) {
  const celulas = React.Children.toArray(children).filter(Boolean);
  return (
    <YStack borderTopWidth={1} borderBottomWidth={1} borderColor="$border">
      <XStack paddingVertical="$lg" alignItems="center">
        {celulas.map((celula, i) => (
          <React.Fragment key={i}>
            {i > 0 ? <YStack width={1} alignSelf="stretch" backgroundColor="$border" /> : null}
            {celula}
          </React.Fragment>
        ))}
      </XStack>
    </YStack>
  );
}
