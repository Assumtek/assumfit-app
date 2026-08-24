/**
 * Score de energia — fórmula estática do MVP (Fase 1).
 *
 * A spec pondera HRV 40%, sono 25%, FC repouso 20%, hidratação 10% e
 * temperatura 5%. Duas ressalvas que valem enquanto isto for local:
 *
 * 1. Normalização. HRV saudável varia de ~20 a ~200 ms entre pessoas, então o
 *    valor absoluto não diz nada — só o desvio da linha de base da própria
 *    pessoa. Enquanto não houver 7 dias de histórico, caímos numa faixa
 *    populacional e o app se declara "calibrando".
 * 2. Hidratação entra neutra (0,5). O tracker de água é Fase 2; até lá o peso
 *    de 10% não tem de onde sair e fingir um valor distorceria o score.
 *
 * O modelo Python da Fase 2 substitui isto e passa a considerar cronótipo.
 */
import type { Reading, SleepNight } from './types';

export type EnergyLevel = 'high' | 'mid' | 'low';

export type EnergyState = {
  score: number;
  level: EnergyLevel;
  /** true enquanto não houver histórico pessoal suficiente. */
  calibrating: boolean;
  eyebrow: string;
  title: string;
  description: string;
  levelLabel: string;
  /**
   * Frase de transição. `null` quando NÃO há transição à frente hoje.
   *
   * Era uma string fixa por faixa — "segundo pico às 16h" aparecia às 20h, com
   * o pico já passado. Agora sai da varredura da própria curva, e some quando
   * não há o que anunciar. A fonte da verdade é `ai/models/insight.py`; esta
   * cópia existe para o app não ficar mudo sem rede.
   */
  nextLabel: string | null;
  /** Score projetado para cada hora do dia, 0 a 23. */
  curve: number[];
  /**
   * `play` e `calendar` seguem no tipo por causa do INSIGHT do servidor, que
   * pode ter sido gerado antes do reposicionamento e chegar do cache. As
   * ações locais não os usam mais: a home incentiva movimento, não foco.
   */
  action: { label: string; icon: 'play' | 'calendar' | 'drop' | 'dumbbell' | 'footprints' };
};

/**
 * Limiares que separam os níveis. Exportados porque a régua da tela precisa
 * desenhar as MESMAS divisões — se cada lado tiver seu número, o app mostra
 * "nível médio" com o marcador na faixa alta.
 */
export const ENERGY_BANDS = { mid: 38, high: 65 } as const;

/** Dias de histórico necessários para abandonar a referência populacional. */
export const CALIBRATION_DAYS = 7;

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** Prior de cronobiologia: pico de manhã, vale à tarde, segundo pico ao fim do dia. */
function circadianFactor(hour: number): number {
  if (hour < 6) return 0.25;
  if (hour < 12) return 0.95;
  if (hour < 15) return 0.55; // vale de alerta
  if (hour < 18) return 0.85; // segundo pico
  if (hour < 21) return 0.6;
  return 0.35;
}

const levelOf = (score: number): EnergyLevel =>
  score >= ENERGY_BANDS.high ? 'high' : score >= ENERGY_BANDS.mid ? 'mid' : 'low';

const RANK: Record<EnergyLevel, number> = { low: 0, mid: 1, high: 2 };

/**
 * A avaliação em palavras de um SCORE, e não de um estado já montado.
 *
 * Existe porque a home mostra o score do modelo (servidor) e mostrava, ao
 * lado, o rótulo do cálculo offline: dava para ler "44" e "prontidão alta" na
 * mesma linha, que é o app se contradizendo em dois centímetros de tela. Quem
 * exibe o número tira daqui a palavra que o acompanha.
 */
export function rotuloDoScore(score: number): string {
  return COPY[levelOf(score)](score).levelLabel;
}

/** Ganho mínimo para chamar um horário de melhor janela. Abaixo disso é ruído. */
const MIN_PEAK_GAIN = 5;

/**
 * Primeira troca de faixa à frente, e a direção dela decide a frase.
 *
 * Mesma regra de `next_transition` no Python. Duplicada pelo mesmo motivo que o
 * resto da matemática: o app precisa funcionar sem rede.
 */
function nextTransition(curve: number[], hour: number, score: number): string | null {
  const level = levelOf(score);

  for (let h = hour + 1; h < curve.length; h++) {
    const ahead = levelOf(curve[h]);
    if (ahead === level) continue;
    if (RANK[ahead] > RANK[level]) return `${ahead === 'high' ? 'próximo pico' : 'volta a subir'} às ${h}h`;
    return `começa a cair às ${h}h`;
  }

  let peakHour = -1;
  for (let h = hour + 1; h < curve.length; h++) if (peakHour === -1 || curve[h] > curve[peakHour]) peakHour = h;
  if (peakHour !== -1 && curve[peakHour] - score >= MIN_PEAK_GAIN) return `melhor janela restante às ${peakHour}h`;
  return null;
}

export type EnergyInput = {
  reading: Reading;
  /** `null` enquanto não houver noite medida — não se inventa uma. */
  sleep: SleepNight | null;
  hour: number;
  /** Média pessoal de HRV. Ausente enquanto o histórico for curto. */
  hrvBaseline?: number;
};

