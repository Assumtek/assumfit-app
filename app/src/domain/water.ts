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

/** O consumo de um dia, com a data a que ele pertence. */
export type DiaDeAgua = { date: string; waterMl: number; pours: number[] };

/**
 * Data de HOJE no calendário de quem está segurando o celular.
 *
 * `toISOString().slice(0,10)` parece a forma óbvia e está errada: converte para
 * UTC antes de cortar, e às 22h no Brasil já devolve a data de amanhã.
 */
export function isoHoje(d = new Date()): string {
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

/**
 * O dia corrente — zerado quando o relógio virou desde o último registro.
 *
 * Existe por um defeito relatado em campo (ago/2026): a água não zerava de um
 * dia para o outro. O estado do dia nascia com a data do instante em que o app
 * abria e NUNCA rolava. Como o iOS mantém o app suspenso por dias, quem não
 * fechava o app à força continuava vendo o total de ontem na manhã seguinte —
 * e, pior, cada gole novo era gravado NA DATA DE ONTEM, corrompendo o
 * histórico junto.
 *
 * A recarga do servidor não salvava: ela só substituía o total quando havia
 * registro para hoje, e no começo do dia não há — então o valor velho
 * sobrevivia justamente na hora em que precisava sumir. Zerar tem de ser o
 * padrão, e não a consequência de encontrar um registro.
 */
export function diaCorrente(dia: DiaDeAgua, hoje = isoHoje()): DiaDeAgua {
  if (dia.date === hoje) return dia;
  return { date: hoje, waterMl: 0, pours: [] };
}

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

/**
 * Horários gerados por INTERVALO dentro de uma janela: "a cada 30 min das 8h às 21h".
 *
 * Pedido de um testador (ago/2026), além da lista de horários. Inclusivo nas
 * duas pontas; janela invertida ou passo inválido devolvem lista vazia em vez
 * de um laço sem fim. O teto protege o agendamento do sistema, que aceita
 * poucas dezenas de notificações pendentes.
 */
export const INTERVALOS_MIN = [30, 45, 60, 90, 120] as const;
export const MAX_HORARIOS_GERADOS = 30;

export function horariosPorIntervalo(inicio: string, fim: string, passoMin: number): string[] {
  const [hi, mi] = inicio.split(':').map(Number);
  const [hf, mf] = fim.split(':').map(Number);
  if (![hi, mi, hf, mf].every(Number.isFinite) || !Number.isFinite(passoMin) || passoMin < 5) return [];
  const a = hi * 60 + mi;
  const b = hf * 60 + mf;
  if (b < a) return [];
  const out: string[] = [];
  for (let t = a; t <= b && out.length < MAX_HORARIOS_GERADOS; t += passoMin) {
    out.push(`${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`);
  }
  return out;
}
