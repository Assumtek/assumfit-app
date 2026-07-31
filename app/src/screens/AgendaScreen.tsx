import { useNavigation } from '@react-navigation/native';
import { Text } from '@tamagui/core';
import { XStack, YStack } from '@tamagui/stacks';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Note } from '../components/Card';
import { Icon } from '../components/Icon';
import { Button, Data, Label, SectionTitle } from '../components/ui';
import { blocksFrom, formatHour, nextBest, projectDay, type Block, type Slot } from '../domain/agenda';
import type { EnergyLevel } from '../domain/energy';
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
 * Agenda — grade de dia no formato de calendário (benchmark: Teams/Outlook).
 *
 * A faixa da semana no topo escolhe o DIA; a grade embaixo é a régua de horas.
 * O que diferencia esta agenda de um calendário comum é o fundo: as JANELAS DE
 * ENERGIA pintam a grade o tempo todo — alta, média e baixa como lavagens de um
 * acento só — e os compromissos entram por cima, opacos. É esse cruzamento que
 * justifica a tela: dá para ver que a reunião das 14h cai no vale sem frase
 * explicando, e dá para arrastar o olho até amanhã e escolher onde encaixar o
 * trabalho difícil.
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

  // O dia escolhido na faixa da semana. A semana navega em separado, porque
  // folhear semanas para OLHAR não deveria mudar o dia carregado.
  const [selecionado, setSelecionado] = useState(() => new Date());
  const [semana, setSemana] = useState(() => inicioDaSemana(new Date()));

  useEffect(() => {
    void loadCalendar();
  }, [loadCalendar]);
  useEffect(() => {
    void loadDay(selecionado);
  }, [loadDay, selecionado]);

  const ehHoje = mesmoDia(selecionado, now);
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

  // O rodapé é contextual: dentro de janela útil, o botão de foco; no vale, a
  // próxima janela que vale a pena — e no fim do dia, nada, porque empurrar
  // ação às 23h seria o app desmentindo a própria curva.
  const horaAgora = now.getHours() + now.getMinutes() / 60;
  const janelaAgora = ehHoje
    ? blocks.find((b) => b.startHour <= horaAgora && horaAgora < b.endHour) ?? null
    : null;
  const emJanelaUtil = janelaAgora !== null && janelaAgora.level !== 'low';
  const melhor = ehHoje && !emJanelaUtil ? nextBest(blocks, horaAgora) : null;
  const proxima = melhor && melhor.level !== 'low' && melhor.startHour > horaAgora ? melhor : null;

  const dias = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date(semana);
        d.setDate(d.getDate() + i);
        return d;
      }),
    [semana],
  );

  const mudarSemana = (delta: number) =>
    setSemana((s) => {
      const d = new Date(s);
      d.setDate(d.getDate() + delta * 7);
      return d;
    });

  const voltarParaHoje = () => {
    setSelecionado(new Date());
    setSemana(inicioDaSemana(new Date()));
  };

  const abrirFoco = () => (navigation as any).push('Focus' as never);

  return (
    <YStack flex={1} backgroundColor="$background">
      <YStack
        paddingHorizontal={space.screen}
        paddingTop={insets.top + space.md}
        paddingBottom="$lg"
        borderBottomWidth={1}
        borderBottomColor="$border"
      >
        <XStack alignItems="center" justifyContent="space-between">
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
            <Label>agenda</Label>
            <Text fontSize={17} fontWeight="600" letterSpacing={-0.3} color="$foreground">
              {MESES[selecionado.getMonth()]}
              {selecionado.getFullYear() !== now.getFullYear() ? ` ${selecionado.getFullYear()}` : ''}
            </Text>
          </YStack>
          <XStack alignItems="center" gap="$lg">
            {!ehHoje ? (
              <Pressable
                style={({ pressed }) => [
                  {
                    borderWidth: 1,
                    borderColor: colors.hairlineStrong,
                    borderRadius: 999,
                    paddingHorizontal: 10,
                    paddingVertical: 3,
                  },
                  pressed && { opacity: 0.5 },
                ]}
                onPress={voltarParaHoje}
                accessibilityRole="button"
                accessibilityLabel="Voltar para hoje"
              >
                <Data fontSize={11} color="$foreground">
                  hoje
                </Data>
              </Pressable>
            ) : null}
            <Pressable
              style={({ pressed }) => (pressed ? { opacity: 0.5 } : undefined)}
              onPress={openSidebar}
              accessibilityRole="button"
              accessibilityLabel="Abrir menu"
              hitSlop={16}
            >
              <Icon name="menu" size={24} strokeWidth={2} color={colors.text} />
            </Pressable>
          </XStack>
        </XStack>

        {/* A faixa da semana — o jeito Teams de trocar de dia sem sair da grade. */}
        <XStack alignItems="center" marginTop="$lg">
          <Pressable
            style={({ pressed }) => [{ padding: 4 }, pressed && { opacity: 0.5 }]}
            onPress={() => mudarSemana(-1)}
            accessibilityRole="button"
            accessibilityLabel="Semana anterior"
            hitSlop={8}
          >
            <Icon name="back" size={16} color={colors.textMuted} />
          </Pressable>
          {dias.map((dia) => {
            const escolhido = mesmoDia(dia, selecionado);
            const hoje = mesmoDia(dia, now);
            return (
              <Pressable
                key={chave(dia)}
                style={({ pressed }) => [
                  { flex: 1, alignItems: 'center' },
                  pressed && { opacity: 0.6 },
                ]}
                onPress={() => setSelecionado(dia)}
                accessibilityRole="button"
                accessibilityState={{ selected: escolhido }}
                accessibilityLabel={
                  `${WEEKDAYS[dia.getDay()]}, ${dia.getDate()} de ${MESES[dia.getMonth()]}` +
                  (hoje ? ', hoje' : '')
                }
              >
                <YStack alignItems="center" gap={4}>
                  <Data fontSize={11}>{SEMANA[dia.getDay()]}</Data>
                  <YStack
                    width={32}
                    height={32}
                    borderRadius={16}
                    alignItems="center"
                    justifyContent="center"
                    backgroundColor={escolhido ? '$primary' : 'transparent'}
                    borderWidth={hoje && !escolhido ? 1.5 : 0}
                    borderColor={hoje && !escolhido ? '$foreground' : 'transparent'}
                  >
                    {/* O número sobre o acento usa o ink da marca nos DOIS
                        temas — a mesma regra do texto do Button primário. */}
                    <Text
                      fontSize={15}
                      fontWeight={escolhido ? '600' : '400'}
                      fontVariant={['tabular-nums']}
                      color="$foreground"
                      style={escolhido ? { color: '#0E0A22' } : undefined}
                    >
                      {dia.getDate()}
                    </Text>
                  </YStack>
                </YStack>
              </Pressable>
            );
          })}
          <Pressable
            style={({ pressed }) => [{ padding: 4 }, pressed && { opacity: 0.5 }]}
            onPress={() => mudarSemana(1)}
            accessibilityRole="button"
            accessibilityLabel="Próxima semana"
            hitSlop={8}
          >
            <Icon name="arrowRight" size={16} color={colors.textMuted} />
          </Pressable>
        </XStack>

        {/* Legenda das lavagens + de onde a projeção vem. Uma linha só: a tela
            é de olhar, não de ler. */}
        {latest ? (
          <XStack alignItems="center" justifyContent="space-between" marginTop="$lg">
            <XStack alignItems="center" gap="$lg">
              <Legenda cor={colors.accent} rotulo="alta" />
              <Legenda cor={colors.accent} opacidade={0.5} rotulo="média" />
              <Legenda cor={colors.hairlineStrong} rotulo="baixa" />
            </XStack>
            <Data fontSize={11}>janelas da leitura de {horaDa(latest.recordedAt)}</Data>
          </XStack>
        ) : null}
      </YStack>

      <ScrollView
        ref={scroll}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: insets.bottom + 96 }}
        showsVerticalScrollIndicator={false}
      >
        {!latest ? (
          <YStack paddingHorizontal={space.screen} paddingTop="$lg">
            <Note
              title="Sem leitura da pulseira"
              body="As janelas de energia aparecem na grade depois da primeira medição — vista a pulseira e aguarde alguns minutos."
            />
          </YStack>
        ) : null}

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

          {/* As janelas são o FUNDO permanente da grade — lavagem do acento com
              rótulo, no vocabulário dos blocos de foco do Teams. Compromissos
              entram DEPOIS, opacos, por cima. */}
          {blocks.map((block) => (
            <JanelaCard key={block.startHour} block={block} onPress={abrirFoco} />
          ))}

          {events.map((event) => (
            <EventCard key={event.id} event={event} slots={slots} />
          ))}

          {/* Linha do agora. Fica por cima de tudo — é a referência da leitura. */}
          {ehHoje && inRange ? (
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

      {ehHoje && latest ? (
        emJanelaUtil ? (
          <YStack
            position="absolute"
            left={space.screen}
            right={space.screen}
            bottom={insets.bottom + space.xl}
          >
            <Button
              title="Iniciar sessão de foco"
              onPress={abrirFoco}
              icon={<Icon name="play" size={16} color="#0E0A22" />}
            />
          </YStack>
        ) : proxima ? (
          <YStack
            position="absolute"
            left={space.screen}
            right={space.screen}
            bottom={insets.bottom + space.xl}
            alignItems="center"
          >
            <YStack
              backgroundColor="$background"
              borderWidth={1}
              borderColor="$border"
              borderRadius={999}
              paddingHorizontal="$xl"
              paddingVertical="$sm"
            >
              <Data>
                próxima janela {proxima.level === 'high' ? 'alta' : 'média'} às{' '}
                {formatHour(proxima.startHour)}
              </Data>
            </YStack>
          </YStack>
        ) : null
      ) : null}
    </YStack>
  );
}

