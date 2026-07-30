/**
 * Ciclo menstrual — fases, previsão e o que cada fase muda no dia.
 *
 * O produto é de energia e produtividade, e o ciclo é um dos maiores
 * moduladores de energia que existem numa pessoa que menstrua: HRV, temperatura
 * basal e disposição variam de forma previsível ao longo dele. Ignorar isso
 * significa comparar a pessoa da fase lútea com ela mesma da fase folicular e
 * chamar a diferença de "piora".
 *
 * ESCOPO — o que este módulo NÃO faz, e não deve passar a fazer:
 *
 * - **Não serve como método contraceptivo.** Previsão de ovulação por
 *   calendário erra com frequência, e um app de bem-estar que sugira o
 *   contrário estaria induzindo a pessoa a um risco real.
 * - **Não diagnostica.** Ciclo irregular, ausente ou muito longo tem causas
 *   clínicas, e nomeá-las aqui seria diagnóstico — que o produto não faz.
 * - **Não infere gravidez.** Atraso é atraso; o app mostra o atraso e para aí.
 *
 * A pulseira não mede nada disto: o SDK do fabricante só ACEITA a configuração
 * do ciclo, para exibir lembrete no relógio. O dado vem de quem registra.
 */

/** As quatro fases, na ordem em que acontecem. */
export type CyclePhase = 'menstrual' | 'follicular' | 'ovulatory' | 'luteal';

/** Um ciclo registrado: o dia em que a menstruação começou e quanto durou. */
export type LoggedCycle = {
  /** `YYYY-MM-DD`, no fuso de quem registrou. */
  startedAt: string;
  /** Dias de fluxo. `null` enquanto o ciclo corrente não terminou. */
  durationDays: number | null;
};

export type CycleState = {
  phase: CyclePhase;
  /** Dia do ciclo, começando em 1 no primeiro dia de fluxo. */
  day: number;
  /** Duração estimada deste ciclo, em dias. */
  length: number;
  /** Dias até a próxima menstruação prevista. Negativo = atraso. */
  daysToNext: number;
  /**
   * `true` quando a previsão vem do padrão populacional e não do histórico da
   * pessoa. A tela precisa dizer isso — previsão sem base é chute com data.
   */
  estimating: boolean;
};

/**
 * Ciclo médio quando ainda não há histórico.
 *
 * 28 dias é a referência mais citada, mas a faixa saudável vai de 21 a 35 — por
 * isso o valor só vale até haver dois registros da própria pessoa.
 */
export const DEFAULT_LENGTH = 28;

/** Duração de fluxo padrão, usada quando o ciclo corrente ainda não terminou. */
export const DEFAULT_FLOW_DAYS = 5;

/**
 * A fase lútea é a estável, não a folicular.
 *
 * Entre a ovulação e a menstruação passam-se ~14 dias em quase todo mundo; o
 * que varia de pessoa para pessoa, e de mês para mês, é o tempo ATÉ ovular.
 * Por isso a ovulação é calculada para trás, a partir da próxima menstruação
 * prevista — e não como "dia 14", que só acerta em ciclos de exatamente 28.
 */
const LUTEAL_DAYS = 14;

/** Janela em que a ovulação é considerada em curso, em dias ao redor do pico. */
const OVULATORY_WINDOW = 2;

const DIA_MS = 86_400_000;

function paraData(iso: string): number {
  // Meio-dia evita que horário de verão desloque a diferença em um dia.
  return new Date(`${iso}T12:00:00`).getTime();
}

function diasEntre(de: string, ate: string): number {
  return Math.round((paraData(ate) - paraData(de)) / DIA_MS);
}

/**
 * Duração média a partir do histórico da pessoa.
 *
 * Precisa de dois inícios para existir um intervalo. Ciclos fora da faixa de
 * 21 a 35 dias são descartados do cálculo — não por juízo clínico, mas porque
 * quase sempre são registro esquecido ou digitado errado, e um outlier de 60
 * dias envenena a média que gera todas as previsões seguintes.
 */
