import { XStack, YStack } from '@tamagui/stacks';
import React from 'react';
import { Linking, Platform } from 'react-native';

import { Icon } from './Icon';
import { Body, BodyLarge, Button, SectionTitle } from './ui';
import { Card } from './ui/Card';
import { useTheme } from '../theme/ThemeProvider';

/**
 * O caminho de volta quando uma permissão foi NEGADA.
 *
 * Existe por um caso real (ago/2026): alguém recusou o acesso na abertura, o
 * app ficou sem conectar a pulseira, e a única saída que a pessoa encontrou
 * foi **apagar e reinstalar**. Num produto que vive de uma pulseira, isso é o
 * pior desfecho possível — e era evitável.
 *
 * O que o iOS permite e o que não permite, porque a diferença define este
 * componente: o sistema mostra o prompt de permissão UMA vez. Depois de um
 * "não", nenhuma chamada do app faz o prompt voltar — só a pessoa, nos
 * Ajustes. Então pedir de novo é impossível; o que dá é **dizer o que houve,
 * onde mudar e levar até lá**.
 *
 * Por isso o botão abre `Linking.openSettings()`, que cai direto na página do
 * app nos Ajustes do sistema.
 */

export type PermissaoNegada = 'bluetooth' | 'localizacao' | 'notificacoes' | 'microfone' | 'fotos';

const COPY: Record<PermissaoNegada, { titulo: string; corpo: string; icone: string }> = {
  bluetooth: {
    titulo: 'O Bluetooth está bloqueado para o AssumFit',
    corpo:
      'É por ele que a pulseira fala com o app, sem essa permissão não há batimento, sono nem score. ' +
      'O iPhone só pergunta uma vez, então a mudança acontece nos Ajustes.',
    icone: 'bluetooth',
  },
  localizacao: {
    titulo: 'A localização está bloqueada',
    corpo:
      'Ela serve para a temperatura do seu lugar e para medir distância e percurso no esporte. ' +
      'O resto do app funciona sem ela.',
    icone: 'mountain',
  },
  notificacoes: {
    titulo: 'As notificações estão bloqueadas',
    corpo:
      'Sem elas não chegam os lembretes de água, o resumo da manhã nem o aviso de treino. ' +
      'Os dados continuam sendo registrados normalmente.',
    icone: 'bell',
  },
  microfone: {
    titulo: 'O microfone está bloqueado',
    corpo: 'Ele é usado só no ditado por voz da anamnese. Dá para responder digitando.',
    icone: 'mic',
  },
  fotos: {
    titulo: 'O acesso às fotos está bloqueado',
    corpo:
      'Ele é usado para a foto do prato na contagem de calorias e para salvar o card do treino.',
    icone: 'meal',
  },
};

export function PermissionGate({
  permissao,
  onTentarDeNovo,
}: {
  permissao: PermissaoNegada;
  /** Reexecuta a ação que falhou, para quem voltou dos Ajustes. */
  onTentarDeNovo?: () => void;
}) {
  const { colors } = useTheme();
  const copy = COPY[permissao];

  return (
    <Card>
      <XStack alignItems="center" gap="$md" marginBottom="$md">
        <Icon name={copy.icone as never} size={20} color={colors.textMuted} />
        <BodyLarge flex={1}>
          {copy.titulo}
        </BodyLarge>
      </XStack>

      <Body marginBottom="$lg" lineHeight={20}>
        {copy.corpo}
      </Body>

      <YStack gap="$sm">
        <Button
          title="Abrir os Ajustes do iPhone"
          icon={<Icon name="arrowRight" size={16} color={colors.ink} />}
          onPress={() => void Linking.openSettings().catch(() => undefined)}
        />
        {/*
          O caminho manual escrito por extenso: quem já está nos Ajustes com o
          app aberto ao lado não precisa adivinhar em qual seção mexer. No
          Android o caminho tem outros nomes, então a frase muda com a
          plataforma em vez de mentir sobre uma delas.
        */}
        <Body color="$mutedForeground">
          {Platform.OS === 'ios'
            ? 'Ajustes › AssumFit › ative a permissão e volte para cá.'
            : 'Configurações › Apps › AssumFit › Permissões.'}
        </Body>
        {onTentarDeNovo ? (
          <Button title="Já autorizei, tentar de novo" variant="secondary" onPress={onTentarDeNovo} />
        ) : null}
      </YStack>
    </Card>
  );
}

/**
 * A razão que o rádio devolve é texto do nosso próprio módulo nativo
 * (`QCBandModule.centralManagerDidUpdateState`). Reconhecer "permissão" aqui é
 * o que separa "ligue o Bluetooth" — que a pessoa resolve no centro de
 * controle — de "autorize o app", que só os Ajustes resolvem.
 */
export function permissaoNegadaEm(reason: string | null | undefined): PermissaoNegada | null {
  if (!reason) return null;
  const texto = reason.toLowerCase();
  if (texto.includes('permissão') && texto.includes('bluetooth')) return 'bluetooth';
  if (texto.includes('permissão') && texto.includes('localiz')) return 'localizacao';
  return null;
}
