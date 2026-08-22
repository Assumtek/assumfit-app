import { Text } from '@tamagui/core';
import { XStack, YStack } from '@tamagui/stacks';
import React from 'react';
import { Pressable } from 'react-native';

import { DAY_LABEL, DAY_SHORT } from '../domain/workout';
import type { DiaDeTreino, SemanaDeTreino } from '../domain/trainingWeek';
import { useTheme } from '../theme/ThemeProvider';
import { Icon } from './Icon';
import { Data, Label } from './ui';

/**
 * A SEMANA — sete dias, UMA marca em cada.
 *
 * A primeira versão era um gráfico de barras: trilho, barra, traço da meta,
 * ícone de modalidade, rótulo e ponto de hoje, seis marcas por coluna, 42 numa
 * faixa de 60 pontos. Ficou feia, e o motivo é estrutural e não de ajuste: numa
 * peça desse tamanho, cada marca a mais divide a atenção sem acrescentar
 * leitura. A magnitude em altura de barra também não se sustentava — a diferença
 * entre 40 e 55 minutos não se lê em 60 pontos, e quem quer a curva de volume
 * tem o gráfico de constância logo abaixo.
 *
 * O vocabulário agora tem TRÊS estados e um símbolo cada:
 *
 * - **disco cheio** — houve movimento registrado no dia, valha o que valer o
 *   plano. É o único lugar do acento aqui, porque é o único dado medido.
 * - **disco vazado** — treino previsto e ainda não feito.
 * - **traço** — nada previsto, nada feito.
 *
 * Quanto tempo foi cada dia mora na leitura abaixo, em palavra ("52 min
 * registrados"), e o total da semana no cabeçalho. Número solto dentro da
 * régua seria o número cru que nenhuma tela deste app formata.
 */

type Props = {
  semana: SemanaDeTreino;
  /** O dia aberto na leitura abaixo, pelo `weekday`. */
  selecionado: string;
  onSelect: (dia: DiaDeTreino) => void;
  /** Sequência de dias com movimento, quando a tela quer mostrá-la. */
  streak?: number;
};

export function WeekRail({ semana, selecionado, onSelect, streak }: Props) {
  const { colors } = useTheme();

  /*
   O resumo em palavra, e não um segundo número solto: "3 de 4" só existe
   quando há plano; sem plano, o que há para dizer é o total de minutos.
  */
  const resumo =
    semana.previstos > 0
      ? `${semana.cumpridos} de ${semana.previstos} cumpridos`
      : semana.minutos > 0
        ? `${semana.minutos} min na semana`
        : null;

  return (
    <YStack gap="$md">
      <XStack alignItems="center" justifyContent="space-between">
        <Label>sua semana</Label>
        <XStack alignItems="center" gap="$md">
          {resumo ? <Data>{resumo}</Data> : null}
          {typeof streak === 'number' && streak > 0 ? (
            <XStack alignItems="center" gap={4}>
              <Icon name="flame" size={14} color={colors.accent} strokeWidth={2} />
              <Text fontSize={12} fontWeight="700" color="$primary" fontVariant={['tabular-nums']}>
                {streak}
              </Text>
            </XStack>
          ) : null}
        </XStack>
      </XStack>

      {/*
        A faixa se apoia em duas arestas de hairline, como `ReadoutCluster`.

        Sem elas as marcas flutuavam sob os rótulos, e sete pontos soltos leem
        como respingo, não como régua. A aresta é o chão — e é a MESMA gramática
        dos mostradores da sessão, o que faz o módulo inteiro falar uma língua
        só em vez de duas.
      */}
      <YStack borderTopWidth={1} borderBottomWidth={1} borderColor="$border">
        <XStack paddingVertical="$md">
          {semana.dias.map((dia) => (
            <Dia
              key={dia.weekday}
              dia={dia}
              aberto={dia.weekday === selecionado}
              onPress={() => onSelect(dia)}
            />
          ))}
        </XStack>
      </YStack>
    </YStack>
  );
}

/** 10 pt: grande o bastante para o cheio e o vazado se distinguirem de relance. */
const DISCO = 10;

function Dia({
  dia,
  aberto,
  onPress,
}: {
  dia: DiaDeTreino;
  aberto: boolean;
  onPress: () => void;
}) {
  const moveu = dia.cumprido > 0;
  const previsto = !!dia.planejado;

  const dito = [
    DAY_LABEL[dia.weekday],
    dia.ehHoje ? 'hoje' : null,
    dia.planejado ? dia.planejado.name : dia.descanso ? 'descanso' : null,
    moveu ? `${dia.cumprido} minutos registrados` : previsto ? 'ainda não feito' : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: aberto }}
      accessibilityLabel={dito}
      style={({ pressed }) => [{ flex: 1 }, pressed && { opacity: 0.6 }]}
    >
      {/*
        A seleção é uma pílula que ABRAÇA o conteúdo.

        Ela era uma caixa de 100 pontos de altura para uma marca de 10 — no tema
        claro, um bloco branco que dominava a faixa inteira e quebrava a fileira
        por cima e por baixo. Superfície discreta, e nunca acento: o acento
        pertence ao dado, e o dado deste dia é a marca.
      */}
      <YStack
        alignItems="center"
        gap={6}
        paddingVertical={6}
        borderRadius={10}
        backgroundColor={aberto ? '$card' : 'transparent'}
      >
        <Text
          fontSize={12}
          fontWeight={dia.ehHoje ? '700' : '400'}
          color={dia.ehHoje ? '$foreground' : '$mutedForeground'}
        >
          {DAY_SHORT[dia.weekday]}
        </Text>

        {/* Altura fixa: o traço do descanso é mais baixo que o disco, e sem a
            caixa comum a fileira inteira ondula. */}
        <YStack height={DISCO} justifyContent="center" alignItems="center">
          {moveu ? (
            <YStack
              width={DISCO}
              height={DISCO}
              borderRadius={DISCO / 2}
              backgroundColor="$primary"
            />
          ) : previsto ? (
            <YStack
              width={DISCO}
              height={DISCO}
              borderRadius={DISCO / 2}
              borderWidth={1.5}
              /*
               Vazado usa `$mutedForeground`, não `$borderStrong`: no tema claro
               o hairline forte mede 0,22 de opacidade, e um anel de 1,5 px
               nessa força some. "Previsto e não feito" é o estado que mais
               precisa ser visto — é a pendência da semana.

               Hoje em aberto é o único vazado com acento: é o convite do dia,
               não um registro.
              */
              borderColor={dia.ehHoje ? '$primary' : '$mutedForeground'}
            />
          ) : (
            /*
             Descanso é o estado mais quieto dos três, e é de propósito: não há
             nada a fazer nele. Menos quando é HOJE — aí o acento marca a posição
             do agora, que é dado, e sem ele o dia corrente ficava sem acento
             nenhum na régua justamente quando é dia de folga.
            */
            <YStack
              width={DISCO}
              height={2}
              borderRadius={1}
              backgroundColor={dia.ehHoje ? '$primary' : '$borderStrong'}
            />
          )}
        </YStack>
      </YStack>
    </Pressable>
  );
}
