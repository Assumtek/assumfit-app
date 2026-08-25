import { useNavigation } from '@react-navigation/native';
import { XStack, YStack } from '@tamagui/stacks';
import React, { useEffect, useState } from 'react';

import { Note } from '../../components/List';
import { DetailScreen, usePullRefresh } from '../../components/DetailScreen';
import { Icon } from '../../components/Icon';
import { Body, Card, Data, Label, SectionTitle, Skeleton, Title } from '../../components/ui';
import { consolidateMovement } from '../../domain/movement';
import { SPORTS, sportClock } from '../../domain/sport';
import { formatDuration } from '../../domain/workout';
import {
  fetchExecutionHistory,
  fetchSportSessions,
  type ExecutionHistoryItem,
  type SportSession,
} from '../../services/api.service';
import { useTheme } from '../../theme/ThemeProvider';

const DIAS = 30;

/**
 * Histórico CONSOLIDADO — treino guiado e registro de esporte na mesma linha
 * do tempo (decisão da fundadora, ago/2026): movimento é um só, e quem quer
 * rever a semana não deveria precisar saber em qual das duas telas cada
 * sessão nasceu.
 *
 * Sessão vinculada a uma execução (dia de esporte do plano registrado pelo
 * cronômetro) aparece UMA vez, como esporte — é o registro mais rico. A regra
 * é a de `domain/movement.ts`, a mesma da agenda de movimento e do progresso.
 *
 * Mostra também os ABANDONADOS, e essa é a decisão que define a tela. Listar
 * só os concluídos produziria um retrato lisonjeiro e inútil — a sessão
 * largada no meio é justamente o sinal de que algo não está cabendo na
 * rotina.
 */

const esporteMeta = (kind: string) => SPORTS.find((s) => s.kind === kind);

export function WorkoutHistoryScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation<any>();
  const [treinos, setTreinos] = useState<ExecutionHistoryItem[] | null>(null);
  const [esportes, setEsportes] = useState<SportSession[] | null>(null);

  const carregar = React.useCallback(async () => {
    const [t, e] = await Promise.all([
      fetchExecutionHistory(DIAS).catch(() => []),
      fetchSportSessions(DIAS).catch(() => []),
    ]);
    setTreinos(t);
    setEsportes(e);
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const refresh = usePullRefresh(carregar);

  if (treinos === null || esportes === null) {
    return (
      <DetailScreen title="Histórico" refreshControl={refresh}>
        <Skeleton lines={4} />
      </DetailScreen>
    );
  }

  const linhas = consolidateMovement(treinos, esportes);

  if (linhas.length === 0) {
    return (
      <DetailScreen title="Histórico" refreshControl={refresh}>
        <Note
          title="Nenhuma atividade registrada"
          body="Treino concluído e sessão de esporte entram aqui, na mesma linha do tempo. Os últimos 30 dias são o que a constância usa como janela."
        />
      </DetailScreen>
    );
  }

  const concluidas =
    linhas.filter((l) => l.tipo === 'esporte' || l.treino.status === 'FINISHED').length;

  return (
    <DetailScreen title="Histórico" refreshControl={refresh}>
      <YStack marginBottom="$xl">
        <Label>últimos {DIAS} dias</Label>
        <XStack alignItems="baseline" gap="$sm" marginTop="$xs">
          <Title>{concluidas}</Title>
          <Data>{concluidas === 1 ? 'atividade concluída' : 'atividades concluídas'}</Data>
        </XStack>
      </YStack>

      <YStack gap="$md">
        {linhas.map((linha) => {
          const data = new Date(linha.quando).toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
          });

          if (linha.tipo === 'esporte') {
            const s = linha.esporte;
            const meta = esporteMeta(s.sport);
            return (
              <Card
                key={`esporte-${s.id}`}
                onPress={() => navigation.navigate('Sport', { abrirSessao: s })}
                accessibilityLabel={`${meta?.label ?? s.sport}, ${data}`}
              >
                <XStack alignItems="center" gap="$md">
                  <Data minWidth={52}>{data}</Data>
                  <Icon name={meta?.icon ?? 'footprints'} size={16} color={colors.textMuted} />
                  <YStack flex={1} minWidth={0} gap={4}>
                    <Body color="$foreground" numberOfLines={1}>
                      {meta?.label ?? s.sport}
                    </Body>
                    {s.distanceM ? (
                      <Data>{(s.distanceM / 1000).toFixed(2).replace('.', ',')} km</Data>
                    ) : null}
                  </YStack>
                  <Data>{sportClock(s.durationS * 1000)}</Data>
                  <Icon name="arrowRight" size={16} color={colors.textMuted} />
                </XStack>
              </Card>
            );
          }

          const item = linha.treino;
          const abandonado = item.status !== 'FINISHED';
          return (
            <Card
              key={`treino-${item.id}`}
              onPress={() => navigation.push('ExecutionDetail', { id: item.id })}
              accessibilityLabel={item.workoutName}
            >
              <XStack alignItems="center" gap="$md">
                <Data minWidth={52}>{data}</Data>
                <Icon name="dumbbell" size={16} color={colors.textMuted} />
                <YStack flex={1} minWidth={0} gap={4}>
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
                <Data>{item.durationSec ? formatDuration(item.durationSec) : '–'}</Data>
                <Icon name="arrowRight" size={16} color={colors.textMuted} />
              </XStack>
            </Card>
          );
        })}
      </YStack>
    </DetailScreen>
  );
}
