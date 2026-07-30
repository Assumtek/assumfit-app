import { Text } from '@tamagui/core';
import { XStack, YStack } from '@tamagui/stacks';
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, Switch } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Row, Section } from '../components/Card';
import { DetailScreen } from '../components/DetailScreen';
import { Icon } from '../components/Icon';
import { TimeWheel } from '../components/TimeWheel';
import { Body, Button, Data } from '../components/ui';
import {
  MAX_HORARIOS,
  SLOTS_PULSEIRA,
  useWaterReminderStore,
} from '../store/water-reminder.store';
import { useTheme } from '../theme/ThemeProvider';

/**
 * Os horários do lembrete de água — quantos a pessoa quiser, na hora que quiser.
 *
 * Lista + roda de seleção, não grade de botões: a grade de 17 chips virava uma
 * parede de toques iguais, e limitava a hora cheia. A roda é o vocabulário que
 * o sistema já ensinou para "escolher um horário", e o minuto vem junto.
 */

const HORAS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTOS = ['00', '10', '15', '20', '30', '40', '45', '50'];

export function WaterReminderScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const ligado = useWaterReminderStore((s) => s.ligado);
  const horarios = useWaterReminderStore((s) => s.horarios);
  const pulseiraOk = useWaterReminderStore((s) => s.pulseiraOk);
  const salvando = useWaterReminderStore((s) => s.salvando);
  const carregar = useWaterReminderStore((s) => s.carregar);
  const aplicar = useWaterReminderStore((s) => s.aplicar);

  const [editando, setEditando] = useState(false);
  const [hora, setHora] = useState('10');
  const [minuto, setMinuto] = useState('00');

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const remover = (horario: string) => {
    const novos = horarios.filter((h) => h !== horario);
    void aplicar(novos.length > 0 && ligado, novos);
  };

  const confirmarNovo = () => {
    const novo = `${hora}:${minuto}`;
    setEditando(false);
    if (horarios.includes(novo)) return;
    // Escolher horário é declarar intenção — liga junto, sem segundo toque.
    void aplicar(true, [...horarios, novo]);
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
        <Section label="Horários">
          {horarios.map((h, i) => (
            <Row key={h} last={i === horarios.length - 1}>
              <XStack flex={1} alignItems="center" gap="$sm">
                {/* A pulseira vibra nos primeiros slots — a gotinha marca quais. */}
                {i < SLOTS_PULSEIRA && pulseiraOk ? (
                  <Icon name="drop" size={12} color={colors.accent} />
                ) : null}
                <Text fontSize={22} fontWeight="300" color={ligado ? '$foreground' : '$mutedForeground'}>
                  {h}
                </Text>
              </XStack>
              <Pressable
                onPress={() => remover(h)}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel={`Remover horário ${h}`}
              >
                <Icon name="x" size={16} color={colors.textMuted} />
              </Pressable>
            </Row>
          ))}
          {horarios.length === 0 ? (
            <Row last>
              <Data>Nenhum horário — adicione o primeiro.</Data>
            </Row>
          ) : null}
        </Section>

        {horarios.length < MAX_HORARIOS ? (
          <YStack marginTop="$lg">
            <Button
              title="Adicionar horário"
              variant="secondary"
              onPress={() => setEditando(true)}
            />
          </YStack>
        ) : (
          <Data marginTop="$md">Máximo de {MAX_HORARIOS} horários.</Data>
        )}
      </YStack>

      <Data marginTop="$xl" color="$mutedForeground">
        {pulseiraOk
          ? `A pulseira vibra nos ${SLOTS_PULSEIRA} primeiros horários; o celular avisa em todos.`
          : 'O celular avisa em todos os horários; a pulseira entra quando conectar.'}
      </Data>

      <Modal visible={editando} transparent animationType="slide" onRequestClose={() => setEditando(false)}>
        <Pressable
          style={{ flex: 1, backgroundColor: colors.scrim }}
          onPress={() => setEditando(false)}
          accessibilityLabel="Fechar"
        />
        <YStack
          backgroundColor="$backgroundStrong"
          borderTopLeftRadius={22}
          borderTopRightRadius={22}
          paddingHorizontal="$xl"
          paddingTop="$xl"
          paddingBottom={insets.bottom + 16}
        >
          <Body color="$foreground" marginBottom="$md">
            Novo horário
          </Body>
          <XStack justifyContent="center" alignItems="center" gap="$md">
            <TimeWheel items={HORAS} value={hora} onChange={setHora} />
            <Text fontSize={26} fontWeight="300" color="$mutedForeground">:</Text>
            <TimeWheel items={MINUTOS} value={minuto} onChange={setMinuto} />
          </XStack>
          <YStack marginTop="$lg">
            <Button title={`Lembrar às ${hora}:${minuto}`} onPress={confirmarNovo} />
          </YStack>
        </YStack>
      </Modal>
    </DetailScreen>
  );
}
