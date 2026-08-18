import React from 'react';

import { Data } from './ui';
import { medidoEm } from '../domain/series';

/**
 * Quando esta medição foi feita — em toda tela de saúde, na mesma forma.
 *
 * O motivo é medido, não estético: esta pulseira mede em janelas agendadas e
 * passa dias sem tocar em algumas grandezas. No app do fabricante, no mesmo
 * instante, o batimento era do minuto e o HRV de quatro dias antes — os dois
 * lado a lado, cada um com a sua data. Sem o carimbo, todo número se lê como
 * "agora", e a pessoa decide o dia de hoje com dado de anteontem.
 *
 * `null` sem instante conhecido, em vez de "—" ou de uma data inventada: linha
 * ausente diz menos que linha errada.
 */
export function MeasuredAt({ at, prefixo = 'medido' }: { at?: number | null; prefixo?: string }) {
  if (at == null || !Number.isFinite(at) || at <= 0) return null;
  return (
    <Data marginTop="$xs">
      {prefixo} {medidoEm(at)}
    </Data>
  );
}
