import { YStack } from '@tamagui/stacks';
import React, { useEffect, useState } from 'react';

import { Data, Label, Skeleton } from '../ui';
import { WeekStrip } from '../WeekStrip';
import {
  caloriasAtivas,
  diasFechados,
  fitaDaSemana,
  metaEfetiva,
  type DiaDaFita,
} from '../../domain/dailyGoals';
import * as api from '../../services/api.service';
import { useBiometricStore } from '../../store/biometric.store';
import { useGoalsStore } from '../../store/goals.store';

/**
 * A semana em sete anéis, na home.
 *
 * Carrega o próprio dado: o bloco pode estar desligado, e nesse caso nem monta,
 * nem faz a consulta. Foi o que permitiu tornar a home configurável sem que
 * cada bloco novo custasse uma requisição a quem não o quer.
 */
export function BlocoSemana({ onAbrir }: { onAbrir: (rota: string) => void }) {
  const activity = useBiometricStore((s) => s.activity);
  const metaPadrao = useGoalsStore((s) => s.metaPadraoKcal);
  const metaDeHoje = useGoalsStore((s) => s.metaDeHoje);
  const carregarMetas = useGoalsStore((s) => s.carregar);
  const [dias, setDias] = useState<DiaDaFita[] | null>(null);

  useEffect(() => {
    void carregarMetas();
  }, [carregarMetas]);

  useEffect(() => {
    const hoje = new Date();
    const iso = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
    const meta = metaEfetiva(metaPadrao, metaDeHoje, iso);
    Promise.all([api.fetchDailyHistory(14), api.fetchSportSessions(14)])
      .then(([historico, sessoes]) => {
        const inicioDeHoje = new Date();
        inicioDeHoje.setHours(0, 0, 0, 0);
        const kcalDeHoje = sessoes
          .filter((s) => new Date(s.startedAt).getTime() >= inicioDeHoje.getTime())
          .reduce((soma, s) => soma + (s.kcal ?? 0), 0);
        // Hoje pelo aparelho, como no anel e no calendário de metas.
        const ativasHoje = caloriasAtivas(activity.steps ?? null, activity.activeKcal, kcalDeHoje);
        setDias(fitaDaSemana(historico, sessoes, meta, new Date(), ativasHoje));
      })
      .catch(() => setDias([]));
  }, [metaPadrao, metaDeHoje, activity]);

  if (dias == null) return <Skeleton lines={2} />;
  if (dias.length === 0) return null;

  const fechados = diasFechados(dias.filter((d) => !d.futuro));
  return (
    <YStack gap="$md">
      <Label>sua semana</Label>
      <WeekStrip dias={dias} onPress={() => onAbrir('DailyGoals')} />
      <Data>
        {fechados === 0
          ? 'Nenhum dia fechado ainda nesta semana.'
          : fechados === 1
            ? 'Um dia fechado nesta semana.'
            : `${fechados} dias fechados nesta semana.`}
      </Data>
    </YStack>
  );
}
