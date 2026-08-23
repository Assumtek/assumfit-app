/**
 * Tendência: uma janela recente contra a anterior.
 *
 * A Home responde "estou bem HOJE?" (ver `homeIndicators.ts`). Esta pergunta é
 * outra, e é a que os testadores fazem quando pedem para "ver evolução": estou
 * melhor do que eu estava? Comparar com ontem não responde, porque um dia
 * qualquer oscila mais do que a mudança que se quer enxergar.
 *
 * Decisões que dão sentido ao número:
 *
 * 1. **Janelas em semanas inteiras, e sem sobreposição.** 28 dias contra os 84
 *    anteriores. Múltiplo de 7 porque terça e domingo não se parecem, e uma
 *    janela de 30 dias pesa um dia de semana a mais que os outros. Sem
 *    sobreposição porque incluir o recente dentro do "antes" (o que o Fitness
 *    da Apple faz, 90 dentro de 365) dilui justamente o que mudou.
 * 2. **Média por DIA COM DADO, não por dia do calendário.** Pulseira fora do
 *    pulso não é dia de zero passo, é dia sem medição; contá-lo como zero
 *    inventaria uma queda que não aconteceu.
 * 3. **Dado insuficiente tem estado próprio.** Sem um mínimo em cada janela, a
 *    resposta é "ainda acumulando", com quantos dias faltam. É honesto e é o
 *    que a tela precisa dizer enquanto a série cresce.
 * 4. **Direção não é a mesma coisa que "bom".** Estresse que sobe é ruim, HRV
 *    que sobe é bom. Quem sabe disso é a métrica, por `melhor`.
 */

export type SentidoBom = 'maior' | 'menor';
export type EstadoTendencia = 'acumulando' | 'estavel' | 'sobe' | 'desce';

export type PontoDiario = {
  /** Dia local em ISO (AAAA-MM-DD). */
  dia: string;
  valor: number;
};

export type Tendencia = {
  estado: EstadoTendencia;
  /** Média por dia com dado na janela recente, `null` quando insuficiente. */
  recente: number | null;
  anterior: number | null;
  /** `recente - anterior`, na unidade da métrica. */
  delta: number | null;
  /** Variação relativa ao período anterior, 0,08 = 8%. */
  fracao: number | null;
  /** `true` quando a mudança vai no sentido desejado da métrica. */
  bom: boolean | null;
  /** Dias com medição em cada janela, é o que a tela mostra ao acumular. */
  diasRecentes: number;
  diasAnteriores: number;
  /** Quantos dias com medição ainda faltam para haver comparação. */
  faltam: number;
};

export const JANELA_RECENTE = 28;
export const JANELA_ANTERIOR = 84;

/**
 * Mínimo de dias COM MEDIÇÃO em cada janela.
 *
 * Metade da janela recente e um terço da anterior: exigir a janela cheia nunca
 * aconteceria (ninguém usa a pulseira todo dia), e exigir pouco produziria
 * "tendência" a partir de três dias, que é ruído com nome de conclusão.
 */
const MIN_RECENTE = 14;
const MIN_ANTERIOR = 28;

/** Abaixo disto, a diferença é oscilação, não tendência. */
const LIMIAR_RELATIVO = 0.05;

const DIA_MS = 86_400_000;

