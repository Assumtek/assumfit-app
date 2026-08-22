/**
 * Calorias por minuto a partir do batimento — a conta de Keytel (2005).
 *
 * Pedido de um testador (22/08/2026): acompanhar bpm e calorias DURANTE o
 * treino guiado. O batimento vem da pulseira ao vivo; a caloria ninguém mede —
 * é estimada. A fórmula de Keytel et al. relaciona frequência cardíaca, peso,
 * idade e sexo ao gasto energético em treino, e é a mais usada por relógios
 * esportivos para isso. Sem peso não há conta honesta, e aí a tela mostra só o
 * batimento.
 *
 * Módulo de domínio puro: entram números, sai kcal/min. Nunca negativo —
 * batimento de repouso pode cair abaixo do zero da fórmula, e "queimou -2
 * kcal" não existe.
 */

import type { Sex } from './types';

export type PerfilParaEnergia = { sex: Sex; age: number; weightKg: number };

export function kcalPorMinuto(bpm: number, perfil: PerfilParaEnergia): number {
  const { sex, age, weightKg } = perfil;
  if (!(bpm > 0) || !(weightKg > 0) || !(age > 0)) return 0;
  const joulesPorMin =
    sex === 'm'
      ? -55.0969 + 0.6309 * bpm + 0.1988 * weightKg + 0.2017 * age
      : -20.4022 + 0.4472 * bpm - 0.1263 * weightKg + 0.074 * age;
  return Math.max(0, joulesPorMin / 4.184);
}

/**
 * Acumula o gasto entre duas amostras: o batimento observado vale pelo
 * intervalo até a próxima leitura. Intervalos absurdos (app suspenso por
 * uma hora) são cortados em 2 min — o que não foi visto não é cobrado.
 */
export const INTERVALO_MAXIMO_MS = 2 * 60_000;

export function acumularKcal(acumulado: number, bpm: number, intervaloMs: number, perfil: PerfilParaEnergia): number {
  const ms = Math.min(Math.max(0, intervaloMs), INTERVALO_MAXIMO_MS);
  return acumulado + kcalPorMinuto(bpm, perfil) * (ms / 60_000);
}
