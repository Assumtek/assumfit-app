import type { SleepNight } from './types';

/**
 * Bateria do corpo — quanto de reserva a pessoa tem AGORA.
 *
 * A ideia é a mesma do "Body Battery" do app do fabricante, e ela não vem do
 * aparelho: procuramos nos 33 cabeçalhos do SDK e não existe nenhuma chamada
 * que devolva isso. É cálculo do app deles, e passa a ser cálculo do nosso.
 *
 * O que a torna diferente do score de energia, que já existe aqui: o score
 * responde "como você está" num instante; a bateria responde "quanto sobrou do
 * dia", e por isso é uma CURVA que sobe dormindo e desce acordado. As duas
 * convivem — uma é foto, a outra é filme.
 *
 * ## O que move a agulha
 *
 * O estresse medido pela pulseira, e não a frequência cardíaca. Parece
 * contraintuitivo, mas o estresse do firmware JÁ É derivado de HRV — é a
 * variabilidade convertida em carga autonômica, que é exatamente a grandeza
 * que a bateria quer medir. Usar batimento no lugar puniria quem subiu uma
 * escada e premiaria quem está com febre em repouso.
 *
 * ## O que ela NÃO faz
 *
 * Não inventa o começo do dia. Sem noite medida não há de onde partir, e a
 * função devolve `null` em vez de assumir 50 — num produto de saúde, um número
 * plausível que ninguém mediu é pior que campo vazio, porque não há como
 * distinguir os dois olhando.
 */

/** Uma amostra de estresse com o instante em que foi medida. */
export type StressSample = { at: number; value: number };

export type BatteryPoint = { at: number; level: number };

export type BodyBattery = {
  /** Nível agora, 0 a 100. */
  current: number;
  /** A curva do dia, para o gráfico. */
  curve: BatteryPoint[];
  /** Com quanto a pessoa acordou — o teto do dia. */
  morning: number;
  /**
   * Soma de tudo que o dia DRENOU, em pontos positivos.
   *
   * Não é `morning - current`: um dia que caiu 20 no trânsito e recuperou 20
   * na soneca gastou 20, não zero. A versão anterior media só o saldo abaixo
   * do teto da manhã — e para quem passa o dia na faixa calma do estresse o
   * número travava em 0 para sempre, parecendo quebrado.
   */
  used: number;
  /** Soma de tudo que o dia RECARREGOU acordado (pausas, calma), em pontos. */
  recharged: number;
  /**
   * Quanto a noite devolveu, em pontos.
   *
   * `null` quando não sabemos com quanto a pessoa foi dormir — o cálculo
   * precisa da curva da véspera, e ela só existe a partir do segundo dia de
   * uso. Zero afirmaria que a noite não recuperou nada.
   */
  gain: number | null;
};

/**
 * Taxa de carga por MINUTO, por faixa de estresse.
 *
 * Assimétrica de propósito: carrega devagar e descarrega rápido, porque é assim
 * que funciona — uma noite inteira repõe o que alguma horas de tensão consomem.
 * Simétrica, a curva ficaria plana e a métrica não diria nada.
 *
 * As faixas são as do próprio firmware, que classifica 0–29 relaxado, 30–59
 * normal, 60–79 médio e 80–100 alto. Reaproveitá-las evita uma segunda régua
 * de estresse divergindo em silêncio da que a tela de estresse mostra.
 */
const TAXA_POR_MINUTO = [
  { ate: 29, delta: +0.22 },
  { ate: 59, delta: +0.03 },
  { ate: 79, delta: -0.12 },
  { ate: 100, delta: -0.28 },
];

function taxaDe(estresse: number): number {
  return TAXA_POR_MINUTO.find((f) => estresse <= f.ate)?.delta ?? -0.28;
}

/**
 * Com quanto se acorda, a partir da noite medida.
 *
 * Não é o score de sono repetido: o score já pesa duração, profundo, REM e
 * continuidade, e serve bem como base — mas uma noite excelente não devolve
 * 100 a quem dormiu pouco, e o piso existe porque ninguém acorda em zero e
 * continua de pé.
 */
const PISO_AO_ACORDAR = 25;

export function morningLevel(sleep: SleepNight): number {
  return Math.round(PISO_AO_ACORDAR + (sleep.score / 100) * (100 - PISO_AO_ACORDAR));
}

const clamp = (v: number) => Math.max(0, Math.min(100, v));

/**
 * Monta a curva do dia.
 *
 * `bedtimeLevel` é o nível com que a pessoa foi dormir na véspera, quando ele
 * existe — é o que permite dizer quanto a noite devolveu. Sem ele, `gain` fica
 * `null` em vez de virar um número inventado.
 */
