import { create } from 'zustand';

import { publicarTreinoDeHoje, type TreinoDoWidget } from '../../modules/widgetbridge';
import { workoutMeta } from '../domain/workout';

import { ble } from '../services/ble';
import { armTrainingNudge, cancelRestEnd, scheduleRestEnd } from '../services/notifications.service';

import {
  cancelExecution as apiCancel,
  fetchActivePlan,
  fetchCurrentExecution,
  fetchWorkout,
  finishExecution as apiFinish,
  recordSet as apiRecordSet,
  startExecution as apiStart,
  type Execution,
  type TrainingPlan,
  type WorkoutDetail,
} from '../services/api.service';

/**
 * A vibração no pulso quando o descanso acaba.
 *
 * É o caso em que vibrar vale mais que notificar: durante a série o celular
 * está no chão ou no banco, e o pulso é o único lugar em que o aviso chega sem
 * ter de procurar a tela. Some-se a isso que a notificação do sistema pode
 * estar bloqueada — e a pulseira vibra do mesmo jeito.
 *
 * Um `setTimeout` do JavaScript, e não agendamento do sistema, porque isto só
 * pode acontecer com o app VIVO: quem manda vibrar é o rádio pelo nosso
 * processo. Com o app em segundo plano o iOS congela o temporizador, e aí quem
 * avisa é a notificação agendada — as duas cobrem metades diferentes do mesmo
 * problema, e por isso as duas existem.
 *
 * Fica FORA do estado de propósito: é bookkeeping de temporizador, e guardá-lo
 * no store provocaria re-render a cada descanso sem nada mudar na tela.
 */
let vibracaoDoDescanso: ReturnType<typeof setTimeout> | null = null;

function armarVibracaoDoDescanso(seconds: number) {
  cancelarVibracaoDoDescanso();
  vibracaoDoDescanso = setTimeout(() => {
    vibracaoDoDescanso = null;
    // Falha muda: a pulseira pode estar carregando, e um erro no meio do treino
    // por causa de um reforço de aviso seria pior que não vibrar.
    void ble.vibrate?.().catch(() => undefined);
  }, Math.max(0, seconds) * 1000);
}

function cancelarVibracaoDoDescanso() {
  if (vibracaoDoDescanso) clearTimeout(vibracaoDoDescanso);
  vibracaoDoDescanso = null;
}

/**
 * Estado de treino do app.
 *
 * Duas coisas moram aqui, e as duas por motivos diferentes:
 *
 * 1. **O plano e a sessão em andamento**, porque três telas precisam deles e
 *    cada uma buscando por conta própria é como a home e o check-in acabam
 *    discordando sobre se existe treino aberto.
 * 2. **O progresso local da sessão**, porque a rede não pode ser a única cópia.
 *    Quem está na academia com sinal ruim não pode perder a série que acabou de
 *    fazer, e quem fecha o app entre um exercício e outro não pode voltar do
 *    zero. O servidor recebe cada série assim que dá, mas a verdade da tela é
 *    esta store.
 */

/** Uma série, como a pessoa preencheu. */
export type SetState = {
  load: string;
  reps: string;
  completed: boolean;
};

/** Chave do progresso: um exercício do treino. */
type ExerciseKey = string;

export type SessionProgress = Record<ExerciseKey, SetState[]>;

type WorkoutState = {
  plan: TrainingPlan | null;
  execution: Execution | null;
  workout: WorkoutDetail | null;
  loading: boolean;

  /** Progresso local por exercício. Sobrevive a fechar a tela. */
  progress: SessionProgress;
  /**
   * Instante-alvo do descanso, em epoch.
   *
   * Guardado como INSTANTE e não como contador restante: um contador para de
   * andar quando o app vai para segundo plano, e a pessoa volta com dois
   * minutos de descanso congelados em 40 segundos. O alvo continua verdadeiro
   * mesmo se o app for morto.
   */
  restEndsAt: number | null;

  /**
   * Cronômetro da sessão, em duas partes.
   *
   * `timerBase` são os segundos acumulados ANTES do trecho atual; `timerRunSince`
   * é o instante em que o trecho atual começou, ou `null` quando pausado. O
   * decorrido é `timerBase + (agora − timerRunSince)`.
   *
   * Por que dois campos em vez de um contador: um contador incrementado a cada
   * segundo para quando o app vai para segundo plano, e uma sessão de 50 minutos
   * volta marcando 12. Um único instante de início, por outro lado, não sabe
   * pausar. Os dois juntos resolvem os dois casos — e sobrevivem a sair da tela,
   * porque vivem aqui e não no componente.
   */
  timerBase: number;
  timerRunSince: number | null;

  refresh: () => Promise<void>;
  loadWorkout: (workoutId: string) => Promise<WorkoutDetail>;
  start: (workoutId: string, planDayId?: string) => Promise<Execution>;
  setProgress: (exerciseId: string, index: number, patch: Partial<SetState>) => void;
  completeSet: (exerciseId: string, index: number) => Promise<void>;
  startRest: (seconds: number) => void;
  clearRest: () => void;
  toggleTimer: () => void;
  /** Reposiciona o cronômetro a partir do início real da sessão. */
  syncTimer: (startedAt: string) => void;
  finish: (params: {
    perceivedEffort?: number | null;
    rating?: number | null;
    comment?: string | null;
  }) => Promise<{ durationSec: number | null; completionPct: number | null; workoutName: string }>;
  cancel: () => Promise<void>;
};