export function energyState({ reading, sleep, hour, hrvBaseline }: EnergyInput): EnergyState {
  const calibrating = hrvBaseline == null;

  /**
   * Sinal ausente tem o peso REDISTRIBUÍDO, não zerado.
   *
   * O hardware real entrega um subconjunto do que a spec desenha — o H59 dá
   * batimento e não dá HRV. Tratar o que falta como zero puniria quem
   * simplesmente não tem o sensor: um HRV ausente valendo zero derruba 40% do
   * score de quem talvez esteja ótimo. Redistribuir mantém a proporção entre os
   * sinais que EXISTEM e é a mesma regra do modelo Python (`_components`), para
   * as duas implementações não divergirem.
   *
   * Hidratação segue entrando neutra, e por outro motivo: ela não depende de
   * sensor, depende de a pessoa registrar. Ausência ali é silêncio, não falta
   * de hardware.
   */
  const signals: { norm: number; weight: number }[] = [
    { norm: clamp01((90 - reading.heartRate) / 40), weight: 0.2 },
    { norm: 0.5, weight: 0.1 },
  ];

  /*
   Sono entra na mesma regra dos demais: presente contribui, ausente redistribui.

   Antes era obrigatório, e a tela alimentava um valor fixo de exemplo para
   satisfazer o tipo — um score de 82 que ninguém dormiu, com peso 0,25 no
   resultado. O modelo Python (`_components`) já tratava `sleep_score` como
   opcional; era o TypeScript que estava fora de passo.
   */
  if (sleep != null) {
    signals.push({ norm: clamp01(sleep.score / 100), weight: 0.25 });
  }

  if (reading.hrvMs != null) {
    // Com baseline, o que importa é o desvio; sem ele, uma faixa populacional ampla.
    const hrvNorm = calibrating
      ? clamp01((reading.hrvMs - 25) / 75)
      : clamp01(0.5 + (reading.hrvMs - hrvBaseline) / (hrvBaseline * 0.6));
    signals.push({ norm: hrvNorm, weight: 0.4 });
  }

  if (reading.temperatureC != null) {
    signals.push({ norm: clamp01(1 - Math.abs(reading.temperatureC - 36.6) / 1.5), weight: 0.05 });
  }

  const totalWeight = signals.reduce((sum, s) => sum + s.weight, 0);
  const base = signals.reduce((sum, s) => sum + s.norm * (s.weight / totalWeight), 0);

  // O circadiano MODULA, não domina.
  //
  // Multiplicar o score pelo fator direto fazia o vale das 14h derrubar até
  // quem estava bem recuperado — alguém com HRV ótimo virava "nível baixo" só
  // por ser meio da tarde, o que contradiz o próprio dado. Aqui ele mexe em no
  // máximo 35% do resultado: a curva do dia continua visível, mas quem é a
  // referência é a fisiologia da pessoa.
  const CIRCADIAN_WEIGHT = 0.35;
  const modulation = 1 - CIRCADIAN_WEIGHT + CIRCADIAN_WEIGHT * circadianFactor(hour);

  const scoreAt = (h: number) =>
    Math.round(base * (1 - CIRCADIAN_WEIGHT + CIRCADIAN_WEIGHT * circadianFactor(h)) * 100);

  const score = Math.round(base * modulation * 100);
  const level = levelOf(score);
  const curve = Array.from({ length: 24 }, (_, h) => scoreAt(h));

  return {
    score,
    level,
    calibrating,
    curve,
    nextLabel: nextTransition(curve, hour, score), ...COPY[level](score),
  };
}

type Copy = Omit<EnergyState, 'score' | 'level' | 'calibrating' | 'curve' | 'nextLabel'>;

/**
 * Uma ação por estado, sempre em verbo imperativo.
 *
 * É o FALLBACK offline. Com rede, o texto vem de `ai/models/insight.py`, que
 * nomeia o sinal responsável em vez de repetir um parágrafo por faixa — aqui
 * não dá para fazer o mesmo, porque água e sono do dia moram no servidor.
 */
/*
 REPOSICIONAMENTO (ago/2026, decisão da fundadora): o score fala PRONTIDÃO
 para treinar, não energia para produzir. A home incentiva esporte, movimento
 e recuperação; foco e agenda continuam como telas do menu, mas nunca mais
 são a ação sugerida. O espelho disto no servidor é `ai/models/insight.py` —
 mudou aqui, muda lá.
 */
const COPY: Record<EnergyLevel, (score: number) => Copy> = {
  high: () => ({
    eyebrow: 'pronto para treinar',
    title: 'Corpo pronto para\ntreinar forte',
    description: 'Recuperação em dia. Aproveite a janela para treinar ou praticar seu esporte com intensidade.',
    levelLabel: 'prontidão alta',
    action: { label: 'Abrir o treino de hoje', icon: 'dumbbell' },
  }),
  mid: () => ({
    eyebrow: 'bom para se mover',
    title: 'Bom momento para\nmovimento leve',
    description: 'Prontidão mediana. Caminhada, mobilidade ou um esporte tranquilo servem bem agora.',
    levelLabel: 'prontidão média',
    action: { label: 'Registrar um esporte', icon: 'footprints' },
  }),
  low: () => ({
    eyebrow: 'hora de recuperar',
    title: 'Seu corpo pede\nrecuperação',
    description: 'Deixe a intensidade para amanhã: água, movimento leve e um sono cedo valem mais agora.',
    levelLabel: 'prontidão baixa',
    action: { label: 'Beber água agora', icon: 'drop' },
  }),
};
