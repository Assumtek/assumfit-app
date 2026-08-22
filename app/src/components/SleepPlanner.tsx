import { Text } from '@tamagui/core';
import { XStack, YStack } from '@tamagui/stacks';
import React, { useMemo, useState } from 'react';
import { Alert, Linking, Platform, Pressable } from 'react-native';

import { Icon } from './Icon';
import { alarmeNativoDisponivel, marcarAlarme } from '../../modules/alarmkit';
import { Body, Button, Data, Label, SectionTitle } from './ui';
import { Card } from './ui/Card';
import {
  CICLO_MIN,
  LATENCIA_MIN,
  bedOptions,
  cycleLabel,
  formatHours,
  formatMinutes,
  wakeOptions,
  type SleepOption,
} from '../domain/sleepCycles';
import { useTheme } from '../theme/ThemeProvider';

/**
 * O planejador de ciclos: a que horas acordar se deitar agora, e a que horas
 * deitar para acordar na hora marcada.
 *
 * A pergunta que o card responde não é "quantas horas dormir" — é ONDE o
 * despertador cai. Acordar no fim de um ciclo (sono leve) rende disposição
 * diferente de acordar no meio dele, e é isso que faz 6h30 valer mais que 7h
 * em algumas noites.
 *
 * Os números são referência de fisiologia do sono (ciclo de ~90 min, ~15 min
 * para pegar no sono), não medição desta pessoa — e a tela diz isso em vez de
 * fingir precisão individual.
 */

type Modo = 'dormir-agora' | 'acordar-as';

/** Passo do seletor de hora de acordar. */
const PASSO_MIN = 15;

export function SleepPlanner({ horaDeDormirHabitual }: { horaDeDormirHabitual?: number | null }) {
  const { colors } = useTheme();
  const [modo, setModo] = useState<Modo>('acordar-as');

  // Ponto de partida do "acordar às": 7h é o despertador mais comum do país;
  // a hora habitual de dormir do perfil, quando existe, move o padrão.
  const [acordarMin, setAcordarMin] = useState(7 * 60);

  const agoraMin = useMemo(() => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  }, []);

  const deitarMin = horaDeDormirHabitual != null ? Math.round(horaDeDormirHabitual * 60) : agoraMin;

  const opcoes = modo === 'acordar-as' ? bedOptions(acordarMin) : wakeOptions(agoraMin);

  /**
   * O ciclo que a pessoa escolheu. `null` = a recomendação, que é a primeira.
   *
   * As três opções já apareciam na tela, mas o despertador usava a primeira
   * fixa — quem queria um ciclo a mais via a alternativa e não conseguia
   * pegá-la. Card que mostra escolha e não aceita toque promete algo que não
   * existe.
   */
  const [escolhida, setEscolhida] = useState<number | null>(null);
  const opcaoEscolhida = opcoes.find((o) => o.cycles === escolhida) ?? opcoes[0];

  return (
    <YStack gap="$md" marginTop="$xl">
      <SectionTitle>Ciclos de sono</SectionTitle>

      {/* As duas perguntas que este card responde, como escolha explícita —
          um seletor de duas posições, não duas telas. */}
      <XStack gap="$sm">
        <Aba
          ativa={modo === 'acordar-as'}
          rotulo="Quero acordar às"
          onPress={() => setModo('acordar-as')}
        />
        <Aba
          ativa={modo === 'dormir-agora'}
          rotulo="Vou dormir agora"
          onPress={() => setModo('dormir-agora')}
        />
      </XStack>

      {modo === 'acordar-as' ? (
        <Card>
          <Label marginBottom="$md">hora de acordar</Label>
          <XStack alignItems="center" justifyContent="space-between">
            <Passo
              rotulo="Quinze minutos antes"
              icone="down"
              onPress={() => setAcordarMin((m) => (m - PASSO_MIN + 1440) % 1440)}
            />
            <Text
              fontSize={40}
              fontWeight="200"
              letterSpacing={-1.5}
              color="$foreground"
              fontVariant={['tabular-nums']}
            >
              {formatMinutes(acordarMin)}
            </Text>
            <Passo
              rotulo="Quinze minutos depois"
              icone="up"
              onPress={() => setAcordarMin((m) => (m + PASSO_MIN) % 1440)}
            />
          </XStack>
          <Data marginTop="$md">
            Deite em um destes horários para acordar no fim de um ciclo:
          </Data>
        </Card>
      ) : (
        <Data>
          Deitando agora ({formatMinutes(agoraMin)}), estes são os horários que caem no fim de um
          ciclo:
        </Data>
      )}

      {/*
        As três opções são ESCOLHÍVEIS.

        Elas já eram desenhadas, mas o despertador usava `opcoes[0]` fixo — quem
        queria dormir um ciclo a mais via a opção na tela e não tinha como
        pegá-la. Card que mostra alternativa e não aceita toque é pior que não
        mostrar: promete uma escolha que não existe.

        A primeira vem marcada por ser a recomendação, não por ser a única.
      */}
      <YStack gap="$sm">
        {opcoes.map((o) => (
          <OpcaoDeCiclo
            key={o.cycles}
            opcao={o}
            destaque={o.cycles === (escolhida ?? opcoes[0]?.cycles)}
            modo={modo}
            accent={colors.accent}
            onPress={() => setEscolhida(o.cycles)}
          />
        ))}
      </YStack>

      {/*
        O despertador: no Android o app CRIA o alarme de verdade; no iOS não
        existe API pública para isso, e o honesto é abrir o Relógio com o
        horário à vista em vez de fingir que gravou. A nota diz qual dos dois
        aconteceu — promessa de alarme que não tocou é o pior defeito possível
        numa tela de sono.
      */}
      <Button
        title="Definir despertador"
        variant="secondary"
        icon={<Icon name="clock" size={16} color={colors.text} />}
        onPress={() => void definirAlarme(opcaoEscolhida, modo)}
      />

      <Data>
        Ciclo médio de {CICLO_MIN} minutos e {LATENCIA_MIN} minutos para pegar no sono, referência
        de fisiologia do sono, não medida sua.
      </Data>
    </YStack>
  );
}

