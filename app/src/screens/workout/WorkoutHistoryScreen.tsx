import { useNavigation } from '@react-navigation/native';
import { XStack, YStack } from '@tamagui/stacks';
import React, { useEffect, useState } from 'react';

import { Note } from '../../components/Card';
import { DetailScreen, usePullRefresh } from '../../components/DetailScreen';
import { Icon } from '../../components/Icon';
import { Body, Card, Data, Label, SectionTitle } from '../../components/ui';
import { formatDuration } from '../../domain/workout';
import { fetchExecutionHistory, type ExecutionHistoryItem } from '../../services/api.service';
import { useTheme } from '../../theme/ThemeProvider';

const DIAS = 30;

/**
 * Histórico de treinos — o que foi feito, não o que estava planejado.
 *
 * Saiu de dentro do plano porque respondia uma pergunta de outro momento: quem
 * abre a tela de treino quer saber o que fazer hoje, e a lista dos últimos
 * trinta dias empurrava isso para longe.
 *
 * Mostra também os ABANDONADOS, e essa é a decisão que define a tela. Listar só
 * os concluídos produziria um retrato lisonjeiro e inútil — a sessão largada no
 * meio é justamente o sinal de que algo no plano não está cabendo na rotina.
 */
export function WorkoutHistoryScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation<any>();
  const [itens, setItens] = useState<ExecutionHistoryItem[] | null>(null);

  const carregar = React.useCallback(
    () =>
      fetchExecutionHistory(DIAS)
        .then(setItens)
        .catch(() => setItens([])),
    [],
  );

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const refresh = usePullRefresh(carregar);

  if (itens === null) {
    return (
      <DetailScreen title="Histórico" refreshControl={refresh}>
        <Body>Carregando…</Body>
      </DetailScreen>
    );
  }

  if (itens.length === 0) {
    return (
      <DetailScreen title="Histórico" refreshControl={refresh}>
        <Note
          title="Nenhum treino registrado"
          body="Cada sessão concluída entra aqui, com duração e data. Os últimos 30 dias são o que a constância usa como janela."
        />
      </DetailScreen>
    );
  }

  const concluidos = itens.filter((i) => i.status === 'FINISHED');

  return (
    <DetailScreen title="Histórico" refreshControl={refresh}>
      <YStack marginBottom="$xl">
        <Label>últimos {DIAS} dias</Label>
        <XStack alignItems="baseline" gap="$sm" marginTop="$xs">
          <SectionTitle fontSize={28}>{concluidos.length}</SectionTitle>
          <Data>{concluidos.length === 1 ? 'treino concluído' : 'treinos concluídos'}</Data>
        </XStack>
      </YStack>

      <YStack gap="$md">
        {itens.map((item) => {
          const abandonado = item.status !== 'FINISHED';
          return (
            <Card
              key={item.id}
              onPress={() => (navigation as any).push('ExecutionDetail', { id: item.id })}
              accessibilityLabel={item.workoutName}
            >
              <XStack alignItems="center" gap="$md">
                <Data width={52}>
                  {new Date(item.startedAt).toLocaleDateString('pt-BR', {
                    day: '2-digit',
                    month: '2-digit',
                  })}
                </Data>
                <YStack flex={1} minWidth={0} gap={2}>
                  <Body color="$foreground" numberOfLines={1}>
                    {item.workoutName}
                  </Body>
                  {/*
                    O abandono é dito em palavra, não em cor.

                    `$destructive` é reservado para valor fora da faixa saudável
                    e para ação irreversível — pintar de vermelho um treino
                    interrompido transformaria uma escolha de rotina em falha
                    clínica.
                  */}
                  {abandonado ? <Data>interrompido</Data> : null}
                </YStack>
                <Data>{item.durationSec ? formatDuration(item.durationSec) : '—'}</Data>
                <Icon name="arrowRight" size={14} color={colors.textMuted} />
              </XStack>
            </Card>
          );
        })}
      </YStack>
    </DetailScreen>
  );
}
