/**
 * Regra de ouro do design: nenhuma tela formata número cru.
 * Toda métrica passa por aqui e sai como avaliação em linguagem humana (o
 * destaque) mais o número técnico (o sub-label).
 *
 * Sobre COR — mudou com o design system clínico. A avaliação não é colorida por
 * métrica. Um instrumento de medição é neutro até o valor sair da faixa
 * saudável; só aí ele sinaliza. Por isso `state` tem duas posições apenas, e
 * "Bom" versus "Excelente" não é diferença de cor, é diferença de palavra.
 *
 * Os limiares vieram do mockup e de faixas de referência usuais. Quando o
 * modelo de IA entrar (Fase 2), a avaliação passa a considerar a linha de base
 * pessoal em vez de faixa absoluta.
 */

import type { Palette } from '../theme/palette';
import { formatDuration } from './workout';

export type RatingState = 'normal' | 'alert';

export type Rating = {
  /**
   * `false` quando o sensor não forneceu o dado.
   *
   * Existe porque ausência precisa atravessar a camada de avaliação intacta. A
   * alternativa — devolver uma Rating comum com valor zero — fazia a tela
   * exibir "0 ms · Pode melhorar" com a mesma tipografia de uma medição real, e
   * num produto de saúde apresentar dado fabricado como medido é o defeito mais
   * grave que existe.
   */
  available: boolean;
  /** "Excelente", "Bom", "Pode melhorar" — o que aparece grande. */
  label: string;
  /** O dado técnico já formatado com unidade. Vai como sub-label. */
  detail: string;
  /** 0..1 — quanto do anel ou arco preencher. */
  fraction: number;
  /** `alert` apenas fora da faixa saudável, nunca para graduar o que está bem. */
  state: RatingState;
};

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** O traço de "não medido". Um só, para a tela inteira falar a mesma língua. */
export const DASH = '–';

/**
 * Formata um valor que pode não ter sido medido.
 *
 * Existe para a checagem de ausência não se espalhar por doze telas com doze
 * jeitos diferentes de escrever o mesmo traço — e para ninguém ser tentado a
 * resolver com `?? 0`, que é como o dado fabricado entra.
 */
export function shown(value: number | null, format: (n: number) => string = (n) => String(Math.round(n))): string {
  return value == null ? DASH : format(value);
}

/**
 * A avaliação de um sinal que o aparelho não mediu.
 *
 * Traço em vez de número, e `state: 'normal'` de propósito: ausência não é
 * alerta. Um aparelho que não mede pressão não deve pintar a tela de vermelho.
 */
const semMedicao = (): Rating => ({
  available: false,
  label: '–',
  detail: 'sem medição',
  fraction: 0,
  state: 'normal',
});

/**
 * Cor de um estado. É o único lugar do app que decide cor a partir de dado.
 *
 * A paleta chega por parâmetro em vez de import porque este módulo é domínio
 * puro e roda em teste sem árvore React — e, desde que o tema é dinâmico, não
 * existe mais UMA paleta para importar. Quem chama já tem a do tema em mãos.
 */
export function stateColor(state: RatingState, colors: Palette): string {
  return state === 'alert' ? colors.alert : colors.accent;
}

/** Cor do texto da avaliação: neutro no normal, sinalizado no alerta. */
export function ratingTextColor(state: RatingState, colors: Palette): string {
  return state === 'alert' ? colors.alert : colors.text;
}

export function rateHrv(ms: number | null): Rating {
  if (ms == null) return semMedicao();
  return {
    available: true,
    label: ms >= 70 ? 'Excelente' : ms >= 50 ? 'Bom' : 'Pode melhorar',
    detail: `${Math.round(ms)} ms`,
    fraction: clamp01(ms / 100),
    // HRV baixo não é achado clínico — é relativo à própria pessoa.
    state: ms < 20 ? 'alert' : 'normal',
  };
}

/**
 * Bateria do corpo.
 *
 * As faixas são de RESERVA, não de saúde: 30 não é "ruim", é "sobrou pouco
 * para hoje". Por isso `state` nunca vira alerta — reserva baixa ao fim de um
 * dia cheio é o funcionamento esperado do corpo, e sinalizar em vermelho
 * transformaria cansaço normal em achado clínico, que é justamente o que este
 * produto não faz.
 */
