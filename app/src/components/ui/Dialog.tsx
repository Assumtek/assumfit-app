import { XStack, YStack } from '@tamagui/stacks';
import React from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable } from 'react-native';

import { Body, SectionTitle } from './Type';
import { Button } from './Button';
import { ShadowView } from './ShadowView';
import { useFabShadow } from './elevation';

/**
 * Camada de sobreposição do app.
 *
 * Existe porque a primeira versão do sheet de troca de exercício foi montada
 * como um `YStack` absoluto dentro da tela, e isso quebra de duas formas ao
 * mesmo tempo:
 *
 * 1. **Camada.** Absoluto dentro da árvore da tela disputa empilhamento com o
 *    que já está lá — o overlay de descanso tem `zIndex: 1000` e passava por
 *    cima do sheet. `Modal` do React Native é uma janela nativa própria: nada
 *    da tela consegue pintar sobre ela.
 * 2. **Opacidade.** O painel usava `$card`, que no escuro é um véu de 3% sobre
 *    o fundo. `$card` é TINTA: serve para uma peça assentada sobre o fundo
 *    opaco da tela, e não para um painel que flutua sobre conteúdo. Usado
 *    solto, o resultado é exatamente o que se via — texto de trás atravessando
 *    o painel.
 *
 * Por isso a superfície aqui é `$backgroundStrong` (o `ink2` da paleta, opaco
 * nos dois temas) e nunca `$card`.
 */

/** O véu escuro. Fecha ao toque — é o gesto que todo mundo tenta primeiro. */
function Scrim({ onPress }: { onPress: () => void }) {
  return (
    <Pressable style={{ flex: 1 }} onPress={onPress} accessibilityLabel="Fechar">
      <YStack flex={1} backgroundColor="$scrim" />
    </Pressable>
  );
}

/**
 * Folha ancorada no rodapé — para escolher algo de uma lista.
 *
 * O conteúdo decide a altura, até o teto que o próprio filho impuser. Sem isso
 * uma lista de dois itens desenha um painel de meia tela vazio.
 */
export function Sheet({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      {/*
        A folha SOBE com o teclado. Sem isto, um campo de texto no fim da folha
        (o volume do recipiente, ago/2026) ficava embaixo do teclado — e a
        folha é exatamente o lugar onde campos curtos moram.
      */}
      <KeyboardAvoidingView
        style={{ flex: 1, justifyContent: 'flex-end' }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Scrim onPress={onClose} />
        <YStack
          backgroundColor="$backgroundStrong"
          borderTopLeftRadius={24}
          borderTopRightRadius={24}
          borderTopWidth={1}
          borderColor="$border"
          paddingHorizontal="$xl"
          paddingTop="$xl"
          paddingBottom="$xxxl"
          gap="$lg"
        >
          {children}
        </YStack>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/**
 * Diálogo de confirmação, centrado.
 *
 * A ação destrutiva vem PRIMEIRO e preenchida, e a saída vem depois como
 * contorno. É o oposto do reflexo de "esconder o botão perigoso": quem abriu
 * este diálogo já decidiu, e enterrar a confirmação transforma uma decisão
 * tomada em caça ao botão. Quem se arrependeu tem o toque fora e o botão de
 * voltar — dois caminhos, ambos maiores que o alvo destrutivo.
 */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  loading,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}) {
  const shadow = useFabShadow();

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onCancel} statusBarTranslucent>
      <YStack flex={1} alignItems="center" justifyContent="center">
        <Scrim onPress={onCancel} />

        {/*
          O diálogo fica FORA do fluxo do scrim, absoluto sobre ele: o scrim
          precisa ocupar a tela inteira para receber o toque, e um irmão dentro
          dele herdaria a área de toque de fechar.
        */}
        <XStack position="absolute" left={0} right={0} paddingHorizontal="$xl" justifyContent="center">
          <ShadowView shadow={shadow} radius={24} backgroundColor="#000000">
            <YStack
              backgroundColor="$backgroundStrong"
              borderRadius={16}
              borderWidth={1}
              borderColor="$border"
              padding="$xl"
              gap="$md"
              maxWidth={420}
            >
              <SectionTitle fontSize={18} textAlign="center">
                {title}
              </SectionTitle>
              <Body textAlign="center" marginBottom="$sm">
                {body}
              </Body>
              <Button title={confirmLabel} onPress={onConfirm} loading={loading} />
              <Button title={cancelLabel} variant="secondary" onPress={onCancel} />
            </YStack>
          </ShadowView>
        </XStack>
      </YStack>
    </Modal>
  );
}
