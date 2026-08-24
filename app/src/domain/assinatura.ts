/**
 * A assinatura do dia: os cinco eixos do produto numa forma só.
 *
 * A home mostra sono, energia, recuperação, atividade e calma como cinco
 * números soltos, e número solto não responde à pergunta que a pessoa faz ao
 * abrir o app, que é "como eu estou hoje". Cinco eixos num pentágono viram uma
 * FORMA, e forma se compara de relance: a de hoje contra a média dos últimos
 * dias diz, sem texto, onde o dia saiu do lugar de sempre.
 *
 * Três decisões que sustentam o resto:
 *
 * 1. **Todo eixo passa por `ratings.ts`.** A fração do vértice é a mesma que
 *    preenche o anel da tela de detalhe. Um radar com régua própria seria uma
 *    segunda avaliação do mesmo dado, divergindo em silêncio da primeira.
 * 2. **Eixo sem medição não vale zero.** Vale `null`, e a figura mostra o
 *    buraco. Zero desenha um dia ruim onde houve apenas sensor calado, e num
 *    produto de saúde isso é dado fabricado com cara de medido.
 * 3. **A média não inclui hoje.** Ela é o "de sempre" contra o qual hoje é
 *    lido; incluir o próprio dia puxa a referência na direção dele e encolhe
 *    justamente a diferença que se quer enxergar.
 */

import type { DailySummary } from '../services/api.service';
import { rateActivity, rateHrv } from './ratings';

export type ChaveDoEixo = 'sono' | 'energia' | 'recuperacao' | 'atividade' | 'calma';

export type Eixo = {
  chave: ChaveDoEixo;
  /** Como aparece no vértice. Curto, porque o espaço é de cinco letras. */
  rotulo: string;
  /** 0..1 de hoje, ou `null` quando não houve medição. */
  fracao: number | null;
  /** 0..1 da média dos dias anteriores, ou `null` sem dias suficientes. */
  media: number | null;
  /** A tela que este eixo abre ao toque. */
  rota: string;
};

/** Sem este mínimo de dias medidos não há "de sempre", e a média não se desenha. */
export const MINIMO_DE_DIAS = 3;

/** Os cinco eixos, na ordem em que giram no pentágono, do topo em diante. */
export const EIXOS: { chave: ChaveDoEixo; rotulo: string; rota: string }[] = [
  { chave: 'sono', rotulo: 'Sono', rota: 'Sleep' },
  { chave: 'energia', rotulo: 'Energia', rota: 'Health' },
  { chave: 'recuperacao', rotulo: 'Recup.', rota: 'Hrv' },
  { chave: 'atividade', rotulo: 'Atividade', rota: 'Activity' },
  { chave: 'calma', rotulo: 'Calma', rota: 'Stress' },
];

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** Média dos valores presentes, ou `null` se não houver os dias mínimos. */
function mediaDe(valores: (number | null)[]): number | null {
  const presentes = valores.filter((v): v is number => v != null && Number.isFinite(v));
  if (presentes.length < MINIMO_DE_DIAS) return null;
  return presentes.reduce((s, v) => s + v, 0) / presentes.length;
}

/**
 * A fração de cada eixo a partir de uma linha de resumo diário.
 *
 * É a MESMA função para hoje e para cada dia da média, e isso é deliberado: se
 * a régua de hoje e a régua do histórico pudessem divergir, a comparação entre
 * a forma cheia e a tracejada compararia duas coisas diferentes.
 */
function fracoesDoDia(dia: Partial<DailySummary>, metaDePassos: number): Record<ChaveDoEixo, number | null> {
  const hrv = rateHrv(dia.hrv_ms ?? null);
  const atividade = rateActivity({ steps: dia.steps ?? null, goal: metaDePassos });
  return {
    sono: dia.sleep_score != null ? clamp01(dia.sleep_score / 100) : null,
    energia: dia.energy_score != null ? clamp01(dia.energy_score / 100) : null,
    recuperacao: hrv.available ? hrv.fraction : null,
    atividade: atividade.available ? atividade.fraction : null,
    // Calma é o AVESSO do estresse, e não um dado novo: 20 de estresse é 80 de
    // calma. Invertido aqui porque num radar todo eixo precisa apontar para o
    // mesmo lado, "mais longe do centro é melhor". Sem isso, a única métrica em
    // que crescer é ruim deformaria a figura ao contrário do que ela sugere.
    calma: dia.stress_score != null ? clamp01(1 - dia.stress_score / 100) : null,
  };
}

/**
 * Os cinco eixos prontos para desenhar.
 *
 * `hoje` é o estado ao vivo (a pulseira acabou de medir), e `dias` é o
 * histórico do servidor, do mais antigo ao mais recente, incluindo ou não o dia
 * corrente: a data de hoje é descartada da média por comparação de `day`.
 */
export function assinaturaDoDia({
  hoje,
  dias,
  metaDePassos,
  dataDeHoje,
}: {
  hoje: Partial<DailySummary>;
  dias: DailySummary[];
  metaDePassos: number;
  dataDeHoje: string;
}): Eixo[] {
  const deHoje = fracoesDoDia(hoje, metaDePassos);
  const anteriores = dias.filter((d) => d.day !== dataDeHoje).map((d) => fracoesDoDia(d, metaDePassos));

  return EIXOS.map(({ chave, rotulo, rota }) => ({
    chave,
    rotulo,
    rota,
    fracao: deHoje[chave],
    media: mediaDe(anteriores.map((d) => d[chave])),
  }));
}