export function rateBodyBattery(level: number | null): Rating {
  if (level == null) return semMedicao();
  return {
    available: true,
    label: level >= 70 ? 'Cheia' : level >= 40 ? 'Na metade' : level >= 20 ? 'Baixa' : 'No fim',
    detail: `${Math.round(level)} de 100`,
    fraction: clamp01(level / 100),
    state: 'normal',
  };
}

export function rateHeartRate(bpm: number | null): Rating {
  if (bpm == null) return semMedicao();
  const rounded = Math.round(bpm);
  return {
    available: true,
    label: rounded < 60 ? 'Excelente' : rounded < 75 ? 'Normal' : 'Elevado',
    detail: `${rounded} bpm`,
    fraction: clamp01((bpm - 44) / (100 - 44)),
    // Bradicardia ou taquicardia em repouso.
    state: rounded < 40 || rounded > 100 ? 'alert' : 'normal',
  };
}

export function rateSpo2(pct: number | null): Rating {
  if (pct == null) return semMedicao();
  const rounded = Math.round(pct);
  return {
    available: true,
    label: rounded >= 97 ? 'Excelente' : rounded >= 95 ? 'Bom' : 'Abaixo do esperado',
    detail: `${rounded}%`,
    fraction: clamp01((pct - 85) / 15),
    state: rounded < 95 ? 'alert' : 'normal',
  };
}

export function rateSleep(score: number | null, totalMin: number | null): Rating {
  // Sem noite medida não há avaliação. Antes o tipo exigia número, e a tela
  // alimentava um valor de exemplo só para satisfazê-lo.
  if (score == null || totalMin == null) return semMedicao();
  const available = true;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return {
    available,
    label: score >= 85 ? 'Excelente' : score >= 70 ? 'Bom' : 'Pode melhorar',
    detail: `${h}h ${String(m).padStart(2, '0')}m`,
    fraction: clamp01(score / 100),
    state: score < 50 ? 'alert' : 'normal',
  };
}

export function rateStress(score: number | null): Rating {
  if (score == null) return semMedicao();
  const rounded = Math.round(score);
  return {
    available: true,
    label: rounded < 30 ? 'Calmo' : rounded < 60 ? 'Moderado' : 'Elevado',
    detail: `${rounded} de 100`,
    fraction: clamp01(score / 100),
    state: rounded >= 75 ? 'alert' : 'normal',
  };
}

export function rateTemperature(celsius: number | null): Rating {
  if (celsius == null) return semMedicao();
  return {
    available: true,
    label: celsius < 36.1 ? 'Abaixo da média' : celsius <= 37.2 ? 'Normal' : 'Elevada',
    detail: `${celsius.toFixed(1).replace('.', ',')} °C`,
    // A escala da tela vai de 35 a 39 °C.
    fraction: clamp01((celsius - 35) / 4),
    state: celsius < 35.5 || celsius > 37.8 ? 'alert' : 'normal',
  };
}

export type PressureZone = {
  label: string;
  range: string;
  matches: (sys: number, dia: number) => boolean;
  /** Fora da faixa considerada saudável. */
  abnormal: boolean;
};

/**
 * Zonas da tabela de pressão, de baixo para cima — **Diretrizes Brasileiras de
 * Hipertensão (SBC, 2020)**.
 *
 * Era a tabela americana (AHA 2017), em que diastólica 80 já é "elevada". Um
 * testador mediu 11 por 8 e perguntou qual era a base — e pela diretriz
 * brasileira 110/80 é NORMAL (ótima < 120/80; normal até 129/84;
 * pré-hipertensão 130–139 ou 85–89; hipertensão a partir de 140/90). Produto
 * brasileiro, não médico: a referência é a daqui, e a tela de Ajuda diz qual é.
 */