function OpcaoDeCiclo({
  opcao,
  destaque,
  modo,
  accent,
  onPress,
}: {
  opcao: SleepOption;
  destaque: boolean;
  modo: Modo;
  accent: string;
  onPress: () => void;
}) {
  return (
    <Card
      selected={destaque}
      onPress={onPress}
      accessibilityLabel={`${cycleLabel(opcao.cycles)}, ${opcao.cycles} ciclos, ${formatHours(opcao.hours)} de sono`}
    >
      <XStack alignItems="center" gap="$md">
        <YStack flex={1} gap={4}>
          {/* A avaliação em linguagem humana no destaque; o número técnico
              (ciclos e horas) como sub-rótulo — a regra de ouro do produto. */}
          <Body color="$foreground">{cycleLabel(opcao.cycles)}</Body>
          <Data>
            {opcao.cycles} ciclos · {formatHours(opcao.hours)} de sono
          </Data>
        </YStack>
        <YStack alignItems="flex-end">
          <Text
            fontSize={26}
            fontWeight="300"
            letterSpacing={-0.8}
            fontVariant={['tabular-nums']}
            style={{ color: destaque ? accent : undefined }}
            color={destaque ? undefined : '$foreground'}
          >
            {opcao.label}
          </Text>
          <Data>{modo === 'acordar-as' ? 'deitar' : 'acordar'}</Data>
        </YStack>
      </XStack>
    </Card>
  );
}

function Aba({
  ativa,
  rotulo,
  onPress,
}: {
  ativa: boolean;
  rotulo: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: ativa }}
      style={({ pressed }) => [{ flex: 1 }, pressed && { opacity: 0.7 }]}
    >
      <YStack
        paddingVertical="$md"
        borderRadius={12}
        borderWidth={1}
        borderColor={ativa ? '$primary' : '$border'}
        backgroundColor={ativa ? '$primarySoft' : 'transparent'}
        alignItems="center"
      >
        <Body fontWeight={ativa ? '700' : '400'} color="$foreground">
          {rotulo}
        </Body>
      </YStack>
    </Pressable>
  );
}

