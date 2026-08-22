/**
 * A meta de água do dia — a MESMA regra da tela (`app/src/domain/waterGoal.ts`).
 *
 * O insight da Saúde dizia "0,4 L de 2,5 L" enquanto a tela de Água dizia
 * "de 2.100 ml" (rodada de testes, 22/08/2026): o backend mandava o consumo
 * mas não a meta, e o serviço de IA assumia 2.500. Duas metas para a mesma
 * pessoa na mesma hora é incoerência que ninguém consegue explicar.
 *
 * Peso × 35 ml, com piso da EFSA por sexo (2,0 L / 2,5 L), limites de
 * segurança e centena redonda. Sem o acréscimo por treino do dia, que a tela
 * soma a partir do que foi registrado — aqui entra o que já está no banco.
 * Mudou lá, muda aqui: é a duplicação deliberada que o projeto já pratica
 * entre app e IA, pelo mesmo motivo (o app precisa funcionar offline).
 */
export const ML_POR_KG = 35;
const AI_TOTAL_ML: Record<'f' | 'm', number> = { f: 2000, m: 2500 };
export const META_MINIMA_ML = 1500;
export const META_MAXIMA_ML = 4000;

export function waterGoalMl(weightKg: number | null | undefined, sex: 'f' | 'm', activeMinToday = 0): number {
  const piso = AI_TOTAL_ML[sex];
  const base = weightKg && weightKg > 0 ? weightKg * ML_POR_KG : piso;
  const comTreino = Math.max(base, piso) + (activeMinToday / 60) * 350;
  const limitada = Math.min(META_MAXIMA_ML, Math.max(META_MINIMA_ML, comTreino));
  return Math.round(limitada / 100) * 100;
}
