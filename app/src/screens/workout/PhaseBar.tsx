import { Text } from '@tamagui/core';
import { XStack, YStack } from '@tamagui/stacks';
import React from 'react';

/**
 * Barra de contexto da fase — portada do MUVX.
 *
 * Responde às duas perguntas que se faz no meio do treino: em que parte estou,
 * e quanto falta. A barra vertical colorida à esquerda é o que dá a resposta
 * antes mesmo da leitura.
 *
 * **As cores de fase são as do MUVX, com uma substituição.** Laranja para
 * alongamento e rosa para cardio vêm de lá inteiras; o treino usava o verde de
 * marca deles, e aqui usa o acento do AssumFit. É a mesma troca que vale para o
 * resto do sistema: a composição é do MUVX, a marca é nossa.
 */

export type PhaseType = 'ALONGAMENTO' | 'TREINO' | 'CARDIO';

export const PHASE_COLOR: Record<PhaseType, string> = {
  ALONGAMENTO: '#F97316',
  TREINO: '#877BF0',
  CARDIO: '#F43F5E',
};

export const PHASE_NAME: Record<PhaseType, string> = {
  ALONGAMENTO: 'Alongamento',
  TREINO: 'Treino',
  CARDIO: 'Cardio',
};

export type PhaseProgress = {
  type: PhaseType;
  total: number;
  completed: number;
};

export function PhaseBar({
  current,
  positionInPhase,
  phaseTotal,
  phases,
}: {
  current: PhaseType;
  positionInPhase: number;
  phaseTotal: number;
  phases: PhaseProgress[];
}) {
  const completed = phases.find((p) => p.type === current)?.completed ?? 0;
  // Piso de 5% para a barra não sumir por completo no primeiro exercício — uma
  // barra vazia lê como "nada carregou".
  const progress = phaseTotal > 0 ? Math.max((completed / phaseTotal) * 100, 5) : 5;

  return (
    <YStack paddingHorizontal="$xl" marginTop="$md" gap="$md">
      <XStack alignItems="center" gap="$sm">
        {/* Cor de fase vai por `style`, não por token: são três cores
            semânticas que não participam do tema e não têm variante clara/escura
            — declará-las como token do Tamagui seria inflar a paleta com o que
            nunca muda. É como o MUVX também as aplica. */}
        <YStack width={3} height={22} borderRadius={2} style={{ backgroundColor: PHASE_COLOR[current] }} />
        <Text fontSize={15} fontWeight="500" color="$foreground" flex={1}>
          {PHASE_NAME[current]}
        </Text>
        <Text fontSize={13} color="$foreground">
          {positionInPhase} de {phaseTotal} {phaseTotal === 1 ? 'exercício' : 'exercícios'}
        </Text>
      </XStack>

      <YStack height={4} backgroundColor="$border" borderRadius={999} overflow="hidden">
        <YStack
          height={4}
          borderRadius={999}
          width={`${progress}%`}
          style={{ backgroundColor: PHASE_COLOR[current] }}
        />
      </YStack>

      {phases.length > 1 ? (
        <XStack gap="$md" justifyContent="center" flexWrap="wrap">
          {phases.map((phase) => {
            const active = phase.type === current;
            const done = phase.completed >= phase.total && phase.total > 0;
            return (
              <YStack
                key={phase.type}
                paddingHorizontal="$md"
                paddingVertical={6}
                borderRadius={999}
                borderWidth={active ? 1 : 0}
                backgroundColor={active ? undefined : '$control'}
                style={
                  active
                    ? {
                        // `26` e `66` são o alfa em hexadecimal (15% e 40%).
                        backgroundColor: `${PHASE_COLOR[phase.type]}26`,
                        borderColor: `${PHASE_COLOR[phase.type]}66`,
                      }
                    : undefined
                }
              >
                <Text
                  fontSize={12}
                  color={active ? undefined : '$mutedForeground'}
                  fontWeight={active ? '600' : '400'}
                  style={active ? { color: PHASE_COLOR[phase.type] } : undefined}
                >
                  {PHASE_NAME[phase.type]} {done ? '✓' : `${phase.completed}/${phase.total}`}
                </Text>
              </YStack>
            );
          })}
        </XStack>
      ) : null}
    </YStack>
  );
}
