import React, { useCallback, useEffect, useState } from 'react';

import { DetailScreen, usePullRefresh } from '../components/DetailScreen';
import { Note } from '../components/List';
import { TrendList } from '../components/TrendList';
import { Body, Skeleton } from '../components/ui';
import { JANELA_ANTERIOR, JANELA_RECENTE, linhasDeTendencia, type LinhaDeTendencia } from '../domain/trend';
import * as api from '../services/api.service';

const DIAS = JANELA_RECENTE + JANELA_ANTERIOR;

/** Data local de hoje em ISO, que é a chave dos dias do servidor. */
function hojeIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Tendências: o último mês contra os três anteriores.
 *
 * A tela existe porque "melhorei?" não é a mesma pergunta que "como estou
 * hoje?", e nenhuma tela respondia a primeira. Comparar com ontem não serve:
 * um dia qualquer oscila mais do que a mudança que se quer enxergar.
 *
 * A janela vem do servidor, que guarda o resumo por dia bem além do que o app
 * carregava: eram 30 dias por hábito, e a comparação precisa de 112.
 */
export function TrendsScreen() {
  const [linhas, setLinhas] = useState<LinhaDeTendencia[] | null>(null);
  const [erro, setErro] = useState(false);

  const carregar = useCallback(async () => {
    setErro(false);
    try {
      const [dias, habitos] = await Promise.all([
        api.fetchDailyHistory(DIAS),
        api.fetchHabitsHistory(DIAS),
      ]);
      setLinhas(linhasDeTendencia(dias, habitos, hojeIso()));
    } catch {
      setErro(true);
      setLinhas([]);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const refresh = usePullRefresh(carregar);

  return (
    <DetailScreen title="Tendências" refreshControl={refresh}>
      <Body marginBottom="$lg">
        Cada linha compara os últimos {JANELA_RECENTE} dias com os {JANELA_ANTERIOR} anteriores,
        contando só os dias em que houve medição.
      </Body>

      {linhas == null ? (
        <Skeleton lines={6} />
      ) : erro ? (
        <Note title="Sem conexão com o servidor" body="As tendências vêm do histórico guardado na sua conta. Puxe para baixo para tentar de novo." />
      ) : (
        <TrendList linhas={linhas} label="Do último mês para cá" />
      )}
    </DetailScreen>
  );
}
