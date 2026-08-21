/**
 * A meta de água do dia — pelo corpo da pessoa, não por um número redondo.
 *
 * Eram 2,5 L fixos para todo mundo, com um comentário no código prometendo
 * "vira cálculo por peso quando o cadastro tiver peso". O peso existe desde
 * que a anamnese passou a perguntar, e 2,5 L é muito para quem tem 50 kg e
 * pouco para quem tem 100.
 *
 * ## De onde vêm os números
 *
 * A referência europeia (EFSA, *Scientific Opinion on Dietary Reference Values
 * for water*, EFSA Journal 2010;8(3):1459) define ingestão adequada de água
 * TOTAL — bebidas mais a água dos alimentos — em 2,0 L/dia para mulheres e
 * 2,5 L/dia para homens, e diz explicitamente que esses valores valem para
 * temperatura moderada e atividade física moderada.
 *
 * Duas consequências para um app que conta copos:
 *
 * 1. **A meta é a regra inteira, sem desconto.** Houve uma versão que tirava
 *    20 % por "água que vem da comida": 70 kg viravam 2,0 L na tela enquanto a
 *    explicação dizia "70 kg × 35 ml" — a conta mostrada não batia com o
 *    número. A fundadora leu como erro (21/08), e é: mostrar uma regra e
 *    entregar outra é incoerência, não precisão. A pessoa bebe por sede além
 *    da meta; a meta não precisa antecipar a sopa.
 * 2. **Treinar muda a conta.** O próprio documento condiciona os valores à
 *    atividade moderada; quem treina perde mais no suor.
 *
 * A escala por peso usa 35 mL/kg/dia, a regra de bolso da nutrição clínica —
 * e é declarada como isso, não como achado de estudo. Os valores da EFSA
 * entram como PISO por sexo, para que uma pessoa leve não receba uma meta
 * abaixo da referência populacional.
 *
 * Módulo de domínio puro: entram peso, sexo e minutos de treino; sai a meta.
 */

import type { Sex } from './types';

/** Regra de bolso da nutrição clínica para adultos. */
export const ML_POR_KG = 35;

/** EFSA 2010: ingestão adequada de água total, por sexo. */
const AI_TOTAL_ML: Record<Sex, number> = { f: 2000, m: 2500 };

/**
 * Acréscimo por hora de treino registrado hoje.
 *
 * Conservador de propósito: a perda por suor varia demais com calor, roupa e
 * intensidade para o app fingir precisão. 350 mL por hora fica no piso das
 * faixas usuais — melhor pedir de menos e a pessoa beber por sede do que
 * inflar a meta e transformar o card num alvo impossível.
 */
export const ML_POR_HORA_DE_TREINO = 350;

/** Limites de segurança da meta exibida. */
export const META_MINIMA_ML = 1500;
export const META_MAXIMA_ML = 4000;

/** Meta padrão de quem ainda não declarou peso — o valor inicial do store, até o cálculo rodar. */
export const META_PADRAO_ML = 2500;

export type WaterGoalInput = {
  /** Da anamnese. `null` cai na meta padrão. */
  weightKg: number | null;
  sex: Sex;
  /** Minutos de treino e esporte registrados HOJE. */
  activeMinToday?: number;
};

/** A meta do dia, em mililitros, arredondada para 100 — copo não tem precisão de 1 mL. */
export function waterGoalMl({ weightKg, sex, activeMinToday = 0 }: WaterGoalInput): number {
  // O piso da referência populacional: pessoa leve não desce abaixo dele.
  const piso = AI_TOTAL_ML[sex];
  const base = weightKg && weightKg > 0 ? weightKg * ML_POR_KG : piso;
  const comTreino = Math.max(base, piso) + (activeMinToday / 60) * ML_POR_HORA_DE_TREINO;

  const limitada = Math.min(META_MAXIMA_ML, Math.max(META_MINIMA_ML, comTreino));
  return Math.round(limitada / 100) * 100;
}

/** A frase que explica a meta na tela — a conta é da pessoa, e ela pode conferir. */
export function waterGoalReason({ weightKg, sex, activeMinToday = 0 }: WaterGoalInput): string {
  const partes: string[] = [];
  partes.push(
    weightKg && weightKg > 0
      ? `${Math.round(weightKg)} kg × ${ML_POR_KG} ml`
      : `referência para ${sex === 'f' ? 'mulheres' : 'homens'} adultos`,
  );
  if (activeMinToday > 0) partes.push(`+ ${Math.round(activeMinToday)} min de treino hoje`);
  return partes.join(' ');
}
