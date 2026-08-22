---
name: AssumFit
description: Instrumento de bolso, tinta escura com viés roxo, um acento só, número fino e linha em vez de caixa.
colors:
  accent: "#877BF0"
  ink-dark: "#0E0A22"
  ink2-dark: "#161130"
  text-dark: "#ECE7F4"
  text-muted-dark: "rgba(236,231,244,0.56)"
  text-faint-dark: "rgba(236,231,244,0.44)"
  hairline-dark: "rgba(236,231,244,0.10)"
  alert-dark: "#D08A62"
  card-dark: "rgba(236,231,244,0.032)"
  ink-light: "#ECE7F4"
  ink2-light: "#E2DBEF"
  text-light: "#0E0A22"
  text-muted-light: "rgba(14,10,34,0.64)"
  text-faint-light: "rgba(14,10,34,0.52)"
  hairline-light: "rgba(14,10,34,0.13)"
  alert-light: "#A2482A"
  card-light: "rgba(252,251,254,0.96)"
typography:
  display:
    fontFamily: "$body (fonte do sistema: San Francisco no iOS)"
    fontSize: "72px"
    fontWeight: 200
    lineHeight: "76px"
    letterSpacing: "-3.5px"
  metric:
    fontFamily: "$body"
    fontSize: "44px"
    fontWeight: 200
    lineHeight: "48px"
    letterSpacing: "-2px"
  metric-sm:
    fontFamily: "$body"
    fontSize: "22px"
    fontWeight: 300
    letterSpacing: "-0.6px"
  headline:
    fontFamily: "$body"
    fontSize: "30px"
    fontWeight: 600
    lineHeight: "36px"
    letterSpacing: "-1px"
  title:
    fontFamily: "$body"
    fontSize: "28px"
    fontWeight: 700
    letterSpacing: "-0.8px"
  section-title:
    fontFamily: "$body"
    fontSize: "16px"
    fontWeight: 700
    letterSpacing: "-0.2px"
  rating:
    fontFamily: "$body"
    fontSize: "18px"
    fontWeight: 500
    letterSpacing: "-0.3px"
  body:
    fontFamily: "$body"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: "21px"
  data:
    fontFamily: "$body"
    fontSize: "12px"
    fontWeight: 400
  label:
    fontFamily: "$body"
    fontSize: "11px"
    fontWeight: 700
    letterSpacing: "1.6px"
rounded:
  sm: "6px"
  md: "10px"
  button: "14px"
  card: "20px"
  hero: "24px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  xxl: "32px"
  xxxl: "48px"
  screen: "24px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.ink-dark}"
    rounded: "{rounded.button}"
    height: "56px"
    padding: "0 24px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.text-dark}"
    rounded: "{rounded.button}"
    height: "56px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.text-dark}"
    height: "56px"
  card:
    backgroundColor: "{colors.card-dark}"
    rounded: "{rounded.card}"
    padding: "16px"
  hero-card:
    backgroundColor: "{colors.card-dark}"
    rounded: "{rounded.hero}"
    padding: "24px"
---

# Design System: AssumFit

Este arquivo descreve o sistema visual **como está construído**, os valores
vêm de `app/src/theme/palette.ts`, `app/tamagui.config.ts`,
`app/src/components/ui/*` e `app/src/components/{Card,Surface,Icon}.tsx`. Quando
este texto e o código divergirem, o código vale e este arquivo precisa ser
refeito. As regras de fundo (acento único, `$destructive` reservado, vidro só no
controle) estão em `CLAUDE.md` § Regras de design; aqui elas ganham os números.

## Overview

**Creative North Star: "O instrumento de bolso"**

O AssumFit lê o corpo e devolve uma avaliação em linguagem humana; o número
técnico fica de sub-label. A tela se parece com o mostrador de um aparelho, não
com um feed: tinta escura com viés roxo (nunca preto puro), texto off-white com
viés lilás (nunca branco puro), um acento só, o roxo `#877BF0` do manual de
marca, e números grandes **finos** (peso 200–300), que é o que os faz ler como
instrumento e não como manchete. A composição (card com relevo, halo radial,
pill) foi portada do treino do MUVX; a identidade é a do AssumFit, e o verde
`#24DB89` de lá não entra.

