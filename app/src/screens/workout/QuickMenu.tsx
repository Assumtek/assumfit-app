import { useNavigation } from '@react-navigation/native';
import { YStack } from '@tamagui/stacks';
import React from 'react';
import { Pressable, ScrollView } from 'react-native';

import { Icon, type IconName } from '../../components/Icon';
import { ShadowView } from '../../components/ui/ShadowView';
import { useCardShadow, useSurfaceColor } from '../../components/ui/elevation';
import { Data } from '../../components/ui';
import { useTheme } from '../../theme/ThemeProvider';

/**
 * Menu rápido do treino — botões quadrados em carrossel horizontal.
 *
 * Quadrado e não linha de lista porque estes quatro são DESTINOS irmãos, sem
 * hierarquia entre si: ninguém abre "Evolução" mais que "Histórico". Uma lista
 * vertical impõe uma ordem de importância que não existe, e ainda empurra o
 * plano da semana para fora da primeira tela.
 *
 * Rola de lado de propósito, mesmo cabendo quatro. O carrossel deixa espaço
 * para o quinto sem redesenhar nada — e o cartão cortado na margem direita é o
 * que avisa que há mais, sem precisar de seta.
 */

const LADO = 96;

type Item = { icone: IconName; rotulo: string; rota: string };

const ITENS: Item[] = [
  { icone: 'calendar', rotulo: 'Histórico', rota: 'WorkoutHistory' },
  { icone: 'ruler', rotulo: 'Anamnese', rota: 'AnamnesisHistory' },
  { icone: 'pulse', rotulo: 'Personal', rota: 'Personal' },
  { icone: 'up', rotulo: 'Progresso', rota: 'Progress' },
];

export function QuickMenu() {
  const navigation = useNavigation<any>();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      /*
       O respiro à direita é do CONTEÚDO, não da tela.

       A `DetailScreen` já tem 24 de margem, e o carrossel precisa furá-la para
       o último cartão encostar na borda quando rolado. Sem isto ele para 24
       antes do fim e parece que a lista acabou.
      */
      contentContainerStyle={{ gap: 10, paddingRight: 24 }}
      style={{ marginHorizontal: -24, paddingHorizontal: 24 }}
    >
      {ITENS.map((item) => (
        <Botao key={item.rota} item={item} onPress={() => navigation.navigate(item.rota)} />
      ))}
    </ScrollView>
  );
}

function Botao({ item, onPress }: { item: Item; onPress: () => void }) {
  const { colors } = useTheme();
  const shadow = useCardShadow();
  const surface = useSurfaceColor();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={item.rotulo}
      style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
    >
      <ShadowView shadow={shadow} radius={18} backgroundColor={surface}>
        <YStack
          width={LADO}
          height={LADO}
          borderRadius={18}
          borderWidth={1}
          borderColor="$border"
          padding="$md"
          justifyContent="space-between"
          overflow="hidden"
        >
          {/*
            Ícone acromático, como no resto do sistema: estes botões são
            navegação, e o acento pertence ao dado.
          */}
          <Icon name={item.icone} size={20} color={colors.textMuted} />
          <Data color="$foreground" numberOfLines={2}>
            {item.rotulo}
          </Data>
        </YStack>
      </ShadowView>
    </Pressable>
  );
}
