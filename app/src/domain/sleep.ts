import type { SleepNight, SleepPhase, SleepSegment } from './types';

/**
 * Score de sono a partir dos estágios MEDIDOS.
 *
 * O `SleepNight` sempre teve um campo `score`, e até agora ele vinha de um
 * literal: 82, escrito à mão no store. O HealthKit não fornece score — ele
 * entrega os estágios, e o número tem que sair deles.
 *
 * Isto NÃO é dado inventado: é métrica derivada de medição, como o próprio
 * score de energia. A diferença está em ser calculada a partir do que a pessoa
 * dormiu, e não escrita antes de ela dormir.
 *
 * As referências abaixo são de adulto saudável, e por isso o resultado é
 * bem-estar e não diagnóstico — o produto não é dispositivo médico.
 */

/** Duração que satura a componente de tempo: 7h30. */
const DURACAO_ALVO_MIN = 450;
/** Proporção de sono profundo típica em adulto: 13% a 23% do total. */
const PROFUNDO_ALVO = 0.18;
/** Proporção de REM típica: 20% a 25%. */
const REM_ALVO = 0.22;
/** Acima disto, o despertar noturno já pesa integralmente. */
const DESPERTO_LIMITE_MIN = 60;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/**
 * Peso de cada componente.
 *
 * Duração domina porque é o que mais varia e o que mais afeta o dia seguinte.
 * Continuidade entra por último e com o menor peso: uma ida ao banheiro não
 * deveria derrubar a noite inteira.
 */
const PESOS = { duracao: 0.5, profundo: 0.25, rem: 0.15, continuidade: 0.1 };

export function sleepScore(phases: Record<SleepPhase, number>): number {
  const dormido = phases.deep + phases.rem + phases.light;
  // Noite sem sono registrado não tem score — quem chama decide o que fazer.
  if (dormido <= 0) return 0;

  const duracao = clamp01(dormido / DURACAO_ALVO_MIN);
  const profundo = clamp01(phases.deep / dormido / PROFUNDO_ALVO);
  const rem = clamp01(phases.rem / dormido / REM_ALVO);
  const continuidade = clamp01(1 - phases.awake / DESPERTO_LIMITE_MIN);

  const bruto =
    duracao * PESOS.duracao +
    profundo * PESOS.profundo +
    rem * PESOS.rem +
    continuidade * PESOS.continuidade;

  return Math.round(bruto * 100);
}

/**
 * Monta a noite a partir dos segmentos, na ordem em que aconteceram.
 *
 * A ordem é preservada de propósito: é ela que revela a arquitetura do sono —
 * profundo concentrado no começo, REM crescendo até o amanhecer. Somar tudo em
 * totais perderia justamente o que o hipnograma mostra.
 */
/**
 * Continuidade do sono profundo, de 0 a 100.
 *
 * Duas noites com os mesmos 90 minutos de profundo não valem o mesmo: um bloco
 * único de 90 restaura mais que seis pedaços de 15 espalhados pela noite. O
 * total de profundo, sozinho, não distingue as duas — e é por isso que o app do
 * fabricante mostra este número ao lado da duração, não no lugar dela.
 *
 * Mede duas coisas e as multiplica:
 *
 * 1. **Tamanho do maior bloco** contra o ciclo de referência. Um ciclo de sono
 *    adulto tem ~20 min de profundo, e chegar lá uma vez é o mínimo para a
 *    noite ter tido restauração de verdade.
 * 2. **Fragmentação** — quantos blocos foram necessários para somar o mesmo
 *    total. Um bloco é ideal; cada bloco a mais dilui.
 *
 * Multiplicadas, e não somadas, porque uma não compensa a outra: doze blocos de
 * 8 minutos continuam sendo uma noite fragmentada por mais que somem 96.
 *
 * Devolve `null` sem sono profundo nenhum — não é zero. Zero afirmaria que a
 * continuidade foi péssima; `null` diz que não há o que avaliar, que é o caso
 * de quem tirou um cochilo ou tem a noite mal registrada.
 */
const CICLO_PROFUNDO_MIN = 20;

export function deepSleepContinuity(segments: SleepSegment[]): number | null {
  const blocos = segments.filter((s) => s.phase === 'deep' && s.minutes > 0);
  if (blocos.length === 0) return null;

  const total = blocos.reduce((soma, b) => soma + b.minutes, 0);
  const maior = Math.max(...blocos.map((b) => b.minutes));

  const consolidacao = clamp01(maior / CICLO_PROFUNDO_MIN);

  /*
   Quantos blocos seriam necessários se a noite fosse ideal, contra quantos
   foram de fato. Uma noite com 60 min de profundo em 3 blocos de 20 tem
   fragmentação 1,0 — está no limite do que o ciclo explica, não é defeito.
  */
  const idealDeBlocos = Math.max(1, Math.ceil(total / CICLO_PROFUNDO_MIN));
  const fragmentacao = clamp01(idealDeBlocos / blocos.length);

  return Math.round(consolidacao * fragmentacao * 100);
}

export function nightFrom(date: string, segments: SleepSegment[], spo2Night: number[] = []): SleepNight {
  const phases: Record<SleepPhase, number> = { rem: 0, deep: 0, light: 0, awake: 0 };
  for (const s of segments) phases[s.phase] += s.minutes;

  return {
    date,
    score: sleepScore(phases),
    // Tempo DORMIDO, sem o desperto: "8h na cama" com 1h acordado são 7h de
    // sono, e é o número que a pessoa reconhece como o que dormiu.
    totalMin: phases.deep + phases.rem + phases.light,
    deepContinuity: deepSleepContinuity(segments),
    phases,
    segments,
    spo2Night,
  };
}
