import { useNavigation } from '@react-navigation/native';
import { YStack } from '@tamagui/stacks';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';

import { DetailScreen } from '../../components/DetailScreen';
import { Note, Row, Section } from '../../components/List';
import { Body, BodyLarge, Button, Data, Label, Skeleton } from '../../components/ui';
import * as api from '../../services/api.service';
import { useWorkoutStore } from '../../store/workout.store';

/**
 * Revisar o plano ANTES de ele valer.
 *
 * O plano nascia ativo: a pessoa respondia a anamnese, esperava a geração e
 * descobria o que tinha sido prescrito com aquilo já em vigor, substituindo o
 * plano anterior sem que ninguém tivesse dito sim. "Antes de aprovar o treino,
 * o usuário deve poder revisar e editar o plano" (22/09/2026).
 *
 * Enquanto esta tela está aberta, o plano ANTERIOR continua valendo. Quem
 * desiste não fica sem nada, e quem aprova troca no momento em que decidiu.
 *
 * Editar aqui não é uma terceira ferramenta de edição: o caminho é o personal,
 * que já sabe trocar exercício, mudar série e mover dia, e já aplica sobre o
 * plano com as travas clínicas no meio. Repetir isso numa tela de revisão
 * criaria duas regras para a mesma coisa.
 */
export function PlanReviewScreen() {
  const navigation = useNavigation<any>();
  const refresh = useWorkoutStore((s) => s.refresh);

  const [plano, setPlano] = useState<api.TrainingPlan | null | undefined>(undefined);
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(async () => {
    setPlano(await api.fetchDraftPlan().catch(() => null));
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const aprovar = async () => {
    setOcupado(true);
    try {
      await api.approvePlan();
      await refresh();
      navigation.replace('Plan');
    } catch {
      setOcupado(false);
      Alert.alert('Não deu para aprovar agora', 'Tente de novo em instantes.');
    }
  };

  const descartar = () => {
    Alert.alert(
      'Descartar este plano?',
      'Ele some, e o plano que você já seguia continua valendo. Para ter outro, será preciso gerar de novo.',
      [
        { text: 'Manter', style: 'cancel' },
        {
          text: 'Descartar',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setOcupado(true);
              await api.discardPlan().catch(() => undefined);
              await refresh();
              navigation.replace('Plan');
            })();
          },
        },
      ]);
  };

  if (plano === undefined) {
    return (
      <DetailScreen title="Revisar plano">
        <YStack paddingTop="$lg"><Skeleton lines={4} /></YStack>
      </DetailScreen>
    );
  }

  if (!plano) {
    return (
      <DetailScreen title="Revisar plano">
        <Note
          title="Nada para revisar"
          body="Não há plano esperando aprovação. O que estiver valendo continua em Treino."
        />
        <Button title="Ir para o treino" onPress={() => navigation.replace('Plan')} />
      </DetailScreen>
    );
  }

  const dias = plano.days ?? [];

  return (
    <DetailScreen title="Revisar plano">
      <YStack gap="$md" paddingTop="$md">
        <Label>proposta</Label>
        <BodyLarge color="$foreground">{plano.name}</BodyLarge>
        {plano.rationale ? <Body color="$mutedForeground">{plano.rationale}</Body> : null}
        <Data>
          Este plano ainda não está valendo. Enquanto você não aprovar, o seu treino atual
          continua o mesmo.
        </Data>
      </YStack>

      <Section label="A semana proposta">
        {dias.map((d, i) => (
          <Row key={d.dayOfWeek} last={i === dias.length - 1}>
            <YStack flex={1} gap={4}>
              <Body color="$foreground">{rotuloDoDia(d.dayOfWeek)}</Body>
              <Data>
                {d.workout
                  ? `${d.workout.name} · ${d.workout.exerciseCount} exercícios` +
                    (d.workout.estimatedDuration ? ` · ${d.workout.estimatedDuration} min` : '')
                  : 'descanso'}
              </Data>
            </YStack>
          </Row>
        ))}
      </Section>

      <YStack gap="$sm" marginTop="$lg">
        <Button
          title={ocupado ? 'Aprovando…' : 'Aprovar e começar'}
          onPress={() => void aprovar()}
          disabled={ocupado}
          loading={ocupado}
        />
        {/*
          Ajustar é o personal, e ele trabalha sobre o plano QUE ESTÁ VALENDO.

          Por isso este botão aprova ANTES de abrir a conversa, em vez de levar
          direto: mandar para o personal com o rascunho pendente faria os
          pedidos caírem sobre o plano antigo, que é justamente o que a pessoa
          está trocando. Aprovar primeiro é o que faz "troque o agachamento"
          significar o que ela quis dizer.
        */}
        <Button
          title="Aprovar e ajustar com o personal"
          variant="secondary"
          onPress={() => {
            void (async () => {
              setOcupado(true);
              try {
                await api.approvePlan();
                await refresh();
                navigation.replace('Personal');
              } catch {
                setOcupado(false);
                Alert.alert('Não deu para aprovar agora', 'Tente de novo em instantes.');
              }
            })();
          }}
          disabled={ocupado}
        />
        <Button title="Descartar" variant="ghost" onPress={descartar} disabled={ocupado} />
      </YStack>
    </DetailScreen>
  );
}

const DIAS: Record<string, string> = {
  MONDAY: 'Segunda',
  TUESDAY: 'Terça',
  WEDNESDAY: 'Quarta',
  THURSDAY: 'Quinta',
  FRIDAY: 'Sexta',
  SATURDAY: 'Sábado',
  SUNDAY: 'Domingo',
};

function rotuloDoDia(dia: string): string {
  return DIAS[dia] ?? dia;
}
