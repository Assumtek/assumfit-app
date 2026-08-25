import { XStack, YStack } from '@tamagui/stacks';
import { Body, BodyLarge, Data, SectionTitle } from '../../components/ui';
import React from 'react';
import { TextInput, TouchableOpacity } from 'react-native';

import { Icon } from '../../components/Icon';
import { SetTimer } from './SetTimer';
import { useTheme } from '../../theme/ThemeProvider';

/**
 * Série, em stepper — portado do MUVX.
 *
 * As três formas não são variação decorativa; são o que faz a tela funcionar
 * com o celular apoiado no banco:
 *
 * - **concluída** colapsa numa linha com o que foi feito ("60kg · 12 reps");
 * - **pendente** é uma linha apagada, só para dar noção de quanto falta;
 * - **ativa** expande com os campos.
 *
 * Uma lista onde todas as séries estão expandidas ao mesmo tempo obriga a
 * procurar em qual delas se está. Aqui só existe uma resposta possível.
 */

export type SeriesState = { load: string; reps: string; completed: boolean };

type Props = {
  number: number;
  prescribedReps: string;
  state: SeriesState;
  isActive: boolean;
  /** Alongamento e cardio: só duração e confirmação, sem carga nem repetição. */
  simple?: boolean;
  isCardio?: boolean;
  /** Série prescrita em segundos (prancha, isometria): relógio no lugar das reps. */
  seconds?: number | null;
  onChange: (patch: Partial<SeriesState>) => void;
  onToggle: () => void;
  onSkip?: () => void;
};

