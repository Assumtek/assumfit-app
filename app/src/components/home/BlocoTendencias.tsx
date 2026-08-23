import { YStack } from '@tamagui/stacks';
import React, { useEffect, useState } from 'react';
import { Pressable } from 'react-native';

import { Data, Label, Skeleton } from '../ui';
import { TrendList } from '../TrendList';
import {
  JANELA_ANTERIOR,
  JANELA_RECENTE,
  linhasDeTendencia,
  tendenciasProntas,
  type LinhaDeTendencia,
} from '../../domain/trend';
import * as api from '../../services/api.service';

const DIAS = JANELA_RECENTE + JANELA_ANTERIOR;

/**
 * As tendências que já têm o que dizer, no máximo três.
 *
 * Na home entram só as prontas: uma lista de seis "ainda acumulando" ocuparia
 * meia tela para informar que o app não sabe. A tela cheia mostra todas, com o
 * que falta em cada uma, e o bloco leva até lá.
 */
export function BlocoTendencias({ onAbrir }: { onAbrir: (rota: string) => void }) {
  const [linhas, setLinhas] = useState<LinhaDeTendencia[] | null>(null);

  useEffect(() => {
    const d = new Date();
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    Promise.all([api.fetchDailyHistory(DIAS), api.fetchHabitsHistory(DIAS)])
      .then(([dias, habitos]) => setLinhas(linhasDeTendencia(dias, habitos, iso)))
      .catch(() => setLinhas([]));
  }, []);

  if (linhas == null) return <Skeleton lines={3} />;

  const prontas = tendenciasProntas(linhas);
  if (prontas.length === 0) {
    return (
      <Pressable onPress={() => onAbrir('Trends')} accessibilityRole="button" accessibilityLabel="Tendências">
        <YStack gap="$sm">
          <Label>tendências</Label>
          <Data>
            As tendências aparecem quando houver medição suficiente para comparar um mês com os três
            anteriores.
          </Data>
        </YStack>
      </Pressable>
    );
  }

  return (
    <Pressable onPress={() => onAbrir('Trends')} accessibilityRole="button" accessibilityLabel="Ver todas as tendências">
      <TrendList linhas={prontas.slice(0, 3)} label="Tendências" />
    </Pressable>
  );
}
