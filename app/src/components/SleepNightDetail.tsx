import { XStack, YStack } from '@tamagui/stacks';
import React, { useState } from 'react';
import { Pressable } from 'react-native';

import { Icon } from './Icon';
import { Row, Section } from './List';
import { Hypnogram } from './charts/Hypnogram';
import { useChartWidth } from './charts/useChartWidth';
import { Body, Data, Display, RatingText } from './ui';
import { formatDateBR } from '../domain/birthDate';
import { rateSleep } from '../domain/ratings';
import { ExplicarMetrica } from './ExplicarMetrica';
import { horaLocal, trechosAcordado } from '../domain/sleep';
import type { SleepNight, SleepPhase } from '../domain/types';
import { useTheme } from '../theme/ThemeProvider';

/**
 * O detalhe de UMA noite: score, ponta a ponta com relógio, avaliação,
 * hipnograma, levantadas e fases.
 *
 * Era o corpo da tela de Sono e só existia para a noite corrente. Um testador
 * (Leonardo, 22/08, build 1.0.5 (4)) pediu o mesmo detalhe nos dias
 * anteriores; a peça sobe para componente e a tela do dia passado a reusa.
 */
const PHASES: { key: SleepPhase; label: string; opacity: number }[] = [
  { key: 'deep', label: 'Profundo', opacity: 1 },
  { key: 'rem', label: 'REM', opacity: 0.66 },
  { key: 'light', label: 'Leve', opacity: 0.38 },
  { key: 'awake', label: 'Acordado', opacity: 0.16 },
];