export function SeriesCard({
  number,
  prescribedReps,
  state,
  isActive,
  simple,
  isCardio,
  seconds,
  onChange,
  onToggle,
  onSkip,
}: Props) {
  const { colors } = useTheme();
  const pending = !state.completed && !isActive;

  // ---- Concluída: uma linha ---------------------------------------------
  if (state.completed) {
    return (
      <XStack
        alignItems="center"
        gap="$md"
        paddingVertical="$lg"
        borderBottomWidth={1}
        borderBottomColor="$border"
        opacity={0.7}
      >
        <Body color="$mutedForeground" minWidth={28}>
          {number}ª
        </Body>
        <Body color="$mutedForeground" flex={1}>
          {simple
            ? `${prescribedReps} concluído`
            : seconds
              ? `${state.load || '0'}kg · ${state.reps || seconds} s`
              : `${state.load || '0'}kg · ${state.reps || '0'} reps`}
        </Body>
        <TouchableOpacity onPress={onToggle} activeOpacity={0.7} accessibilityRole="checkbox">
          <YStack
            width={28}
            height={28}
            borderRadius={999}
            alignItems="center"
            justifyContent="center"
            backgroundColor="$primary"
          >
            <Icon name="check" size={16} color={colors.ink} />
          </YStack>
        </TouchableOpacity>
      </XStack>
    );
  }

  // ---- Pendente: linha apagada ------------------------------------------
  if (pending) {
    return (
      <XStack
        alignItems="center"
        gap="$md"
        paddingVertical="$lg"
        borderBottomWidth={1}
        borderBottomColor="$border"
        opacity={0.35}
      >
        <Body color="$mutedForeground" minWidth={28}>
          {number}ª
        </Body>
        <Body color="$mutedForeground" flex={1}>
          Pendente
        </Body>
        <YStack width={28} height={28} borderRadius={999} borderWidth={1} borderColor="$border" />
      </XStack>
    );
  }

  // ---- Ativa, alongamento ou cardio: só confirmar ------------------------
  if (simple) {
    return (
      <YStack paddingVertical="$lg" borderBottomWidth={1} borderBottomColor="$border">
        <XStack alignItems="center" gap="$md">
          <SectionTitle color="$foreground" minWidth={28}>
            {number}ª
          </SectionTitle>
          <YStack flex={1}>
            <BodyLarge fontWeight="500" color="$foreground">
              {isCardio ? `Faça por ${prescribedReps}` : `Mantenha por ${prescribedReps}`}
            </BodyLarge>
            <Body color="$mutedForeground">
              {isCardio ? 'Mantenha o ritmo constante' : 'Respire calmamente e segure a posição'}
            </Body>
          </YStack>
          <TouchableOpacity onPress={onToggle} activeOpacity={0.7} accessibilityRole="checkbox">
            <YStack
              width={48}
              height={48}
              borderRadius={12}
              alignItems="center"
              justifyContent="center"
              borderWidth={2}
              borderColor="$primary"
            >
              <Icon name="check" size={24} color={colors.accent} />
            </YStack>
          </TouchableOpacity>
        </XStack>
        {onSkip ? (
          <TouchableOpacity onPress={onSkip} activeOpacity={0.7}>
            <XStack alignItems="center" justifyContent="center" gap="$xs" marginTop="$sm">
              <Body color="$mutedForeground">
                Pular
              </Body>
              <Icon name="arrowRight" size={12} color={colors.textMuted} />
            </XStack>
          </TouchableOpacity>
        ) : null}
      </YStack>
    );
  }

  // ---- Ativa, força: campos de carga e repetição -------------------------
  return (
    <YStack paddingVertical="$lg" borderBottomWidth={1} borderBottomColor="$border">
      <XStack alignItems="center" gap="$md">
        <SectionTitle color="$foreground" minWidth={28}>
          {number}ª
        </SectionTitle>
        <Body fontWeight="500" color="$primary" flex={1}>
          Série atual
        </Body>
        {onSkip ? (
          <TouchableOpacity onPress={onSkip} activeOpacity={0.7}>
            <XStack alignItems="center" gap="$xs">
              <Body color="$mutedForeground">
                Pular
              </Body>
              <Icon name="arrowRight" size={12} color={colors.textMuted} />
            </XStack>
          </TouchableOpacity>
        ) : null}
      </XStack>

      <XStack gap="$md" marginTop="$md" alignItems="flex-end">
        <NumberField
          label="Peso (kg)"
          value={state.load}
          onChangeText={(v) => onChange({ load: v.replace(',', '.') })}
          keyboardType="decimal-pad"
        />
        {seconds ? (
          <SetTimer
            seconds={seconds}
            label={`Tempo (${prescribedReps})`}
            onDone={() => {
              onChange({ reps: String(seconds) });
              onToggle();
            }}
          />
        ) : (
          <NumberField
            label={`Reps (${prescribedReps})`}
            value={state.reps}
            onChangeText={(v) => onChange({ reps: v.replace(/\D/g, '') })}
            keyboardType="number-pad"
          />
        )}
        <TouchableOpacity onPress={onToggle} activeOpacity={0.7} accessibilityRole="checkbox">
          <YStack
            width={48}
            height={48}
            borderRadius={12}
            alignItems="center"
            justifyContent="center"
            borderWidth={2}
            borderColor="$primary"
          >
            <Icon name="check" size={24} color={colors.accent} />
          </YStack>
        </TouchableOpacity>
      </XStack>
    </YStack>
  );
}

function NumberField({
  label,
  value,
  onChangeText,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  keyboardType: 'decimal-pad' | 'number-pad';
}) {
  const { colors } = useTheme();
  return (
    <YStack flex={1} gap="$xs">
      <Data color="$mutedForeground">
        {label}
      </Data>
      <YStack
        backgroundColor="$card"
        borderRadius={12}
        borderWidth={1}
        borderColor="$border"
        minHeight={48}
        justifyContent="center"
      >
        <TextInput
          style={{
            color: colors.text,
            fontSize: 18,
            fontWeight: '600',
            textAlign: 'center',
            paddingVertical: 12,
          }}
          value={value}
          onChangeText={onChangeText}
          keyboardType={keyboardType}
          placeholder="0"
          placeholderTextColor={colors.textFaint}
          accessibilityLabel={label}
        />
      </YStack>
    </YStack>
  );
}
