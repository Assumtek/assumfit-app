import React from 'react';
import Svg, { Circle, Path } from 'react-native-svg';

import { useTheme } from '../theme/ThemeProvider';


/**
 * Marca AssumFit — vetores oficiais.
 *
 * Os paths vêm direto de `assets/brand/*.svg`, do kit de marca, e NÃO devem ser
 * editados à mão: se a marca mudar, regenerar a partir do arquivo novo. O único
 * ajuste feito foi trocar o `fill` fixo por prop, para a marca herdar a cor do
 * contexto em vez de carregar o `#ece7f4` do arquivo.
 *
 * O símbolo tem simetria rotacional — duas formas espelhadas com dois pontos de
 * tamanhos diferentes. É por isso que ele funciona tão bem girando: em qualquer
 * ângulo a composição continua equilibrada.
 */

const SYMBOL_RATIO = 1.0000;
const TYPE_RATIO = 3.0045;

type MarkProps = {
  size?: number;
  color?: string;
  /**
   * Folga ao redor da arte, como fração do tamanho.
   *
   * Necessária quando a marca GIRA: o canvas do SVG tem exatamente o tamanho da
   * arte, então ao rotacionar as pontas saem da área de desenho e são cortadas
   * — a marca aparece fatiada dentro de um quadrado. A diagonal de um quadrado
   * é 1,41× o lado, então 0,22 de folga cobre qualquer ângulo com margem.
   *
   * Só a área de desenho cresce; a arte mantém o mesmo tamanho visual.
   */
  bleed?: number;
};

/** Símbolo isolado. Quadrado. */
export function LogoMark({ size = 64, color, bleed = 0 }: MarkProps) {
  const { colors } = useTheme();
  color = color ?? colors.text;
  const vb = 2300;
  const pad = vb * bleed;
  const box = size * (1 + bleed * 2);

  return (
    <Svg width={box} height={box} viewBox={`${-pad} ${-pad} ${vb + pad * 2} ${vb + pad * 2}`}>
      <Path d="M823.7,2021.58l143.04-739.29c8.98-46.42-31.52-87.36-78.03-78.87l-789.95,144.08v-570.48h50.87c321.69,0,614.65,122.09,835.79,321.99,30.22,27.83,58.96,56.56,86.79,86.78,199.89,221.15,321.99,514.11,321.99,835.8h-570.49Z" fill={color} />
      <Path d="M1464.88,278.42l-143.04,739.29c-8.98,46.42,31.52,87.36,78.03,78.87l789.95-144.08v570.48h-50.87c-321.69,0-614.65-122.09-835.79-321.99-30.22-27.83-58.96-56.56-86.79-86.78-199.89-221.15-321.99-514.11-321.99-835.8h570.49Z" fill={color} />
      <Circle cx={349.6} cy={1770.89} r={118.88} fill={color} />
      <Circle cx={1968.34} cy={511.32} r={232.9} fill={color} />
    </Svg>
  );
}

type TypeProps = {
  /** Altura do logotipo; a largura sai da proporção original. */
  height?: number;
  color?: string;
  /** O pingo do "i" é o único elemento em roxo no logotipo. */
  accentColor?: string;
};

/**
 * Logotipo desenhado, não texto.
 *
 * A marca usa uma sans geométrica específica que não está instalada no app.
 * Renderizar "assumfit" com a fonte do sistema produziria um desenho de letra
 * diferente do da identidade — por isso o logotipo entra como vetor.
 */