A contenção é a regra: a linha substitui a caixa, hierarquia vem de opacidade
sobre a base e não de cinzas sólidos, raio contido, margens largas ("espaço é o
sinal de preço"). Não é dispositivo médico, nenhuma cor "clínica", nenhum
semáforo.

**Key Characteristics:**
- Duas paletas oficiais, inversas entre si; o acento é a única cor que não vira.
- Peso tipográfico com lugar fixo: título/avaliação 700, corpo 400, número grande 200–300.
- Relevo material no escuro, sombra no claro; vidro só na camada de controle.
- Alinhamento à esquerda; centralizado só dentro de peça simétrica (anel, botão, mostrador).
- Nenhuma tela formata número cru: tudo passa por `domain/ratings.ts`.

## Colors

Uma base de tinta, um acento, um alerta; tudo o mais é opacidade sobre a base.

### Primary
- **Roxo da marca** (`accent`, `#877BF0`, igual nos dois temas): pertence ao
  DADO, anel, arco, sparkline, régua, trilho, pill de metadado, tique de
  "chegou", e ao único botão primário da tela. Nunca em texto corrido, nunca em
  ícone de navegação ou rótulo. `accentSoft` (`rgba(135,123,240,0.16)` escuro /
  `0.18` claro) é o fundo tênue para seleção e pill.
- **Texto sobre o acento**: sempre `#0E0A22` (`$primaryForeground`) nos dois
  temas, o roxo é médio, e texto claro em cima dele não alcança contraste.

### Neutral (escuro)
- **Tinta** (`ink`, `#0E0A22`): fundo da tela. **Tinta 2** (`ink2`, `#161130`): fundo forte.
- **Texto** (`text`, `#ECE7F4`); **muted** a 0.56 (texto de leitura subordinado,
  5,5:1); **faint** a 0.44 (só estado inativo e ornamento, nunca informação).
- **Hairline** a 0.10 / **forte** a 0.18; **track** a 0.09 (trilho de régua).
- **Card** (`surfaceTint`, `rgba(236,231,244,0.032)`): véu claríssimo, a peça se destaca por ser mais clara que o fundo.
- **Vidro de fallback** `rgba(18,13,40,0.94)`; **scrim** `rgba(0,0,0,0.72)`;
  especular topo `rgba(236,231,244,0.15)` / base `rgba(0,0,0,0.45)`.

### Neutral (claro)
- **Tinta** `#ECE7F4`, **Tinta 2** `#E2DBEF`, **Texto** `#0E0A22`.
- Opacidades MAIORES para o mesmo peso percebido: muted 0.64, faint 0.52,
  hairline 0.13 / forte 0.22, track 0.11.
- **Card** e **vidro de fallback** quase brancos (`rgba(252,251,254,0.96)`): no
  claro não existe "mais claro que o papel", e a peça só lê como elevada quando
  é branca e projeta sombra. Especular topo `rgba(255,255,255,0.9)` / base
  `rgba(14,10,34,0.10)`; scrim `rgba(14,10,34,0.42)`.

### Alerta
- **Terracota** (`alert`): `#D08A62` no escuro, `#A2482A` no claro, o ÚNICO
  tom que muda de valor entre temas (o claro desaparece sobre fundo claro).
  É `$destructive`, reservado a valor fora da faixa saudável e à ação
  irreversível. Há teste travando que o acento não muda (`ratings.test.ts`).

**The One Accent Rule.** Só existe `$primary`, e ele é do dado. Separar "Bom"
de "Excelente" por cor é proibido: `ratings.ts` devolve `state: 'normal' |
'alert'`, não uma cor por métrica.

**The No Pure Black Rule.** Nunca `#000` nem `#FFF`. O viés roxo/lilás é o que
faz o conjunto parecer material em vez de default de sistema.

## Typography

**Fonte:** `$body` do Tamagui v5 = fonte do sistema (San Francisco no iOS).
Números usam `tabular-nums`. A escala é ÚNICA e mora em
`components/ui/Type.tsx`; `fontSize` solto numa tela é defeito.

### Hierarchy
- **Display** (200, 72/76, -3.5): o número que domina uma tela de detalhe.
- **Metric** (200, 44/48, -2): número secundário, arcos, idade biológica comparada.
- **MetricSm** (300, 22, -0.6): número em anel pequeno, valor de linha, mostrador (`Readout` sobe para 26).
- **Headline** (600, 30/36, -1): a manchete da tela ("Seu corpo pede uma pausa"). 600, não 700: afirmação, não grito.
- **Title** (700, 28, -0.8): título de tela.
- **SectionTitle** (700, 16, -0.2): cabeçalho de seção.
- **RatingText** (500, 18, -0.3): a avaliação em linguagem humana, o destaque de toda métrica.
- **Body** (400, 14/21, `$mutedForeground`): texto corrido.
- **Data** (400, 12, `$mutedForeground`, tabular): o dado técnico, subordinado à avaliação. Nunca em `$faint`.
- **Label** (700, 11, +1.6, CAIXA ALTA, `$mutedForeground`): etiqueta de laboratório. 11 é o piso do iOS.

**The Thin Number Rule.** Número grande é 200–300; título e avaliação são 700;
corpo e dado 400. No tema claro `Display`/`Metric` sobem para 300 e `MetricSm`
para 400 (`$theme-light`), porque traço fino escuro sobre claro perde massa, é
o mesmo peso PERCEBIDO, não outro desenho.

## Layout

Coluna única com margem lateral de 24 (`space.screen`), alinhada à esquerda.
Escala de espaçamento em múltiplos de 4: 4 / 8 / 12 / 16 / 24 / 32 / 48
(`$xs`…`$xxxl`), compartilhada como `space` e `size` no Tamagui. Seções
separadas por hairline de 1px com `paddingVertical="$xl"`; linhas de lista com
`paddingVertical="$lg"` e divisória abaixo, exceto na última. Centralização só
dentro de peça simétrica por natureza. Um card por linha de lista é ruído: lista
é `Section` + `Row`.

## Elevation & Depth

Híbrido, e a família errada é o jeito mais fácil de estragar o sistema:
**vidro é do controle, sombra é do conteúdo.**

- `components/Surface.tsx`, camada de controle. `Glass` é Liquid Glass nativo
  (`expo-glass-effect`, iOS 26) em barra de abas, painel lateral e modal; cai
  para `glassFallback` quase opaco (translucidez sem desfoque lê como falha) e
  desliga o nativo quando a aparência do app diverge da do sistema. `Surface`
  e `EmbossedDivider` têm aresta especular de hairline (clara em cima, escura
  embaixo). No claro ganham sombra `#0E0A22` 0.10 / raio 14 / y 5.
- `components/ui/`, camada de conteúdo. Toda sombra passa por `ShadowView`
  (o `YStack` do Tamagui descarta `shadow*` em silêncio) e vem de
  `elevation.ts`. Não existe quinto nível.

### Shadow Vocabulary
- **Card** (`useCardShadow`, neutra): escuro `#000` 0.18 / raio 24 / y 6; claro `rgb(40,35,75)` 0.06 / raio 14 / y 4.
- **Highlight** (`useHighlightShadow`, `#877BF0` 0.10): raio 28 / y 10 escuro, 24 / 8 claro. A sombra colorida faz a peça parecer iluminada por dentro, único lugar em que o acento aparece sem ser dado.
- **CTA** (`useCtaShadow`, `#877BF0`): 0.25 / raio 20 / y 6 escuro; 0.28 / 18 / 8 claro.
- **FAB** (`useFabShadow`, `#877BF0`, raio 14 / y 4): 0.22 escuro, 0.30 claro. O único nível que sobe de verdade.

**The Dark-Is-Material Rule.** No escuro a peça se destaca por ser mais clara
que o fundo e a aresta especular basta; no claro a espessura inteira vem da
sombra. Um card bom no escuro e chapado no claro é o defeito mais provável, confira nos dois (`xcrun simctl ui booted appearance light`).

## Shapes

Raios contidos, arredondamento exagerado é vocabulário de app barato. Tokens
`sm` 6, `md` 10, `pill` 999; fixos nos componentes: botão 14, `Card` 20,
`HeroCard` 24. Bordas de 1px em `$border` (2px em `$primary` quando
selecionado). Régua de histórico com 6px de altura e raio 3. O halo do
`HeroCard` sangra para fora do canto de propósito, contido, lê como círculo
desenhado em vez de luz.

## Components

### Section / Row / Note (`components/Card.tsx`)
Separam; não elevam. `Section` tem hairline no topo, `Label` ou `SectionTitle`
opcionais. `Row` distribui rótulo e valor com `space-between` e gap mínimo de
12. `Note` é texto contido sem caixa nem ícone: `Label` + `Body` + botão
`secondary md` opcional, e serve a ESTADO (erro, vazio, consentimento), nunca a
rodapé explicativo permanente. `HistoryRow` é rótulo + régua (`$track`, barra no
acento) + valor.

### Card / HeroCard (`components/ui/Card.tsx`)
`Card`: `ShadowView` + sombra de card, raio 20, `padding $lg`, borda 1px
`$border`. `HeroCard` (no máximo um por tela): sombra highlight, raio 24,
`padding $xl`, gradiente vertical `rgba(135,123,240,0.07)→0` até 85%,
`RadialHalo` de 150px no canto superior direito, `eyebrow` opcional em 11/700/+1.5
no acento. Pressionado: opacidade 0.72. `Pill`/`PillText` (raio 999, fundo
`rgba(135,123,240,0.15)`, borda 0.40, texto 10.5/700 no acento) só para metadado.

### Button (`components/ui/Button.tsx`)
Altura `lg` 56 / `md` 44, raio 14, `paddingHorizontal $xl`, texto 15 (ou 14)
em 700. `primary`: fundo `$primary`, texto `$primaryForeground`, sombra CTA, no
máximo um por tela. `secondary`: contorno 1px `$borderStrong`, sem sombra.
`ghost`: só texto. Inativo: opacidade 0.55; pressionado 0.8.

### Readout / ReadoutCluster (`components/ui/Readout.tsx`)
O mostrador: `MetricSm` a 26 + unidade em `Data`, rótulo em `Data` 11,
centralizado, um nó de acessibilidade. `ReadoutCluster` é a faixa de
instrumento: hairline em cima, embaixo e entre as células, `paddingVertical
$lg`. Valor já chega formatado; traço (`: `) é legítimo, zero inventado não.

### Icon (`components/Icon.tsx`)
Glifos do `lucide-react-native`, outline monolinear, só traço (glifo que
precisa de `fill` não pertence ao sistema). Padrão no código: `size 18`,
`strokeWidth 2`; `CLAUDE.md` pede 1,5, quem quiser o traço fino passa
`strokeWidth={1.5}`. Cor vem como VALOR de `useTheme().colors`, nunca token.

## Do's and Don'ts

### Do:
- **Do** escrever cor como token do Tamagui (`$card`, `$mutedForeground`), resolvido a cada render; importar de `@tamagui/core`, `@tamagui/stacks`, `@tamagui/linear-gradient`.
- **Do** pegar cor como valor de `useTheme()` só para SVG, `ActivityIndicator`, ícone e valor calculado em tempo de execução (`style={{}}`).
- **Do** manter `userInterfaceStyle: "automatic"` no `app.json`; o modo "Sistema" depende disso.
- **Do** usar os componentes de `Type.tsx` para todo texto; a avaliação humana grande, o número em sub-label.
- **Do** conferir toda mudança de relevo nos dois temas.

### Don't:
- **Don't** usar `StyleSheet.create` com cor, congela no import. A única exceção é `Surface.tsx`, que embrulha uma view nativa e recalcula por tema.
- **Don't** escrever hexadecimal em `tamagui.config.ts` nem importar paleta em módulo de domínio (`ratings.ts` recebe `colors` por parâmetro).
- **Don't** usar `$destructive` para gradação de qualidade, nem o acento em texto, rótulo ou ícone de navegação.
- **Don't** colocar vidro em card de métrica, sombra colorida atrás de botão contornado, ou um quinto nível de sombra no arquivo da tela.
- **Don't** importar do barril `tamagui` (arrasta `react-dom`) nem trazer cor do MUVX junto com componente portado.

## Como a tela de Dispositivo aplica isto

`screens/DeviceScreen.tsx` (refeita em 22/08/2026) é o caso de referência, evidência em `05-topo-claro.png` / `06-topo-corrigido.png`:

- **Primeira dobra = faixa de instrumento.** `ReadoutCluster` com três
  mostradores (bateria · última leitura · chegou hoje N de 7) entre hairlines;
  o número em peso fino, a unidade em `Data`. Sem card.
- **Uma ação primária.** "Sincronizar agora" é o único `Button primary`, fundo
  roxo, texto na tinta escura nos dois temas, sombra CTA visível como halo roxo.
- **Razão por grandeza = `Section` + `Row`.** Rótulo em `Body`, resumo em
  `Data`, hora à direita em tabular; tique no acento quando a grandeza chegou
  (dado), círculo vazio em `$border` quando não, estado, não alerta.
- **Propriedades no fim.** Modelo, identificador e ferramentas descem para
  seções de consulta; `Note` só aparece em estado (sem pulseira, erro).
- **Card reservado.** O único `Card` da tela embrulha o progresso quando a
  sincronização falha, a peça em destaque do momento, não decoração.
