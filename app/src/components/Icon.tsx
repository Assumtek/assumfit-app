import {
  Activity,
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  BarChart3,
  Bell,
  Bluetooth,
  Calendar,
  Check,
  ChevronDown,
  ChevronUp,
  ChevronsRight,
  CircleHelp,
  Clock,
  Droplet,
  Dumbbell,
  Flag,
  Flame,
  Gauge,
  Heart,
  Hourglass,
  LayoutGrid,
  ListChecks,
  Moon,
  Pause,
  Play,
  Ruler,
  Thermometer,
  Waves,
} from 'lucide-react-native';
import React from 'react';

import { useTheme } from '../theme/ThemeProvider';

/**
 * Ícones do app — Lucide, não desenho à mão.
 *
 * Antes cada glifo era um `<Path d="…">` escrito aqui. Funcionava e parecia
 * torto: o triângulo do "play" fora do centro óptico, o arco do sino levemente
 * fora de eixo, espessura variando de um ícone para o outro. Não era falta de
 * cuidado — acertar óptica de glifo em grid de 24 px é trabalho de desenhista,
 * e a diferença aparece justamente no tamanho em que a gente usa.
 *
 * Lucide é a MESMA biblioteca de glifos que o MUVX usa. A embalagem é outra, e
 * de propósito: lá é `@tamagui/lucide-icons-2`, atada ao Tamagui v2-rc. Tentei
 * `@tamagui/lucide-icons` aqui e o app morreu com "Can't find Tamagui
 * configuration" — aquele pacote é da linha v1 e procura um config v1 que não
 * existe neste projeto.
 *
 * `lucide-react-native` não tem acoplamento nenhum com o Tamagui: desenha em
 * `react-native-svg`, que já estava instalado. Mesmos glifos, uma dependência de
 * versão a menos para casar.
 *
 * **A API não mudou.** `<Icon name="play" size={16} color={…} />` continua
 * igual, porque são 40+ chamadas espalhadas pelo app e o nome semântico
 * (`swap`, `checklist`) diz mais no ponto de uso que `ArrowLeftRight`.
 */

export type IconName =
  | 'grid'
  | 'pulse'
  | 'moon'
  | 'drop'
  | 'thermometer'
  | 'heart'
  | 'gauge'
  | 'wave'
  | 'steps'
  | 'age'
  | 'bluetooth'
  | 'back'
  | 'arrowRight'
  | 'play'
  | 'calendar'
  | 'bell'
  | 'swap'
  | 'flag'
  | 'checklist'
  | 'skip'
  | 'help'
  | 'clock'
  | 'ruler'
  | 'flame'
  | 'up'
  | 'down'
  | 'dumbbell'
  | 'check'
  | 'pause';

/**
 * Nome semântico → componente do Lucide.
 *
 * Quatro escolhas merecem nota, porque o nome óbvio do Lucide não era o certo:
 *
 * - `steps` → `BarChart3`, e não `Footprints`. A tela de atividade mostra
 *   passos por HORA, em barras; a pegada sugeriria caminhada, que é outra coisa.
 * - `age` → `Hourglass`. Idade biológica é tempo, e `Clock` já está ocupado
 *   pelo cronômetro — dois ícones parecidos em telas vizinhas viram um só na
 *   memória de quem usa.
 * - `wave` → `Waves` para pressão arterial: a onda é a forma do pulso.
 * - `pulse` → `Activity`, o traço de eletrocardiograma, que é o que HRV evoca.
 */
const GLYPH = {
  grid: LayoutGrid,
  pulse: Activity,
  moon: Moon,
  drop: Droplet,
  thermometer: Thermometer,
  heart: Heart,
  gauge: Gauge,
  wave: Waves,
  steps: BarChart3,
  age: Hourglass,
  bluetooth: Bluetooth,
  back: ArrowLeft,
  arrowRight: ArrowRight,
  play: Play,
  calendar: Calendar,
  bell: Bell,
  swap: ArrowLeftRight,
  flag: Flag,
  checklist: ListChecks,
  skip: ChevronsRight,
  help: CircleHelp,
  clock: Clock,
  ruler: Ruler,
  flame: Flame,
  up: ChevronUp,
  down: ChevronDown,
  dumbbell: Dumbbell,
  check: Check,
  pause: Pause,
} as const;

type Props = {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
};

export function Icon({ name, size = 18, color, strokeWidth = 2 }: Props) {
  const { colors } = useTheme();
  const Glyph = GLYPH[name];

  /*
   A cor vem como VALOR, não como token.

   Quem chama já resolve pelo `useTheme()` — é o padrão do app para componentes
   que recebem cor para passar a um SVG. Manter assim evita que metade das
   chamadas passe token e metade passe valor.
  */
  return <Glyph size={size} color={color ?? colors.text} strokeWidth={strokeWidth} />;
}
