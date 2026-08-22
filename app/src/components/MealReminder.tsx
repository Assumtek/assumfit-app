import { horaCurta } from '../domain/horario';
import { useNavigation } from '@react-navigation/native';
import { XStack, YStack } from '@tamagui/stacks';
import React, { useEffect } from 'react';
import { Pressable, Switch } from 'react-native';

import { Row, Section } from './Card';
import { Icon } from './Icon';
import { Body, Data } from './ui';
import { useMealReminderStore } from '../store/meal-reminder.store';
import { useTheme } from '../theme/ThemeProvider';

/** A entrada do lembrete de refeições — a mesma linha do lembrete de água, na tela de Refeições. */
export function MealReminder() {
  const { colors } = useTheme();
  const navigation = useNavigation();
  const ligado = useMealReminderStore((s) => s.ligado);
  const horarios = useMealReminderStore((s) => s.horarios);
  const salvando = useMealReminderStore((s) => s.salvando);
  const carregar = useMealReminderStore((s) => s.carregar);
  const aplicar = useMealReminderStore((s) => s.aplicar);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  return (
    <Section label="Lembrete de refeições">
      <Row last>
        <Pressable
          style={{ flex: 1 }}
          onPress={() => (navigation as any).push('MealReminder' as never)}
          accessibilityRole="button"
          accessibilityLabel="Escolher horários do lembrete de refeições"
        >
          <XStack alignItems="center" gap="$sm">
            <YStack flex={1} gap={4}>
              <Body color="$foreground">Lembrar de registrar o que comi</Body>
              <Data>
                {ligado
                  ? `às ${horarios.map(horaCurta).join(', ')}`
                  : 'toque para escolher os horários'}
              </Data>
            </YStack>
            <Icon name="arrowRight" size={16} color={colors.textMuted} />
          </XStack>
        </Pressable>
        <Switch
          value={ligado}
          onValueChange={(v) => void aplicar(v)}
          trackColor={{ true: colors.accent }}
          disabled={salvando}
        />
      </Row>
    </Section>
  );
}
