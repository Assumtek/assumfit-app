import { XStack, YStack } from '@tamagui/stacks';
import React from 'react';

import { darkPalette } from '../theme/palette';
import { useTheme } from '../theme/ThemeProvider';
import { Icon, type IconName } from './Icon';
import { Body, Button, Headline, HeroCard } from './ui';

/**
 * A LEITURA do painel — a peça que responde "o que é isto, e o que eu faço".
 *
 * É a mesma em Treino e em Esporte de propósito. As duas telas mostravam a
 * sessão do dia com composições diferentes (títulos de tamanhos diferentes,
 * metadados em ordens diferentes), e quem alternava entre elas relia tudo do
 * zero — pareciam dois produtos costurados. Uma peça só, dois conteúdos.
 *
 * **Sem etiqueta acima do título.** O estado ("hoje", "em andamento") vive na
 * linha de meta, escrito como frase; uma etiqueta em caixa alta acima do
 * título rouba a primeira leitura para dizer menos do que o próprio título já
 * diz.
 *
 * A ação mora DENTRO da peça: card e botão soltos são duas coisas que a pessoa
 * precisa relacionar; juntos são uma só — "este é o treino, comece por aqui".
 */

type Acao = {
  title: string;
  onPress: () => void;
  icon?: IconName;
  variant?: 'primary' | 'secondary' | 'ghost';
};

type Props = {
  titulo: string;
  /** A frase de contexto: modalidade, blocos, duração, estado. */
  meta?: string | null;
  /** Ícone da modalidade, à esquerda da meta. Acromático — é rótulo. */
  icone?: IconName | null;
  /** Destaque de peça ativa: só quando há sessão correndo. */
  ativo?: boolean;
  acao?: Acao | null;
  /** Ação alternativa, abaixo da principal. */
  secundaria?: Acao | null;
  onPress?: () => void;
  accessibilityLabel?: string;
  children?: React.ReactNode;
};

export function TrainingPanel({
  titulo,
  meta,
  icone,
  ativo,
  acao,
  secundaria,
  onPress,
  accessibilityLabel,
  children,
}: Props) {
  const { colors } = useTheme();

  return (
    <HeroCard selected={ativo} onPress={onPress} accessibilityLabel={accessibilityLabel}>
      <YStack gap="$sm">
        <Headline numberOfLines={2}>{titulo}</Headline>
        {meta ? (
          <XStack alignItems="center" gap="$sm">
            {icone ? (
              <Icon name={icone} size={16} color={colors.textMuted} strokeWidth={1.5} />
            ) : null}
            <Body flex={1} numberOfLines={2}>
              {meta}
            </Body>
            {/* A seta só aparece quando a peça INTEIRA é o alvo e não há botão:
                com botão, ela prometeria um segundo destino que não existe. */}
            {onPress && !acao ? (
              <Icon name="arrowRight" size={16} color={colors.textMuted} strokeWidth={1.5} />
            ) : null}
          </XStack>
        ) : null}
      </YStack>

      {children}

      {acao || secundaria ? (
        <YStack gap="$md" marginTop="$lg">
          {acao ? (
            <Button
              title={acao.title}
              variant={acao.variant ?? 'primary'}
              onPress={acao.onPress}
              icon={
                acao.icon ? (
                  <Icon
                    name={acao.icon}
                    size={16}
                    /* Sobre o acento, o ink escuro da marca nos DOIS temas — a
                       mesma regra do texto do botão primário. */
                    color={
                      (acao.variant ?? 'primary') === 'primary' ? darkPalette.ink : colors.text
                    }
                  />
                ) : undefined
              }
            />
          ) : null}
          {secundaria ? (
            <Button
              title={secundaria.title}
              variant={secundaria.variant ?? 'secondary'}
              size="md"
              onPress={secundaria.onPress}
            />
          ) : null}
        </YStack>
      ) : null}
    </HeroCard>
  );
}
