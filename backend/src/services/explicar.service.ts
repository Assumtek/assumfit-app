import axios from 'axios';

import { env } from '../lib/env';
import { prisma } from '../lib/prisma';

/**
 * O que um número significa PARA ESTA PESSOA.
 *
 * Pedido de testador: "tive um sono 92% ótimo, mas o que isso significa?". A
 * tela dizia o valor e a avaliação e parava aí.
 *
 * O material é o histórico DELA, e é por isso que isto mora no servidor: a
 * média de 21 dias, o melhor recente, a relação entre duas grandezas. Sem
 * histórico não há o que comparar, e o texto genérico com cara de
 * personalizado é pior que não explicar, então a rota devolve nada.
 *
 * Responde a um TOQUE. Nada roda aqui sozinho, e é o que mantém o custo
 * proporcional ao uso: uma chamada quando alguém pergunta.
 */

export type MetricaExplicavel = 'sono' | 'energia' | 'hrv' | 'estresse' | 'repouso';

type Fatos = {
  metrica: string;
  rotulo: string;
  valor: number;
  unidade: string;
  avaliacao: string;
  componentes: string[];
  media_pessoal: number | null;
  dias_de_historico: number;
  melhor: string | null;
  pior: string | null;
  relacao: string | null;
};

const JANELA_DIAS = 28;

const CAMPO: Record<MetricaExplicavel, { coluna: string; rotulo: string; unidade: string }> = {
  sono: { coluna: 'sleep_minutes', rotulo: 'Sono', unidade: 'minutos' },
  energia: { coluna: 'score', rotulo: 'Energia', unidade: 'de 100' },
  hrv: { coluna: 'hrv_ms', rotulo: 'HRV', unidade: 'ms' },
  estresse: { coluna: 'stress_score', rotulo: 'Estresse', unidade: 'de 100' },
  repouso: { coluna: 'heart_rate', rotulo: 'Batimento em repouso', unidade: 'bpm' },
};

/**
 * A média da pessoa e os extremos, da janela recente.
 *
 * Por dia COM MEDIÇÃO, como na tendência: dia sem pulseira não é dia de zero,
 * e contá-lo puxaria a média para baixo inventando uma piora.
 */
async function historico(
  userId: string,
  metrica: MetricaExplicavel,
): Promise<{ media: number | null; dias: number; melhor: string | null; pior: string | null }> {
  const desde = new Date(Date.now() - JANELA_DIAS * 86_400_000);

  if (metrica === 'energia') {
    const linhas = await prisma.energyScore.findMany({
      where: { userId, hourStart: { gte: desde } },
      select: { score: true, hourStart: true },
      orderBy: { hourStart: 'asc' },
    });
    return resumir(linhas.map((l) => ({ valor: l.score, quando: l.hourStart })));
  }

  const coluna = CAMPO[metrica].coluna;
  const linhas = await prisma.$queryRawUnsafe<{ valor: number; quando: Date }[]>(
    `SELECT ${coluna} AS valor, recorded_at AS quando
       FROM biometric_readings
      WHERE user_id = $1::uuid AND recorded_at >= $2 AND ${coluna} IS NOT NULL
      ORDER BY recorded_at ASC`,
    userId,
    desde,
  );
  return resumir(linhas);
}

function resumir(linhas: { valor: number; quando: Date }[]) {
  if (linhas.length === 0) return { media: null, dias: 0, melhor: null, pior: null };

  // Um valor por DIA, o último de cada: é o que a tendência também faz, e
  // evita que um dia com 300 leituras pese como 300.
  const porDia = new Map<string, number>();
  for (const l of linhas) porDia.set(l.quando.toISOString().slice(0, 10), l.valor);
  const valores = [...porDia.values()];
  const media = valores.reduce((s, v) => s + v, 0) / valores.length;

  const ordenados = [...porDia.entries()].sort((a, b) => b[1] - a[1]);
  const dataBr = (iso: string) => iso.split('-').reverse().slice(0, 2).join('/');
  return {
    media: Math.round(media * 10) / 10,
    dias: valores.length,
    melhor: ordenados.length > 1 ? `${ordenados[0][1]} em ${dataBr(ordenados[0][0])}` : null,
    pior:
      ordenados.length > 2
        ? `${ordenados[ordenados.length - 1][1]} em ${dataBr(ordenados[ordenados.length - 1][0])}`
        : null,
  };
}

export async function explicarMetrica(
  userId: string,
  entrada: {
    metrica: MetricaExplicavel;
    valor: number;
    avaliacao: string;
    componentes?: string[];
  },
): Promise<{ de_onde_vem: string; onde_voce_esta: string; o_que_mexe: string } | null> {
  const meta = CAMPO[entrada.metrica];
  if (!meta) return null;

  const h = await historico(userId, entrada.metrica);
  const fatos: Fatos = {
    metrica: entrada.metrica,
    rotulo: meta.rotulo,
    valor: entrada.valor,
    unidade: meta.unidade,
    avaliacao: entrada.avaliacao,
    componentes: entrada.componentes ?? [],
    media_pessoal: h.media,
    dias_de_historico: h.dias,
    melhor: h.melhor,
    pior: h.pior,
    relacao: null,
  };

  try {
    const { data } = await axios.post(`${env.AI_SERVICE_URL}/insights/explicar`, fatos, {
      timeout: 20_000,
    });
    return data;
  } catch {
    // Sem explicação, a tela não mostra o bloco. Silêncio é melhor que um
    // texto genérico com cara de leitura pessoal.
    return null;
  }
}
