import { XStack, YStack } from '@tamagui/stacks';
import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, Switch } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Row, Section } from '../components/List';
import { DetailScreen } from '../components/DetailScreen';
import { Icon } from '../components/Icon';
import { TimeWheel } from '../components/TimeWheel';
import { HoraDigitada } from '../components/HoraDigitada';
import { normalizarHorario } from '../domain/horario';
import { Body, Button, Data, MetricSm, Title } from '../components/ui';
import { MAX_HORARIOS_REFEICAO, useMealReminderStore } from '../store/meal-reminder.store';
import { useTheme } from '../theme/ThemeProvider';

/**
 * Os horários habituais das refeições — e um aviso em cada um para registrar.
 *
 * Mesma gramática do lembrete de água (lista + roda de horário): a pessoa já
 * aprendeu uma vez; a segunda não deve custar nada. Sem pulseira aqui — o
 * firmware não tem lembrete de refeição, e é o celular que abre a tela certa.
 */

const HORAS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTOS = ['00', '10', '15', '20', '30', '40', '45', '50'];

export function MealReminderScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const ligado = useMealReminderStore((s) => s.ligado);
  const horarios = useMealReminderStore((s) => s.horarios);
  const salvando = useMealReminderStore((s) => s.salvando);
  const carregar = useMealReminderStore((s) => s.carregar);
  const aplicar = useMealReminderStore((s) => s.aplicar);

  const [editando, setEditando] = useState(false);
  const [hora, setHora] = useState('12');
  const [minuto, setMinuto] = useState('30');
  /** Digitado à mão — vence a roda quando é uma hora válida. */
  const [digitado, setDigitado] = useState('');
  const manual = normalizarHorario(digitado);
  const escolhido = manual ?? `${hora}:${minuto}`;

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const remover = (horario: string) => {
    const novos = horarios.filter((h) => h !== horario);
    void aplicar(novos.length > 0 && ligado, novos);
  };

  const confirmarNovo = () => {
    const novo = escolhido;
    setDigitado('');
    setEditando(false);
    if (horarios.includes(novo)) return;
    void aplicar(true, [...horarios, novo]);
  };

  return (
    <DetailScreen title="Lembrete de refeições">
      <Section label="Lembrete">
        <Row last>
          <YStack flex={1} gap={4}>
            <Body color="$foreground">Lembrar de registrar o que comi</Body>
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
        <Section label="Horários das refeições">
          {horarios.map((h, i) => (
            <Row key={h} last={i === horarios.length - 1}>
              <MetricSm fontWeight="300" color={ligado ? '$foreground' : '$mutedForeground'}>
                {h}
              </MetricSm>
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
              <Data>Nenhum horário, adicione o primeiro.</Data>
            </Row>
          ) : null}
        </Section>

        {horarios.length < MAX_HORARIOS_REFEICAO ? (
          <YStack marginTop="$lg">
            <Button title="Adicionar horário" variant="secondary" onPress={() => setEditando(true)} />
          </YStack>
        ) : (
          <Data marginTop="$md">Máximo de {MAX_HORARIOS_REFEICAO} horários.</Data>
        )}
      </YStack>

      <Data marginTop="$xl" color="$mutedForeground">
        O aviso abre a tela de Refeições, registrar leva dois toques, e é isso que fecha o hábito.
      </Data>

      <Modal visible={editando} transparent animationType="slide" onRequestClose={() => setEditando(false)}>
        {/* O teclado cobria o campo "ou digite" (testador, 22/08): a folha
            sobe junto com ele. */}
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
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
            Horário da refeição
          </Body>
          <XStack justifyContent="center" alignItems="center" gap="$md">
            <TimeWheel items={HORAS} value={hora} onChange={setHora} />
            <Title fontWeight="300" color="$mutedForeground">:</Title>
            <TimeWheel items={MINUTOS} value={minuto} onChange={setMinuto} />
          </XStack>
          {/* Ou digitar: a roda anda de 10 em 10; quem quer 07:55 digita.
              Pedido de um testador (21/08). */}
          <HoraDigitada valor={digitado} onChange={setDigitado} valido={manual !== null} />
          <YStack marginTop="$lg">
            <Button title={`Lembrar às ${escolhido}`} onPress={confirmarNovo} />
          </YStack>
        </YStack>
        </KeyboardAvoidingView>
      </Modal>
    </DetailScreen>
  );
}
