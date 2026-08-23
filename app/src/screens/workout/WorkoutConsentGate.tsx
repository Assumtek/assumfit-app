import { XStack, YStack } from '@tamagui/stacks';
import React, { useState } from 'react';

import { Note } from '../../components/List';
import { Icon } from '../../components/Icon';
import { Body, Button, Card, Heading } from '../../components/ui';
import { setWorkoutConsent } from '../../services/api.service';
import { useTheme } from '../../theme/ThemeProvider';

/**
 * O pedido de consentimento de dados de saúde para treino — UM só, para os
 * DOIS fluxos de anamnese.
 *
 * Ele nasceu dentro do formulário (`AnamnesisScreen`) e ficou lá quando o
 * fluxo conversacional virou a rota principal: a conversa começava sem pedir
 * permissão e a produção respondia 403 — a tela dizia "confira a conexão"
 * para um problema que era de consentimento. Extraído para componente, quem
 * criar um terceiro fluxo herda o pedido em vez de reesquecê-lo.
 *
 * A pergunta seguinte JÁ É o dado sensível: "algum médico já disse que você
 * tem um problema no coração?" não pode aparecer antes de a pessoa saber o
 * que será feito com a resposta (LGPD, consentimento específico).
 */
export function WorkoutConsentGate({
  onGranted,
  onDecline,
}: {
  onGranted: () => void;
  onDecline: () => void;
}) {
  const { colors } = useTheme();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const grantConsent = async () => {
    setSaving(true);
    setError(null);
    try {
      await setWorkoutConsent(true);
      onGranted();
    } catch {
      setError('Não foi possível registrar seu consentimento. Tente de novo.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <YStack gap="$xl" paddingTop="$lg">
      <YStack gap="$sm">
        <Heading fontWeight="800" color="$foreground" letterSpacing={-0.5}>
          Antes de perguntar sobre você
        </Heading>
        <Body color="$mutedForeground">
          Para montar um treino seguro, precisamos saber do seu histórico de saúde, condições,
          medicamentos, lesões. Isso é dado sensível, e por isso pedimos permissão separada da
          leitura da pulseira.
        </Body>
      </YStack>

      <Card>
        <YStack gap="$md">
          {[
            'Suas respostas ficam guardadas para montar e remontar seu treino. Só você as vê.',
            'Não são usadas para nenhuma outra finalidade, e não vão para lugar nenhum além do que monta o seu plano.',
            'Você pode retirar esta permissão quando quiser. Ao retirar, apagamos suas respostas de saúde e os planos gerados a partir delas.',
          ].map((line) => (
            <XStack key={line} gap="$sm" alignItems="flex-start">
              <YStack width={8} height={8} borderRadius={4} backgroundColor="$primary" marginTop={8} />
              <Body color="$mutedForeground" flex={1}>
                {line}
              </Body>
            </XStack>
          ))}
        </YStack>
      </Card>

      {error ? (
        <Body color="$destructive">
          {error}
        </Body>
      ) : null}

      <Button
        title={saving ? 'Registrando…' : 'Concordo, pode perguntar'}
        icon={<Icon name="check" size={16} color={colors.ink} />}
        loading={saving}
        onPress={grantConsent}
      />
      <Button title="Agora não" variant="ghost" onPress={onDecline} />

      <Note
        title="por que separado"
        body={
          'Consentir com a leitura do seu HRV não é consentir com o registro de uma condição ' +
          'cardíaca. São dados de naturezas diferentes, e por isso a permissão é pedida em ' +
          'separado e pode ser retirada em separado.'
        }
      />
    </YStack>
  );
}
