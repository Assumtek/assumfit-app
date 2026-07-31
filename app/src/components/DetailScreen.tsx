import { useNavigation } from '@react-navigation/native';
import { YStack } from '@tamagui/stacks';
import React from 'react';
import { Pressable, RefreshControl, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useUiStore } from '../store/ui.store';
import { useTheme } from '../theme/ThemeProvider';
import { Icon } from './Icon';
import { Title } from './ui';

type Props = {
  title: string;
  children: React.ReactNode;
  /**
   * Puxar para atualizar, quando a tela tem o que recarregar.
   *
   * Repassado ao `ScrollView` daqui em vez de a tela montar o próprio: o
   * gesto precisa pertencer ao MESMO scroll que já rola, e um segundo
   * `ScrollView` aninhado só para ter refresh quebra o do de fora.
   */
  refreshControl?: React.ComponentProps<typeof ScrollView>['refreshControl'];
  /**
   * Voltar de SUB-TELA: telas que empilham estados internos (a intermediária
   * do esporte, o resumo, o detalhe do histórico) passam aqui o "desempilhar"
   * delas. Sem isso a seta faz `goBack()` da ROTA — e o que parece um passo
   * atrás joga a pessoa para fora da tela inteira.
   */
  onBack?: () => void;
};

/**
 * Cabeçalho e corpo comuns às telas de métrica.
 *
 * Sem barra inferior, toda tela precisa de saída própria: voltar quando há
 * pilha, e o menu lateral sempre. O título flutua no espaço negativo, sem
 * barra de navegação desenhada.
 */
export function DetailScreen({ title, children, refreshControl, onBack }: Props) {
  const { colors } = useTheme();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const openSidebar = useUiStore((s) => s.openSidebar);
  const voltar = onBack ?? (navigation.canGoBack() ? () => navigation.goBack() : null);

  return (
    <YStack flex={1} backgroundColor="$background">
      <ScrollView
        style={{ flex: 1 }}
        refreshControl={refreshControl}
        contentContainerStyle={{
          paddingHorizontal: 24,
          paddingTop: insets.top + 12,
          
          paddingBottom: insets.bottom + 48,
        }}
        showsVerticalScrollIndicator={false}
      >
        <YStack
          flexDirection="row"
          alignItems="center"
          justifyContent="space-between"
          marginBottom="$xxl"
        >
          {voltar ? (
            <Pressable
              style={({ pressed }) => (pressed ? { opacity: 0.5 } : undefined)}
              onPress={voltar}
              accessibilityRole="button"
              accessibilityLabel="Voltar"
              hitSlop={16}
            >
              <Icon name="back" size={20} color={colors.textMuted} />
            </Pressable>
          ) : (
            <YStack width={20} />
          )}
          <Pressable
            style={({ pressed }) => (pressed ? { opacity: 0.5 } : undefined)}
            onPress={openSidebar}
            accessibilityRole="button"
            accessibilityLabel="Abrir menu"
            hitSlop={10}
          >
            {/* O sanduíche visível: as duas linhas hairline eram discretas
                demais para a porta de toda a navegação (feedback de campo). */}
            <Icon name="menu" size={24} strokeWidth={2} color={colors.text} />
          </Pressable>
        </YStack>

        <Title marginBottom="$xl">{title}</Title>
        {children}
      </ScrollView>
    </YStack>
  );
}

/**
 * Puxar para atualizar, pronto para passar ao `DetailScreen`.
 *
 * Hook em vez de seis `RefreshControl` escritos à mão: cada cópia carrega o
 * estado de "girando", o `finally` que o desliga e a cor do indicador — e é o
 * `finally` que alguém esquece, deixando a roda girando para sempre depois de
 * uma falha de rede.
 *
 * Devolve o ELEMENTO, não a prop solta, porque é assim que o `ScrollView` o
 * espera e evita que cada tela invente um nome diferente para a mesma coisa.
 */
export function usePullRefresh(recarregar: () => Promise<unknown>) {
  const { colors } = useTheme();
  const [girando, setGirando] = React.useState(false);

  const puxar = React.useCallback(async () => {
    setGirando(true);
    try {
      await recarregar();
    } finally {
      setGirando(false);
    }
  }, [recarregar]);

  return (
    <RefreshControl refreshing={girando} onRefresh={() => void puxar()} tintColor={colors.textMuted} />
  );
}
