import { useNavigation } from '@react-navigation/native';
import { Text } from '@tamagui/core';
import { XStack, YStack } from '@tamagui/stacks';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '../components/Icon';
import { Body, Button, Data, Label, SectionTitle } from '../components/ui';
import { blocksFrom, formatHour, projectDay, type Block, type Slot } from '../domain/agenda';
import { useBiometricStore } from '../store/biometric.store';
import { useCalendarStore } from '../store/calendar.store';
import type { CalendarEvent } from '../services/api.service';
import { useUiStore } from '../store/ui.store';
import { useTheme } from '../theme/ThemeProvider';
import { space } from '../theme/tokens';

const DAY_START = 6;
const DAY_END = 23;

/** Altura de uma hora na grade. Define toda a geometria da tela. */
const HOUR_H = 56;
/** Largura da calha de horas à esquerda. */
const GUTTER = 52;

/**
 * Agenda do dia — grade de horas, no formato de um calendário de dia.
 *
 * A escolha de desenhar a GRADE, e não uma lista, muda o que a tela comunica.
 * Numa lista, "trabalho profundo das 15h às 18h" é uma frase; na grade, é um
 * bloco três vezes mais alto que outro de uma hora. A duração vira tamanho, o
 * intervalo vira distância, e a leitura passa a ser espacial — que é como se lê
 * um dia.
 *
 * Com Google Agenda ou Outlook conectados, os compromissos entram na MESMA
 * régua vertical e a energia recua para um trilho na calha. É esse cruzamento
 * que justifica a tela existir: dá para ver que a reunião das 14h cai no vale
 * sem precisar de frase explicando.
 *
 * O que ela NÃO faz: guardar compromisso. Os eventos são buscados no provedor a
 * cada abertura e descartados — nem o servidor nem o aparelho os persistem. Uma
 * agenda carrega nome e horário de reunião de gente que nunca aceitou termo
 * nenhum conosco, e o consentimento para lê-la é separado e revogável.
 */
