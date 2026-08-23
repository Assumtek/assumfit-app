import { WEEK_ORDER } from './workout';

/**
 * O "bom dia" das 7h30 quando a IA não respondeu: um molde LOCAL que cita o
 * treino do dia e varia de um dia para o outro.
 *
 * Pedido de um testador (Leonardo, 22/08, build 1.0.5 (4)): de manhã, uma
 * mensagem sobre o treino previsto; sem treino, só motivadora; contextual e
 * sem repetir. A redação principal continua sendo da IA (rota de insights);
 * este molde é o que garante que a manhã não fique em silêncio quando a
 * localização foi negada ou a rede falhou à noite.
 */

export type DiaDoPlanoAmanha = { estado: 'treino'; nome: string } | { estado: 'descanso' } | { estado: 'sem-plano' };

const COM_TREINO = [
  (n: string) => `Hoje é ${n}. O corpo descansou para isso; comece pelo primeiro exercício e o resto vem.`,
  (n: string) => `${n} no plano de hoje. Quanto mais cedo, mais fácil de caber no dia.`,
  (n: string) => `Dia de ${n}. Não precisa ser perfeito, precisa acontecer.`,
  (n: string) => `${n} te espera. Separe a roupa agora e a decisão já está tomada.`,
  (n: string) => `Hoje tem ${n}. Água antes, e o aquecimento faz o resto.`,
  (n: string) => `O plano reservou hoje para ${n}. Uma sessão feita vale mais que duas adiadas.`,
];
const DESCANSO = [
  'Dia de descanso no plano. Recuperar também é treinar; movimento leve conta a favor.',
  'Hoje o plano pede recuperação. Uma caminhada curta e água já fazem o dia valer.',
  'Descanso hoje. O músculo cresce no intervalo, não na série.',
  'Sem treino marcado hoje. Dormir bem esta noite é o que prepara o próximo.',
  'Dia livre no plano. Alongar dez minutos deixa o corpo pronto para amanhã.',
];
const SEM_PLANO = [
  'Um dia com movimento começa com uma decisão pequena: escolha uma agora.',
  'Sem plano ainda. Dez minutos de caminhada hoje já mudam a tarde.',
  'O corpo responde ao que se repete. Hoje, uma coisa que dê para repetir amanhã.',
  'Comece por onde está: uma volta no quarteirão conta.',
];

function diaDoAno(d: Date): number {
  const inicio = new Date(d.getFullYear(), 0, 0);
  return Math.floor((d.getTime() - inicio.getTime()) / 86_400_000);
}

/** A mensagem de amanhã, escolhida pelo dia do ano: dois dias seguidos nunca repetem. */
export function textoMatinalLocal(amanha: DiaDoPlanoAmanha, data: Date): { title: string; body: string } {
  const i = diaDoAno(data);
  const body =
    amanha.estado === 'treino'
      ? COM_TREINO[i % COM_TREINO.length](amanha.nome)
      : amanha.estado === 'descanso'
        ? DESCANSO[i % DESCANSO.length]
        : SEM_PLANO[i % SEM_PLANO.length];
  return { title: 'Bom dia', body };
}

/** O dia de amanhã no plano, a partir do dia de hoje que o plano informa. */
export function diaDeAmanha(
  plan: { today: string; days: { dayOfWeek: string; dayType: string; workout?: { name: string } | null }[] } | null,
): DiaDoPlanoAmanha {
  if (!plan) return { estado: 'sem-plano' };
  const i = WEEK_ORDER.indexOf(plan.today as (typeof WEEK_ORDER)[number]);
  const amanha = WEEK_ORDER[(i + 1 + 7) % 7];
  const dia = plan.days.find((d) => d.dayOfWeek === amanha);
  return dia && dia.dayType === 'WORKOUT' && dia.workout ? { estado: 'treino', nome: dia.workout.name } : { estado: 'descanso' };
}
