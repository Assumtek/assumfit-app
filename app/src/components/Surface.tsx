import React from 'react';
import { StyleSheet, View, ViewProps, ViewStyle } from 'react-native';

import type { Palette } from '../theme/palette';
import { type Scheme, useTheme } from '../theme/ThemeProvider';


/**
 * `expo-glass-effect` é módulo nativo: num binário que não o contenha — Expo Go,
 * ou um dev client compilado antes de ele entrar — o import estático derruba o
 * arquivo inteiro e leva a árvore junto. Carregar sob guarda faz a ausência
 * degradar para o fallback, que é o comportamento correto de um efeito.
 */
type GlassModule = {
  GlassView: React.ComponentType<Record<string, unknown>>;
  isLiquidGlassAvailable: () => boolean;
};

const glassModule: GlassModule | null = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-glass-effect') as GlassModule;
  } catch {
    return null;
  }
})();

const liquidGlass = (() => {
  try {
    return glassModule?.isLiquidGlassAvailable() ?? false;
  } catch {
    return false;
  }
})();

/**
 * Relevo do AssumFit.
 *
 * A regra que separa os dois: **vidro é da camada de controle, conteúdo é
 * plano.** Barra de abas, painel lateral, ação flutuante — vidro. Métrica,
 * lista, gráfico — superfície ou nada. Vidro em tudo vira decoração e derruba
 * a contenção do sistema.
 *
 * O relevo não vem de sombra projetada. Vem de material: translucidez que
 * refrata o que está atrás, mais uma aresta especular no topo, como se a luz
 * viesse de cima. Sombra colorida e `elevation` alta são vocabulário de card
 * de app de consumo.
 */

type GlassProps = ViewProps & {
  /** `clear` deixa passar mais; `regular` tem mais difusão. */
  variant?: 'clear' | 'regular';
  radius?: number;
  children?: React.ReactNode;
};

/**
 * Camada de controle. Liquid Glass real no iOS 26, translúcido no resto.
 *
 * O vidro nativo é DESLIGADO quando o tema escolhido no app diverge do tema do
 * aparelho. O `GlassView` do iOS refrata segundo a aparência do sistema e não
 * aceita ordem em contrário: com o app no claro e o aparelho no escuro, o
 * painel lateral continuava escuro sobre uma tela clara. Perder o vidro nesse
 * caso é melhor que perder o tema — e quem mantém os dois iguais (a maioria,
 * já que o padrão é `sistema`) segue com o efeito nativo.
 */
export function Glass({ variant = 'regular', radius = 0, style, children, ...rest }: GlassProps) {
  const { scheme, systemScheme } = useTheme();
  const styles = useSheet();
  if (liquidGlass && glassModule && scheme === systemScheme) {
    const GlassView = glassModule.GlassView;
    return (
      <GlassView glassEffectStyle={variant} style={[{ borderRadius: radius }, style]} {...rest}>
        {children}
      </GlassView>
    );
  }

  return (
    <View style={[styles.fallbackGlass, { borderRadius: radius }, style]} {...rest}>
      <Specular radius={radius} />
      {children}
    </View>
  );
}

type SurfaceProps = ViewProps & {
  radius?: number;
  children?: React.ReactNode;
};

/**
 * Superfície de conteúdo. Levantada o suficiente para se destacar do fundo,
 * discreta o suficiente para não virar card. Uma aresta clara no topo e uma
 * escura embaixo fazem a peça parecer ter espessura.
 */
export function Surface({ radius = 0, style, children, ...rest }: SurfaceProps) {
  const styles = useSheet();
  return (
    <View style={[styles.surface, { borderRadius: radius }, style]} {...rest}>
      <Specular radius={radius} />
      {children}
    </View>
  );
}

/**
 * Aresta especular: uma linha clara colada no topo e uma escura no rodapé.
 * É o que dá a sensação de bisel — o mesmo truque de um botão de alumínio
 * anodizado sob luz difusa.
 */
export function Specular({ radius = 0 }: { radius?: number }) {
  const styles = useSheet();
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden' }]}>
      <View style={styles.specularTop} />
      <View style={styles.specularBottom} />
    </View>
  );
}

/** Divisória com relevo: hairline escura com um fio de luz logo abaixo. */
export function EmbossedDivider({ style }: { style?: ViewStyle }) {
  const styles = useSheet();
  return (
    <View style={style}>
      <View style={styles.dividerShadow} />
      <View style={styles.dividerLight} />
    </View>
  );
}

export const supportsLiquidGlass = liquidGlass;

/**
 * Profundidade no claro NÃO é o mesmo truque do escuro.
 *
 * No escuro a peça se destaca porque é mais CLARA que o fundo, e a aresta
 * especular no topo basta. Sobre um fundo claro isso não funciona: não existe
 * "mais claro que o papel". O que dá espessura ali é sombra — a mesma razão
 * pela qual objeto sobre mesa branca só se lê pela sombra que projeta.
 *
 * Discreta de propósito: raio largo, opacidade baixa, deslocamento pequeno.
 * Sombra dura e escura é vocabulário de card de app de consumo, que é
 * exatamente o que este sistema evita.
 *
 * `overflow: 'hidden'` só entra no escuro porque no iOS ele RECORTA a sombra
 * junto com o conteúdo — a peça ficaria plana de novo. No claro o recorte sai e
 * quem arredonda é o `borderRadius` do próprio fundo.
 */
const elevation = (scheme: 'light' | 'dark'): ViewStyle =>
  scheme === 'light'
    ? {
        shadowColor: '#0E0A22',
        shadowOpacity: 0.1,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 5 },
        elevation: 3,
      }
    : { overflow: 'hidden' };

/**
 * Este é o único componente que continua em estilo bruto do React Native, e
 * não em props do Tamagui.
 *
 * Não é migração esquecida: ele embrulha uma view NATIVA (`GlassView`) e monta
 * sombra, aresta especular e recorte condicionados ao tema. Tudo isso são
 * objetos de estilo passados adiante — props tipadas do Tamagui não teriam
 * onde encaixar, e converter só espalharia conversões de volta para estilo.
 */
const sheet = (colors: Palette, scheme: Scheme) =>
  ({
    surface: {
      backgroundColor: colors.surfaceTint,
      ...elevation(scheme),
    },
    /**
     * Sem o vidro nativo não há desfoque, e translucidez sem desfoque deixa o
     * conteúdo de trás legível — lê como falha, não como material. O fallback
     * fica quase opaco de propósito.
     */
    fallbackGlass: {
      backgroundColor: colors.glassFallback,
      ...elevation(scheme),
    },
    specularTop: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.specularTop,
    },
    specularBottom: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.specularBottom,
    },
    dividerShadow: { height: StyleSheet.hairlineWidth, backgroundColor: colors.specularBottom },
    dividerLight: { height: StyleSheet.hairlineWidth, backgroundColor: colors.hairline },
    // Sem a anotação, `position: 'absolute'` é inferido como `string` e a view
    // nativa recusa a folha inteira.
  }) satisfies Record<string, ViewStyle>;

/** As folhas do tema atual. Recalcula a cada troca, como o `makeStyles` fazia. */
function useSheet() {
  const { colors, scheme } = useTheme();
  return React.useMemo(() => sheet(colors, scheme), [colors, scheme]);
}
