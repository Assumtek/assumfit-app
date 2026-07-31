/**
 * Primitivos visuais portados do MUVX.
 *
 * Import sempre daqui, e nunca do barril `tamagui` — ele arrasta
 * `@tamagui/popper`, que importa `react-dom`, e o bundle do React Native
 * quebra. Use `@tamagui/core` e `@tamagui/stacks` diretamente.
 */
export { Button } from './Button';
export {
  Body,
  Data,
  Display,
  Headline,
  Label,
  Metric,
  MetricSm,
  RatingText,
  SectionTitle,
  Title,
} from './Type';
export { Card, HeroCard, Pill, PillText } from './Card';
export { CORNER_HALO, RadialHalo, type HaloLayer } from './RadialHalo';
export { ShadowView, type Shadow } from './ShadowView';
export {
  useCardShadow,
  useCtaShadow,
  useFabShadow,
  useHighlightShadow,
  useSurfaceColor,
} from './elevation';
