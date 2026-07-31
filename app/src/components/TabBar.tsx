import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Text } from '@tamagui/core';
import { XStack, YStack } from '@tamagui/stacks';
import React, { useContext } from 'react';
import { Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../theme/ThemeProvider';
import { Icon, type IconName } from './Icon';
import { Glass } from './Surface';

/**
 * A barra de abas — os cinco gestos diários, na zona do polegar.
 *
 * É o caso de uso que `Surface.tsx` sempre nomeou para o `Glass`: vidro é do
 * CONTROLE, e barra de abas é controle. Liquid Glass nativo no iOS 26, com o
 * fallback translúcido do sistema onde ele não existe.
 *
 * O estado ativo é ACROMÁTICO — `$foreground` + peso contra `$mutedForeground`
 * — porque "um acento, e ele é do dado" vale também aqui: pintar a aba de roxo
 * gastaria o acento em navegação, e é exatamente o que separa esta barra da
 * tab bar genérica de app de saúde.
 */

/** Altura do CONTEÚDO da barra; o total soma o inset inferior do aparelho. */
export const TAB_BAR_HEIGHT = 56;

const TAB_ICON: Record<string, IconName> = {
  Main: 'grid',
  Health: 'pulse',
  Sport: 'footprints',
  Meals: 'flame',
  Focus: 'brain',
};

/**
 * `true` dentro do navigator de abas. As telas raiz precisam de folga extra no
 * fim do scroll — a barra flutua por cima do conteúdo, que é o que faz o vidro
 * ter o que refratar. Quem está fora das abas (detalhe empurrado no stack
 * raiz) não tem barra e não paga a folga.
 */
export const DentroDasAbas = React.createContext(false);

/** A folga inferior de rolagem certa para a tela ONDE ela é chamada. */
export function useBottomClearance(): number {
  const insets = useSafeAreaInsets();
  const comBarra = useContext(DentroDasAbas);
  return insets.bottom + (comBarra ? TAB_BAR_HEIGHT + 32 : 48);
}

export function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Glass
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        paddingBottom: insets.bottom,
        borderTopWidth: 1,
        borderTopColor: colors.hairline,
      }}
    >
      <XStack height={TAB_BAR_HEIGHT} alignItems="stretch">
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const rotulo = options.title ?? route.name;
          const ativa = state.index === index;

          const aoTocar = () => {
            const evento = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!ativa && !evento.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          return (
            <Pressable
              key={route.key}
              onPress={aoTocar}
              accessibilityRole="tab"
              accessibilityLabel={rotulo}
              accessibilityState={{ selected: ativa }}
              style={({ pressed }) => [{ flex: 1 }, pressed && { opacity: 0.6 }]}
            >
              <YStack flex={1} alignItems="center" justifyContent="center" gap={3}>
                <Icon
                  name={TAB_ICON[route.name] ?? 'grid'}
                  size={22}
                  strokeWidth={1.5}
                  color={ativa ? colors.text : colors.textMuted}
                />
                <Text
                  fontSize={11}
                  fontWeight={ativa ? '700' : '400'}
                  color={ativa ? '$foreground' : '$mutedForeground'}
                >
                  {rotulo}
                </Text>
              </YStack>
            </Pressable>
          );
        })}
      </XStack>
    </Glass>
  );
}
