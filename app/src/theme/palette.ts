/**
 * Paletas do AssumFit — claro e escuro.
 *
 * As duas vêm do MANUAL DE MARCA (`assets/brand/`), não foram escolhidas aqui.
 * O kit define as duas aplicações: fundo escuro `#0e0a22` com texto `#ece7f4`, e
 * fundo claro `#ece7f4` com texto `#0e0a22`. O acento `#877bf0` é o MESMO nos
 * dois — é a única cor que não inverte, e é o que mantém a marca reconhecível
 * independentemente do tema.
 *
 * Regras que valem nos dois:
 *
 * 1. Nunca `#000` nem `#FFF` puros. O quase-preto tem viés roxo e o off-white
 *    tem viés lilás; é isso que faz o conjunto parecer material em vez de
 *    default de sistema.
 * 2. Hierarquia por opacidade sobre a base, não por cinzas sólidos.
 * 3. A linha substitui a caixa.
 * 4. UM acento, e ele pertence ao dado. Como o acento nunca é usado em texto, a
 *    questão de contraste de leitura não se coloca — ele só aparece em traço de
 *    2 pontos ou mais, onde `#877bf0` se sustenta sobre as duas bases.
 * 5. `alert` só aparece fora da faixa saudável. É o único tom que muda de valor
 *    entre os temas, porque terracota claro sobre fundo claro não se lê.
 */

export type Palette = {
  ink: string;
  ink2: string;
  text: string;
  textMuted: string;
  textFaint: string;
  hairline: string;
  hairlineStrong: string;
  track: string;
  accent: string;
  accentSoft: string;
  alert: string;
  alertSoft: string;
  /** Cor sobre a qual o vidro se apoia quando o efeito nativo não existe. */
  glassFallback: string;
  /** Aresta clara do relevo. Vem da luz, então clareia nos dois temas. */
  specularTop: string;
  /** Aresta escura do relevo. */
  specularBottom: string;
  /** Fundo tênue de superfície elevada. */
  surfaceTint: string;
  /** Papel milimetrado: malha fina e malha reforçada. */
  gridFine: string;
  gridMajor: string;
  /** Véu sobre o conteúdo quando a sidebar abre. */
  scrim: string;
};

export const darkPalette: Palette = {
  ink: '#0E0A22',
  ink2: '#161130',
  text: '#ECE7F4',
  textMuted: 'rgba(236,231,244,0.56)',
  // 0.36 media 2,9:1 — invisível até para o papel de "apagado". 0.44 (3,8:1)
  // continua abaixo do muted na hierarquia, mas deixa de sumir. Texto de
  // leitura NUNCA usa faint (ver Type.tsx/Data); isto é estado e ornamento.
  textFaint: 'rgba(236,231,244,0.44)',
  hairline: 'rgba(236,231,244,0.10)',
  hairlineStrong: 'rgba(236,231,244,0.18)',
  track: 'rgba(236,231,244,0.09)',
  accent: '#877BF0',
  accentSoft: 'rgba(135,123,240,0.16)',
  alert: '#D08A62',
  alertSoft: 'rgba(208,138,98,0.14)',
  glassFallback: 'rgba(18,13,40,0.94)',
  specularTop: 'rgba(236,231,244,0.15)',
  specularBottom: 'rgba(0,0,0,0.45)',
  surfaceTint: 'rgba(236,231,244,0.032)',
  gridFine: 'rgba(236,231,244,0.05)',
  gridMajor: 'rgba(236,231,244,0.11)',
  scrim: 'rgba(0,0,0,0.72)',
};

export const lightPalette: Palette = {
  ink: '#ECE7F4',
  ink2: '#E2DBEF',
  text: '#0E0A22',
  // No claro a opacidade precisa ser MAIOR para o mesmo peso percebido: texto
  // escuro sobre fundo claro perde legibilidade mais rápido do que o inverso.
  textMuted: 'rgba(14,10,34,0.64)',
  textFaint: 'rgba(14,10,34,0.52)',
  hairline: 'rgba(14,10,34,0.13)',
  hairlineStrong: 'rgba(14,10,34,0.22)',
  track: 'rgba(14,10,34,0.11)',
  accent: '#877BF0',
  accentSoft: 'rgba(135,123,240,0.18)',
  // Terracota mais fechado: o tom do escuro desaparece sobre fundo claro.
  alert: '#A2482A',
  alertSoft: 'rgba(162,72,42,0.12)',
  // No claro a superfície elevada precisa ser QUASE branca, não um véu sobre o
  // fundo: `#ece7f4` já é claro, e um branco a 55% em cima dele produz uma
  // diferença que o olho não separa. A peça só lê como elevada quando é branca
  // e projeta sombra — ver `elevation` em `Surface.tsx`.
  glassFallback: 'rgba(252,251,254,0.96)',
  specularTop: 'rgba(255,255,255,0.9)',
  specularBottom: 'rgba(14,10,34,0.10)',
  surfaceTint: 'rgba(255,255,255,0.92)',
  gridFine: 'rgba(14,10,34,0.055)',
  gridMajor: 'rgba(14,10,34,0.12)',
  scrim: 'rgba(14,10,34,0.42)',
};

/** Escala de espaçamento em múltiplos de 4. Não muda com o tema. */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
  /** Margem lateral da tela. Larga de propósito: espaço é o sinal de preço. */
  screen: 24,
} as const;

/**
 * Raios contidos. Arredondamento exagerado é vocabulário de app de consumo
 * barato — não muda com o tema.
 */
export const radius = {
  sm: 8,
  md: 12,
  pill: 999,
} as const;