function Passo({
  rotulo,
  icone,
  onPress,
}: {
  rotulo: string;
  icone: 'up' | 'down';
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={rotulo}
      hitSlop={8}
      style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
    >
      <YStack
        width={44}
        height={44}
        borderRadius={24}
        borderWidth={1}
        borderColor="$borderStrong"
        alignItems="center"
        justifyContent="center"
      >
        <Icon name={icone} size={20} color={colors.text} />
      </YStack>
    </Pressable>
  );
}

/**
 * Cria o alarme onde dá, e abre o relógio onde não dá.
 *
 * Android tem intent pública (`SET_ALARM`) e o alarme nasce gravado. O iOS não
 * expõe nada equivalente: o máximo honesto é abrir o app Relógio com o horário
 * dito em voz alta pela mensagem, para a pessoa criar em dois toques.
 */
async function definirAlarme(opcao: SleepOption, modo: Modo) {
  const hora = Math.floor(opcao.minutes / 60);
  const minuto = opcao.minutes % 60;
  const titulo = modo === 'acordar-as' ? 'Hora de deitar' : 'AssumFit';

  if (Platform.OS === 'android') {
    try {
      await Linking.sendIntent('android.intent.action.SET_ALARM', [
        { key: 'android.intent.extra.alarm.HOUR', value: hora },
        { key: 'android.intent.extra.alarm.MINUTES', value: minuto },
        { key: 'android.intent.extra.alarm.MESSAGE', value: titulo },
        // Sem `SKIP_UI`: a pessoa confirma no app de relógio, e é lá que ela
        // escolhe repetição e som. Criar em silêncio seria mexer no despertador
        // de alguém sem mostrar o que mudou.
      ]);
      return;
    } catch {
      Alert.alert('Não foi possível abrir o despertador', `Marque ${opcao.label} no seu relógio.`);
      return;
    }
  }

  /*
   iOS 26+: o AlarmKit deixa o app marcar o alarme de verdade, com permissão
   da pessoa e a tela de alarme do sistema. Um testador (21/08, build 7) tocou
   em "Abrir Relógio" e nada aconteceu — o esquema `clock-alarm://` não abre
   nada no iOS 26 e a falha era engolida. O texto "o iPhone não deixa" ficou
   velho junto.
  */
  if (alarmeNativoDisponivel()) {
    const resultado = await marcarAlarme(hora, minuto, titulo);
    if (resultado === 'scheduled') {
      Alert.alert(
        'Despertador marcado',
        `${opcao.label}, pelo próprio iPhone. Dá para ver e ajustar no app Relógio.`);
      return;
    }
    if (resultado === 'denied') {
      Alert.alert(
        'Sem permissão para alarmes',
        `Libere em Ajustes → AssumFit → Alarmes, ou marque ${opcao.label} no app Relógio.`);
      return;
    }
    // 'error' e 'unsupported' caem no caminho de abaixo.
  }

  // iOS anterior ao 26: abre o Relógio e diz o horário. E se não conseguir
  // abrir, DIZ — antes a falha era silenciosa, e silêncio aqui lê como botão
  // quebrado.
  Alert.alert(
    `Despertador para ${opcao.label}`,
    'Nesta versão do iOS o app não cria alarmes. Vou abrir o Relógio para você tocar em “+” e marcar esse horário.',
    [
      { text: 'Agora não', style: 'cancel' },
      {
        text: 'Abrir Relógio',
        onPress: () => {
          void Linking.openURL('clock-alarm://').catch(() => {
            Alert.alert('Não consegui abrir o Relógio', `Abra o app Relógio e marque ${opcao.label}.`);
          });
        },
      },
    ]);
}
