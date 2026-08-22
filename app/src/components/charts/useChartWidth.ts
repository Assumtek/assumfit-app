import { useCallback, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';

/**
 * A largura medida de um contêiner, para gráfico que desenha em SVG e precisa
 * do número antes de renderizar.
 *
 * Eram dezesseis cópias de `useState(0)` + `onLayout` lendo
 * `nativeEvent.layout.width`; uma delas chamava a variável de `largura`, outra
 * de `chartWidth`, e nenhuma tinha como divergir além do nome. Aqui é um par:
 * a largura e o `onLayout` que a preenche.
 */
export function useChartWidth(): [number, (e: LayoutChangeEvent) => void] {
  const [width, setWidth] = useState(0);
  const onLayout = useCallback((e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width), []);
  return [width, onLayout];
}
