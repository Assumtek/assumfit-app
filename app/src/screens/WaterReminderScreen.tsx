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
import { INTERVALOS_MIN } from '../domain/water';
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
  const modo = useWaterReminderStore((s) => s.modo);
  const intervaloMin = useWaterReminderStore((s) => s.intervaloMin);
  const janela = useWaterReminderStore((s) => s.janela);
  const setModo = useWaterReminderStore((s) => s.setModo);
  const aplicarIntervalo = useWaterReminderStore((s) => s.aplicarIntervalo);
  const efetivos = useWaterReminderStore((s) => s.horariosEfetivos)();

  const [editando, setEditando] = useState(false);
  const [hora, setHora] = useState('10');
  const [minuto, setMinuto] = useState('00');
  /** Digitado à mão — vence a roda quando é uma hora válida. */
  const [digitado, setDigitado] = useState('');
  const manual = normalizarHorario(digitado);
  const escolhido = manual ?? `${hora}:${minuto}`;
  /** Qual ponta da janela a roda está editando, no modo por intervalo. */
  const [ponta, setPonta] = useState<'inicio' | 'fim' | null>(null);

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
    if (ponta) {
      const proxima = { ...janela, [ponta]: novo };
      setPonta(null);
      void aplicarIntervalo({ intervaloMin, janela: proxima });
      return;
    }
    if (horarios.includes(novo)) return;
    // Escolher horário é declarar intenção — liga junto, sem segundo toque.
    void aplicar(true, [...horarios, novo]);
  };

  const editarPonta = (qual: 'inicio' | 'fim') => {
    const [h, m] = janela[qual].split(':');
    setHora(h);
    setMinuto(MINUTOS.includes(m) ? m : '00');
    setPonta(qual);
    setEditando(true);
  };

  return (
    <DetailScreen title="Lembrete de água">
      <Section label="Lembrete">
        <Row last>
          <YStack flex={1} gap={4}>
            <Body color="$foreground">Lembrar de beber água</Body>
            <Data>
              {ligado
                ? `${efetivos.length} ${efetivos.length === 1 ? 'horário' : 'horários'} por dia`
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

      {/*
        Dois jeitos de dizer quando: uma lista de horários, ou "a cada X min das
        A às B" (pedido de um testador, ago/2026). Mesma notificação por trás;
        o que muda é quem gera a lista.
      */}
      <YStack marginTop="$xl">
        <Section label="Como lembrar">
          <Row>
            <Pressable style={{ flex: 1 }} onPress={() => void setModo('horarios')} accessibilityRole="button">
              <Body color={modo === 'horarios' ? '$foreground' : '$mutedForeground'}>Em horários escolhidos</Body>
            </Pressable>
            {modo === 'horarios' ? <Icon name="check" size={16} color={colors.accent} /> : null}
          </Row>
          <Row last>
            <Pressable style={{ flex: 1 }} onPress={() => void setModo('intervalo')} accessibilityRole="button">
              <Body color={modo === 'intervalo' ? '$foreground' : '$mutedForeground'}>A cada tanto tempo, numa janela</Body>
            </Pressable>
            {modo === 'intervalo' ? <Icon name="check" size={16} color={colors.accent} /> : null}
          </Row>
        </Section>
      </YStack>

      {modo === 'intervalo' ? (
        <YStack marginTop="$xl">
          <Section label="Intervalo">
            <Row>
              <XStack flex={1} gap="$sm" flexWrap="wrap">
                {INTERVALOS_MIN.map((min) => (
                  <Pressable
                    key={min}
                    onPress={() => void aplicarIntervalo({ intervaloMin: min, janela })}
                    accessibilityRole="button"
                    accessibilityState={{ selected: intervaloMin === min }}
                  >
                    <YStack
                      paddingHorizontal="$md"
                      paddingVertical={8}
                      borderRadius={999}
                      borderWidth={1}
                      borderColor={intervaloMin === min ? '$primary' : '$border'}
                    >
                      <Body color={intervaloMin === min ? '$foreground' : '$mutedForeground'}>
                        {min >= 60 ? `${min / 60}h${min % 60 ? String(min % 60).padStart(2, '0') : ''}` : `${min} min`}
                      </Body>
                    </YStack>
                  </Pressable>
                ))}
              </XStack>
            </Row>
            <Row>
              <Pressable style={{ flex: 1 }} onPress={() => editarPonta('inicio')} accessibilityRole="button">
                <Body color="$foreground">Começa às</Body>
              </Pressable>
              <MetricSm fontWeight="300" color="$foreground">{janela.inicio}</MetricSm>
            </Row>
            <Row last>
              <Pressable style={{ flex: 1 }} onPress={() => editarPonta('fim')} accessibilityRole="button">
                <Body color="$foreground">Termina às</Body>
              </Pressable>
              <MetricSm fontWeight="300" color="$foreground">{janela.fim}</MetricSm>
            </Row>
          </Section>
          <Data marginTop="$md">
            {efetivos.length > 0
              ? `${efetivos.length} lembretes por dia, de ${efetivos[0]} a ${efetivos[efetivos.length - 1]}.`
              : 'Janela invertida, o fim precisa vir depois do começo.'}
          </Data>
        </YStack>
      ) : null}

      <YStack marginTop="$xl" display={modo === 'intervalo' ? 'none' : 'flex'}>
        <Section label="Horários">
          {horarios.map((h, i) => (
            <Row key={h} last={i === horarios.length - 1}>
              <XStack flex={1} alignItems="center" gap="$sm">
                {/* A pulseira vibra nos primeiros slots — a gotinha marca quais. */}
                {i < SLOTS_PULSEIRA && pulseiraOk ? (
                  <Icon name="drop" size={12} color={colors.accent} />
                ) : null}
                <MetricSm fontWeight="300" color={ligado ? '$foreground' : '$mutedForeground'}>
                  {h}
                </MetricSm>
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
              <Data>Nenhum horário, adicione o primeiro.</Data>
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

      <Modal visible={editando} transparent animationType="slide" onRequestClose={() => { setEditando(false); setPonta(null); }}>
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
            {ponta === 'inicio' ? 'Começar a lembrar às' : ponta === 'fim' ? 'Parar de lembrar às' : 'Novo horário'}
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
            <Button title={ponta ? `Usar ${escolhido}` : `Lembrar às ${escolhido}`} onPress={confirmarNovo} />
          </YStack>
        </YStack>
        </KeyboardAvoidingView>
      </Modal>
    </DetailScreen>
  );
}
