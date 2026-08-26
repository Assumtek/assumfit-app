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
  /**
   * As calorias ativas de HOJE, medidas no aparelho.
   *
   * O servidor tem do dia corrente só o que já foi enviado, e o aparelho tem o
   * número de agora: sem esta entrada, a mesma tela mostrava 774 kcal no anel
   * grande e outro valor no dia de hoje do calendário. Dois números para a
   * mesma pergunta, lado a lado, é o que destrói a confiança no resto.
   */
  ativasDeHoje?: number | null,
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
    const doServidor = caloriasAtivas(passosPorDia.get(day) ?? null, null, kcalPorDia.get(day) ?? 0);
    const ativas =
      day === chaveHoje && ativasDeHoje != null && Number.isFinite(ativasDeHoje)
        ? ativasDeHoje
        : doServidor;
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
  /** As calorias ativas de hoje, medidas no aparelho. Ver `aneisDoCalendario`. */
  ativasDeHoje?: number | null,
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
  const aneis = aneisDoCalendario(diasDoServidor, sessoes, meta, fim, dias, ativasDeHoje);
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

export type DetalheDoDia = {
  /** "sábado, 23 de agosto", para o título do bloco. */
  titulo: string;
  kcal: string;
  passos: string;
  situacao: string;
  /** `true` quando não houve leitura nenhuma naquele dia. */
  vazio: boolean;
};

const DIAS_DA_SEMANA = [
  'domingo',
  'segunda-feira',
  'terça-feira',
  'quarta-feira',
  'quinta-feira',
  'sexta-feira',
  'sábado',
];
const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

/**
 * O que mostrar quando alguém toca num anel do calendário.
 *
 * Pedido de testador (Bruno, 23/08/2026): o calendário mostrava a forma do mês
 * e nada do dia. Um anel pela metade não diz se foram 200 kcal ou 380.
 *
 * Dia sem nenhuma leitura tem texto próprio, e não "0 kcal": zero é uma
 * afirmação sobre o corpo da pessoa, e o que houve foi ausência de medição.
 */
export function detalheDoDia(
  anel: AnelDoDia,
  passosDoDia: number | null,
  meta: number,
  hojeIso: string,
): DetalheDoDia {
  const [ano, mes, dia] = anel.day.split('-').map(Number);
  const data = new Date(ano, mes - 1, dia);
  const titulo =
    anel.day === hojeIso
      ? 'hoje'
      : `${DIAS_DA_SEMANA[data.getDay()]}, ${dia} de ${MESES[mes - 1]}`;

  const vazio = (passosDoDia == null || passosDoDia === 0) && anel.ativas === 0;
  if (vazio) {
    return {
      titulo,
      kcal: '–',
      passos: '–',
      situacao: anel.futuro ? 'Dia que ainda não chegou.' : 'Sem leitura da pulseira neste dia.',
      vazio: true,
    };
  }

  const falta = Math.max(0, meta - anel.ativas);
  return {
    titulo,
    kcal: `${Math.round(anel.ativas)} kcal`,
    passos: passosDoDia != null ? `${Math.round(passosDoDia).toLocaleString('pt-BR')} passos` : '–',
    situacao:
      anel.fraction >= 1
        ? 'Meta fechada.'
        : anel.day === hojeIso
          ? `Faltam ${falta} kcal para fechar.`
          : `Ficou a ${falta} kcal da meta.`,
    vazio: false,
  };
}

/**
 * O que o TREINO GUIADO gastou hoje.
 *
 * A conta de calorias ativas somava passos e sessões de esporte, e o treino da
 * academia não é nenhum dos dois: musculação quase não produz passo, e o
 * check-in guiado grava uma execução, não uma sessão de esporte. Quem fechou
 * uma hora de treino via "121 kcal, de passos e sessões" e "40% da meta de
 * passos" (Leonardo, 25/08/2026: "calorias não considerou meu treino",
 * "atividade física está considerando apenas passos mas eu fiz um mega
 * treino"). O esforço estava registrado; ninguém o somava.
 *
 * A conta é a mesma do esporte, MET × peso × horas, com o MET de musculação do
 * catálogo (5.0). Sem peso no cadastro, usa o meio da faixa de referência, e o
 * número continua sendo estimativa declarada, nunca medição.
 */
export const MET_DO_TREINO_GUIADO = 5.0;
/** Meio da faixa 60–85 kg usada no esporte, para quando o cadastro não tem peso. */
const PESO_DE_REFERENCIA_KG = 72;

export type ExecucaoDoDia = {
  startedAt: string;
  durationSec: number | null;
  status: string;
};

/**
 * Soma as execuções CONCLUÍDAS que começaram hoje.
 *
 * Execução em andamento fica de fora: ela ainda não tem duração final, e somar
 * um treino pela metade faria o número andar para trás quando ele fechasse com
 * a duração real. Sessão sem duração também sai, em vez de virar zero contado.
 */
export function kcalDoTreinoGuiado(
  execucoes: ExecucaoDoDia[],
  pesoKg: number | null,
  agora: Date = new Date()): number {
  const inicio = new Date(agora);
  inicio.setHours(0, 0, 0, 0);
  const peso = pesoKg != null && pesoKg > 0 ? pesoKg : PESO_DE_REFERENCIA_KG;

  return Math.round(
    execucoes
      .filter((e) => e.status === 'FINISHED')
      .filter((e) => new Date(e.startedAt) >= inicio)
      .reduce((soma, e) => {
        const segundos = e.durationSec ?? 0;
        if (segundos <= 0) return soma;
        return soma + (MET_DO_TREINO_GUIADO * peso * segundos) / 3600;
      }, 0));
}