/** Um item da legenda: a barrinha no traço que a grade usa, com o nome ao lado. */
function Legenda({ cor, opacidade, rotulo }: { cor: string; opacidade?: number; rotulo: string }) {
  return (
    <XStack alignItems="center" gap="$xs">
      <YStack
        width={3}
        height={12}
        borderRadius={1.5}
        opacity={opacidade ?? 1}
        style={{ backgroundColor: cor }}
      />
      <Data fontSize={11}>{rotulo}</Data>
    </XStack>
  );
}

/**
 * Uma janela de energia na grade.
 *
 * Posicionada em absoluto pela hora e dimensionada pela duração — é essa
 * conversão que faz a grade valer a pena. A lavagem de fundo é o acento em
 * intensidades (a mesma rampa de opacidade do calendário do ciclo): alta mais
 * presente, média mais leve, vale neutro. O rótulo fica no TOPO do bloco, como
 * um bloco de foco agendado no Teams, para sobreviver a compromissos por cima.
 */
function JanelaCard({ block, onPress }: { block: Block; onPress: () => void }) {
  const { colors } = useTheme();
  const height = (block.endHour - block.startHour) * HOUR_H;
  const vale = block.level === 'low';

  return (
    <Pressable
      style={({ pressed }) => [
        LANE,
        {
          top: offsetOf(block.startHour) + 1,
          height: height - 2,
          backgroundColor: corDaJanela(block.level, colors),
        },
        pressed && !vale && { opacity: 0.5 },
      ]}
      onPress={vale ? undefined : onPress}
      disabled={vale}
      // O vale não é acionável — dar-lhe papel de botão anunciaria um toque
      // que não faz nada.
      accessibilityRole={vale ? undefined : 'button'}
      accessibilityLabel={
        `${block.title}, das ${formatHour(block.startHour)} às ${formatHour(block.endHour)}` +
        (vale ? '' : ', toque para iniciar uma sessão de foco')
      }
    >
      <YStack
        width={3}
        opacity={block.level === 'mid' ? 0.5 : 1}
        style={{ backgroundColor: vale ? colors.hairlineStrong : colors.accent }}
      />
      <YStack flex={1} paddingVertical="$sm" paddingHorizontal="$md" gap={2}>
        <SectionTitle fontSize={13} numberOfLines={1}>
          {block.title}
        </SectionTitle>
        <Data fontSize={11} numberOfLines={1}>
          {formatHour(block.startHour)} – {formatHour(block.endHour)} ·{' '}
          {block.activities.join(' · ')}
        </Data>
      </YStack>
    </Pressable>
  );
}

