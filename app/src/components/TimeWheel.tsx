import { YStack } from '@tamagui/stacks';
import { Subtitle } from './ui';
import React, { useRef } from 'react';
import { NativeScrollEvent, NativeSyntheticEvent, ScrollView } from 'react-native';

const ALTURA_ITEM = 44;
const VISIVEIS = 5;

/**
 * Roda de seleção — o vocabulário do seletor de hora do iOS, em JS puro.
 *
 * Existe porque o seletor nativo é módulo de rebuild e uma grade de botões
 * para 24 horas é ruim de olhar e pior de tocar. Uma ScrollView com snap dá a
 * mesma mecânica da roda do sistema: arrasta, trava no item, o do centro vale.
 */
export function TimeWheel({
  items,
  value,
  onChange,
  width = 72,
}: {
  items: string[];
  value: string;
  onChange: (item: string) => void;
  width?: number;
}) {
  const indice = Math.max(0, items.indexOf(value));
  const scrollRef = useRef<ScrollView>(null);

  const aoParar = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.y / ALTURA_ITEM);
    const escolhido = items[Math.min(items.length - 1, Math.max(0, i))];
    if (escolhido !== value) onChange(escolhido);
  };

  const margem = (ALTURA_ITEM * (VISIVEIS - 1)) / 2;

  return (
    <YStack height={ALTURA_ITEM * VISIVEIS} width={width} overflow="hidden">
      {/* A régua do item escolhido: duas linhas, como no seletor do sistema. */}
      <YStack
        position="absolute"
        top={margem}
        left={0}
        right={0}
        height={ALTURA_ITEM}
        borderTopWidth={1}
        borderBottomWidth={1}
        borderColor="$borderStrong"
        pointerEvents="none"
      />
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        snapToInterval={ALTURA_ITEM}
        decelerationRate="fast"
        contentOffset={{ x: 0, y: indice * ALTURA_ITEM }}
        onMomentumScrollEnd={aoParar}
        contentContainerStyle={{ paddingVertical: margem }}
      >
        {items.map((item) => (
          <YStack key={item} height={ALTURA_ITEM} alignItems="center" justifyContent="center">
            <Subtitle
              fontWeight={item === value ? '600' : '300'}
              color={item === value ? '$foreground' : '$mutedForeground'}
            >
              {item}
            </Subtitle>
          </YStack>
        ))}
      </ScrollView>
    </YStack>
  );
}
