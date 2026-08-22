import React from 'react';
import { Line } from 'react-native-svg';

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
      {/* Só linhas horizontais, espaçadas pelo intervalo maior: régua de
          leitura, não papel quadriculado. A grade fina e as verticais
          decoravam mais do que mediam. */}
      {Array.from({ length: Math.floor(height / majorSize) + 1 }, (_, i) => (
        <Line
          key={`${id}-h${i}`}
          x1={x}
          y1={i * majorSize}
          x2={x + width}
          y2={i * majorSize}
          stroke={colors.gridMajor}
          strokeWidth={0.5}
        />
      ))}
    </>
  );
}
