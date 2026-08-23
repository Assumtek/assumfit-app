import { useNavigation } from '@react-navigation/native';
import { XStack, YStack } from '@tamagui/stacks';
import { File, Paths } from 'expo-file-system';
import React, { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { Note } from '../../components/List';
import { DetailScreen } from '../../components/DetailScreen';
import { Icon } from '../../components/Icon';
import { ProgressRing } from '../../components/ProgressRing';
import { Body, Button, Heading, Title } from '../../components/ui';
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
 * não mentir sobre o progresso e não parecer travada.
 *
 * O servidor não reporta fase, então o anel avança pelo TEMPO, numa curva que
 * satura em 95% — calibrada para a duração típica — e só a confirmação do
 * servidor fecha o círculo. Não é uma porcentagem medida, e é por isso que os
 * últimos 5% são reservados ao desfecho real; mas um anel parado (a versão
 * anterior, fixa em 22%) dizia algo pior: que nada estava acontecendo.
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
 * o registro no servidor continua, e é ele que decide o desfecho. Acompanha o
 * teto do backend (300 s, que cobre juiz + re-votação) com folga de polling.
 */
const TIMEOUT_MS = 330_000;

/**
 * Quantas consultas seguidas podem falhar antes de a tela desistir.
 *
 * Era UMA. Bloquear a tela do celular durante a espera — que dura minutos — faz
 * o iOS suspender o app e matar a requisição em voo; a consulta seguinte
 * estourava e a tela dizia "perdemos a conexão", com o servidor gerando o plano
 * normalmente do outro lado. Relatado em produção (ago/2026): a geração
 * continuou `RUNNING` no banco depois de a pessoa ver o erro.
 *
 * Seis tentativas cobrem uma suspensão curta e a volta da rede sem transformar
 * comportamento normal do sistema operacional em falha.
 */
const FALHAS_ATE_DESISTIR = 6;

/**
 * O pedido em curso, guardado em disco.
 *
 * Ele vivia só no fecho do efeito: sair da tela ou o app morrer perdia o
 * identificador, e a pessoa recomeçava do zero — gerando um SEGUNDO pedido
 * enquanto o primeiro ainda corria. Com o id em disco, voltar retoma a mesma
 * espera.
 */
const ARQUIVO_PEDIDO = 'geracao-em-curso.v1.json';

function guardarPedido(requestId: string) {
  try {
    new File(Paths.document, ARQUIVO_PEDIDO).write(JSON.stringify({ requestId, at: Date.now() }));
  } catch {
    // Sem disco, o comportamento volta a ser o antigo: recomeça do zero.
  }
}

/** O pedido guardado, se ainda fizer sentido esperá-lo. */
function lerPedido(): string | null {
  try {
    const f = new File(Paths.document, ARQUIVO_PEDIDO);
    if (!f.exists) return null;
    const { requestId, at } = JSON.parse(f.textSync()) as { requestId: string; at: number };
    if (!requestId || Date.now() - at > TIMEOUT_MS) {
      descartarPedido();
      return null;
    }
    return requestId;
  } catch {
    return null;
  }
}

function descartarPedido() {
  try {
    const f = new File(Paths.document, ARQUIVO_PEDIDO);
    if (f.exists) f.delete();
  } catch {
    // Sem disco a próxima leitura simplesmente não acha nada.
  }
}

export function GeneratingScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation<any>();
  const refresh = useWorkoutStore((s) => s.refresh);

  const [elapsedS, setElapsedS] = useState(0);
  const [status, setStatus] = useState<GenerationStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const startedAt = useRef(Date.now());

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    let falhasSeguidas = 0;
    let emCurso: string | null = null;

    const poll = async (requestId: string) => {
      if (!alive) return;
      emCurso = requestId;
      try {
        const current = await fetchGenerationStatus(requestId);
        if (!alive) return;
        falhasSeguidas = 0;
        setStatus(current);
        setError(null);

        if (current.finished) {
          descartarPedido();
          if (current.status === 'DONE') {
            await refresh();
            // Meio segundo para o anel FECHAR na tela antes de trocar: o
            // desfecho visível é parte do progresso, não um luxo.
            setTimeout(() => alive && navigation.replace('Plan'), 600);
          }
          return;
        }
        if (Date.now() - startedAt.current > TIMEOUT_MS) {
          setError('A geração está demorando mais que o normal. Volte em alguns minutos.');
          return;
        }
        timer = setTimeout(() => void poll(requestId), POLL_MS);
      } catch {
        if (!alive) return;
        /*
         Falha de consulta NÃO é falha de geração.

         O servidor gera de forma assíncrona e a tela só pergunta. Bloquear o
         celular durante a espera suspende o app e mata a requisição em voo —
         comportamento normal do iOS, que a versão anterior transformava em
         "perdemos a conexão" na primeira ocorrência, com o plano sendo gerado
         do outro lado.
        */
        falhasSeguidas += 1;
        if (falhasSeguidas >= FALHAS_ATE_DESISTIR) {
          setError('Perdemos a conexão com o servidor. O plano pode ter sido gerado, volte ao Treino em alguns minutos.');
          return;
        }
        // Espera crescente: a rede que voltou não precisa ser martelada.
        timer = setTimeout(() => void poll(requestId), POLL_MS * (falhasSeguidas + 1));
      }
    };

    /*
     Retoma o pedido guardado em vez de abrir outro.

     Sem isto, voltar à tela pedia uma SEGUNDA geração enquanto a primeira ainda
     corria — duas chamadas de modelo pelo mesmo plano, e a pessoa esperando o
     dobro.
    */
    const anterior = lerPedido();
    if (anterior) {
      void poll(anterior);
    } else {
      requestPlanGeneration()
        .then((requestId) => {
          if (!alive) return;
          guardarPedido(requestId);
          void poll(requestId);
        })
        .catch(() => alive && setError('Não foi possível iniciar a geração.'));
    }

    // De volta ao primeiro plano, pergunta na hora: o timer do JS fica congelado
    // enquanto o app dorme, e esperar o próximo tique somaria segundos à espera.
    const volta = AppState.addEventListener('change', (st) => {
      if (st === 'active' && alive && emCurso) {
        falhasSeguidas = 0;
        clearTimeout(timer);
        void poll(emCurso);
      }
    });

    return () => {
      alive = false;
      clearTimeout(timer);
      volta.remove();
    };
  }, [navigation, refresh]);

  // O relógio da tela: anel e etapas derivam os dois do mesmo tempo decorrido.
  useEffect(() => {
    const id = setInterval(() => setElapsedS((Date.now() - startedAt.current) / 1000), 250);
    return () => clearInterval(id);
  }, []);

  const done = status?.finished && status.status === 'DONE';
  /*
   1 - e^(-t/55): passa por ~65% aos 60 s e ~80% aos 90 s — o meio da faixa
   real de duração — e nunca alcança o teto de 95% sem o servidor confirmar.
   */
  const fraction = done ? 1 : Math.min(0.95, 1 - Math.exp(-elapsedS / 55));
  const step = Math.min(STEPS.length - 1, Math.floor(elapsedS / 18));

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
            <Heading fontWeight="800" color="$foreground" letterSpacing={-0.5}>
              {isReferral ? 'Melhor não gerar automático' : 'Não deu certo desta vez'}
            </Heading>
            <Body color="$mutedForeground">
              {status?.message ?? error}
            </Body>
          </YStack>

          {canRetry ? (
            <Button
              title="Tentar de novo"
              icon={<Icon name="arrowRight" size={16} color={colors.ink} />}
              onPress={() => navigation.replace('Generating')}
            />
          ) : null}

          {/*
            Encaminhamento não oferece "tentar de novo" — a mesma anamnese
            devolve o mesmo encaminhamento —, mas precisa oferecer REFAZER.

            A mensagem agora nomeia a condição declarada ("você indicou uma
            condição cardíaca"), e nomear sem dar caminho seria pior que a frase
            genérica de antes: quem marcou por engano leria a acusação e não
            teria como corrigi-la.
          */}
          {isReferral ? (
            <Button
              title="Refazer a anamnese"
              variant="secondary"
              onPress={() => navigation.replace('Anamnesis')}
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
                'O AssumFit é um produto de esporte, bem-estar e autoconhecimento, não um dispositivo médico. ' +
                'Ele não diagnostica nem substitui avaliação profissional, e quando o seu perfil ' +
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
          <ProgressRing size={132} strokeWidth={2} fraction={fraction} color={colors.accent}>
            <Title
              fontWeight="300"
              color="$foreground"
              fontVariant={['tabular-nums']}
            >
              {Math.round(fraction * 100)}%
            </Title>
          </ProgressRing>
        </YStack>

        <YStack gap="$sm">
          <Heading fontWeight="800" color="$foreground" letterSpacing={-0.5}>
            Montando seu treino
          </Heading>
          <Body color="$mutedForeground">
            {STEPS[step]}
          </Body>
        </YStack>

        <YStack gap="$md">
          {STEPS.map((label, i) => (
            <XStack key={label} alignItems="center" gap="$md">
              <YStack
                width={8}
                height={8}
                borderRadius={4}
                backgroundColor={i <= step ? '$primary' : '$track'}
              />
              <Body color={i <= step ? '$foreground' : '$mutedForeground'}>
                {label}
              </Body>
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
