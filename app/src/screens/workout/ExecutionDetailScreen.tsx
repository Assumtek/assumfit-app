import { useNavigation, useRoute } from '@react-navigation/native';
import { XStack, YStack } from '@tamagui/stacks';
import React, { useEffect, useState } from 'react';

import { Note, Row, Section } from '../../components/Card';
import { DetailScreen } from '../../components/DetailScreen';
import { Icon } from '../../components/Icon';
import { Body, Button, Card, Data, Display, Label, SectionTitle } from '../../components/ui';
import { formatDuration } from '../../domain/workout';
import { mensagemDaFalha } from '../../domain/apiErrors';
import { fetchExecutionDetail, type ExecutionDetail } from '../../services/api.service';
import { useTheme } from '../../theme/ThemeProvider';
import { PHASE_COLOR, PHASE_NAME, type PhaseType } from './PhaseBar';

/**
 * O que aconteceu numa sessão — série a série.
 *
 * A lista de histórico responde "quando" e "quanto tempo". Esta responde a
 * pergunta que faz alguém abrir o histórico: **quanto eu levantei da última
 * vez**. Sem ela, o histórico é um diário de presença.
 *
 * O prescrito aparece ao lado do executado, sempre. Três séries registradas não
 * significam nada isoladas — contra as quatro do plano são um treino encurtado;
 * contra três são um treino cumprido.
 */
