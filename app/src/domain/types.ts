/** Uma leitura instantânea do wearable. Espelha `biometric_readings` no banco. */
/**
 * Uma leitura do wearable.
 *
 * **`null` significa NÃO MEDIDO, e é diferente de zero.** A distinção não é
 * preciosismo: o hardware real entrega um subconjunto do que o produto desenha.
 * O H59 dá batimento e não dá HRV; um relógio futuro pode dar HRV e não dar
 * pressão. Enquanto ausência era representada por `0`, a tela mostrava
 * "HRV 0 ms · Pode melhorar" com a mesma confiança de um valor medido — dado
 * fabricado apresentado como medição, que num produto de saúde é o pior defeito
 * possível.
 *
 * `heartRate` e `recordedAt` não são anuláveis porque uma leitura sem nenhum dos
 * dois não é leitura.
 */
export type Reading = {
  recordedAt: number;
  heartRate: number;
  hrvMs: number | null;
  /**
   * Quando o HRV foi medido — não é o mesmo instante da leitura.
   *
   * Nesta pulseira o HRV vem de medição AGENDADA, enquanto o batimento é
   * contínuo. Sem separar os dois instantes, uma amostra de horas atrás viaja
   * colada em cada batimento novo e a tela a apresenta como se fosse de agora.
   */
  hrvAt?: number;
  /**
   * Quando o BATIMENTO foi medido — que não é quando a leitura chegou.
   *
   * O serviço acumula as grandezas campo a campo, porque o SDK entrega uma por
   * vez e uma leitura do domínio é um instante completo. O efeito colateral era
   * grave: QUALQUER evento — passos, que mudam a cada passada — reemitia o
   * último batimento conhecido carimbado com a hora de agora. Correndo, a tela
   * mostrava a frequência de repouso como se fosse ao vivo, e a trava de
   * frescor não pegava, porque o carimbo que ela lia era o da chegada.
   *
   * Relatado em produção (ago/2026): 53 bpm durante uma corrida. Mesma solução
   * que o HRV já tinha em `hrvAt` — a grandeza carrega o próprio instante.
   */
  heartRateAt?: number;
  spo2Pct: number | null;
  temperatureC: number | null;
  steps: number | null;
  /**
   * Distância (m) e calorias ativas do dia, do MESMO evento que traz os passos.
   *
   * A pulseira manda os três juntos; a ponte guardava só os passos e a tela de
   * atividade mostrava "0,0 km · 0 kcal" ao lado de 5.628 passos (ago/2026).
   */
  distanceM?: number | null;
  activeKcal?: number | null;
  bpSystolic: number | null;
  bpDiastolic: number | null;
  stressScore: number | null;
  respRate: number | null;
  source: 'staranb' | 'healthkit' | 'health-connect' | 'mock';
};

export type SleepPhase = 'rem' | 'deep' | 'light' | 'awake';

/** Um trecho contínuo numa fase. A sequência deles é o hipnograma. */
export type SleepSegment = { phase: SleepPhase; minutes: number };

export type SleepNight = {
  date: string;
  score: number;
  totalMin: number;
  /**
   * Quão CONSOLIDADO foi o sono profundo, de 0 a 100. `null` sem profundo.
   *
   * Separado de `phases.deep` porque responde outra pergunta: aquele é quanto,
   * este é em quantos pedaços. Ver `deepSleepContinuity`.
   */
  deepContinuity: number | null;
  phases: Record<SleepPhase, number>;
  /** Ordem real das fases ao longo da noite — o que revela a arquitetura do sono. */
  segments: SleepSegment[];
  /** SpO₂ amostrado durante a noite, para detectar dessaturação. */
  spo2Night: number[];
  /**
   * Início e fim da noite, em epoch.
   *
   * A noite não carregava a própria janela, e sem ela não havia como recortar a
   * série de SpO₂ das 24 h para o trecho dormido — que é o motivo de o gráfico
   * "Oxigênio durante a noite" ter nascido e permanecido vazio. Opcionais
   * porque noite vinda do HealthKit ou de arquivo antigo não os tem.
   */
  startAt?: number;
  endAt?: number;
  /**
   * Quem mediu esta noite.
   *
   * A pulseira é a fonte preferida; o app Saúde entra quando ela não tem a
   * noite. Sem este campo, a tela de dados não conseguia dizer a procedência
   * do único número que pode vir de dois aparelhos diferentes, e procedência
   * de dado sensível não é detalhe.
   */
  source?: 'band' | 'healthkit';
};

/** Par sistólica/diastólica de uma aferição. */
export type PressureReading = { systolic: number; diastolic: number; at: string };

export type Activity = {
  steps: number;
  goal: number;
  distanceKm: number;
  activeKcal: number;
  activeMin: number;
};

export type BioAgeFactor = {
  key: 'fitness' | 'hrv' | 'sleep' | 'activity';
  label: string;
  /** Valor do usuário já formatado para exibição. */
  value: string;
  /** O típico da idade da pessoa, formatado — a régua contra a qual ela é lida. */
  reference: string;
  /** A idade que ESTE marcador sugere, em anos a mais ou a menos que a real. Negativo rejuvenesce. */
  years: number;
  /**
   * Quanto do desvio final vem deste marcador: `years × peso`. As contribuições
   * SOMAM o desvio; os `years` não — e um testador somou (+0,9 +2,6 +4,3 = 7,8)
   * contra um título que dizia +2 (ago/2026). A idade é média ponderada das
   * idades sugeridas, e a tela precisa mostrar o número que fecha a conta.
   */
  contribution: number;
  /** Peso efetivo deste marcador na média (0–1; 0 para o que não entra). */
  weight: number;
};

export type BioAge = {
  realAge: number;
  bioAge: number;
  /** realAge − bioAge. Positivo = mais jovem que a idade cronológica. */
  delta: number;
  factors: BioAgeFactor[];
  /** VO₂máx estimado (mL/kg/min) — o intermediário que mais explica o número. */
  vo2max?: number;
};

export type Sex = 'f' | 'm';

export type User = {
  name: string;
  birthYear: number;
  sex: Sex;
};
