import { useNavigation } from '@react-navigation/native';
import { Text } from '@tamagui/core';
import { XStack, YStack } from '@tamagui/stacks';
import React, { useEffect, useRef, useState } from 'react';

import { Note } from '../../components/Card';
import { DetailScreen } from '../../components/DetailScreen';
import { Icon } from '../../components/Icon';
import { ProgressRing } from '../../components/ProgressRing';
import { Button } from '../../components/ui';
import {
  fetchGenerationStatus,
  requestPlanGeneration,
  type GenerationStatus,
} from '../../services/api.service';
import { useWorkoutStore } from '../../store/workout.store';
import { useTheme } from '../../theme/ThemeProvider';

/**
 * A espera da geração.
 *
 * Leva de 50 a 120 segundos — duas chamadas de modelo sobre o catálogo inteiro.
 * Uma tela de espera desse tamanho precisa fazer duas coisas ao mesmo tempo:
 * não mentir sobre o progresso (não há porcentagem real a mostrar) e não
 * parecer travada.
 *
 * A saída é dizer o que está acontecendo, em etapas que correspondem ao que o
 * servidor realmente faz. O anel é indeterminado de propósito — uma barra
 * chegando a 90% e parando ali é pior que nenhuma barra.
 */
const STEPS = [
  'Lendo o que você respondeu',
  'Cruzando com as referências clínicas do seu perfil',
  'Escolhendo os exercícios',
  'Conferindo se o treino é seguro para você',
];

/** Intervalo entre consultas. Curto o bastante para a tela virar rápido no fim. */
const POLL_MS = 2500;

/**
 * Teto de espera. Acima disso a geração não terminou e a tela para de esperar —
 * o registro no servidor continua, e é ele que decide o desfecho.
 */
const TIMEOUT_MS = 240_000;

export function GeneratingScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation<any>();
  const refresh = useWorkoutStore((s) => s.refresh);

  const [step, setStep] = useState(0);
  const [status, setStatus] = useState<GenerationStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const startedAt = useRef(Date.now());

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;

    const poll = async (requestId: string) => {
      if (!alive) return;
      try {
        const current = await fetchGenerationStatus(requestId);
        if (!alive) return;
        setStatus(current);
        if (current.finished) {
          if (current.status === 'DONE') {
            await refresh();
            navigation.replace('Plan');
          }
          return;
        }
        if (Date.now() - startedAt.current > TIMEOUT_MS) {
          setError('A geração está demorando mais que o normal. Volte em alguns minutos.');
          return;
        }
        timer = setTimeout(() => void poll(requestId), POLL_MS);
      } catch {
        if (alive) setError('Perdemos a conexão com o servidor. Tente de novo.');
      }
    };

    requestPlanGeneration()
      .then((requestId) => void poll(requestId))
      .catch(() => alive && setError('Não foi possível iniciar a geração.'));

    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [navigation, refresh]);

  // As etapas avançam por tempo, não por sinal do servidor — ele não reporta
  // fase. Elas são honestas sobre a ORDEM do que acontece, não sobre o instante.
  useEffect(() => {
    const id = setInterval(() => setStep((s) => Math.min(STEPS.length - 1, s + 1)), 18_000);
    return () => clearInterval(id);
  }, []);

  const failed = status?.finished && status.status !== 'DONE';

  if (failed || error) {
    const isReferral = status?.status === 'REFERRAL';
    // Encaminhamento não é falha e não oferece "tentar de novo": tentar de novo
    // com a mesma anamnese devolve o mesmo encaminhamento, e insistir seria
    // sugerir que a recusa é um obstáculo a contornar.
    const canRetry = !isReferral;

    return (
      <DetailScreen title="Seu treino">
        <YStack gap="$xl" paddingTop="$lg">
          <YStack gap="$sm">
            <Text fontSize={24} fontWeight="800" color="$foreground" letterSpacing={-0.5}>
              {isReferral ? 'Melhor não gerar automático' : 'Não deu certo desta vez'}
            </Text>
            <Text fontSize={14} color="$mutedForeground">
              {status?.message ?? error}
            </Text>
          </YStack>

          {canRetry ? (
            <Button
              title="Tentar de novo"
              icon={<Icon name="arrowRight" size={16} color={colors.ink} />}
              onPress={() => navigation.replace('Generating')}
            />
          ) : null}

          <Button
            title="Voltar para o início"
            variant="ghost"
            onPress={() => navigation.navigate('Main')}
          />

          {isReferral ? (
            <Note
              title="escopo do AssumFit"
              body={
                'O AssumFit é um produto de bem-estar e produtividade, não um dispositivo médico. ' +
                'Ele não diagnostica nem substitui avaliação profissional — e quando o seu perfil ' +
                'pede essa avaliação, o certo é dizer isso em vez de gerar um treino mesmo assim.'
              }
            />
          ) : null}
        </YStack>
      </DetailScreen>
    );
  }

  return (
    <DetailScreen title="Seu treino">
      <YStack gap="$xl" paddingTop="$xl">
        <YStack alignItems="flex-start">
          <ProgressRing size={132} strokeWidth={2} fraction={0.22} color={colors.accent} />
        </YStack>

        <YStack gap="$sm">
          <Text fontSize={24} fontWeight="800" color="$foreground" letterSpacing={-0.5}>
            Montando seu treino
          </Text>
          <Text fontSize={14} color="$mutedForeground">
            {STEPS[step]}
          </Text>
        </YStack>

        <YStack gap="$md">
          {STEPS.map((label, i) => (
            <XStack key={label} alignItems="center" gap="$md">
              <YStack
                width={6}
                height={6}
                borderRadius={3}
                backgroundColor={i <= step ? '$primary' : '$track'}
              />
              <Text fontSize={13} color={i <= step ? '$foreground' : '$mutedForeground'}>
                {label}
              </Text>
            </XStack>
          ))}
        </YStack>

        <Note
          title="por que demora"
          body={
            'O treino não sai de um catálogo pronto. Ele é montado a partir das suas respostas e das ' +
            'referências clínicas do seu perfil, e depois passa por uma conferência de segurança antes ' +
            'de chegar até você. Costuma levar entre um e dois minutos.'
          }
        />
      </YStack>
    </DetailScreen>
  );
}