export function ExecutionDetailScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation();
  const { id } = (useRoute().params ?? {}) as { id?: string };

  const [detalhe, setDetalhe] = useState<ExecutionDetail | null>(null);
  const [erro, setErro] = useState<unknown>(null);

  useEffect(() => {
    if (!id) return setErro(new Error('sem id'));
    fetchExecutionDetail(id)
      .then(setDetalhe)
      .catch((e) => setErro(e));
  }, [id]);

  if (erro) {
    return (
      <DetailScreen title="Treino">
        <Note
          title="Não foi possível carregar"
          body={mensagemDaFalha(erro, 'A leitura deste treino')}
        />
      </DetailScreen>
    );
  }

  if (!detalhe) {
    return (
      <DetailScreen title="Treino">
        <Body>Carregando…</Body>
      </DetailScreen>
    );
  }

  const quando = new Date(detalhe.startedAt);
  const interrompido = detalhe.status !== 'FINISHED';

  return (
    <DetailScreen title="Treino">
      <YStack marginBottom="$xl">
        <Label>
          {quando.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
        </Label>
        <SectionTitle fontSize={22} marginTop="$xs">
          {detalhe.workoutName}
        </SectionTitle>
        {detalhe.muscleGroups.length ? (
          <Data marginTop="$xs">{detalhe.muscleGroups.join(' · ')}</Data>
        ) : null}
      </YStack>

      <XStack gap="$xxl" marginBottom="$xl">
        <YStack>
          <Display fontSize={40} lineHeight={44} letterSpacing={-1.8}>
            {detalhe.durationSec ? formatDuration(detalhe.durationSec) : '–'}
          </Display>
          <Data>duração</Data>
        </YStack>
        {detalhe.completionPct != null ? (
          <YStack>
            <Display fontSize={40} lineHeight={44} letterSpacing={-1.8}>
              {Math.round(detalhe.completionPct)}%
            </Display>
            <Data>concluído</Data>
          </YStack>
        ) : null}
      </XStack>

      {/*
        A interrupção é dita em palavra, não em cor. `$destructive` é reservado
        a valor fora da faixa saudável e a ação irreversível — um treino
        interrompido é uma escolha de rotina, não uma falha clínica.
      */}
      {interrompido ? (
        <Note
          title="Sessão interrompida"
          body="Este treino não foi concluído. As séries registradas até ali continuam valendo para o auto-preenchimento de carga."
        />
      ) : null}

      {detalhe.phases.map((fase) => {
        const tipo = fase.type as PhaseType;
        return (
          <YStack key={fase.type} marginTop="$xl">
            <XStack alignItems="center" gap="$sm" marginBottom="$md">
              {/* Cor calculada vai em `style` — token não aceita valor cru. */}
              <YStack width={4} height={16} borderRadius={2} style={{ backgroundColor: PHASE_COLOR[tipo] }} />
              <SectionTitle>{PHASE_NAME[tipo]}</SectionTitle>
            </XStack>

            <YStack gap="$md">
              {fase.exercises.map((exercicio) => {
                const feitas = exercicio.sets.filter((s) => s.completed);
                const completo = feitas.length >= exercicio.prescribedSets;
                return (
                  <Card key={exercicio.id}>
                    <XStack alignItems="center" gap="$md">
                      <YStack flex={1} minWidth={0}>
                        <Body color="$foreground" numberOfLines={2}>
                          {exercicio.name}
                        </Body>
                        <Data>
                          {feitas.length} de {exercicio.prescribedSets}{' '}
                          {exercicio.prescribedSets === 1 ? 'série' : 'séries'}
                        </Data>
                      </YStack>
                      <Icon
                        name="check"
                        size={16}
                        color={completo ? colors.accent : colors.hairlineStrong}
                      />
                    </XStack>

                    {/*
                      As séries só aparecem quando houve CARGA registrada.

                      Alongamento e mobilidade não têm peso nem repetição para
                      mostrar — listar "— × —" quatro vezes ocupa espaço para
                      dizer o que a contagem acima já disse.
                    */}
                    {feitas.some((s) => s.load != null || s.repetitions != null) ? (
                      <YStack marginTop="$sm" gap="$xs">
                        {feitas.map((serie) => (
                          <XStack key={serie.order} alignItems="center" gap="$md">
                            <Data width={24}>{serie.order + 1}ª</Data>
                            <Data color="$foreground">
                              {serie.load != null ? `${serie.load} kg` : '–'}
                            </Data>
                            <Data>×</Data>
                            <Data color="$foreground">
                              {serie.repetitions != null ? `${serie.repetitions} reps` : '–'}
                            </Data>
                          </XStack>
                        ))}
                      </YStack>
                    ) : null}
                  </Card>
                );
              })}
            </YStack>
          </YStack>
        );
      })}

      {detalhe.perceivedEffort != null || detalhe.rating != null || detalhe.comment ? (
        <Section label="Como você avaliou">
          {detalhe.perceivedEffort != null ? (
            <Row>
              <Body color="$foreground">Esforço percebido</Body>
              <Data>{detalhe.perceivedEffort} de 10</Data>
            </Row>
          ) : null}
          {detalhe.rating != null ? (
            <Row>
              <Body color="$foreground">Nota da sessão</Body>
              <Data>{detalhe.rating} de 5</Data>
            </Row>
          ) : null}
          {detalhe.comment ? (
            <Row last>
              <Body flex={1} color="$foreground">
                {detalhe.comment}
              </Body>
            </Row>
          ) : null}
        </Section>
      ) : null}

      {/*
        Compartilhar do histórico (decisão da fundadora, ago/2026): quem
        fechou a conclusão sem compartilhar não perde o cartão. Contagem e
        volume saem do PRÓPRIO detalhe — só séries completas contam, e volume
        zero vira omissão no cartão, nunca afirmação.
      */}
      <YStack marginTop="$xl">
        <Button
          title="Compartilhar treino"
          variant="secondary"
          onPress={() => {
            const exercicios = detalhe.phases.reduce((n, f) => n + f.exercises.length, 0);
            const volume = detalhe.phases.reduce(
              (soma, f) =>
                soma +
                f.exercises.reduce(
                  (v, e) =>
                    v +
                    e.sets.reduce(
                      (sv, set) =>
                        sv + (set.completed ? (set.load ?? 0) * (set.repetitions ?? 0) : 0),
                      0),
                  0),
              0);
            (navigation as any).push('WorkoutShare', {
              workoutName: detalhe.workoutName,
              durationSec: detalhe.durationSec,
              exercises: exercicios > 0 ? exercicios : null,
              volumeKg: volume > 0 ? Math.round(volume) : null,
            });
          }}
        />
      </YStack>
    </DetailScreen>
  );
}
