import React from 'react';
import { Defs, Line, Pattern, Rect } from 'react-native-svg';

import { useTheme } from '../../theme/ThemeProvider';

type Props = {
  width: number;
  height: number;
  /** Deslocamento horizontal — a malha precisa começar onde os dados começam. */
  x?: number;
  /** Lado do quadrado da malha fina, em pontos. */
  cell?: number;
  /** A cada quantas células a linha fica mais forte. */
  major?: number;
  id?: string;
};

/**
 * Papel milimetrado. É o fundo de toda visualização do app.
 *
 * A malha faz duas coisas: dá a referência de leitura que um gráfico solto não
 * tem — dá para estimar valor pela contagem de quadrados — e traz o vocabulário
 * de papel de laboratório, que é o registro do produto. Fica em opacidade muito
 * baixa: é grade de referência, não textura decorativa.
 */
export function GridPaper({ width, height, x = 0, cell = 12, major = 4, id = 'grid' }: Props) {
  const { colors } = useTheme();
  const majorSize = cell * major;

  return (
    <>
      <Defs>
        <Pattern id={`${id}-fine`} width={cell} height={cell} patternUnits="userSpaceOnUse">
          <Line x1={0} y1={0} x2={cell} y2={0} stroke={colors.gridFine} strokeWidth={0.5} />
          <Line x1={0} y1={0} x2={0} y2={cell} stroke={colors.gridFine} strokeWidth={0.5} />
        </Pattern>
        <Pattern id={`${id}-major`} width={majorSize} height={majorSize} patternUnits="userSpaceOnUse">
          <Rect width={majorSize} height={majorSize} fill={`url(#${id}-fine)`} />
          <Line x1={0} y1={0} x2={majorSize} y2={0} stroke={colors.gridMajor} strokeWidth={0.5} />
          <Line x1={0} y1={0} x2={0} y2={majorSize} stroke={colors.gridMajor} strokeWidth={0.5} />
        </Pattern>
      </Defs>
      <Rect x={x} y={0} width={width} height={height} fill={`url(#${id}-major)`} />
    </>
  );
}
