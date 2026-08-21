import { useNavigation } from '@react-navigation/native';
import { XStack, YStack } from '@tamagui/stacks';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView } from 'react-native';

import { Note, Row, Section } from '../components/Card';
import { DetailScreen, usePullRefresh } from '../components/DetailScreen';
import { Body, Data, Display, RatingText } from '../components/ui';
import {
  rateHeartRate,
  rateHrv,
  ratePressure,
  rateSleep,
  rateSpo2,
  rateStress,
  ratingTextColor,
  type Rating,
} from '../domain/ratings';
import * as api from '../services/api.service';
import { useTheme } from '../theme/ThemeProvider';
import { space } from '../theme/tokens';

/** Quantos dias a faixa cobre. */
const DIAS = 30;

const SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

/**
 * Chave `YYYY-MM-DD` no fuso LOCAL.
 *
 * `toISOString()` converte para UTC antes de cortar, e por isso qualquer horário
 * depois das 21h no Brasil viraria o dia seguinte — a faixa marcaria como "hoje"
 * um dia que ainda não começou. É o mesmo cuidado que o `tzOffset` resolve no
 * lado do servidor.
 */
function chaveLocal(d: Date): string {
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

/** Os últimos `DIAS` dias, do mais antigo ao mais recente. */
function ultimosDias(hoje: Date): Date[] {
  return Array.from({ length: DIAS }, (_, i) => {
    const d = new Date(hoje);
    d.setDate(d.getDate() - (DIAS - 1 - i));
    return d;
  });
}

export function HistoryScreen() {
  const { colors } = useTheme();

  const [dados, setDados] = useState<api.DailySummary[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [selecionado, setSelecionado] = useState<string>(() => chaveLocal(new Date()));

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      setDados(await api.fetchDailyHistory(DIAS));
    } catch {
      // Sem servidor não há histórico: ele mora no banco, não no aparelho. Dizer
      // isso é melhor que uma faixa vazia que parece "você não mediu nada".
      setErro('Não foi possível carregar o histórico. Verifique a conexão com o servidor.');
      setDados([]);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const refresh = usePullRefresh(carregar);

  const porDia = useMemo(() => new Map((dados ?? []).map((d) => [d.day, d])), [dados]);
  const dias = useMemo(() => ultimosDias(new Date()), []);
  const dia = porDia.get(selecionado) ?? null;

  return (
    <DetailScreen title="Histórico" refreshControl={refresh}>
      {/*
        A faixa rola horizontalmente e começa no fim — o dia mais recente é o
        que interessa ao abrir, e obrigar a rolar 30 dias para chegar nele
        inverteria a prioridade.
      */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: space.sm, paddingVertical: space.md, paddingRight: space.md }}
        // `onContentSizeChange` em vez de `contentOffset`: a largura só é
        // conhecida depois da medição.
        ref={(r) => r?.scrollToEnd({ animated: false })}
        onContentSizeChange={(_, __) => undefined}
      >
        {dias.map((d) => {
          const chave = chaveLocal(d);
          const resumo = porDia.get(chave);
          const ativo = chave === selecionado;
          const temDado = (resumo?.readings ?? 0) > 0;

          return (
            <Pressable
              key={chave}
              onPress={() => setSelecionado(chave)}
              accessibilityRole="button"
              accessibilityState={{ selected: ativo }}
              accessibilityLabel={`${d.getDate()} de ${d.toLocaleDateString('pt-BR', { month: 'long' })}${
                temDado ? '' : ', sem medição'
              }`}
            >
              {/*
                Uma LINHA sob o dia, não uma caixa em volta: a régua inferior
                marca a seleção com o mesmo vocabulário do resto do app.
              */}
              <YStack
                alignItems="center"
                gap="$xs"
                paddingVertical="$sm"
                paddingHorizontal="$sm"
                minWidth={44}
                borderRadius={12}
                borderBottomWidth={ativo ? 1 : 0}
                borderBottomColor="$borderStrong"
              >
                <Body color={ativo ? '$foreground' : '$mutedForeground'}>{SEMANA[d.getDay()]}</Body>
                <Data color={ativo ? '$foreground' : '$mutedForeground'}>{d.getDate()}</Data>
                {/*
                  O ponto é o ÚNICO acento aqui, e ele codifica dado: marca os
                  dias em que houve medição. Sem ele a faixa não distingue um dia
                  vazio de um dia cheio antes de você tocar.
                */}
                <YStack
                  width={4}
                  height={4}
                  borderRadius={2}
                  backgroundColor={temDado ? '$primary' : 'transparent'}
                />
              </YStack>
            </Pressable>
          );
        })}
      </ScrollView>

      {dados === null ? (
        <YStack paddingVertical="$xl">
          <ActivityIndicator size="small" color={colors.textMuted} />
        </YStack>
      ) : erro ? (
        <Note title="Histórico indisponível" body={erro} />
      ) : !dia ? (
        <Note
          title="Sem medição neste dia"
          body="Os dias com medição aparecem marcados na faixa acima. Use a pulseira ao longo do dia para preencher o histórico."
        />
      ) : (
        <ResumoDoDia dia={dia} />
      )}
    </DetailScreen>
  );
}

/**
 * O resumo de um dia.
 *
 * Toda métrica passa por `ratings.ts`, como qualquer outra tela: o destaque é a
 * avaliação em linguagem humana e o número técnico é sub-label. Métrica sem
 * medição naquele dia simplesmente não aparece — uma linha "—" repetida cinco
 * vezes não informa nada além do que a ausência já diz.
 */
function ResumoDoDia({ dia }: { dia: api.DailySummary }) {
  const { colors } = useTheme();

  const navigation = useNavigation<any>();
  const linhas: { label: string; rating: Rating; detalhe: string; metric: string }[] = [];

  // Sono abre a lista, como abre a tela de Saúde: é a métrica que mais explica
  // o resto do dia. Score e duração juntos — `rateSleep` exige os dois, porque
  // "82" sem duração tanto pode ser uma noite ótima quanto um cochilo.
  if (dia.sleep_score != null && dia.sleep_minutes != null) {
    const rating = rateSleep(dia.sleep_score, dia.sleep_minutes);
    linhas.push({
      label: 'Sono', metric: 'sleep',
      rating,
      detalhe: `${rating.detail} · score ${dia.sleep_score}`,
    });
  }
  if (dia.heart_rate != null) {
    linhas.push({
      label: 'Coração', metric: 'hr',
      rating: rateHeartRate(dia.heart_rate),
      detalhe:
        dia.heart_rate_min != null && dia.heart_rate_max != null
          ? `${dia.heart_rate} bpm em média · ${dia.heart_rate_min}–${dia.heart_rate_max}`
          : `${dia.heart_rate} bpm em média`,
    });
  }
  if (dia.hrv_ms != null) {
    linhas.push({ label: 'HRV', metric: 'hrv', rating: rateHrv(dia.hrv_ms), detalhe: `${dia.hrv_ms} ms em média` });
  }
  if (dia.spo2_pct != null) {
    linhas.push({
      label: 'Oxigênio', metric: 'spo2',
      rating: rateSpo2(dia.spo2_pct),
      // A MÍNIMA do dia importa mais que a média: dessaturação é episódica, e
      // uma média de 96% pode esconder uma queda a 88% durante o sono.
      detalhe: dia.spo2_min != null ? `${dia.spo2_pct}% em média · mínima ${dia.spo2_min}%` : `${dia.spo2_pct}% em média`,
    });
  }
  if (dia.stress_score != null) {
    linhas.push({ label: 'Estresse', metric: 'stress', rating: rateStress(dia.stress_score), detalhe: `${dia.stress_score} de 100` });
  }
  if (dia.bp_systolic != null && dia.bp_diastolic != null) {
    linhas.push({
      label: 'Pressão', metric: 'pressure',
      rating: ratePressure(dia.bp_systolic, dia.bp_diastolic),
      detalhe: `${dia.bp_systolic}/${dia.bp_diastolic} mmHg em média`,
    });
  }

  const data = new Date(`${dia.day}T12:00:00`);

  return (
    <>
      <YStack marginTop="$md" marginBottom="$lg">
        <Display>{dia.energy_score ?? '—'}</Display>
        <Data marginTop="$xs" color="$mutedForeground">
          {dia.energy_score != null ? 'energia média do dia' : 'sem score calculado neste dia'}
        </Data>
        <Body marginTop="$sm">
          {data.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
        </Body>
      </YStack>

      {linhas.length ? (
        <Section label="Métricas do dia">
          {linhas.map((l, i) => (
            <Pressable
              key={l.label}
              onPress={() => navigation.push('MetricDay', { metric: l.metric, dia: dia.day })}
              accessibilityRole="button"
              accessibilityLabel={`${l.label}, ${l.rating.label}. Abrir o dia inteiro`}
              style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
            >
            <Row last={i === linhas.length - 1}>
              {/* `flex: 1` no rótulo e `flexShrink: 0` no valor: a avaliação
                  ("Pode melhorar") é mais larga que o rótulo e não pode ser
                  espremida — quem cede espaço é o nome da métrica. */}
              <Body flex={1} color="$foreground" numberOfLines={1}>
                {l.label}
              </Body>
              <YStack alignItems="flex-end" flexShrink={0} maxWidth="62%">
                <RatingText numberOfLines={1} style={{ color: ratingTextColor(l.rating.state, colors) }}>
                  {l.rating.label}
                </RatingText>
                <Data marginTop="$xs" color="$mutedForeground" numberOfLines={1}>
                  {l.detalhe}
                </Data>
              </YStack>
            </Row>
            </Pressable>
          ))}
        </Section>
      ) : null}

      <Section label="Atividade">
        <Pressable onPress={() => navigation.push('MetricDay', { metric: 'steps', dia: dia.day })} accessibilityRole="button">
        <Row last>
          <Body flex={1} color="$foreground">Passos</Body>
          <Data color="$foreground">{dia.steps != null ? dia.steps.toLocaleString('pt-BR') : '—'}</Data>
        </Row>
        </Pressable>
      </Section>

    </>
  );
}
