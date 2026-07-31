import { Directory, File, Paths } from 'expo-file-system';

import * as api from './api.service';
import type { GeoPoint } from '../domain/sport';

/**
 * A caixa de saída das sessões de esporte.
 *
 * A sessão concluída é gravada no aparelho ANTES de qualquer tentativa de
 * rede, e só sai daqui depois que o servidor confirmou. É o que torna
 * verdadeira a promessa da tela ("fica guardada e sobe sozinha"): sem isto,
 * uma falha de POST perdia o treino inteiro — servidor e aparelho —, porque o
 * percurso local era chaveado pelo id que só o servidor emite.
 */

const PREFIXO = 'esporte-pendente-';

export type SessaoPendente = {
  sport: string;
  startedAt: string;
  durationS: number;
  distanceM: number | null;
  kcal: number;
  avgHr: number | null;
  maxHr: number | null;
  points: GeoPoint[];
};

export function guardarPendente(sessao: SessaoPendente): void {
  try {
    new File(Paths.document, `${PREFIXO}${Date.parse(sessao.startedAt)}.json`).write(
      JSON.stringify(sessao),
    );
  } catch {
    // Sem espaço em disco não há cópia local — o POST ainda pode salvar.
  }
}

export function removerPendente(startedAt: string): void {
  try {
    const f = new File(Paths.document, `${PREFIXO}${Date.parse(startedAt)}.json`);
    if (f.exists) f.delete();
  } catch {
    // Já não existe — era o objetivo.
  }
}

/** O percurso local, chaveado pelo id do servidor — o mapinha do histórico. */
export function guardarPercurso(id: string, points: GeoPoint[]): void {
  if (points.length < 2) return;
  try {
    new File(Paths.document, `percurso-${id}.json`).write(JSON.stringify(points));
  } catch {
    // Sem espaço o histórico fica sem mapa — nunca sem registro.
  }
}

/**
 * Reenvia o que ficou para trás. Roda na abertura da tela e no pull-refresh;
 * o que falhar continua na caixa para a próxima tentativa.
 */
export async function reenviarPendentes(): Promise<number> {
  let arquivos: File[] = [];
  try {
    arquivos = new Directory(Paths.document)
      .list()
      .filter((e): e is File => e instanceof File && e.name.startsWith(PREFIXO));
  } catch {
    return 0;
  }

  let enviadas = 0;
  for (const arquivo of arquivos) {
    try {
      const { points, ...payload } = JSON.parse(await arquivo.text()) as SessaoPendente;
      const registro = await api.saveSportSession(payload);
      guardarPercurso(registro.id, points ?? []);
      arquivo.delete();
      enviadas += 1;
    } catch {
      // Continua pendente; a próxima abertura tenta de novo.
    }
  }
  return enviadas;
}
