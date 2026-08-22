import { YStack } from '@tamagui/stacks';
import { useChartWidth } from './useChartWidth';
import React, { useState } from 'react';

import { LineChart } from './LineChart';
import { Note } from '../Card';
import { Data } from '../ui';
import { noPeriodo, rotulosDoPeriodo, type Ponto } from '../../domain/series';
import { isoHoje } from '../../domain/water';

/**
 * As medições de HOJE de uma grandeza, com o eixo saindo do próprio dado.
 *
 * Existe porque cada tela de métrica montava o seu gráfico à mão, e as
 * diferenças não eram de propósito: umas agrupavam por hora, outras plotavam a
 * série crua, e os rótulos do eixo eram texto fixo — `['1h atrás', '30 min',
 * 'agora']` desenhado sobre dados de qualquer idade. Aqui o eixo descreve o que
 * está na tela, e a ausência é dita em vez de virar um espaço vazio.
 *
 * Recebe a série com CARIMBO, não valores soltos: é o instante que permite
 * recortar o dia e nomear o eixo. Métrica cuja série não tem tempo — passos por
 * hora, por exemplo — tem gráfico próprio e não passa por aqui.
 */
export function DayChart({
  serie,
  dia,
  vazio,
  band,
  thresholds,
  id,
  height = 152,
}: {
  serie: Ponto[];
  /**
   * O dia que está sendo mostrado.
   *
   * Ausente ou igual a hoje, a série é recortada nas últimas 24 h — a série ao
   * vivo carrega amostras mais antigas. Num dia passado ela já vem fatiada pelo
   * dia certo, e recortar de novo por "últimas 24 h" a esvaziaria por completo.
   */
  dia?: string;
  /** O que dizer quando não há medição no dia. */
  vazio: string;
  band?: { from: number; to: number };
  thresholds?: { value: number; label: string }[];
  id: string;
  height?: number;
}) {
  const [largura, onLayoutLargura] = useChartWidth();

  /*
   O dia corrente, e não a série inteira: "medições do dia" precisa ser o dia,
   senão o gráfico mistura ontem no meio sem dizer.
  */
  const doDia = !dia || dia === isoHoje() ? noPeriodo(serie, '24H') : serie;

  return (
    <YStack onLayout={onLayoutLargura}>
      {doDia.length >= 1 ? (
        <>
          <LineChart
            data={doDia.map((p) => p.value)}
            width={largura}
            height={height}
            markLast
            band={band}
            thresholds={thresholds ?? []}
            xLabels={rotulosDoPeriodo(doDia)}
            id={id}
          />
          <Data marginTop="$sm">
            {doDia.length} {doDia.length === 1 ? 'medição' : 'medições'}
            {!dia || dia === isoHoje() ? ' hoje' : ' no dia'}
          </Data>
        </>
      ) : (
        // Só o vazio de verdade explica; uma medição já vira ponto no gráfico.
        <Note title="Sem medições hoje" body={vazio} />
      )}
    </YStack>
  );
}
