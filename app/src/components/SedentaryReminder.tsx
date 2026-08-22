import { horaCurta } from '../domain/horario';
import { XStack, YStack } from '@tamagui/stacks';
import React, { useEffect, useState } from 'react';
import { Pressable, Switch } from 'react-native';

import { useNavigation } from '@react-navigation/native';

import { QCBand } from '../../modules/qcband';
import { useWaterReminderStore } from '../store/water-reminder.store';
import { Icon } from './Icon';
import { Row, Section } from './Card';
import { Body, Data } from './ui';
import { useTheme } from '../theme/ThemeProvider';

/**
 * O interruptor do alerta de sedentarismo.
 *
 * Vive em Dispositivo, que é onde ele tecnicamente mora: é o firmware quem
 * conta o tempo parada e vibra. Esteve também em Hábitos até ago/2026, quando
 * a fundadora tirou — aquela tela é sobre água, e um segundo assunto ali
 * dividia a atenção do único gesto que ela pede.
 *
 * O lembrete é do FIRMWARE: a pulseira conta o tempo parada e vibra sozinha,
 * com o celular desligado inclusive. Por isso o estado é LIDO do aparelho ao
 * montar — o toggle mostra o que a pulseira realmente faz, não uma preferência
 * local que poderia mentir.
 */

const INTERVALOS = [30, 45, 60, 90] as const;

/** Janela fixa 8h–20h, todos os dias. Configuração fina quando alguém pedir. */
const JANELA = { inicio: '08:00', fim: '20:00', dias: [1, 1, 1, 1, 1, 1, 1] };

/**
 * A linha-resumo do lembrete de água — o interruptor liga/desliga aqui mesmo;
 * tocar no texto abre a tela de horários. A lógica inteira mora no
 * `water-reminder.store`, porque dois lugares aplicando agendamento é onde um
 * diverge do outro.
 */
export function WaterReminder() {
  const { colors } = useTheme();
  const navigation = useNavigation();
  const ligado = useWaterReminderStore((s) => s.ligado);
  const horarios = useWaterReminderStore((s) => s.horarios);
  const salvando = useWaterReminderStore((s) => s.salvando);
  const carregar = useWaterReminderStore((s) => s.carregar);
  const aplicar = useWaterReminderStore((s) => s.aplicar);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  return (
    <Section label="Lembrete de água">
      <Row last>
        <Pressable
          style={{ flex: 1 }}
          onPress={() => (navigation as any).push('WaterReminder' as never)}
          accessibilityRole="button"
          accessibilityLabel="Escolher horários do lembrete de água"
        >
          <XStack alignItems="center" gap="$sm">
            <YStack flex={1} gap={4}>
              <Body color="$foreground">Lembrar de beber água</Body>
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

export function SedentaryReminder() {
  const { colors } = useTheme();
  const [estado, setEstado] = useState<{ ligado: boolean; intervalo: number } | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!QCBand) return;
    QCBand.getSedentary()
      .then((r) => setEstado({ ligado: r.intervalMin > 0, intervalo: r.intervalMin || 60 }))
      .catch(() => setEstado(null));
  }, []);

  const aplicar = async (ligado: boolean, intervalo: number) => {
    if (!QCBand || salvando) return;
    setSalvando(true);
    const anterior = estado;
    setEstado({ ligado, intervalo });
    try {
      // Desligar é intervalo zero: o firmware não tem booleano separado — a
      // dupla janela+intervalo É o estado.
      await QCBand.setSedentary(JANELA.inicio, JANELA.fim, JANELA.dias, ligado ? intervalo : 0);
    } catch {
      setEstado(anterior);
    } finally {
      setSalvando(false);
    }
  };

  // Sem pulseira ao alcance não há o que ligar — e um interruptor que não faz
  // nada ensina a desconfiar dos outros.
  if (estado === null) return null;

  return (
    <Section label="Alerta de sedentarismo">
      <Row>
        <YStack flex={1} gap={4}>
          <Body color="$foreground">Vibrar quando eu ficar parada</Body>
          <Data>
            na pulseira, das {JANELA.inicio} às {JANELA.fim}
          </Data>
        </YStack>
        <Switch
          value={estado.ligado}
          onValueChange={(v) => void aplicar(v, estado.intervalo)}
          trackColor={{ true: colors.accent }}
          disabled={salvando}
        />
      </Row>
      {estado.ligado ? (
        <Row last>
          <Body flex={1} color="$foreground">
            Depois de
          </Body>
          <XStack gap="$sm">
            {INTERVALOS.map((min) => (
              <Pressable
                key={min}
                onPress={() => void aplicar(true, min)}
                accessibilityRole="radio"
                accessibilityState={{ selected: estado.intervalo === min }}
              >
                <YStack
                  paddingVertical={8}
                  paddingHorizontal={12}
                  borderRadius={999}
                  borderWidth={1}
                  borderColor={estado.intervalo === min ? '$primary' : '$borderStrong'}
                  backgroundColor={estado.intervalo === min ? '$primarySoft' : 'transparent'}
                >
                  <Data color="$foreground">
                    {min} min
                  </Data>
                </YStack>
              </Pressable>
            ))}
          </XStack>
        </Row>
      ) : null}
    </Section>
  );
}