export function LogoType({ height = 32, color, accentColor }: TypeProps) {
  const { colors } = useTheme();
  color = color ?? colors.text;
  accentColor = accentColor ?? colors.accent;
  return (
    <Svg width={height * TYPE_RATIO} height={height} viewBox="0 0 2140.67 712.49">
      <Path d="M220.14,267.55c-61.68,0-97.52,25.35-111.41,68.13l48.28,14.37c10.49-26.8,27.29-39.72,61.19-39.72,31.32,0,53.12,15.82,53.12,48.28v13.4h-70.08c-56.67,0-92.03,29.23-92.03,76.54s31.81,77.66,88,77.66c29.39,0,56.83-9.2,74.11-28.57l1.67,23.54h51.61v-171.76c-.97-56.51-47.31-81.86-104.46-81.86ZM271.33,431.59c0,39.88-34.23,53.28-62.16,53.28-34.23,0-47.15-16.95-47.15-39.24s16.3-33.9,50.7-33.9h58.61v19.86Z" fill={color} />
      <Path d="M356.43,476.41l32.82-37.3c21.88,24.87,50.73,42.77,89.52,42.77,27.35,0,44.76-11.44,44.76-29.84,0-11.44-5.97-20.89-29.34-25.37l-52.22-10.44c-52.72-9.95-73.11-35.31-73.11-70.62,0-42.77,37.8-78.08,101.46-78.08,47.74,0,80.57,15.92,104.94,45.26l-33.32,35.31c-17.9-23.87-44.76-36.81-71.62-36.81-31.83,0-48.74,11.44-48.74,30.34,0,12.44,6.96,22.88,31.33,27.85l59.19,11.94c47.24,9.45,65.15,32.33,65.15,64.15,0,48.24-37.8,80.57-101.95,80.57-49.73,0-90.51-15.91-118.86-49.73Z" fill={color} />
      <Path d="M584.7,476.41l32.82-37.3c21.88,24.87,50.73,42.77,89.52,42.77,27.35,0,44.76-11.44,44.76-29.84,0-11.44-5.97-20.89-29.34-25.37l-52.22-10.44c-52.72-9.95-73.11-35.31-73.11-70.62,0-42.77,37.8-78.08,101.46-78.08,47.74,0,80.57,15.92,104.94,45.26l-33.32,35.31c-17.9-23.87-44.76-36.81-71.62-36.81-31.83,0-48.74,11.44-48.74,30.34,0,12.44,6.96,22.88,31.33,27.85l59.19,11.94c47.24,9.45,65.15,32.33,65.15,64.15,0,48.24-37.8,80.57-101.95,80.57-49.73,0-90.51-15.91-118.86-49.73Z" fill={color} />
      <Path d="M837.34,436.62v-164.12h53.22v150.2c0,43.27,19.89,57.2,54.71,57.2s65.65-21.89,65.65-73.11v-134.28h53.22v248.67h-47.25l-2.49-39.79c-16.91,30.83-46.25,44.76-86.04,44.76-49.24,0-91.02-26.36-91.02-89.52Z" fill={color} />
      <Path d="M1121.81,521.17v-248.67h47.25l2.49,39.79c17.9-30.84,47.75-44.76,80.57-44.76,35.31,0,68.14,15.92,83.55,48.74,15.41-33.82,52.72-48.74,85.54-48.74,48.24,0,92.01,29.34,92.01,92.01v161.63h-53.21v-151.69c0-39.79-21.88-55.7-51.23-55.7-34.81,0-64.66,25.36-64.66,72.61v134.78h-53.21v-151.69c0-39.79-21.88-55.7-51.23-55.7s-64.65,21.38-64.65,75.1v132.29h-53.22Z" fill={color} />
      <Path d="M1807.63,369.95v151.17h-53.28v-193.38c0-6.09-4.94-11.03-11.03-11.03h-102.32v204.41h-52.64v-204.41h-48.28v-44.24h48.28v-19.37c0-53.28,32.29-85.57,89.93-85.57,18.4,0,35.36,3.55,47.79,10.5l-13.89,43.27c-7.43-3.55-17.92-6.46-27.93-6.46-27.29,0-43.27,11.46-43.27,39.24v18.4h69.15c53.84,0,97.48,43.64,97.48,97.48Z" fill={color} />
      <Path d="M2031.93,506.75c-16.41,11.44-39.29,19.4-64.15,19.4-46.25,0-80.57-21.38-80.57-75.59v-133.79h-52.72v-44.26h52.72v-74.6h52.22v74.6h83.06v44.26h-83.06v125.83c0,23.37,11.44,36.31,35.31,36.31,18.4,0,31.33-4.98,43.27-13.43l13.92,41.28Z" fill={color} />
      <Circle cx={1782.26} cy={207.32} r={30.24} fill={accentColor} />
    </Svg>
  );
}

export { SYMBOL_RATIO, TYPE_RATIO };