/**
 * Estado inicial das séries de um exercício.
 *
 * A carga vem pré-preenchida com a da última vez — é a melhor estimativa que
 * existe do que a pessoa vai levantar hoje, e muito melhor que campo vazio.
 * Repetições não são pré-preenchidas: elas variam com o dia, e sugerir um
 * número seria induzir a resposta.
 */
function initialSets(exercise: WorkoutDetail['phases'][number]['exercises'][number]): SetState[] {
  const count = Math.max(1, exercise.sets.length);
  const load = exercise.lastLoad ?? exercise.sets[0]?.load ?? null;
  return Array.from({ length: count }, () => ({
    load: load != null ? String(load) : '',
    reps: '',
    completed: false,
  }));
}

function seedProgress(workout: WorkoutDetail, existing: SessionProgress): SessionProgress {
  const seeded: SessionProgress = {};
  for (const phase of workout.phases) {
    for (const exercise of phase.exercises) {
      // O que já foi preenchido nesta sessão vence o pré-preenchimento: voltar
      // para a tela não pode apagar a série que a pessoa acabou de registrar.
      seeded[exercise.id] = existing[exercise.id] ?? initialSets(exercise);
    }
  }
  return seeded;
}

export const useWorkoutStore = create<WorkoutState>((set, get) => ({
  plan: null,
  execution: null,
  workout: null,
  loading: false,
  progress: {},
  restEndsAt: null,
  timerBase: 0,
  timerRunSince: null,

  refresh: async () => {
    set({ loading: true });
    try {
      const [plan, execution] = await Promise.all([fetchActivePlan(), fetchCurrentExecution()]);
      set({ plan, execution });

      /*
       Publica o treino do dia para o widget.

       Aqui, e não na tela: a tela pode nunca ser aberta — quem instalou o
       widget muitas vezes o usa PARA NÃO abrir o app. Este `refresh` roda na
       abertura, que é o momento em que o app tem dado fresco e o widget ainda
       não sabe de nada.
      */
      publicarTreinoDeHoje(paraWidget(plan));

      // Sessão aberta de uma abertura anterior do app: recarrega o treino dela
      // para a tela de execução ter o que renderizar sem passar pelo check-in.
      if (execution && get().workout?.id !== execution.workoutId) {
        const workout = await fetchWorkout(execution.workoutId);
        set({ workout, progress: seedProgress(workout, get().progress) });
      }
      if (!execution) set({ progress: {}, restEndsAt: null, timerBase: 0, timerRunSince: null });
    } catch {
      /*
       Sem rede ou sessão vencida, o plano em memória continua valendo — a tela
       mostra o que tem. Sem este catch, o `void refresh()` das telas virava
       "Uncaught (in promise): 401" no console a cada abertura com token velho.
      */
    } finally {
      set({ loading: false });
    }
  },

  loadWorkout: async (workoutId) => {
    const workout = await fetchWorkout(workoutId);
    set({ workout, progress: seedProgress(workout, get().progress) });
    return workout;
  },

  start: async (workoutId, planDayId) => {
    const workout = get().workout?.id === workoutId ? get().workout! : await fetchWorkout(workoutId);
    const execution = await apiStart(workoutId, planDayId);
    // Progresso zerado ao INICIAR, não ao carregar o treino: entrar para ver os
    // exercícios e voltar não pode apagar nada, mas um check-in novo começa do
    // zero.
    set({
      execution,
      workout,
      progress: seedProgress(workout, {}),
      restEndsAt: null,
      timerBase: 0,
      timerRunSince: Date.now(),
    });
    return execution;
  },

  setProgress: (exerciseId, index, patch) => {
    const current = get().progress[exerciseId] ?? [];
    const next = current.map((item, i) => (i === index ? { ...item, ...patch } : item));
    set({ progress: { ...get().progress, [exerciseId]: next } });
  },

  completeSet: async (exerciseId, index) => {
    const { execution, progress } = get();
    const sets = progress[exerciseId] ?? [];
    const target = sets[index];
    if (!target) return;

    const completed = !target.completed;
    get().setProgress(exerciseId, index, { completed });
    if (!execution) return;

    // A rede não decide o que a tela mostra. A série já foi marcada acima; se o
    // envio falhar, o registro local continua e o próximo envio o carrega — o
    // endpoint é idempotente por (sessão, exercício, ordem) justamente para isso.
    try {
      await apiRecordSet(execution.id, {
        workoutExerciseId: exerciseId,
        setOrder: index + 1,
        load: target.load ? Number(target.load) : null,
        repetitions: target.reps ? Number(target.reps) : null,
        completed,
      });
    } catch {
      // Silencioso de propósito: um alerta de rede no meio da série interrompe
      // o treino por algo que se resolve sozinho.
    }
  },

  startRest: (seconds) => {
    const endsAt = Date.now() + seconds * 1000;
    set({ restEndsAt: endsAt });
    /*
     A notificação é o que faz o descanso funcionar com o celular no bolso.

     Sem ela, quem guarda o telefone entre as séries — que é o comportamento
     normal — só descobre que o descanso acabou ao olhar de novo, e o intervalo
     real vira o dobro do prescrito. Falha em silêncio se a permissão foi
     negada: a barra na tela continua sendo o aviso principal.
    */
    void scheduleRestEnd(endsAt).catch(() => undefined);
    armarVibracaoDoDescanso(seconds);
  },
  clearRest: () => {
    set({ restEndsAt: null });
    void cancelRestEnd().catch(() => undefined);
    cancelarVibracaoDoDescanso();
  },

  toggleTimer: () => {
    const { timerBase, timerRunSince } = get();
    if (timerRunSince === null) {
      // Retomando: a base fica, e um novo trecho começa agora.
      set({ timerRunSince: Date.now() });
    } else {
      // Pausando: o trecho corrente é absorvido pela base.
      set({
        timerBase: timerBase + Math.round((Date.now() - timerRunSince) / 1000),
        timerRunSince: null,
      });
    }
  },

  /**
   * Alinha o cronômetro com o início real da sessão.
   *
   * Chamado quando a tela monta sobre uma sessão que já existia — ao voltar do
   * check-in, ou depois de o app ter sido morto. Sem isto, quem reabre o app no
   * meio do treino vê o cronômetro em zero, e o tempo que já passou desaparece.
   *
   * Só age quando ainda não há nada contado: se a pessoa pausou, esse estado
   * vale mais que o cálculo a partir de `startedAt`.
   */
  syncTimer: (startedAt) => {
    const { timerBase, timerRunSince } = get();
    if (timerBase > 0 || timerRunSince !== null) return;
    set({ timerBase: 0, timerRunSince: new Date(startedAt).getTime() });
  },

  finish: async (params) => {
    const { execution } = get();
    if (!execution) throw new Error('Nenhuma sessão em andamento');
    const result = await apiFinish(execution.id, params);
    set({ execution: null, progress: {}, restEndsAt: null, timerBase: 0, timerRunSince: null });
    // Treinou: a cobrança das 15h de HOJE morre e renasce para amanhã. É o que
    // impede o app de cobrar à tarde um treino feito de manhã.
    void armTrainingNudge(true);
    return {
      durationSec: result.durationSec,
      completionPct: result.completionPct,
      workoutName: result.workoutName,
    };
  },

  cancel: async () => {
    const { execution } = get();
    if (!execution) return;
    await apiCancel(execution.id);
    set({ execution: null, progress: {}, restEndsAt: null, timerBase: 0, timerRunSince: null });
  },
}));