export function AgendaScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const openSidebar = useUiStore((s) => s.openSidebar);
  const latest = useBiometricStore((s) => s.latest);
  const sleep = useBiometricStore((s) => s.sleep);
  const scroll = useRef<ScrollView>(null);
  const events = useCalendarStore((s) => s.events);
  const loadCalendar = useCalendarStore((s) => s.load);
  const loadDay = useCalendarStore((s) => s.loadDay);

  // A hora corrente é estado, não leitura solta: a linha do "agora" precisa
  // descer sozinha enquanto a tela fica aberta.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    void loadCalendar().then(() => loadDay(new Date()));
  }, [loadCalendar, loadDay]);

  const nowOffset = offsetOf(now.getHours() + now.getMinutes() / 60);

  // Abre já na hora atual em vez de às 6h — o dia útil raramente começa no topo.
  useEffect(() => {
    const id = setTimeout(
      () => scroll.current?.scrollTo({ y: Math.max(0, nowOffset - HOUR_H * 2), animated: false }),
      0,
    );
    return () => clearTimeout(id);
    // Só no primeiro render: rolar sozinho depois roubaria a tela de quem está lendo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hours = Array.from({ length: DAY_END - DAY_START }, (_, i) => DAY_START + i);
  const slots = latest ? projectDay({ reading: latest, sleep }, DAY_START, DAY_END) : [];
  const blocks = blocksFrom(slots);
  const inRange = nowOffset >= 0 && now.getHours() < DAY_END;

  return (
    <YStack flex={1} backgroundColor="$background">
      <XStack
        alignItems="center"
        justifyContent="space-between"
        paddingHorizontal={space.screen}
        paddingTop={insets.top + space.md}
        paddingBottom="$lg"
        borderBottomWidth={1}
        borderBottomColor="$border"
      >
        <Pressable
          style={({ pressed }) => (pressed ? { opacity: 0.5 } : undefined)}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Voltar"
          hitSlop={16}
        >
          <Icon name="back" size={20} color={colors.textMuted} />
        </Pressable>
        <YStack alignItems="center" gap="$xs">
          <Label>agenda do dia</Label>
          <Text fontSize={17} fontWeight="600" letterSpacing={-0.3} color="$foreground">
            {longDate(now)}
          </Text>
        </YStack>
        <Pressable
          style={({ pressed }) => (pressed ? { opacity: 0.5 } : undefined)}
          onPress={openSidebar}
          accessibilityRole="button"
          accessibilityLabel="Abrir menu"
          hitSlop={16}
        >
          <YStack width={18} height={1} backgroundColor="$mutedForeground" marginBottom={5} />
          <YStack width={12} height={1} backgroundColor="$mutedForeground" />
        </Pressable>
      </XStack>

      <ScrollView
        ref={scroll}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: insets.bottom + 96 }}
        showsVerticalScrollIndicator={false}
      >
        <YStack height={(DAY_END - DAY_START) * HOUR_H}>
          {/* Grade: uma hairline por hora, rótulo na calha. */}
          {hours.map((hour, i) => (
            <XStack
              key={hour}
              position="absolute"
              left={0}
              right={0}
              top={i * HOUR_H}
              height={HOUR_H}
              alignItems="flex-start"
            >
              <Data width={GUTTER} textAlign="right" paddingRight="$md" marginTop={-6}>
                {formatHour(hour)}
              </Data>
              <YStack flex={1} height={1} backgroundColor="$border" />
            </XStack>
          ))}

          {/* Com agenda conectada, a energia recua para um trilho na calha e a
              coluna principal passa a ser dos COMPROMISSOS — que é o que a
              pessoa veio ver. Sem agenda, a energia ocupa a coluna inteira, ou
              a tela ficaria vazia. */}
          {blocks.map((block) =>
            events.length > 0 ? (
              <EnergyRail key={block.startHour} block={block} />
            ) : (
              <BlockCard key={block.startHour} block={block} onPress={() => navigation.navigate('Focus' as never)} />
            ),
          )}

          {events.map((event) => (
            <EventCard key={event.id} event={event} slots={slots} />
          ))}

          {/* Linha do agora. Fica por cima de tudo — é a referência da leitura. */}
          {inRange ? (
            <XStack
              position="absolute"
              left={0}
              right={space.screen}
              top={nowOffset}
              alignItems="center"
              pointerEvents="none"
            >
              <Text
                width={GUTTER}
                textAlign="right"
                paddingRight="$sm"
                fontSize={10}
                fontWeight="500"
                letterSpacing={0.2}
                color="$destructive"
                fontVariant={['tabular-nums']}
              >
                {shortTime(now)}
              </Text>
              <YStack
                width={7}
                height={7}
                borderRadius={3.5}
                backgroundColor="$destructive"
                marginLeft={-1}
              />
              <YStack flex={1} height={1} backgroundColor="$destructive" />
            </XStack>
          ) : null}
        </YStack>
      </ScrollView>

      <YStack
        position="absolute"
        left={space.screen}
        right={space.screen}
        bottom={insets.bottom + space.xl}
      >
        <Button
          title="Iniciar sessão de foco"
          onPress={() => navigation.navigate('Focus' as never)}
          icon={<Icon name="play" size={16} color={colors.ink} />}
        />
      </YStack>
    </YStack>
  );
}

/**
 * Bloco na grade.
 *
 * Posicionado em absoluto pela hora e dimensionado pela duração — é essa
 * conversão que faz a grade valer a pena. A barra vertical à esquerda é o mesmo
 * vocabulário do resto do app: a linha substitui a caixa, e a cor dela é a
 * única coisa que distingue um nível do outro.
 */
function BlockCard({ block, onPress }: { block: Block; onPress: () => void }) {
  const { colors } = useTheme();
  const hours = block.endHour - block.startHour;
  const height = hours * HOUR_H;

  // O trilho é TRAÇO, não fundo: `accentSoft` existe para preencher área e some
  // numa faixa de 3 pontos. O nível intermediário usa o mesmo acento com
  // presença menor, que é como o resto do app grada intensidade.
  const railColor = block.level === 'low' ? colors.hairlineStrong : colors.accent;

  return (
    <Pressable
      style={({ pressed }) => [
        LANE,
        { top: offsetOf(block.startHour) + 1, height: height - 2, backgroundColor: colors.surfaceTint },
        pressed && { opacity: 0.5 },
      ]}
      onPress={block.level === 'low' ? undefined : onPress}
      accessibilityRole="button"
      accessibilityLabel={`${block.title}, das ${formatHour(block.startHour)} às ${formatHour(block.endHour)}`}
    >
      <YStack width={3} opacity={block.level === 'mid' ? 0.5 : 1} style={{ backgroundColor: railColor }} />
      <YStack flex={1} paddingVertical="$sm" paddingHorizontal="$md" gap={2}>
        <SectionTitle numberOfLines={1}>{block.title}</SectionTitle>
        <Data marginTop={1}>
          {formatHour(block.startHour)} – {formatHour(block.endHour)} · pico {block.peak}
        </Data>
        {/* A justificativa só cabe em bloco de duas horas ou mais. Espremer
            três linhas num bloco de uma hora produz reticências, não leitura. */}
        {hours >= 2 ? (
          <Body marginTop="$xs" fontSize={12} lineHeight={17} numberOfLines={hours >= 3 ? 3 : 2}>
            {block.detail}
          </Body>
        ) : null}
      </YStack>
    </Pressable>
  );
}

