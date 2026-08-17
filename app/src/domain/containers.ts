/**
 * Os recipientes de água da pessoa — copo, garrafa e squeeze — com o volume
 * que ELA usa (decisão da fundadora, ago/2026).
 *
 * O volume era fixo em 200/500/750 ml, e isso transformava cada registro numa
 * aproximação: quem bebe em copo de 300 subestimava um terço do dia inteiro.
 * Com o volume cadastrado, o toque continua sendo um só e o número passa a
 * ser o dela.
 *
 * Módulo de domínio puro: sem React, sem armazenamento — só o formato, os
 * padrões e os limites.
 */

export type ContainerKey = 'copo' | 'garrafa' | 'squeeze';

export type Container = {
  key: ContainerKey;
  label: string;
  ml: number;
};

/** Padrões de partida — volumes comuns, não afirmação sobre o copo de ninguém. */
export const DEFAULT_CONTAINERS: Container[] = [
  { key: 'copo', label: 'copo', ml: 200 },
  { key: 'garrafa', label: 'garrafa', ml: 500 },
  { key: 'squeeze', label: 'squeeze', ml: 750 },
];

/** Faixa aceita: abaixo de 50 ml é gole, acima de 2 L é galão. */
export const MIN_ML = 50;
export const MAX_ML = 2000;
/** Passo dos botões de ajuste. */
export const STEP_ML = 50;

export function clampMl(ml: number): number {
  if (!Number.isFinite(ml)) return DEFAULT_CONTAINERS[0].ml;
  return Math.min(MAX_ML, Math.max(MIN_ML, Math.round(ml)));
}

/**
 * Lê o que estava guardado, preservando a ORDEM e os rótulos dos padrões:
 * o que sobrevive de uma versão para outra é o volume, não a lista inteira.
 * Entrada corrompida ou de outra versão degrada para o padrão, nunca quebra.
 */
export function parseContainers(raw: string | null): Container[] {
  if (!raw) return DEFAULT_CONTAINERS;
  try {
    const lido = JSON.parse(raw) as unknown;
    if (!Array.isArray(lido)) return DEFAULT_CONTAINERS;
    const porChave = new Map<string, number>();
    for (const item of lido) {
      if (
        item &&
        typeof item === 'object' &&
        typeof (item as Container).key === 'string' &&
        typeof (item as Container).ml === 'number'
      ) {
        porChave.set((item as Container).key, clampMl((item as Container).ml));
      }
    }
    return DEFAULT_CONTAINERS.map((padrao) => ({
      ...padrao,
      ml: porChave.get(padrao.key) ?? padrao.ml,
    }));
  } catch {
    return DEFAULT_CONTAINERS;
  }
}

export function serializeContainers(containers: Container[]): string {
  return JSON.stringify(containers.map(({ key, ml }) => ({ key, ml })));
}