export function diaSeguinte(iso: string): string {
  const [a, m, d] = iso.split('-').map(Number);
  const x = new Date(a, m - 1, d + 1);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

export function SleepNightDetail({ sleep }: { sleep: SleepNight }) {
  const rating = rateSleep(sleep.score, sleep.totalMin);
  const [chartWidth, onLayoutChartWidth] = useChartWidth();
  const duration = (min: number) => {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
  };
  const pct = (min: number) => Math.round((min / sleep.totalMin) * 100);
  const acordadas = trechosAcordado(sleep);
  const [explicando, setExplicando] = useState(false);
  const { colors } = useTheme();

  return (
    <>
      <YStack marginBottom="$xxl">
        {/*
          O número EXPLICA-SE ao toque.

          "Tive um sono 92% ótimo, mas o que isso significa?" (pedido de
          testador). A tela mostrava o valor e a avaliação, e quem não sabe o
          que é um score de sono ficava com um número bonito e nenhuma leitura.

          Os componentes vão prontos daqui: a tela já sabe de que a noite é
          feita, e recalcular isso no servidor seria uma segunda conta para o
          mesmo número.
        */}
        <Pressable
          onPress={() => setExplicando(true)}
          accessibilityRole="button"
          accessibilityLabel={`Score ${sleep.score}, entender o que significa`}
          style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
        >
          <Display>{sleep.score}</Display>
          <XStack alignItems="center" gap="$xs" marginTop="$sm">
            <Data>score · {duration(sleep.totalMin)} de sono</Data>
            <Icon name="help" size={14} color={colors.textMuted} />
          </XStack>
        </Pressable>

        <ExplicarMetrica
          aberto={explicando}
          onFechar={() => setExplicando(false)}
          metrica="sono"
          rotulo="Sono"
          valor={sleep.score}
          avaliacao={rating.label}
          componentes={[
            `${duration(sleep.totalMin)} dormidas`,
            `${pct(sleep.phases.deep)}% de sono profundo`,
            `${pct(sleep.phases.rem)}% de REM`,
            acordadas.length > 0
              ? `${acordadas.length} ${acordadas.length === 1 ? 'vez acordado' : 'vezes acordado'}`
              : 'noite sem despertares registrados',
          ]}
        />
        {/*
          A DATA da noite, não uma hora.

          `SleepSegment` guarda duração e fase, nunca instante — carimbar um
          horário de despertar aqui seria invenção. E a data importa: uma noite
          de quatro dias atrás exibida sem ela se lê como a de ontem, que foi o
          que o app do fabricante mostrava.
        */}
        {/*
          As DUAS pontas da noite. O rótulo dizia só o dia em que começou, e a
          fundadora leu "20/08" como a noite anterior quando era a de 20 para 21
          (ago/2026); um testador, antes, tinha lido o contrário. Dormiu X,
          acordou Y resolve as duas leituras.
        */}
        <Data marginTop="$xs">noite de {formatDateBR(sleep.date).slice(0, 5)} para {formatDateBR(diaSeguinte(sleep.date))}</Data>
        {/* Início e fim com relógio — pedido de um testador (22/08). Só quando
            a noite veio com janela; sem ela, a linha não aparece em vez de
            inventar hora. */}
        {sleep.startAt != null && sleep.endAt != null ? (
          <Data marginTop="$xs">dormiu {horaLocal(sleep.startAt)} · acordou {horaLocal(sleep.endAt)}</Data>
        ) : null}
        {/*
          A ORIGEM aparece quando não é a pulseira.

          O sono é o único número do app que pode vir de dois aparelhos, e a
          diferença entre eles pode ser enorme: o app Saúde do iPhone registrou
          41 minutos numa noite em que a pulseira tinha 8h30 (fundadora,
          26/08/2026). Sem dizer de onde veio, o número parece do wearable e o
          erro fica invisível. Quando é a pulseira, nada é dito: é o esperado.
        */}
        {sleep.source === 'healthkit' ? (
          <Data marginTop="$xs" color="$mutedForeground">
            do app Saúde do iPhone, não da pulseira
          </Data>
        ) : null}
        <RatingText
          marginTop="$lg"
          color={rating.state === 'alert' ? '$destructive' : '$foreground'}
        >
          {rating.label}
        </RatingText>
        {/* Uma frase de abertura: o que este número É. O método inteiro fica na
            Ajuda — pedido dos testadores (ago/2026), que queriam entender a
            métrica sem sair da tela. */}
        <Body marginTop="$md">O score nasce das fases medidas: metade é quanto você dormiu, um quarto é o sono profundo, o resto é REM e continuidade, uma noite longa e picada pode pontuar menos que uma curta e inteira.</Body>
      </YStack>

      <YStack onLayout={onLayoutChartWidth}>
        <Hypnogram segments={sleep.segments} width={chartWidth} />
      </YStack>
      <Data marginTop="$md" marginBottom="$sm" lineHeight={18}>
        A ordem importa mais que o total: profundo concentrado nos primeiros ciclos é o padrão
        fisiológico.
      </Data>

      {/*
        Quando levantou durante a noite, com relógio. A seção só existe se
        houve levantada: "nenhuma" como linha seria ruído numa noite inteira.
      */}
      {acordadas.length > 0 ? (
        <YStack marginBottom="$xl">
          <Section label="Acordou durante a noite">
            {acordadas.map((t, i) => (
              <Row key={t.startAt} last={i === acordadas.length - 1}>
                <Body flex={1}>
                  {horaLocal(t.startAt)} → {horaLocal(t.endAt)}
                </Body>
                <Data>{t.minutes >= 60 ? `${Math.floor(t.minutes / 60)}h ${String(t.minutes % 60).padStart(2, '0')}m` : `${t.minutes} min`}</Data>
              </Row>
            ))}
          </Section>
        </YStack>
      ) : null}

      <Section label="Fases da noite">
        {PHASES.map((p, i) => (
          <Row key={p.key} last={i === PHASES.length - 1}>
            <YStack
              width={8}
              height={4}
              backgroundColor="$primary"
              marginRight="$md"
              opacity={p.opacity}
            />
            <Body flex={1}>{p.label}</Body>
            <Data marginRight="$xl">{duration(sleep.phases[p.key])}</Data>
            <RatingText minWidth={48} textAlign="right" fontWeight="300">
              {pct(sleep.phases[p.key])}%
            </RatingText>
          </Row>
        ))}
      </Section>

      {/*
        Oxigênio durante a noite SAIU desta tela (decisão da fundadora, 21/08).
        A pulseira raramente entrega a série noturna de SpO₂, e a seção vivia
        entre dois estados ruins: gráfico vazio ou um aviso de "sem medição"
        que lia como defeito. O oxigênio continua com tela própria.
      */}
    </>
  );
}
