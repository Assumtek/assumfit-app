import { Text } from '@tamagui/core';
import { XStack, YStack } from '@tamagui/stacks';
import React, { useEffect } from 'react';
import { Pressable, Switch } from 'react-native';

import { Row, Section } from '../components/Card';
import { DetailScreen } from '../components/DetailScreen';
import { Body, Data } from '../components/ui';
import {
  MAX_HORARIOS,
  SLOTS_PULSEIRA,
  useWaterReminderStore,
} from '../store/water-reminder.store';
import { useTheme } from '../theme/ThemeProvider';

/**
 * Os horários do lembrete de água, escolhidos pela pessoa.
 *
 * Grade de horas cheias, não um seletor de relógio: escolher "10h, 13h, 16h"
 * é decisão de RITMO do dia, não de minuto — e a grade mostra o dia inteiro de
 * uma vez, o que nenhum seletor de rolagem faz. Meia em meia hora dobraria a
 * grade para dizer quase nada: ninguém bebe água "às 14h30 em ponto".
 */

const HORAS = Array.from({ length: 17 }, (_, i) => i + 6); // 06h–22h

export function WaterReminderScreen() {
  const { colors } = useTheme();
  const ligado = useWaterReminderStore((s) => s.ligado);
  const horarios = useWaterReminderStore((s) => s.horarios);
  const pulseiraOk = useWaterReminderStore((s) => s.pulseiraOk);
  const salvando = useWaterReminderStore((s) => s.salvando);
  const carregar = useWaterReminderStore((s) => s.carregar);
  const aplicar = useWaterReminderStore((s) => s.aplicar);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const alternarHora = (hora: number) => {
    const horario = `${String(hora).padStart(2, '0')}:00`;
    const tem = horarios.includes(horario);
    if (!tem && horarios.length >= MAX_HORARIOS) return;
    const novos = tem ? horarios.filter((h) => h !== horario) : [...horarios, horario];
    if (novos.length === 0) {
      // Sem horário não há lembrete: desligar é mais honesto que fingir.
      void aplicar(false, novos);
      return;
    }
    // Escolher horário é declarar intenção — liga junto, sem segundo toque.
    void aplicar(true, novos);
  };

  return (
    <DetailScreen title="Lembrete de água">
      <Section label="Lembrete">
        <Row last>
          <YStack flex={1} gap={2}>
            <Body color="$foreground">Lembrar de beber água</Body>
            <Data>
              {ligado
                ? `${horarios.length} ${horarios.length === 1 ? 'horário' : 'horários'} por dia`
                : 'desligado'}
            </Data>
          </YStack>
          <Switch
            value={ligado}
            onValueChange={(v) => void aplicar(v)}
            trackColor={{ true: colors.accent }}
            disabled={salvando}
          />
        </Row>
      </Section>

      <YStack marginTop="$xl">
        <Section label="Nos horários">
          <Row last>
            <XStack flexWrap="wrap" gap="$sm" paddingVertical="$xs">
              {HORAS.map((hora) => {
                const horario = `${String(hora).padStart(2, '0')}:00`;
                const ativo = ligado && horarios.includes(horario);
                return (
                  <Pressable
                    key={hora}
                    onPress={() => alternarHora(hora)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: ativo }}
                    accessibilityLabel={`${hora} horas`}
                  >
                    <YStack
                      paddingVertical={8}
                      paddingHorizontal={12}
                      borderRadius={999}
                      borderWidth={1}
                      borderColor={ativo ? '$primary' : '$borderStrong'}
                      backgroundColor={ativo ? '$primarySoft' : 'transparent'}
                    >
                      <Text fontSize={13} color={ativo ? '$foreground' : '$mutedForeground'}>
                        {hora}h
                      </Text>
                    </YStack>
                  </Pressable>
                );
              })}
            </XStack>
          </Row>
        </Section>
      </YStack>

      <Data marginTop="$md" color="$mutedForeground">
        {pulseiraOk
          ? `A pulseira vibra nos ${SLOTS_PULSEIRA} primeiros horários; o celular avisa em todos.`
          : 'O celular avisa em todos os horários; a pulseira entra quando conectar.'}
      </Data>
    </DetailScreen>
  );
}
