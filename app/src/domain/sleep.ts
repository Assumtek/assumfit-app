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

export function nightFrom(
  date: string,
  segments: SleepSegment[],
  spo2Night: number[] = [],
  janela?: { startAt: number; endAt: number },
): SleepNight {
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
    startAt: janela?.startAt,
    endAt: janela?.endAt,
  };
}

/**
 * A curva de SpO₂ DENTRO da janela da noite.
 *
 * A tela de sono desenhava esse gráfico desde sempre e ele nunca teve dado:
 * `nightFrom` recebe `spo2Night` com padrão `[]`, e o caminho da pulseira nunca
 * passou o terceiro argumento. O resultado era um gráfico permanentemente vazio
 * numa seção intitulada "Oxigênio durante a noite" — pior que não ter a seção,
 * porque parece medição que deu zero.
 *
 * A pulseira mede SpO₂ em janelas agendadas ao longo das 24 h; o que interessa
 * aqui é o recorte da noite. Fatiar é a operação inteira — nada é interpolado,
 * porque inventar ponto entre duas medições numa tela de saúde é inventar
 * dessaturação que não houve.
 */
export function spo2DaNoite(
  inicioDaNoite: number,
  fimDaNoite: number,
  amostras: { at: number; value: number }[],
): number[] {
  if (!(fimDaNoite > inicioDaNoite)) return [];
  return amostras
    .filter((a) => a.at >= inicioDaNoite && a.at <= fimDaNoite && a.value > 0)
    .sort((a, b) => a.at - b.at)
    .map((a) => a.value);
}

/**
 * A que dia pertence uma noite — pela TARDE em que ela começou.
 *
 * A data vinha do início do primeiro segmento de sono, e isso dava 19/08 a
 * quem adormeceu às 23h30 e 20/08 a quem adormeceu à 0h30 — a mesma noite,
 * duas datas, conforme o lado da meia-noite. Um testador (ago/2026) viu "última
 * noite em 20/08" e perguntou se não deveria ser 19/08; e o histórico dele
 * ficou com um buraco no dia 19. Início antes do meio-dia é madrugada: a noite
 * é do dia anterior. `inicio` é instante LOCAL (epoch ms) — nunca converta via
 * `toISOString`, que é UTC e empurra 23h de Brasília para o dia seguinte.
 */
export function dataDaNoite(inicio: number): string {
  const d = new Date(inicio);
  if (d.getHours() < 12) d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Segmento de sono com instante — o que a pulseira entrega, já convertido. */
export type SegmentoComInstante = SleepSegment & { startAt: number; endAt: number };

/**
 * Quanto tempo ACORDADO ainda é a mesma noite.
 *
 * Um testador (22/08/2026) dormiu 23h30, levantou à 1h, voltou e dormiu até
 * 6h45 — e o app mostrou 59 minutos. A pulseira grava o sono em blocos, e um
 * bloco que termina de um lado da meia-noite do firmware e outro que começa do
 * outro caíam em "dias" diferentes; o app pegava o primeiro dia com sono e
 * parava. Três horas é folga para ir ao banheiro, acalmar um filho ou ler um
 * pouco; mais que isso é cochilo separado, não a mesma noite.
 */
export const INTERVALO_MAXIMO_NA_NOITE_MS = 3 * 3_600_000;

/**
 * Segmentos soltos → noites inteiras.
 *
 * Ordena pelo início, descarta duplicata exata (o mesmo bloco pode vir em dois
 * "dias" da memória), e junta numa noite só tudo que dista menos que
 * `INTERVALO_MAXIMO_NA_NOITE_MS` do bloco anterior. O intervalo vira um
 * segmento "acordado" — é verdade (a pessoa levantou) e é o que faz a
 * continuidade e o hipnograma contarem a noite como ela foi. A data de cada
 * noite é a da TARDE em que ela começou (`dataDaNoite`). Devolve da mais
 * recente para a mais antiga.
 */
export function montarNoites(segmentos: SegmentoComInstante[]): SleepNight[] {
  const vistos = new Set<string>();
  const ordenados = segmentos
    .filter((s) => s.minutes > 0 && Number.isFinite(s.startAt) && s.startAt > 0)
    .filter((s) => {
      const chave = `${s.startAt}|${s.phase}|${s.minutes}`;
      if (vistos.has(chave)) return false;
      vistos.add(chave);
      return true;
    })
    .sort((a, b) => a.startAt - b.startAt);
  if (ordenados.length === 0) return [];

  const grupos: SegmentoComInstante[][] = [];
  for (const seg of ordenados) {
    const atual = grupos[grupos.length - 1];
    const fimAnterior = atual ? Math.max(...atual.map((x) => x.endAt)) : null;
    if (atual && fimAnterior !== null && seg.startAt - fimAnterior <= INTERVALO_MAXIMO_NA_NOITE_MS) {
      atual.push(seg);
    } else {
      grupos.push([seg]);
    }
  }

  const noites = grupos.map((grupo) => {
    const segments: SleepSegment[] = [];
    let fim = grupo[0].startAt;
    for (const seg of grupo) {
      const intervalo = Math.round((seg.startAt - fim) / 60_000);
      if (segments.length > 0 && intervalo >= 1) segments.push({ phase: 'awake', minutes: intervalo });
      segments.push({ phase: seg.phase, minutes: seg.minutes });
      fim = Math.max(fim, seg.endAt);
    }
    return nightFrom(dataDaNoite(grupo[0].startAt), segments, [], { startAt: grupo[0].startAt, endAt: fim });
  });

  return noites.sort((a, b) => (b.startAt ?? 0) - (a.startAt ?? 0));
}

/** Um trecho acordado dentro da noite, com relógio. */
export type TrechoAcordado = { startAt: number; endAt: number; minutes: number };

/**
 * Os trechos em que a pessoa ACORDOU durante a noite, com hora de início e fim.
 *
 * Pedido de um testador (22/08/2026): "mostrar o horário do início e término
 * do sono e, se acordou na madrugada, trazer também". Os segmentos já carregam
 * a ordem e a duração; somando-os a partir de `startAt` cada um ganha relógio.
 * Sem `startAt` (noite vinda de fonte sem janela) não há como datar — devolve
 * vazio em vez de inventar hora. Acordado de menos de 1 minuto não é "acordou",
 * é virada na cama.
 */
export function trechosAcordado(night: SleepNight): TrechoAcordado[] {
  if (night.startAt == null) return [];
  const trechos: TrechoAcordado[] = [];
  let cursor = night.startAt;
  for (const seg of night.segments) {
    const fim = cursor + seg.minutes * 60_000;
    if (seg.phase === 'awake' && seg.minutes >= 1) trechos.push({ startAt: cursor, endAt: fim, minutes: seg.minutes });
    cursor = fim;
  }
  return trechos;
}

/** `23:05`, em hora local. */
export function horaLocal(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
