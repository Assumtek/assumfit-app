import { XStack, YStack } from '@tamagui/stacks';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert } from 'react-native';

import { DetailScreen } from '../components/DetailScreen';
import { ActionRow, Row, Section } from '../components/List';
import { ProgressRing } from '../components/ProgressRing';
import { Body, Data, Label, Metric, RatingText, Skeleton } from '../components/ui';
import { aneisDoCalendario, caloriasAtivas, diasFechados, metaEfetiva, repousoAteAgora } from '../domain/dailyGoals';
import { ageFromBirthDate, calorieGoal } from '../domain/nutritionGoal';
import { isoHoje } from '../domain/water';
import * as api from '../services/api.service';
import { useBiometricStore } from '../store/biometric.store';
import { useGoalsStore } from '../store/goals.store';
import { useTheme } from '../theme/ThemeProvider';
import { useWorkoutStore } from '../store/workout.store';

/**
 * Metas do dia: o anel de calorias ativas, o repouso ao lado, a meta editável
 * (padrão ou só para hoje) e o calendário de 28 dias com um anel por dia.
 * Tela própria (fundadora, 23/08/2026): a Home não recebe anéis de volta.
 */
export function DailyGoalsScreen() {
  const { colors } = useTheme();
  const activity = useBiometricStore((s) => s.activity);
  const latest = useBiometricStore((s) => s.latest);
  const metaPadrao = useGoalsStore((s) => s.metaPadraoKcal);
  const metaDeHoje = useGoalsStore((s) => s.metaDeHoje);
  const carregar = useGoalsStore((s) => s.carregar);
  const definirPadrao = useGoalsStore((s) => s.definirPadrao);
  const definirSoHoje = useGoalsStore((s) => s.definirSoHoje);
  const limparSoHoje = useGoalsStore((s) => s.limparSoHoje);
  const [bmr, setBmr] = useState<number | null>(null);
  const [dias, setDias] = useState<api.DailySummary[] | null>(null);
  const [sessoes, setSessoes] = useState<api.SportSession[]>([]);
  const [sessoesHoje, setSessoesHoje] = useState(0);

  useEffect(() => {
    void carregar();
    let vivo = true;
    void (async () => {
      const [anamnese, perfil, rotina, d, s] = await Promise.all([
        api.fetchAnamnesis().catch(() => null),
        api.fetchProfile().catch(() => null),
        api.fetchLifestyle().catch(() => null),
        api.fetchDailyHistory(30).catch(() => []),
        api.fetchSportSessions(30).catch(() => []),
      ]);
      if (!vivo) return;
      const resp = (anamnese?.answers ?? {}) as Record<string, unknown>;
      const num = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null);
      const meta = calorieGoal({
        weightKg: num(resp.weightKg),
        heightCm: num(resp.heightCm),
        ageYears: perfil ? ageFromBirthDate(perfil.birthDate, new Date()) : null,
        sex: perfil?.sex ?? null,
        goalAnswer: typeof resp.goal === 'string' ? resp.goal : (useWorkoutStore.getState().plan?.goal ?? rotina?.goal ?? null),
        trainDaysPerWeek: rotina?.trainDays?.length ?? null,
      });
      setBmr(meta?.bmr ?? null);
      setDias(d);
      setSessoes(s);
      const inicio = new Date();
      inicio.setHours(0, 0, 0, 0);
      setSessoesHoje(s.filter((x) => new Date(x.startedAt) >= inicio).reduce((soma, x) => soma + (x.kcal ?? 0), 0));
    })();
    return () => {
      vivo = false;
    };
  }, [carregar]);

  const hoje = isoHoje(new Date());
  const meta = metaEfetiva(metaPadrao, metaDeHoje, hoje);
  const ativas = caloriasAtivas(activity.steps ?? null, latest?.activeKcal ?? null, sessoesHoje);
  const agora = new Date();
  const repouso = repousoAteAgora(bmr, agora.getHours() + agora.getMinutes() / 60);
  const fracao = meta > 0 ? Math.min(1, ativas / meta) : 0;
  const aneis = useMemo(() => aneisDoCalendario(dias ?? [], sessoes, meta, new Date()), [dias, sessoes, meta]);
  const soHoje = metaDeHoje?.date === hoje;

  const pedirMeta = (titulo: string, atual: number, onOk: (kcal: number) => void) =>
    Alert.prompt(titulo, 'Calorias ativas por dia', (t) => {
      const n = Number(String(t ?? '').replace(/\D/g, ''));
      if (Number.isFinite(n) && n >= 50) onOk(n);
    }, 'plain-text', String(atual), 'number-pad');

  return (
    <DetailScreen title="Metas do dia">
      <XStack alignItems="center" gap="$xl" marginTop="$lg">
        <ProgressRing fraction={fracao} size={140} strokeWidth={12}>
          <YStack alignItems="center">
            <Metric>{ativas}</Metric>
            <Data>de {meta} kcal</Data>
          </YStack>
        </ProgressRing>
        <YStack flex={1} gap="$sm">
          <RatingText>{fracao >= 1 ? 'Meta fechada' : `${Math.round(fracao * 100)}% da meta`}</RatingText>
          <Body>{`Ativas: ${ativas} kcal, de passos e sessões de hoje.`}</Body>
          <Body>{repouso != null ? `Repouso até agora: ~${repouso} kcal (${bmr} por dia).` : 'Repouso: precisa de peso, altura e idade na anamnese.'}</Body>
        </YStack>
      </XStack>

      <Section label="Meta de calorias ativas">
        <ActionRow
          title="Meta padrão"
          subtitle={`${metaPadrao} kcal por dia`}
          right="none"
          onPress={() => pedirMeta('Meta padrão', metaPadrao, definirPadrao)}
        />
        <ActionRow
          title="Só para hoje"
          subtitle={soHoje ? `${metaDeHoje!.kcal} kcal hoje (toque para mudar)` : 'Mudar a meta só de hoje, sem mexer no padrão'}
          right="none"
          onPress={() => pedirMeta('Meta só para hoje', soHoje ? metaDeHoje!.kcal : metaPadrao, (k) => definirSoHoje(k, hoje))}
          last={!soHoje}
        />
        {soHoje ? <ActionRow title="Voltar à meta padrão hoje" right="none" onPress={limparSoHoje} last /> : null}
      </Section>

      <Section label="Últimos 28 dias">
        {dias === null ? (
          <Skeleton lines={3} />
        ) : (
          <>
            <Data marginBottom="$md">{`${diasFechados(aneis)} ${diasFechados(aneis) === 1 ? 'dia' : 'dias'} com a meta fechada`}</Data>
            <YStack gap="$sm">
              {Array.from({ length: 4 }, (_, semana) => (
                <XStack key={semana} justifyContent="space-between">
                  {aneis.slice(semana * 7, semana * 7 + 7).map((a) => (
                    <YStack key={a.day} alignItems="center" gap={4} accessibilityLabel={`${a.day}: ${a.ativas} kcal`}>
                      <ProgressRing fraction={a.fraction} size={32} strokeWidth={4} color={a.fraction >= 1 ? colors.good : colors.accent} />
                      <Label>{a.day.slice(8, 10)}</Label>
                    </YStack>
                  ))}
                </XStack>
              ))}
            </YStack>
            <Row last>
              <Data>Anel vazio é dia sem passos lidos e sem sessão: ou a pulseira ficou longe, ou o dia foi parado.</Data>
            </Row>
          </>
        )}
      </Section>
    </DetailScreen>
  );
}