/**
 * Um compromisso na grade — card opaco por cima das janelas, no formato do
 * Teams: barra à esquerda, título, horário.
 *
 * O nível de energia da hora de início decide a cor da barra — é o cruzamento
 * que dá sentido a ter os dois na mesma tela. No vale a barra é neutra, o mesmo
 * traço dos blocos de recuperação: `$destructive` seguiria reservado a valor
 * fora da faixa saudável, e uma reunião mal-horária não é isso.
 */
function EventCard({ event, slots }: { event: CalendarEvent; slots: Slot[] }) {
  const { colors } = useTheme();
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
    <YStack
      {...LANE}
      top={top + 1}
      height={height - 2}
      backgroundColor="$card"
      borderWidth={1}
      borderColor="$border"
      accessible
      accessibilityLabel={
        `${event.title}, das ${clockOf(start)} às ${clockOf(end)}` +
        (event.attendeeCount > 1 ? `, ${event.attendeeCount} pessoas` : '') +
        `, na sua janela ${NIVEL_PT[level]}`
      }
    >
      <YStack
        width={3}
        opacity={level === 'mid' ? 0.5 : 1}
        style={{ backgroundColor: level === 'low' ? colors.hairlineStrong : colors.accent }}
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
 * A faixa que uma janela ou compromisso ocupa: da calha até a margem direita.
 *
 * Janela e evento compartilham a medida de propósito — eles dividem a mesma
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

/**
 * A lavagem de fundo de cada nível — o acento em rampa de opacidade, a mesma
 * gramática do calendário do ciclo. O vale usa o tinte neutro da superfície:
 * pintá-lo de acento diria "isto também é janela", e ele é o oposto disso.
 */
function corDaJanela(level: EnergyLevel, colors: { accent: string; surfaceTint: string }): string {
  if (level === 'low') return colors.surfaceTint;
  const r = parseInt(colors.accent.slice(1, 3), 16);
  const g = parseInt(colors.accent.slice(3, 5), 16);
  const b = parseInt(colors.accent.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${level === 'high' ? 0.16 : 0.08})`;
}

const NIVEL_PT: Record<EnergyLevel, string> = { high: 'alta', mid: 'média', low: 'baixa' };

const clockOf = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/** Converte hora decimal em deslocamento vertical dentro da grade. */
const offsetOf = (hour: number) => (hour - DAY_START) * HOUR_H;

/** O domingo da semana que contém `d`, à meia-noite local. */
function inicioDaSemana(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  c.setDate(c.getDate() - c.getDay());
  return c;
}

const mesmoDia = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** Chave estável de um dia para a lista da semana. */
const chave = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

const SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

const horaDa = (ms: number) => {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const shortTime = (d: Date) =>
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