/** Segundos decorridos do cronômetro. Pausado, devolve só a base acumulada. */
export function elapsedSeconds(base: number, runSince: number | null, now: number): number {
  return base + (runSince === null ? 0 : Math.max(0, Math.round((now - runSince) / 1000)));
}

/** Quantas séries do treino inteiro já foram marcadas. Alimenta o anel da sessão. */
export function sessionProgressFraction(workout: WorkoutDetail | null, progress: SessionProgress): number {
  if (!workout) return 0;
  let total = 0;
  let done = 0;
  for (const phase of workout.phases) {
    for (const exercise of phase.exercises) {
      const sets = progress[exercise.id] ?? [];
      total += sets.length;
      done += sets.filter((s) => s.completed).length;
    }
  }
  return total === 0 ? 0 : done / total;
}

/**
 * O plano reduzido ao que cabe num widget.
 *
 * Quatro campos. O widget é pequeno e é lido de relance — mandar o plano
 * inteiro para ele escolher o que mostrar transferiria a decisão de hierarquia
 * para o SwiftUI, que é onde ela é mais cara de mudar.
 */
function paraWidget(plan: Awaited<ReturnType<typeof fetchActivePlan>>): TreinoDoWidget | null {
  if (!plan) return null;
  const hoje = plan.days.find((d) => d.dayOfWeek === plan.today);
  const treino = hoje?.workout;
  if (!treino) {
    return {
      nome: 'Descanso',
      detalhe: 'Recuperação é o que faz a adaptação acontecer.',
      minutos: null,
      descanso: true,
    };
  }
  return {
    nome: treino.name,
    detalhe: workoutMeta(treino.muscleGroups, treino.exerciseCount),
    minutos: treino.estimatedDuration ?? null,
    descanso: false,
  };
}
