/**
 * O texto do lembrete de água — calculado do que a pessoa REALMENTE bebeu.
 *
 * O lembrete era uma frase só ("Um copo agora conta para a meta de hoje"),
 * congelada no agendamento e repetida quatro vezes por dia até virar ruído
 * que se dispensa sem ler. Aqui ele passa a dizer o estado: quem não bebeu
 * nada ouve isso, quem está perto ouve quanto falta, e quem bateu a meta não
 * ouve nada — lembrete depois da meta é interrupção sem pedido.
 *
 * Módulo de domínio puro: recebe números, devolve texto. Nada de React, nada
 * de agendador — é o que permite testar cada faixa sem simular o relógio.
 */

export type WaterNudge = { title: string; body: string };

/** `1500` → `1,5`. Vírgula, porque a tela é em português. */
const litros = (ml: number) => (ml / 1000).toFixed(1).replace('.', ',');

/**
 * O lembrete para um horário do dia CORRENTE.
 *
 * `null` quando não há o que lembrar: a meta já foi batida. O copo entra na
 * conta para traduzir o que falta em gesto — "faltam 1,2 L" não diz quantas
 * vezes é preciso levantar; "cerca de 6 copos" diz.
 */
export function waterNudge(waterMl: number, goalMl: number, copoMl: number): WaterNudge | null {
  const falta = Math.max(0, goalMl - waterMl);
  if (falta === 0) return null;

  if (waterMl === 0) {
    return {
      title: 'Você ainda não bebeu água hoje',
      body: `Um copo de ${copoMl} ml já tira do zero — a meta são ${litros(goalMl)} L.`,
    };
  }

  const copos = Math.max(1, Math.ceil(falta / copoMl));
  // Perto do fim o número de copos é a informação; longe, o volume assusta
  // menos que "12 copos". A fronteira é o último terço da meta.
  if (falta <= goalMl / 3) {
    return {
      title: `Faltam ${litros(falta)} L para a meta`,
      body: `São ${copos} ${copos === 1 ? 'copo' : 'copos'} — dá para fechar o dia.`,
    };
  }

  return {
    title: 'Hora da água',
    body: `Você está em ${litros(waterMl)} L de ${litros(goalMl)} L. Faltam ${litros(falta)} L.`,
  };
}

/** O lembrete genérico dos dias seguintes, onde o consumo ainda não existe. */
export const WATER_NUDGE_PADRAO: WaterNudge = {
  title: 'Hora da água',
  body: 'Um copo agora conta para a meta de hoje.',
};