export function averageLength(cycles: LoggedCycle[]): number | null {
  const inicios = [...cycles].map((c) => c.startedAt).sort();
  const intervalos: number[] = [];
  for (let i = 1; i < inicios.length; i++) {
    const d = diasEntre(inicios[i - 1], inicios[i]);
    if (d >= 21 && d <= 35) intervalos.push(d);
  }
  if (!intervalos.length) return null;
  return Math.round(intervalos.reduce((a, b) => a + b, 0) / intervalos.length);
}

/**
 * Em que ponto do ciclo a pessoa está numa data.
 *
 * `null` sem nenhum registro — sem primeiro dia não há ciclo, e inventar um
 * colocaria a pessoa numa fase que ela não está.
 */
export function phaseOn(date: string, cycles: LoggedCycle[], today = date): CycleState | null {
  const ordenados = [...cycles].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const ultimo = [...ordenados].reverse().find((c) => diasEntre(c.startedAt, date) >= 0);
  if (!ultimo) return null;

  const media = averageLength(ordenados);
  const length = media ?? DEFAULT_LENGTH;
  const day = diasEntre(ultimo.startedAt, date) + 1;
  const fluxo = ultimo.durationDays ?? DEFAULT_FLOW_DAYS;

  // A ovulação sai de trás para frente: length menos a fase lútea estável.
  const ovulacao = length - LUTEAL_DAYS;

  let phase: CyclePhase;
  if (day <= fluxo) phase = 'menstrual';
  else if (Math.abs(day - ovulacao) <= OVULATORY_WINDOW) phase = 'ovulatory';
  else if (day < ovulacao) phase = 'follicular';
  else phase = 'luteal';

  return {
    phase,
    day,
    length,
    daysToNext: length - diasEntre(ultimo.startedAt, today),
    estimating: media === null,
  };
}

/** Data prevista da próxima menstruação. `null` sem registro. */
export function nextPeriod(cycles: LoggedCycle[]): string | null {
  const ordenados = [...cycles].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const ultimo = ordenados[ordenados.length - 1];
  if (!ultimo) return null;
  const length = averageLength(ordenados) ?? DEFAULT_LENGTH;
  return new Date(paraData(ultimo.startedAt) + length * DIA_MS).toISOString().slice(0, 10);
}

/**
 * O que cada fase significa para o DIA da pessoa.
 *
 * Deliberadamente sobre energia, treino e foco — que é o domínio do produto —
 * e não sobre sintoma clínico. "Sua temperatura basal sobe na fase lútea" é
 * fisiologia descritiva; "isso indica X" seria diagnóstico.
 */
export const PHASE_COPY: Record<CyclePhase, { label: string; body: string; training: string }> = {
  menstrual: {
    label: 'Menstruação',
    body:
      'Estrogênio e progesterona no ponto mais baixo do ciclo. Energia costuma cair, e a percepção de esforço sobe para a mesma carga de sempre.',
    training: 'Movimento leve costuma cair melhor que treino intenso. Se o corpo pedir descanso, ele tem razão.',
  },
  follicular: {
    label: 'Fase folicular',
    body:
      'Estrogênio subindo. É a fase em que a maioria relata mais disposição, melhor recuperação entre séries e mais tolerância a volume.',
    training: 'Boa janela para as sessões mais exigentes e para começar algo novo.',
  },
  ovulatory: {
    label: 'Ovulação',
    body:
      'Estrogênio no pico e temperatura basal prestes a subir. Costuma ser o ponto mais alto de energia do ciclo.',
    training: 'Momento de força e potência. Vale atenção extra ao aquecimento — a frouxidão ligamentar aumenta aqui.',
  },
  luteal: {
    label: 'Fase lútea',
    body:
      'Progesterona alta. A temperatura basal sobe cerca de 0,3 °C e o HRV tende a cair — o que aparece no score sem que nada esteja errado.',
    training: 'Volume moderado costuma render mais que intensidade. Hidratação e sono pesam mais nesta fase.',
  },
};