/**
 * Trilho fino de energia, na calha.
 *
 * Quando há compromissos, a energia deixa de ser o conteúdo e vira o PANO DE
 * FUNDO: uma faixa colorida ao lado das horas. É a leitura que o produto quer
 * provocar — "esta reunião cai no meu vale" — e ela só funciona se as duas
 * informações dividirem a mesma régua vertical.
 */
function EnergyRail({ block }: { block: Block }) {
  const { colors } = useTheme();
  const height = (block.endHour - block.startHour) * HOUR_H;

  return (
    <YStack
      position="absolute"
      left={GUTTER - 10}
      top={offsetOf(block.startHour) + 1}
      width={3}
      height={height - 2}
      borderRadius={1.5}
      opacity={block.level === 'mid' ? 0.5 : 1}
      style={{ backgroundColor: block.level === 'low' ? colors.hairlineStrong : colors.accent }}
      pointerEvents="none"
      accessibilityLabel={`${block.title}, das ${formatHour(block.startHour)} às ${formatHour(block.endHour)}`}
    />
  );
}

/**
 * Um compromisso na grade.
 *
 * O nível de energia da hora de início decide a cor da borda — é o cruzamento
 * que dá sentido a ter os dois na mesma tela. Uma reunião difícil às 14h
 * aparece marcada, sem precisar de texto explicando.
 */
function EventCard({ event, slots }: { event: CalendarEvent; slots: Slot[] }) {
  const start = new Date(event.start);
  const end = new Date(event.end);
  const startHour = start.getHours() + start.getMinutes() / 60;
  const endHour = end.getHours() + end.getMinutes() / 60;

  // Fora da janela desenhada não há onde colocar; some em vez de encavalar.
  if (event.allDay || endHour <= DAY_START || startHour >= DAY_END) return null;

  const top = offsetOf(Math.max(startHour, DAY_START));
  // Piso de 24 pontos: uma reunião de 15 minutos vira uma faixa ilegível sem ele.
  const height = Math.max(24, offsetOf(Math.min(endHour, DAY_END)) - top);
  const level = slots.find((s) => s.hour === Math.floor(startHour))?.level ?? 'mid';

  return (
    <YStack {...LANE} top={top + 1} height={height - 2} backgroundColor="$card">
      <YStack
        width={3}
        opacity={level === 'mid' ? 0.5 : 1}
        backgroundColor={level === 'low' ? '$destructive' : '$primary'}
      />
      <YStack flex={1} paddingVertical="$xs" paddingHorizontal="$md" gap={1} justifyContent="center">
        <SectionTitle fontSize={14} numberOfLines={height > 40 ? 2 : 1}>
          {event.title}
        </SectionTitle>
        {height > 44 ? (
          <Data marginTop={1} numberOfLines={1}>
            {clockOf(start)} – {clockOf(end)}
            {event.attendeeCount > 1 ? ` · ${event.attendeeCount} pessoas` : ''}
          </Data>
        ) : null}
      </YStack>
    </YStack>
  );
}

/**
 * A faixa que um bloco ou compromisso ocupa: da calha até a margem direita.
 *
 * Bloco e evento compartilham a medida de propósito — eles dividem a mesma
 * coluna, e uma diferença de um ponto entre os dois apareceria como
 * desalinhamento na sobreposição.
 */
const LANE = {
  position: 'absolute',
  left: GUTTER,
  right: space.screen,
  flexDirection: 'row',
  borderRadius: 8,
  overflow: 'hidden',
} as const;

const clockOf = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/** Converte hora decimal em deslocamento vertical dentro da grade. */
const offsetOf = (hour: number) => (hour - DAY_START) * HOUR_H;

const WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

const longDate = (d: Date) => `${WEEKDAYS[d.getDay()]}, ${d.getDate()} de ${MONTHS[d.getMonth()]}`;
const shortTime = (d: Date) =>
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
