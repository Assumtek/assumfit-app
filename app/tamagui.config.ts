/**
 * Config do Tamagui — AssumFit.
 *
 * Os NOMES dos tokens seguem o vocabulário do MUVX (`$background`, `$card`,
 * `$primary`, `$border`, `$mutedForeground`) de propósito: é o que permite
 * portar os componentes de lá sem reescrever prop por prop. Os VALORES são do
 * AssumFit, e vêm de `src/theme/palette.ts` — a paleta continua sendo a fonte
 * da verdade, e este arquivo só a traduz.
 *
 * Se alguém for tentado a escrever um hexadecimal aqui: não. Duas listas de cor
 * divergem em silêncio, e a divergência aparece como um card fora do tema numa
 * tela que ninguém abriu essa semana.
 *
 * **A regra 0 do CLAUDE.md continua valendo.** O acento é `#877BF0`, do manual
 * de marca. O verde `#24DB89` é do MUVX e não entra aqui — trouxemos a
 * composição, não a marca deles.
 *
 * Nenhuma animação com Reanimated: `@tamagui/config/v5` usa o driver
 * `animations-react-native`, cujo único peer é `react`. É o que mantém esta
 * migração sem módulo nativo e, portanto, sem rebuild de dev client.
 *
 * **Importamos de `@tamagui/core`, nunca do barril `tamagui`.** O barril arrasta
 * `@tamagui/popper`, que faz `import "react-dom"` — e `react-dom` é o renderizador
 * da WEB, que não existe num app React Native. O bundle quebra na hora. O MUVX
 * contorna isso instalando `react-dom` como dependência; aqui preferimos importar
 * só o que o app usa (motor de estilo, stacks, gradiente) e não carregar o
 * renderizador de outra plataforma junto.
 */

import { defaultConfig } from '@tamagui/config/v5';
import { createTamagui } from '@tamagui/core';

import { darkPalette, lightPalette, radius, space, type Palette } from './src/theme/palette';

/**
 * Traduz a paleta do AssumFit para os nomes que os componentes do MUVX esperam.
 *
 * `card` merece explicação: no escuro é um véu claríssimo sobre o fundo, porque
 * o relevo ali é MATERIAL — a peça se destaca por ser mais clara que o fundo.
 * No claro isso não existe (não há "mais claro que o papel"), então `card` é
 * quase branco e a espessura vem da sombra. É a mesma lógica que `Surface.tsx`
 * já aplicava.
 */
function toThemeColors(p: Palette, scheme: 'light' | 'dark') {
  return {
    background: p.ink,
    backgroundStrong: p.ink2,
    foreground: p.text,
    color: p.text,

    card: scheme === 'dark' ? p.surfaceTint : p.glassFallback,
    cardForeground: p.text,

    muted: p.track,
    mutedForeground: p.textMuted,
    faint: p.textFaint,

    /**
     * Fundo dos controles circulares do cabeçalho de execução — voltar,
     * cronômetro, lista. Mais presente que `card`: são alvos de toque e
     * precisam se anunciar como tal, ao contrário de uma superfície de conteúdo.
     */
    control: scheme === 'dark' ? 'rgba(236,231,244,0.09)' : 'rgba(14,10,34,0.06)',

    border: p.hairline,
    borderStrong: p.hairlineStrong,

    primary: p.accent,
    primarySoft: p.accentSoft,
    /**
     * Texto e ícone SOBRE o acento.
     *
     * Sempre o fundo escuro da marca, nos dois temas: `#877BF0` é um roxo
     * médio, e texto claro em cima dele não alcança contraste suficiente.
     */
    primaryForeground: darkPalette.ink,

    destructive: p.alert,
    destructiveSoft: p.alertSoft,

    specularTop: p.specularTop,
    specularBottom: p.specularBottom,
    scrim: p.scrim,
    track: p.track,
  };
}

export const tamaguiConfig = createTamagui({
  ...defaultConfig,
  settings: {
    ...defaultConfig.settings,
    /**
     * Permite escrever `backgroundColor` ao lado de `bg`.
     *
     * O default do v5 aceita só o atalho, e isso torna todo componente portado
     * do MUVX um erro de tipagem — eles usam a forma longa.
     */
    onlyAllowShorthands: false,
  },
  tokens: {
    ...defaultConfig.tokens,
    // A geometria não muda com o tema, e já estava definida. Reaproveitar evita
    // um segundo conjunto de espaçamentos competindo com o primeiro.
    space: { ...defaultConfig.tokens.space, ...space },
    size: { ...defaultConfig.tokens.size, ...space },
    radius: { ...defaultConfig.tokens.radius, ...radius },
  },
  themes: {
    ...defaultConfig.themes,
    light: { ...defaultConfig.themes.light, ...toThemeColors(lightPalette, 'light') },
    dark: { ...defaultConfig.themes.dark, ...toThemeColors(darkPalette, 'dark') },
  },
});

export type AppTamaguiConfig = typeof tamaguiConfig;

declare module '@tamagui/core' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface TamaguiCustomConfig extends AppTamaguiConfig {}
}

export default tamaguiConfig;
