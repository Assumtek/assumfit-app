import React from 'react';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

/**
 * Halo radial — o brilho difuso no canto do card.
 *
 * O React Native não tem gradiente radial: nem em estilo, nem via
 * `LinearGradient`. A saída é desenhar em SVG, e é o que o MUVX faz. Portado de
 * lá, com uma simplificação — lá as camadas recebiam a cor como string `rgba()`
 * e um regex a separava em `stopColor` + `stopOpacity` na hora de renderizar;
 * aqui a opacidade já vem separada, porque a conversão só existia para o CSS
 * de origem.
 *
 * `pointerEvents="none"` não está aqui: quem posiciona o halo é responsável por
 * isso, já que o SVG cobre a área inteira e engoliria o toque do card.
 */

export type HaloLayer = {
  /** Centro, em porcentagem da área: `'50%'`. */
  cx: string;
  cy: string;
  /** Raio, em porcentagem. */
  r: string;
  color: string;
  /** Opacidade no centro. Vai a zero na borda. */
  opacity: number;
};

export function RadialHalo({ layers }: { layers: HaloLayer[] }) {
  return (
    <Svg
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      width="100%"
      height="100%"
      // Sem isto o gradiente vira círculo e deixa de acompanhar a área quando o
      // card não é quadrado — que é sempre.
      preserveAspectRatio="none"
    >
      <Defs>
        {layers.map((layer, i) => (
          <RadialGradient key={i} id={`halo-${i}`} cx={layer.cx} cy={layer.cy} r={layer.r}>
            <Stop offset="0%" stopColor={layer.color} stopOpacity={layer.opacity} />
            <Stop offset="70%" stopColor={layer.color} stopOpacity={0} />
          </RadialGradient>
        ))}
      </Defs>
      {layers.map((_, i) => (
        <Rect key={i} x="0" y="0" width="100%" height="100%" fill={`url(#halo-${i})`} />
      ))}
    </Svg>
  );
}

/** O halo do canto superior direito, que é o uso padrão no card de destaque. */
export const CORNER_HALO: HaloLayer[] = [
  { cx: '50%', cy: '50%', r: '50%', color: '#877BF0', opacity: 0.18 },
];
