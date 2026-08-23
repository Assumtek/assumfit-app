/**
 * Meta diária de calorias — peso, altura e objetivo da anamnese; idade e sexo
 * do cadastro.
 *
 * A base é Mifflin-St Jeor, a equação com melhor validação para gasto em
 * repouso sem medir composição corporal. Em cima entram o fator de atividade
 * (dias de treino por semana, quando o onboarding os tem) e o ajuste do
 * objetivo declarado: déficit para perder peso, superávit para ganhar massa.
 *
 * O resultado é FAIXA de partida, não prescrição: o produto não é dispositivo
 * médico e a tela apresenta a meta como referência ("~1.900 kcal"). Nada aqui
 * importa paleta nem monta string de UI — módulo de domínio puro, testável.
 */

export type CalorieGoal = {
  /** Gasto diário estimado (TDEE), kcal. */
  tdee: number;
  /** Meta ajustada ao objetivo, arredondada a 50 kcal. */
  goal: number;
  /** 'deficit' | 'surplus' | 'maintain' — o que o objetivo fez com o número. */
  adjustment: 'deficit' | 'surplus' | 'maintain';
  /** Gasto de repouso (Mifflin-St Jeor), kcal por dia: o que o corpo gasta parado. */
  bmr: number;
};

/** Respostas de NUMBER da anamnese chegam como string ("82") ou número. */
export function toMeasure(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const n = Number(value.replace(',', '.').replace(/[^\d.]/g, ''));
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  return null;
}

export function ageFromBirthDate(iso: string, now: Date): number | null {
  const nascimento = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(nascimento.getTime())) return null;
  let idade = now.getUTCFullYear() - nascimento.getUTCFullYear();
  const aniversario = new Date(Date.UTC(now.getUTCFullYear(), nascimento.getUTCMonth(), nascimento.getUTCDate()));
  if (now < aniversario) idade -= 1;
  return idade;
}

export function calorieGoal(input: {
  weightKg: number | null;
  heightCm: number | null;
  ageYears: number | null;
  sex: 'f' | 'm' | null;
  /** Resposta crua da pergunta `goal` da anamnese ("Perder peso", …). */
  goalAnswer: string | null;
  /** Dias de treino por semana (0–7), do perfil de rotina, se houver. */
  trainDaysPerWeek?: number | null;
}): CalorieGoal | null {
  const { weightKg, heightCm, ageYears, sex } = input;
  // Fora dessas faixas o mais provável é resposta trocada (peso em libras,
  // altura em metros) — melhor nenhuma meta do que uma meta absurda.
  if (weightKg === null || weightKg < 30 || weightKg > 300) return null;
  if (heightCm === null || heightCm < 120 || heightCm > 230) return null;
  if (ageYears === null || ageYears < 14 || ageYears > 100) return null;
  if (sex !== 'f' && sex !== 'm') return null;

  const bmr = 10 * weightKg + 6.25 * heightCm - 5 * ageYears + (sex === 'm' ? 5 : -161);

  const dias = input.trainDaysPerWeek ?? null;
  const fator =
    dias === null ? 1.45 : dias <= 0 ? 1.35 : dias <= 2 ? 1.45 : dias <= 4 ? 1.55 : 1.7;
  const tdee = bmr * fator;

  /*
   O objetivo chega em três vocabulários, e todos precisam ser lidos.

   A resposta da anamnese ("Perder peso", "Ganhar massa"), o objetivo do plano
   ativo (`emagrecimento`, `hipertrofia`) e o do perfil. Um testador com peso,
   altura e um plano de emagrecimento recebia meta de MANUTENÇÃO — a tela só
   lia a anamnese, que não tinha a pergunta na versão dele — e pediu "cálculo
   de calorias para quem quer emagrecer ou ganhar massa" achando que não existia.
  */
  const objetivo = (input.goalAnswer ?? '').toLowerCase();
  const adjustment: CalorieGoal['adjustment'] =
    objetivo.includes('perder') || objetivo.includes('emagrec')
      ? 'deficit'
      : objetivo.includes('massa') || objetivo.includes('ganhar') || objetivo.includes('hipertrof')
        ? 'surplus'
        : 'maintain';

  let goal = adjustment === 'deficit' ? tdee * 0.8 : adjustment === 'surplus' ? tdee * 1.12 : tdee;
  // Déficit não desce abaixo do repouso: a meta é sustentável ou não é meta.
  if (adjustment === 'deficit') goal = Math.max(goal, bmr);

  const arredondar = (v: number) => Math.round(v / 50) * 50;
  return { tdee: arredondar(tdee), goal: arredondar(goal), adjustment, bmr: Math.round(bmr) };
}