function diasEntre(deIso: string, ateIso: string): number {
  const a = Date.parse(`${deIso}T00:00:00Z`);
  const b = Date.parse(`${ateIso}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return Number.NaN;
  return Math.round((b - a) / DIA_MS);
}

function media(valores: number[]): number | null {
  if (valores.length === 0) return null;
  return valores.reduce((s, v) => s + v, 0) / valores.length;
}

export type OpcoesTendencia = {
  /** Sentido em que a métrica melhora. */
  melhor: SentidoBom;
  /**
   * Diferença absoluta abaixo da qual nada mudou, na unidade da métrica.
   * Existe porque 5% de um número pequeno pode ser irrelevante (dois batimentos
   * por minuto), e a fração sozinha exageraria.
   */
  limiarAbsoluto?: number;
  /** Hoje, em ISO local. Injetado para o teste não depender do relógio. */
  hoje: string;
};

/**
 * Compara os últimos 28 dias com os 84 anteriores.
 *
 * `pontos` pode vir em qualquer ordem, com buracos e com dias repetidos (o
 * último valor de um dia repetido vence).
 */
export function tendencia(pontos: PontoDiario[], opcoes: OpcoesTendencia): Tendencia {
  const porDia = new Map<string, number>();
  for (const p of pontos) {
    if (!Number.isFinite(p.valor)) continue;
    porDia.set(p.dia, p.valor);
  }

  const recentes: number[] = [];
  const anteriores: number[] = [];
  for (const [dia, valor] of porDia) {
    const idade = diasEntre(dia, opcoes.hoje);
    if (Number.isNaN(idade) || idade < 0) continue;
    if (idade < JANELA_RECENTE) recentes.push(valor);
    else if (idade < JANELA_RECENTE + JANELA_ANTERIOR) anteriores.push(valor);
  }

  const base = {
    diasRecentes: recentes.length,
    diasAnteriores: anteriores.length,
  };

  if (recentes.length < MIN_RECENTE || anteriores.length < MIN_ANTERIOR) {
    return {
      ...base,
      estado: 'acumulando',
      recente: media(recentes),
      anterior: media(anteriores),
      delta: null,
      fracao: null,
      bom: null,
      faltam:
        Math.max(0, MIN_RECENTE - recentes.length) +
        Math.max(0, MIN_ANTERIOR - anteriores.length),
    };
  }

  const recente = media(recentes) as number;
  const anterior = media(anteriores) as number;
  const delta = recente - anterior;
  const fracao = anterior !== 0 ? delta / Math.abs(anterior) : null;

  const pequenoEmValor =
    opcoes.limiarAbsoluto != null && Math.abs(delta) < opcoes.limiarAbsoluto;
  const pequenoEmFracao = fracao != null && Math.abs(fracao) < LIMIAR_RELATIVO;
  const estavel = pequenoEmValor || (fracao == null ? delta === 0 : pequenoEmFracao);

  const estado: EstadoTendencia = estavel ? 'estavel' : delta > 0 ? 'sobe' : 'desce';
  const bom = estavel ? null : opcoes.melhor === 'maior' ? delta > 0 : delta < 0;

  return { ...base, estado, recente, anterior, delta, fracao, bom, faltam: 0 };
}

/**
 * As métricas que fazem sentido comparar em janela longa, com a régua de cada
 * uma. A tela escolhe a CHAVE e recebe a frase pronta: número cru formatado em
 * tela é o defeito que esta tabela existe para impedir.
 *
 * Nem toda métrica entra. Pressão, oxigênio e temperatura são medições
 * pontuais, tiradas quando alguém lembra: a média de uma janela dessas diz mais
 * sobre quando a pessoa mediu do que sobre o corpo dela.
 */
export type ChaveDeTendencia =
  | 'passos'
  | 'calorias'
  | 'sono'
  | 'hrv'
  | 'repouso'
  | 'stress'
  | 'agua';

type Regua = {
  rotulo: string;
  melhor: SentidoBom;
  limiarAbsoluto: number;
  /** Formata a MÉDIA e o DELTA na unidade da métrica. */
  formatar: (valor: number) => string;
};

const inteiro = (sufixo: string) => (v: number) =>
  `${Math.round(Math.abs(v)).toLocaleString('pt-BR')} ${sufixo}`;

export const REGUAS: Record<ChaveDeTendencia, Regua> = {
  passos: { rotulo: 'Passos', melhor: 'maior', limiarAbsoluto: 400, formatar: inteiro('passos') },
  calorias: { rotulo: 'Movimento', melhor: 'maior', limiarAbsoluto: 30, formatar: inteiro('kcal') },
  sono: {
    rotulo: 'Sono',
    melhor: 'maior',
    limiarAbsoluto: 15,
    formatar: (v) => {
      const min = Math.round(Math.abs(v));
      const h = Math.floor(min / 60);
      return h > 0 ? `${h} h ${String(min % 60).padStart(2, '0')} min` : `${min} min`;
    },
  },
  hrv: { rotulo: 'Variabilidade', melhor: 'maior', limiarAbsoluto: 3, formatar: inteiro('ms') },
  repouso: {
    rotulo: 'Batimento em repouso',
    melhor: 'menor',
    limiarAbsoluto: 3,
    formatar: inteiro('bpm'),
  },
  stress: { rotulo: 'Estresse', melhor: 'menor', limiarAbsoluto: 4, formatar: inteiro('pontos') },
  agua: { rotulo: 'Água', melhor: 'maior', limiarAbsoluto: 200, formatar: inteiro('ml') },
};

export type LinhaDeTendencia = {
  chave: ChaveDeTendencia;
  rotulo: string;
  /** A média recente, já com unidade: é o número que a linha mostra. */
  valor: string;
  /** "300 passos a mais por dia", ou o que falta para haver comparação. */
  frase: string;
  estado: EstadoTendencia;
  bom: boolean | null;
};

/** Calcula e descreve de uma vez, que é como as telas usam. */
export function linhaDeTendencia(
  chave: ChaveDeTendencia,
  pontos: PontoDiario[],
  hoje: string,
): LinhaDeTendencia {
  const regua = REGUAS[chave];
  const t = tendencia(pontos, {
    melhor: regua.melhor,
    limiarAbsoluto: regua.limiarAbsoluto,
    hoje,
  });
  const valor = t.recente != null ? regua.formatar(t.recente) : '–';

  let frase: string;
  if (t.estado === 'acumulando') {
    frase =
      t.diasRecentes === 0 && t.diasAnteriores === 0
        ? 'Ainda não há medições para comparar.'
        : `Ainda acumulando, faltam ${t.faltam} ${t.faltam === 1 ? 'dia' : 'dias'} com medição.`;
  } else if (t.estado === 'estavel') {
    frase = 'Sem mudança em relação aos três meses anteriores.';
  } else {
    const quanto = regua.formatar(t.delta as number);
    frase = `${quanto} ${t.estado === 'sobe' ? 'a mais' : 'a menos'} por dia que nos três meses anteriores.`;
  }

  return { chave, rotulo: regua.rotulo, valor, frase, estado: t.estado, bom: t.bom };
}