export const pressureZones: PressureZone[] = [
  { label: 'Baixa', range: '< 90/60', matches: (s, d) => s < 90 || d < 60, abnormal: true },
  { label: 'Ótima', range: '< 120/80', matches: (s, d) => s < 120 && d < 80, abnormal: false },
  { label: 'Normal', range: '120–129 / 80–84', matches: (s, d) => s <= 129 && d <= 84, abnormal: false },
  { label: 'Elevada', range: '130–139 / 85–89', matches: (s, d) => s <= 139 && d <= 89, abnormal: true },
  { label: 'Alta', range: '≥ 140/90', matches: () => true, abnormal: true },
];

export function ratePressure(sys: number | null, dia: number | null): Rating & { zone: PressureZone } {
  if (sys == null || dia == null) {
    return { ...semMedicao(), zone: pressureZones[pressureZones.length - 1] };
  }
  const zone = pressureZones.find((z) => z.matches(sys, dia)) ?? pressureZones[pressureZones.length - 1];
  return {
    available: true,
    label: zone.label,
    detail: `${sys}/${dia} mmHg`,
    fraction: clamp01((sys - 80) / 80),
    state: zone.abnormal ? 'alert' : 'normal',
    zone,
  };
}

export function rateActivity({ steps, goal }: { steps: number | null; goal: number }): Rating {
  if (steps == null) return semMedicao();
  const fraction = clamp01(steps / goal);
  return {
    available: true,
    label: fraction >= 1 ? 'Meta batida' : fraction >= 0.7 ? 'Bom' : 'Pode melhorar',
    detail: `${steps.toLocaleString('pt-BR')} passos`,
    fraction,
    state: 'normal',
  };
}

/**
 * O tempo em movimento de um período — treino guiado e esporte somados.
 *
 * A régua é a recomendação de 150 min semanais de atividade moderada da OMS
 * (WHO Guidelines on physical activity and sedentary behaviour, 2020), aplicada
 * proporcionalmente à janela escolhida: sem ela, "10h20" é um número sem
 * tamanho. É recomendação de bem-estar, não critério clínico. Por ser
 * proporcional, o rótulo fala de RITMO — em um dia a régua vale um sétimo, e
 * "meta batida" prometeria mais do que 21 minutos entregam. Nunca vira alerta:
 * semana parada é rotina, não achado clínico.
 */
export function rateMovement({ minutes, days }: { minutes: number; days: number }): Rating {
  const goal = (150 * Math.max(1, days)) / 7;
  const fraction = clamp01(minutes / goal);
  return {
    available: true,
    label: fraction >= 1 ? 'No ritmo' : fraction >= 0.7 ? 'Bom' : 'Pode melhorar',
    detail: formatDuration(minutes * 60),
    fraction,
    state: 'normal',
  };
}

export function rateBioAge(delta: number): Rating {
  return {
    available: true,
    label: delta >= 4 ? 'Jovem' : delta >= 0 ? 'Na média' : 'Acima da idade',
    detail: delta === 0 ? 'igual à real' : `${delta > 0 ? '−' : '+'}${Math.abs(delta)} anos`,
    fraction: clamp01((delta + 10) / 20),
    state: 'normal',
  };
}

/**
 * Como descrever a idade de uma medida, em linguagem de gente.
 *
 * Existe porque a tela inicial afirmava "atualiza a cada 2 s" para o HRV — um
 * texto fixo, escrito quando só havia o wearable simulado, que emite a cada
 * 1,8 s. Com a pulseira real o HRV vem de medição AGENDADA e pode ter horas.
 * Anunciar cadência de segundos para um dado desses não é imprecisão de
 * redação: é apresentar valor velho como se fosse de agora, num produto de
 * saúde.
 *
 * Sem instante conhecido, não inventa: devolve `null` e a tela omite.
 */
export function frescor(at: number | undefined, now: number): string | null {
  if (!at) return null;
  const min = Math.floor((now - at) / 60_000);
  if (min < 0) return 'agora';
  if (min < 3) return 'agora';
  if (min < 60) return `há ${min} min`;
  const horas = Math.floor(min / 60);
  if (horas < 24) return `há ${horas} h`;
  const dias = Math.floor(horas / 24);
  return dias === 1 ? 'ontem' : `há ${dias} dias`;
}