export type Ponto = { x: number; y: number };

/**
 * O vértice de um eixo, dada a fração.
 *
 * O primeiro eixo aponta para CIMA e os demais giram no sentido do relógio, que
 * é como se lê um mostrador. O raio mínimo não é zero: um eixo zerado no centro
 * some dentro do miolo do desenho e vira indistinguível de eixo sem medição.
 */
export function vertice(indice: number, fracao: number, centro: Ponto, raio: number, raioMinimo = 0.08): Ponto {
  const angulo = -Math.PI / 2 + (indice * 2 * Math.PI) / EIXOS.length;
  const r = raio * (raioMinimo + (1 - raioMinimo) * clamp01(fracao));
  return { x: centro.x + r * Math.cos(angulo), y: centro.y + r * Math.sin(angulo) };
}

/** A ponta do eixo, onde vive o rótulo. */
export function pontaDoEixo(indice: number, centro: Ponto, raio: number): Ponto {
  return vertice(indice, 1, centro, raio, 0);
}

/**
 * Os segmentos que ligam os vértices, pulando os eixos sem medição.
 *
 * `ponte: true` marca o segmento que atravessa um eixo calado. A tela desenha
 * essas ligações tracejadas: a figura continua fechada, e ao mesmo tempo diz
 * que ali não houve medida, em vez de fingir uma.
 */
export function segmentos(fracoes: (number | null)[], centro: Ponto, raio: number): { de: Ponto; para: Ponto; ponte: boolean }[] {
  const presentes = fracoes
    .map((f, i) => ({ f, i }))
    .filter((p): p is { f: number; i: number } => p.f != null);
  if (presentes.length < 2) return [];

  return presentes.map((atual, ordem) => {
    const proximo = presentes[(ordem + 1) % presentes.length];
    // Vizinhos no pentágono ficam a uma posição de distância; qualquer salto
    // maior significa que houve eixo sem dado entre os dois.
    const salto = (proximo.i - atual.i + fracoes.length) % fracoes.length;
    return {
      de: vertice(atual.i, atual.f, centro, raio),
      para: vertice(proximo.i, proximo.f, centro, raio),
      ponte: salto > 1,
    };
  });
}

/** Quantos eixos foram medidos hoje. Abaixo de três não há forma para desenhar. */
export function eixosMedidos(eixos: Eixo[]): number {
  return eixos.filter((e) => e.fracao != null).length;
}

/**
 * O eixo que mais destoa da própria média, e para que lado.
 *
 * É o que a frase embaixo da figura conta. Só vale a pena dizer quando a
 * diferença é grande o suficiente para não ser variação do dia a dia, daí o
 * piso: abaixo dele, o dia está dentro do padrão da pessoa e a home não tem
 * novidade a anunciar, o que também é uma informação.
 */
export function maiorDesvio(eixos: Eixo[], piso = 0.15): { eixo: Eixo; delta: number } | null {
  let melhor: { eixo: Eixo; delta: number } | null = null;
  for (const eixo of eixos) {
    if (eixo.fracao == null || eixo.media == null) continue;
    const delta = eixo.fracao - eixo.media;
    if (Math.abs(delta) < piso) continue;
    if (!melhor || Math.abs(delta) > Math.abs(melhor.delta)) melhor = { eixo, delta };
  }
  return melhor;
}

/**
 * A leitura da figura, em uma frase.
 *
 * A home já tem o resumo do dia logo acima, e repetir aquele texto aqui gasta
 * a atenção da pessoa duas vezes com a mesma informação. Esta frase fala do
 * que só a FIGURA mostra: onde hoje se afasta do padrão dela. Sem padrão
 * ainda, diz que está juntando dias, que é a verdade e não um estado de erro.
 */
export function fraseDaAssinatura(eixos: Eixo[], diasNaMedia: number): string {
  if (eixosMedidos(eixos) < 3) {
    return 'Faltam medidas de hoje para fechar a figura.';
  }
  if (!eixos.some((e) => e.media != null)) {
    return `Ainda juntando dias para saber o que é normal para você (${diasNaMedia} de ${MINIMO_DE_DIAS}).`;
  }
  const desvio = maiorDesvio(eixos);
  if (!desvio) return 'Hoje está dentro do seu padrão dos últimos dias.';
  const nome = desvio.eixo.rotulo.toLowerCase();
  return desvio.delta > 0
    ? `Hoje ${nome} está acima do seu padrão dos últimos dias.`
    : `Hoje ${nome} está abaixo do seu padrão dos últimos dias.`;
}

/** Quantos dias anteriores têm ao menos um eixo medido. Alimenta a frase. */
export function diasComparaveis(dias: DailySummary[], dataDeHoje: string, metaDePassos: number): number {
  return dias
    .filter((d) => d.day !== dataDeHoje)
    .filter((d) => Object.values(fracoesDoDia(d, metaDePassos)).some((f) => f != null)).length;
}
