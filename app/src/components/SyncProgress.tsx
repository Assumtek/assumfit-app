import { XStack, YStack } from '@tamagui/stacks';
import React from 'react';
import { ActivityIndicator } from 'react-native';

import { Icon } from './Icon';
import { SYNC_LABEL, SYNC_ORDER } from './BandStatus';
import { Body, Data, SectionTitle } from './ui';
import { useBiometricStore } from '../store/biometric.store';
import { useTheme } from '../theme/ThemeProvider';

/**
 * A sincronização explicada enquanto acontece.
 *
 * O motivo de existir é um caso real (ago/2026): alguém em teste tocou em
 * sincronizar, viu um indicador girando sem nenhuma palavra, concluiu que o app
 * estava quebrado e o DESINSTALOU. Nada estava quebrado — a leitura da memória
 * são seis consultas em série por um canal serial lento, e leva de meio minuto
 * a um minuto.
 *
 * O que separa espera de travamento não é a duração, é saber o que está
 * acontecendo. Então a espera aqui é uma lista: o que já chegou fica marcado, o
 * que está chegando é a linha viva, o que falta fica apagado. Ninguém precisa
 * ler o texto para entender — a lista andando já conta.
 *
 * Não usa `$destructive` em nenhum estado: etapa que não respondeu não é erro
 * do corpo de ninguém, e a cor de alerta é reservada a valor fora da faixa
 * saudável.
 */
export function SyncProgress() {
  const { colors } = useTheme();
  const bandActivity = useBiometricStore((s) => s.bandActivity);
  const syncError = useBiometricStore((s) => s.syncError);

  const emCurso = bandActivity?.kind === 'sync' ? bandActivity : null;

  /*
   O erro tem precedência sobre a lista, e não o contrário.

   Quando o teto estoura, a consulta nativa continua pendente lá dentro — o
   canal ainda diz "sincronizando" por um tempo. Mostrar a lista andando ao lado
   de uma falha já declarada daria duas respostas opostas na mesma tela. Uma
   nova tentativa limpa o erro antes de começar, então isto nunca esconde
   progresso real.
  */
  if (syncError) {
    return (
      <YStack gap="$sm">
        <SectionTitle fontSize={16}>A leitura não terminou</SectionTitle>
        <Body>{syncError}</Body>
      </YStack>
    );
  }

  if (!emCurso) return null;
  const atual = emCurso;

  /*
   A varredura das noites guardadas não tem as etapas do dia — é o mesmo
   dia repetido sete vezes. Mostrar a lista de grandezas ali seria mentira, e
   uma linha com a contagem diz o mesmo sem inventar estrutura.
  */
  if (atual.step === 'memory' || atual.step === 'sleep') {
    return (
      <YStack gap="$sm">
        <XStack alignItems="center" gap="$sm">
          <ActivityIndicator size="small" color={colors.accent} />
          <Data color="$foreground">
            {SYNC_LABEL[atual.step]}
            {atual.total > 1 ? ` · ${atual.done} de ${atual.total}` : ''}
          </Data>
        </XStack>
        <Body>
          A pulseira guarda até sete dias sozinha. Estamos trazendo o que ficou gravado enquanto o
          celular não estava por perto.
        </Body>
      </YStack>
    );
  }

  const indiceAtual = SYNC_ORDER.indexOf(atual.step);

  return (
    <YStack gap="$md">
      <YStack gap="$xs">
        <SectionTitle fontSize={16}>Lendo a memória da pulseira</SectionTitle>
        <Body>
          Ela mede sozinha o dia todo e guarda tudo por dentro. Agora estamos trazendo cada
          grandeza, uma por vez, leva cerca de um minuto. Pode manter a tela aberta.
        </Body>
      </YStack>

      <YStack gap="$sm">
        {SYNC_ORDER.map((step, i) => {
          const pronta = i < indiceAtual;
          const viva = i === indiceAtual;
          return (
            <XStack key={step} alignItems="center" gap="$md">
              {/*
                Três estados, três marcas: círculo vazio (falta), indicador
                girando (agora), tique (chegou). O ícone é o que se lê de
                relance; o texto confirma.
              */}
              <YStack width={20} height={20} alignItems="center" justifyContent="center">
                {viva ? (
                  <ActivityIndicator size="small" color={colors.accent} />
                ) : pronta ? (
                  <Icon name="check" size={16} color={colors.accent} />
                ) : (
                  <YStack
                    width={8}
                    height={8}
                    borderRadius={4}
                    borderWidth={1}
                    borderColor="$border"
                  />
                )}
              </YStack>
              <Data color={viva || pronta ? '$foreground' : '$mutedForeground'} flexShrink={1}>
                {SYNC_LABEL[step]}
              </Data>
            </XStack>
          );
        })}
      </YStack>

      {/*
        A régua no acento: é o único lugar da peça em que a cor da marca aparece
        como dado, e ela mostra a mesma verdade da lista num traço só.
      */}
      <YStack height={4} borderRadius={2} backgroundColor="$border" overflow="hidden">
        <YStack
          height={4}
          borderRadius={2}
          backgroundColor="$primary"
          width={`${Math.round((atual.done / atual.total) * 100)}%`}
        />
      </YStack>
    </YStack>
  );
}
