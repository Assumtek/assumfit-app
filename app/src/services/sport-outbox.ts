import { Directory, File, Paths } from 'expo-file-system';

import * as api from './api.service';
import { valeRetomar, type GeoPoint } from '../domain/sport';

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

/**
 * A sessão EM CURSO, gravada enquanto ela corre.
 *
 * A caixa de saída acima só conhece sessão CONCLUÍDA. A que está correndo vivia
 * apenas no estado do React — e o iOS recolhe memória de app em segundo plano
 * sem avisar ninguém. Uma partida de tênis de uma hora, com o celular no bolso,
 * é exatamente o caso em que ele recolhe.
 *
 * O efeito era cruel na direção errada: quanto MAIS longa a sessão, maior a
 * chance de o app morrer, e mais treino se perdia. E a Dynamic Island seguia
 * contando — ela é nativa —, então tudo indicava que estava sendo gravado.
 *
 * Relatado em produção (ago/2026): sessão iniciada pelo app e nenhum registro.
 */
const EM_CURSO = 'esporte-em-curso.v1.json';

export type SessaoEmCurso = {
  /** `kind` do esporte; a tela reconstrói o resto do catálogo. */
  sport: string;
  startedAt: number;
  pausedMs: number;
  pausedSince: number | null;
  points: GeoPoint[];
  hrSamples: number[];
  /** O dia do plano que esta sessão cumpre, quando veio do check-in. */
  vinculo?: { workoutId: string; planDayId: string } | null;
  execucaoVinculada?: string | null;
};

export function guardarEmCurso(sessao: SessaoEmCurso): void {
  try {
    new File(Paths.document, EM_CURSO).write(JSON.stringify(sessao));
  } catch {
    // Falha de disco não pode derrubar a sessão que está correndo: o pior caso
    // volta a ser o comportamento antigo, que é perdê-la se o app morrer.
  }
}

/**
 * A sessão interrompida, se houver — e só se ainda fizer sentido retomá-la.
 *
 * Sessão de mais de doze horas é resto esquecido, não treino: retomar aquilo
 * mostraria um cronômetro absurdo e gravaria um registro que ninguém fez.
 */
export function lerEmCurso(agora = Date.now()): SessaoEmCurso | null {
  try {
    const f = new File(Paths.document, EM_CURSO);
    if (!f.exists) return null;
    const s = JSON.parse(f.textSync()) as SessaoEmCurso;
    if (!valeRetomar(s?.startedAt, agora)) {
      descartarEmCurso();
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

export function descartarEmCurso(): void {
  try {
    const f = new File(Paths.document, EM_CURSO);
    if (f.exists) f.delete();
  } catch {
    // Sem disco, a próxima leitura simplesmente falha e devolve null.
  }
}

export type SessaoPendente = {
  sport: string;
  startedAt: string;
  durationS: number;
  distanceM: number | null;
  kcal: number;
  avgHr: number | null;
  maxHr: number | null;
  /** Execução do plano que a sessão cumpriu — viaja junto no reenvio. */
  workoutExecutionId?: string | null;
  /** Percurso simplificado — viaja junto no reenvio. */
  track?: { lat: number; lon: number }[] | null;
  points: GeoPoint[];
};

export function guardarPendente(sessao: SessaoPendente): void {
  try {
    new File(Paths.document, `${PREFIXO}${Date.parse(sessao.startedAt)}.json`).write(
      JSON.stringify(sessao));
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
