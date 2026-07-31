import { Text, styled } from '@tamagui/core';

/**
 * A escala tipográfica.
 *
 * É a ÚNICA — `theme/typography.ts` foi a versão anterior, em folhas de estilo,
 * e saiu com a migração. Existe para não espalhar `fontSize` solto por 38
 * arquivos: com um número cru em cada tela, a escala deixa de existir como
 * sistema e vira coincidência.
 *
 * **O peso agora participa da hierarquia.** A regra antiga limitava tudo a 400,
 * e o contraste vinha só da escala. Com o sistema visual do MUVX, título e
 * avaliação usam peso — mas os números grandes continuam finos, porque é o que
 * os faz ler como instrumento e não como manchete.
 *
 * Um ajuste que o tema claro exige e que não é opcional: **peso 200 some sobre
 * fundo claro.** Traço fino escuro sobre claro perde massa muito mais rápido
 * que claro sobre escuro, então os números grandes sobem um degrau no claro
 * para manter o mesmo peso PERCEBIDO. É o oposto de mudar o desenho.
 */

const base = { fontFamily: '$body' } as const;

/** O número que domina uma tela de detalhe. */
export const Display = styled(Text, {
  ...base,
  fontSize: 72,
  letterSpacing: -3.5,
  lineHeight: 76,
  color: '$foreground',
  fontVariant: ['tabular-nums'],
  fontWeight: '200',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ...({ '$theme-light': { fontWeight: '300' } } as any),
});

/** Número secundário — arcos, idade biológica comparada. */
export const Metric = styled(Text, {
  ...base,
  fontSize: 44,
  letterSpacing: -2,
  lineHeight: 48,
  color: '$foreground',
  fontVariant: ['tabular-nums'],
  fontWeight: '200',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ...({ '$theme-light': { fontWeight: '300' } } as any),
});

/** Número dentro de anel pequeno, ou valor de linha de lista. */
export const MetricSm = styled(Text, {
  ...base,
  fontSize: 22,
  letterSpacing: -0.6,
  color: '$foreground',
  fontVariant: ['tabular-nums'],
  fontWeight: '300',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ...({ '$theme-light': { fontWeight: '400' } } as any),
});

/** Título de tela. */
export const Title = styled(Text, {
  ...base,
  fontSize: 28,
  fontWeight: '700',
  letterSpacing: -0.8,
  color: '$foreground',
});

/**
 * A MANCHETE — a frase que a tela existe para dizer ("Seu corpo pede uma
 * pausa"). Um degrau ACIMA do `Title`: numa tela cuja tarefa é decidir o dia,
 * a mensagem do produto não pode perder do cumprimento. Peso 600, não 700: é
 * afirmação, não grito — o 700 fica para título e avaliação.
 */
export const Headline = styled(Text, {
  ...base,
  fontSize: 30,
  fontWeight: '600',
  letterSpacing: -1,
  lineHeight: 36,
  color: '$foreground',
});

/** Cabeçalho de seção. */
export const SectionTitle = styled(Text, {
  ...base,
  fontSize: 16,
  fontWeight: '700',
  letterSpacing: -0.2,
  color: '$foreground',
});

/**
 * A avaliação em linguagem humana — o destaque de toda métrica.
 *
 * Continua sendo o que a tela mostra grande, com o número técnico de sub-label.
 * Essa parte da regra de ouro não mudou com o novo sistema visual.
 */
export const RatingText = styled(Text, {
  ...base,
  fontSize: 18,
  fontWeight: '500',
  letterSpacing: -0.3,
  color: '$foreground',
});

export const Body = styled(Text, {
  ...base,
  fontSize: 14,
  fontWeight: '400',
  lineHeight: 21,
  color: '$mutedForeground',
});

/**
 * O dado técnico. Subordinado à avaliação, sempre.
 *
 * Em `$mutedForeground`, não `$faint`: é texto de LEITURA (frescor, faixa,
 * porção), e o faint media ~2,9:1 — reprovado no AA nos dois temas. O muted
 * passa com folga (5,5:1) e a subordinação continua vindo do tamanho.
 * `$faint` fica para estado inativo e ornamento, nunca para informação.
 */
export const Data = styled(Text, {
  ...base,
  fontSize: 12,
  fontWeight: '400',
  color: '$mutedForeground',
  fontVariant: ['tabular-nums'],
});

/** Etiqueta de laboratório: caixa alta, tracking largo. 11 é o piso do iOS. */
export const Label = styled(Text, {
  ...base,
  fontSize: 11,
  fontWeight: '700',
  letterSpacing: 1.6,
  textTransform: 'uppercase',
  color: '$mutedForeground',
});
