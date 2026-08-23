import { caloriasDoDia } from './activityEstimates';

/**
 * Metas do dia: o anel de calorias ATIVAS sobre a meta, com o gasto de
 * repouso informado ao lado, e o calendário de anéis dos últimos dias.
 *
 * Pedido de testador (23/08/2026), aprovado pela fundadora: anéis de metas
 * como no Fitness da Apple, especialmente calorias, com a meta editável (só
 * para hoje ou como padrão) e calendário. Vive numa tela própria; a Home
 * acabou de perder os anéis e não os recebe de volta.
 */

export const META_PADRAO_KCAL = 400;

export type MetaDeHoje = { date: string; kcal: number } | null;

/** A meta que vale no dia: a de hoje, se foi definida só para hoje; senão a padrão. */
export function metaEfetiva(padrao: number, deHoje: MetaDeHoje, hojeIso: string): number {
  return deHoje && deHoje.date === hojeIso ? deHoje.kcal : padrao;
}

/**
 * Calorias ATIVAS do dia: passos (estimativa por passo ou a bruta da pulseira,
 * quando plausível) mais as sessões de esporte cronometradas. Treino guiado
 * de força entra pelos passos que gera; uma sessão de corrida registrada com
 * GPS entra pela caloria da sessão.
 */
export function caloriasAtivas(steps: number | null, brutaDoAparelho: number | null | undefined, kcalDasSessoes: number): number {
  const passos = steps != null && steps > 0 ? caloriasDoDia(steps, brutaDoAparelho).valor : 0;
  return Math.round(passos + Math.max(0, kcalDasSessoes));
}

/** Gasto de repouso acumulado até a hora dada: o BMR prorrateado pelas horas do dia. */
export function repousoAteAgora(bmr: number | null, horaDecimal: number): number | null {
  if (bmr == null || bmr <= 0) return null;
  return Math.round((bmr * Math.max(0, Math.min(24, horaDecimal))) / 24);
}

export type AnelDoDia = { day: string; ativas: number; fraction: number; futuro: boolean };

/**
 * O calendário: um anel por dia dos últimos `dias`, do mais antigo para hoje.
 * Dia sem leitura de passos e sem sessão vale zero, não vazio: o anel aberto
 * é a informação ("não se mexeu" ou "não usou a pulseira"), e a tela diz qual.
 */
export function aneisDoCalendario(
  diasDoServidor: { day: string; steps: number | null }[],
  sessoes: { startedAt: string; kcal?: number }[],
  meta: number,
  hoje: Date,
  dias = 28,
): AnelDoDia[] {
  const passosPorDia = new Map(diasDoServidor.map((d) => [d.day, d.steps]));
  const kcalPorDia = new Map<string, number>();
  for (const s of sessoes) {
    const d = new Date(s.startedAt);
    const chave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    kcalPorDia.set(chave, (kcalPorDia.get(chave) ?? 0) + (s.kcal ?? 0));
  }
  const inicio = new Date(hoje);
  inicio.setHours(0, 0, 0, 0);
  const chaveHoje = `${inicio.getFullYear()}-${String(inicio.getMonth() + 1).padStart(2, '0')}-${String(inicio.getDate()).padStart(2, '0')}`;
  inicio.setDate(inicio.getDate() - (dias - 1));
  return Array.from({ length: dias }, (_, i) => {
    const d = new Date(inicio);
    d.setDate(inicio.getDate() + i);
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const ativas = caloriasAtivas(passosPorDia.get(day) ?? null, null, kcalPorDia.get(day) ?? 0);
    return { day, ativas, fraction: meta > 0 ? Math.min(1, ativas / meta) : 0, futuro: day > chaveHoje };
  });
}

/** Dias em que a meta fechou, nos últimos `dias`. */
export function diasFechados(aneis: AnelDoDia[]): number {
  return aneis.filter((a) => a.fraction >= 1).length;
}

export type DiaDaFita = AnelDoDia & {
  /** Inicial do dia da semana, para o rótulo acima do anel. */
  letra: string;
  hoje: boolean;
};

const LETRAS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

/**
 * A semana corrente, domingo a sábado, para a fita no topo.
 *
 * É a peça que mostra que ONTEM existiu: o anel de hoje sozinho não diz se a
 * pessoa vem se movendo ou se hoje é exceção. Domingo a sábado, e não "os
 * últimos sete dias", porque a semana é uma unidade que as pessoas já usam,
 * e uma janela deslizante muda de posição todo dia.
 *
 * Os dias que ainda não chegaram vêm marcados como futuro: anel aberto de
 * quarta-feira numa segunda não é falha, é dia que não aconteceu.
 */
export function fitaDaSemana(
  diasDoServidor: { day: string; steps: number | null }[],
  sessoes: { startedAt: string; kcal?: number }[],
  meta: number,
  hoje: Date,
): DiaDaFita[] {
  const domingo = new Date(hoje);
  domingo.setHours(0, 0, 0, 0);
  domingo.setDate(domingo.getDate() - domingo.getDay());
  /*
   Reaproveita o calendário: pede a janela que vai do domingo desta semana até
   o sábado, e recorta. Uma segunda implementação de "quanto se moveu no dia"
   seria a forma mais fácil de a fita e o calendário divergirem.
  */
  const fim = new Date(domingo);
  fim.setDate(domingo.getDate() + 6);
  const dias = Math.round((fim.getTime() - domingo.getTime()) / 86_400_000) + 1;
  const aneis = aneisDoCalendario(diasDoServidor, sessoes, meta, fim, dias);
  /*
   `futuro` vem recalculado: o calendário o deduz do fim da janela, que aqui é
   o sábado, e todo dia da semana ficaria no passado. A referência certa é o
   dia de hoje.
  */
  const chaveHoje = chaveDoDia(hoje);
  return aneis.map((a, i) => ({
    ...a,
    letra: LETRAS[i % 7],
    hoje: a.day === chaveHoje,
    futuro: a.day > chaveHoje,
  }));
}

function chaveDoDia(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