/**
 * A noite serve ao dia pedido?
 *
 * `SleepNight.date` é o dia em que a pessoa DEITOU — quem dormiu dia 28 às 23h e
 * acordou dia 29 tem uma noite datada em 28. Então a noite que sustenta o dia D
 * é a de D−1 (o normal) ou a do próprio D (quem foi dormir depois da meia-noite).
 */
export function noiteSustentaODia(sleep: SleepNight, dia: string): boolean {
  const [ano, mes, d] = dia.split('-').map(Number);
  if (!ano || !mes || !d) return false;
  const vespera = new Date(ano, mes - 1, d - 1);
  const iso = `${vespera.getFullYear()}-${String(vespera.getMonth() + 1).padStart(2, '0')}-${String(
    vespera.getDate()).padStart(2, '0')}`;
  return sleep.date === dia || sleep.date === iso;
}

/**
 * A bateria é DIÁRIA, e por isso recebe o dia.
 *
 * Antes bastava existir uma noite — qualquer uma. Com a última noite conhecida
 * sendo de quatro dias atrás e o estresse de hoje, a tela mostrava uma reserva
 * de recuperação de HOJE calculada sobre uma noite que não era a de hoje. Cada
 * pedaço era real e o resultado, inventado. Aconteceu com uma testadora cujo
 * sono mais recente era de quatro dias antes.
 *
 * `dia` opcional preserva quem só quer a conta a partir de uma noite explícita
 * (o cálculo do histórico, por exemplo), mas toda TELA precisa passar o dia.
 */
export function calcBodyBattery(
  sleep: SleepNight | null,
  stress: StressSample[],
  bedtimeLevel: number | null = null,
  dia?: string): BodyBattery | null {
  if (!sleep) return null;
  if (dia && !noiteSustentaODia(sleep, dia)) return null;

  const morning = morningLevel(sleep);

  // Sem amostra de estresse a bateria não é zero nem desconhecida: é o nível de
  // quem acabou de acordar e ainda não gastou nada.
  const ordenadas = [...stress].sort((a, b) => a.at - b.at);
  if (ordenadas.length === 0) {
    return {
      current: morning,
      curve: [],
      morning,
      used: 0,
      recharged: 0,
      gain: bedtimeLevel == null ? null : morning - bedtimeLevel,
    };
  }

  const curve: BatteryPoint[] = [{ at: ordenadas[0].at, level: morning }];
  let nivel = morning;
  let drenado = 0;
  let recarregado = 0;

  for (let i = 1; i < ordenadas.length; i++) {
    const anterior = ordenadas[i - 1];
    const atual = ordenadas[i];
    const minutos = (atual.at - anterior.at) / 60000;

    /*
     Intervalo longo NÃO é extrapolado.

     A pulseira mede em janelas, e às vezes fica horas sem medir — pulso
     descalço, aparelho carregando. Aplicar a última taxa por três horas
     inventaria carga ou gasto que ninguém observou. Duas horas é o teto: acima
     disso a bateria simplesmente não se move.
    */
    const efetivos = Math.min(minutos, 120);
    const antes = nivel;
    nivel = clamp(nivel + taxaDe(anterior.value) * efetivos);
    // O gasto e a recarga somam MOVIMENTO real (pós-clamp): dreno no teto ou
    // no piso não conta ponto que a bateria não tinha para dar.
    if (nivel < antes) drenado += antes - nivel;
    else recarregado += nivel - antes;
    curve.push({ at: atual.at, level: Math.round(nivel) });
  }

  const current = Math.round(nivel);
  return {
    current,
    curve,
    morning,
    used: Math.round(drenado),
    recharged: Math.round(recarregado),
    gain: bedtimeLevel == null ? null : morning - bedtimeLevel,
  };
}

/**
 * Eficiência da recuperação: quanto da lacuna a noite conseguiu fechar.
 *
 * Quem foi dormir com 20 e acordou com 80 recuperou 60 de 80 possíveis — 75%.
 * Quem foi dormir com 70 e acordou com 90 recuperou 20 de 30 — 67%, apesar do
 * ganho menor. É por isso que a razão importa mais que a diferença: o mesmo
 * ganho vale mais para quem chegou mais cansado.
 *
 * `null` sem o nível de véspera, pelo mesmo motivo de `gain`.
 */
export function recoveryEfficiency(morning: number, bedtimeLevel: number | null): number | null {
  if (bedtimeLevel == null) return null;
  const lacuna = 100 - bedtimeLevel;
  if (lacuna <= 0) return 100;
  return Math.round((clamp(morning - bedtimeLevel) / lacuna) * 100);
}
