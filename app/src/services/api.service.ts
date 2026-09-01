import axios, { AxiosInstance } from 'axios';
import { umaPorVez } from '../domain/singleFlight';

import type { Reading } from '../domain/types';
import {
  clearTokens,
  flushPendingSave,
  KeychainSaveError,
  loadTokens,
  saveTokens,
  type Tokens,
} from './tokenStorage';

/**
 * Endereço da API, fixado no build por `eas.json`.
 *
 * O padrão de localhost só vale em desenvolvimento. Num build de produção sem a
 * variável, o app apontaria para o próprio aparelho e falharia em toda chamada
 * com "sem conexão" — um erro que parece problema de rede da pessoa e levaria
 * dias para alguém desconfiar da configuração. Melhor não compilar.
 */
const BASE_URL = (() => {
  const configured = process.env.EXPO_PUBLIC_API_URL;
  if (configured) return configured;
  if (!__DEV__) {
    throw new Error(
      'EXPO_PUBLIC_API_URL ausente. Defina no perfil do eas.json antes de compilar para produção.');
  }
  return 'http://localhost:3001';
})();

/** Versão do termo de consentimento vigente. Muda quando o texto muda. */
export const CONSENT_VERSION = '2026-07-v1';

/**
 * Cliente da API.
 *
 * Os tokens vivem no Keychain e ficam espelhados em memória só para o
 * interceptor não precisar de I/O assíncrono a cada requisição. Quem manda é o
 * armazenamento seguro: `restoreSession` recarrega dele na subida do app.
 */
let tokens: Tokens | null = null;

export const api: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  if (tokens?.accessToken) config.headers.Authorization = `Bearer ${tokens.accessToken}`;
  return config;
});

/**
 * Uma renovação em voo, compartilhada por todos os 401 simultâneos.
 *
 * O `_retried` abaixo protege contra laço numa requisição; ele nunca protegeu
 * contra CONCORRÊNCIA. Oito telas pedindo dado ao mesmo tempo pegavam 401
 * juntas e disparavam oito renovações com o MESMO refresh token — e o servidor
 * rotaciona o refresh e trata reapresentação como roubo, revogando TODAS as
 * sessões da pessoa. A primeira renovação passava; as outras sete acionavam a
 * trava de segurança contra o próprio dono, que ficava deslogado, com o app
 * lendo cache e sem conseguir enviar nada. Visto em produção (ago/2026): 11
 * respostas 200 e 13 respostas 401 no mesmo endpoint, no mesmo segundo.
 */
const renovacaoCompartilhada = umaPorVez<Tokens>();

/**
 * Renova o access token uma única vez por 401 e repete a requisição.
 * O flag `_retried` evita laço infinito quando o refresh também está inválido.
 */
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config as (typeof error.config & { _retried?: boolean }) | undefined;
    if (error.response?.status !== 401 || !tokens?.refreshToken || original?._retried) {
      throw error;
    }
    original._retried = true;
    const refreshToken = tokens.refreshToken;
    try {
      /*
       Quem chega durante uma renovação ESPERA a mesma, em vez de abrir outra.
       Depois dela, a requisição repete lendo o token novo pelo interceptor de
       pedido — por isso `api(original)` e não um reenvio com cabeçalho fixado.
      */
      const data = await renovacaoCompartilhada(async () => {
        const r = await axios.post<Tokens>(`${BASE_URL}/auth/refresh`, { refreshToken });
        /*
         A renovação DEU CERTO quando o servidor respondeu — a gravação no
         Keychain é outra etapa, e pode falhar com o aparelho bloqueado. Antes a
         falha da gravação estourava aqui, a requisição original morria e o
         token novo ficava só na memória (o Keychain guarda o pendente e refaz
         ao voltar ao primeiro plano).
        */
        await setSession(r.data).catch((err) => {
          if (!(err instanceof KeychainSaveError)) throw err;
          console.warn('[api] Keychain recusou gravar o token renovado; fica pendente');
        });
        return r.data;
      });
      if (!data) throw error;
      return api(original);
    } catch (falha) {
      /*
       Limpa só se a sessão ainda for a que falhou. Sem esta checagem, um 401 de
       requisição atrasada apagaria a sessão que a renovação bem-sucedida acabou
       de gravar — trocando o defeito de lugar em vez de resolvê-lo.

       E AVISA: o servidor recusar a renovação é o fim da sessão, e ninguém
       além deste interceptor fica sabendo. Sem o aviso o app continuava com
       cara de logado — perfil sem carregar, toda requisição falhando — em vez
       de mandar para o login. Foi o "me relogou como outra pessoa" de ago/2026.
      */
      if (tokens?.refreshToken === refreshToken) {
        await setSession(null);
        const status = axios.isAxiosError(falha) ? falha.response?.status : undefined;
        if (status === 401 || status === 403) for (const ouvinte of ouvintesDeSessaoPerdida) ouvinte();
      }
      throw error;
    }
  });

async function setSession(next: Tokens | null) {
  tokens = next;
  if (next) await saveTokens(next);
  else await clearTokens();
}

const ouvintesDeSessaoPerdida = new Set<() => void>();

/** Chamado quando o servidor recusa a renovação — a sessão acabou, e a tela precisa saber. */
export function onSessionLost(ouvinte: () => void): () => void {
  ouvintesDeSessaoPerdida.add(ouvinte);
  return () => ouvintesDeSessaoPerdida.delete(ouvinte);
}

/** Refaz uma gravação de token que o Keychain recusou. Barato; chame ao voltar ao primeiro plano. */
export const flushSessionSave = flushPendingSave;

/**
 * Recarrega a sessão do Keychain. Chamado na subida do app.
 *
 * Devolve `null` quando o Keychain não pôde ser lido — que NÃO é o mesmo que
 * não haver sessão. Ver `loadTokens`: com o aparelho bloqueado a leitura falha,
 * e é justamente quando o app sobe sozinho por tarefa de fundo.
 */
export async function restoreSession(): Promise<boolean | null> {
  try {
    tokens = await loadTokens();
    return tokens !== null;
  } catch {
    return null;
  }
}

export const isAuthenticated = () => tokens !== null;

export type RegisterInput = {
  email: string;
  password: string;
  name: string;
  birthDate: string;
  sex: 'f' | 'm';
};

export async function register(input: RegisterInput): Promise<void> {
  const { data } = await api.post<Tokens>('/auth/register', { ...input, consentVersion: CONSENT_VERSION });
  await setSession(data);
}

export async function login(email: string, password: string): Promise<void> {
  const { data } = await api.post<Tokens>('/auth/login', { email, password });
  await setSession(data);
}

export async function logout(): Promise<void> {
  const refreshToken = tokens?.refreshToken;
  await setSession(null);
  if (refreshToken) await api.post('/auth/logout', { refreshToken }).catch(() => undefined);
}

export type ConsentPurpose =
  | 'biometric_processing'
  | 'international_transfer'
  | 'marketing'
  /** Guardar as fotos de evolução na nuvem. Revogar apaga as imagens. */
  | 'progress_photos';

export type Profile = {
  id: string;
  email: string;
  name: string;
  /** ISO `YYYY-MM-DD`. */
  birthDate: string;
  sex: 'f' | 'm';
  createdAt: string;
  /** URL assinada da foto de perfil, válida por uma hora. */
  avatarUrl?: string | null;
  consents: { purpose: ConsentPurpose; version: string; grantedAt: string }[];
  subscription: {
    status: string;
    startedAt: string;
    currentPeriodEnd: string | null;
    priceCents: number;
  } | null;
  device: {
    serialNumber: string;
    model: string;
    status: string;
    batteryPct: number | null;
    lastSeenAt: string | null;
    shippedAt: string | null;
  } | null;
};

export async function fetchProfile(): Promise<Profile> {
  const { data } = await api.get<Profile>('/auth/me');
  return data;
}

export type ProfilePatch = {
  name?: string;
  birthDate?: string;
  sex?: 'f' | 'm';
  /** A chave da foto de perfil no S3; `null` remove a foto. */
  avatarKey?: string | null;
};

export async function updateProfile(patch: ProfilePatch): Promise<Profile> {
  const { data } = await api.patch<Profile>('/auth/me', patch);
  return data;
}

/** Direito de eliminação da LGPD. Apaga no servidor e encerra a sessão. */
export async function deleteAccount(): Promise<void> {
  await api.delete('/auth/me');
  await setSession(null);
}

/** O payload do wearable no formato que a API valida. */
function toPayload(reading: Reading) {
  return {
    recordedAt: new Date(reading.recordedAt).toISOString(),
    hrvMs: reading.hrvMs,
    heartRate: Math.round(reading.heartRate),
    spo2Pct: reading.spo2Pct,
    temperature: reading.temperatureC,
    steps: reading.steps,
    bpSystolic: reading.bpSystolic || null,
    bpDiastolic: reading.bpDiastolic || null,
    stressScore: reading.stressScore,
    respRate: reading.respRate,
    source: reading.source,
  };
}

export async function ingest(readings: Reading[]): Promise<{ inserted: number }> {
  const { data } = await api.post<{ inserted: number }>('/biometric/ingest', {
    readings: readings.map(toPayload),
  });
  return data;
}

/**
 * Amostra recuperada da MEMÓRIA da pulseira — dos dias em que o celular não
 * estava por perto. Difere de `Reading` num ponto: pode não ter batimento
 * (um dia antigo pode ter só passos ou só estresse naquela janela).
 */
export type MemoryReading = {
  recordedAt: number;
  heartRate?: number | null;
  spo2Pct?: number | null;
  steps?: number | null;
  stressScore?: number | null;
};

export async function ingestMemory(readings: MemoryReading[]): Promise<{ inserted: number }> {
  const { data } = await api.post<{ inserted: number }>('/biometric/ingest', {
    readings: readings.map((r) => ({
      recordedAt: new Date(r.recordedAt).toISOString(),
      heartRate: r.heartRate != null ? Math.round(r.heartRate) : null,
      spo2Pct: r.spo2Pct ?? null,
      steps: r.steps ?? null,
      stressScore: r.stressScore ?? null,
      source: 'staranb',
    })),
  });
  return data;
}

/**
 * Última leitura registrada no servidor.
 *
 * O endpoint existia desde sempre e ninguém o consumia — por isso a tela abria
 * vazia e só ganhava número quando uma leitura NOVA chegava da pulseira. Não
 * havia nada de mocado ali: havia ausência.
 */
export async function fetchLatestReading(): Promise<Reading | null> {
  const { data } = await api.get<Record<string, unknown> | null>('/biometric/latest');
  if (!data) return null;

  const num = (v: unknown): number | null => (typeof v === 'number' ? v : null);
  return {
    recordedAt: new Date(String(data.recordedAt)).getTime(),
    // `heartRate` não é anulável no domínio: sem ele a leitura não existe.
    heartRate: num(data.heartRate) ?? 0,
    hrvMs: num(data.hrvMs),
    spo2Pct: num(data.spo2Pct),
    // O servidor chama `temperature`; o domínio deixa a unidade no nome.
    temperatureC: num(data.temperature),
    steps: num(data.steps),
    bpSystolic: num(data.bpSystolic),
    bpDiastolic: num(data.bpDiastolic),
    stressScore: num(data.stressScore),
    respRate: num(data.respRate),
    source: (data.source as Reading['source']) ?? 'staranb',
  };
}

export type DailySummary = {
  /** `YYYY-MM-DD` no fuso do aparelho. */
  day: string;
  readings: number;
  heart_rate: number | null;
  heart_rate_min: number | null;
  heart_rate_max: number | null;
  hrv_ms: number | null;
  spo2_pct: number | null;
  spo2_min: number | null;
  stress_score: number | null;
  bp_systolic: number | null;
  bp_diastolic: number | null;
  steps: number | null;
  energy_score: number | null;
  sleep_score: number | null;
  sleep_minutes: number | null;
};

/**
 * Grava a noite no hábito do dia. É o que faz o sono existir no HISTÓRICO:
 * a série da tela mora no aparelho, mas o resumo por dia vem do servidor.
 * Fire-and-forget — perder um envio custa menos que travar a sincronização.
 */
export type DailyHabitRow = {
  date: string;
  waterMl: number;
  sleepScore: number | null;
  sleepMinutes: number | null;
};

/** Os últimos `days` dias de hábitos — é onde o sono de cada noite fica guardado. */
export async function fetchHabitsHistory(days = 14): Promise<DailyHabitRow[]> {
  const { data } = await api.get<DailyHabitRow[]>('/habits', { params: { days } });
  return data;
}

export function pushSleepNight(night: { date: string; score: number; totalMin: number }): void {
  if (!isAuthenticated()) return;
  void api
    .put('/habits', {
      date: night.date,
      sleepScore: night.score,
      sleepMinutes: Math.round(night.totalMin),
    })
    .catch(() => undefined);
}

/**
 * Resumo por dia, para a faixa de histórico.
 *
 * O deslocamento de fuso vai junto porque o servidor roda em UTC: sem ele, o
 * que a pessoa mediu às 22h apareceria no dia seguinte.
 */
export async function fetchDailyHistory(days = 30): Promise<DailySummary[]> {
  // `getTimezoneOffset` devolve o INVERSO do que se espera — no Brasil dá +180,
  // não -180. O sinal é trocado aqui para o servidor somar, não subtrair.
  const tzOffset = -new Date().getTimezoneOffset();
  const { data } = await api.get<DailySummary[]>('/biometric/daily', { params: { days, tzOffset } });
  return data;
}

export type CycleEntry = { startedAt: string; durationDays: number | null };

/**
 * Ciclos registrados.
 *
 * O servidor recusa com 403 quem não tem sexo biológico feminino no cadastro —
 * o filtro não é só de interface. Aqui isso vira lista vazia, porque a tela nem
 * deveria ter sido alcançada.
 */
export async function fetchCycles(months = 12): Promise<CycleEntry[]> {
  const { data } = await api.get<CycleEntry[]>('/cycle', { params: { months } });
  return data;
}

export async function fetchCycleConsent(): Promise<boolean> {
  const { data } = await api.get<{ granted: boolean }>('/cycle/consent');
  return data.granted;
}

/** Revogar APAGA os ciclos no servidor — é o que o backend faz e a tela avisa. */
export async function setCycleConsent(granted: boolean): Promise<void> {
  await api.put('/cycle/consent', { granted, version: CONSENT_VERSION });
}

export async function logCycle(startedAt: string, durationDays: number | null = null): Promise<CycleEntry> {
  const { data } = await api.post<CycleEntry>('/cycle', { startedAt, durationDays });
  return data;
}

export async function deleteCycle(startedAt: string): Promise<void> {
  await api.delete(`/cycle/${startedAt}`);
}

export async function fetchBaseline(): Promise<{ hrvMs: number | null; calibrating: boolean }> {
  const { data } = await api.get<{ hrvMs: number | null; calibrating: boolean }>('/biometric/baseline');
  return data;
}

/**
 * Um ponto por HORA, agregado no servidor. Até 720 horas — trinta dias.
 *
 * É a fonte do histórico por dia: a memória da pulseira guarda sete dias e
 * exige uma consulta serial por dia, enquanto isto vem numa requisição só e
 * cobre o mês. Hora a hora é grosso para a curva de HOJE (a pulseira mede a
 * cada cinco minutos), e é exatamente o que se precisa de um dia passado.
 */
export type HourlyPoint = {
  /** Início da hora, em ISO. */
  hour: string;
  hrv_ms: number | null;
  heart_rate: number | null;
  heart_rate_min: number | null;
  heart_rate_max: number | null;
  spo2_pct: number | null;
  temperature: number | null;
  steps: number | null;
  stress_score: number | null;
};

export async function fetchSeries(hours = 24): Promise<HourlyPoint[]> {
  const { data } = await api.get<HourlyPoint[]>('/biometric/series', { params: { hours } });
  return data;
}

export type ModelInsight = {
  eyebrow: string;
  headline: string;
  detail: string;
  nextLabel: string | null;
  nextHour: number | null;
  action: {
    key: 'play' | 'calendar' | 'drop' | 'dumbbell' | 'footprints' | 'flame';
    label: string;
  };
  driverKey: string | null;
  driverLabel: string | null;
  /** Frase vinda do perfil de rotina. Ausente sem onboarding respondido. */
  context: string | null;
  source: string;
};

export type EnergyFromModel = {
  score: number;
  level: 'high' | 'mid' | 'low';
  calibrating: boolean;
  chronotype: string;
  curve: { hour: number; score: number }[];
  components: { key: string; label: string; norm: number; value: string; assumed: boolean }[];
  insight: ModelInsight;
};

/**
 * Score e insight calculados pelo modelo.
 *
 * A HORA vai no parâmetro porque ela é entrada do cálculo — o vale da tarde só
 * existe em relação ao relógio de quem está lendo, e o servidor roda em UTC.
 * Quem sabe a hora local é o aparelho.
 */
export async function fetchEnergyInsight(
  hour: number,
  force = false,
  /**
   * A água já registrada hoje NESTE aparelho.
   *
   * Vai junto porque o servidor só conhece o que subiu, e o resumo de saúde
   * citava um número que o indicador logo abaixo contradizia na mesma tela.
   */
  waterMl?: number,
): Promise<EnergyFromModel> {
  const { data } = await api.get<EnergyFromModel>('/insights/energy', {
    params: {
      hour,
      ...(force ? { force: 1 } : {}),
      ...(waterMl != null && waterMl > 0 ? { water_ml: Math.round(waterMl) } : {}),
    },
  });
  return data;
}

export type LifestyleProfile = {
  occupation: string | null;
  workPosture: 'sitting' | 'standing' | 'alternating' | 'moving' | null;
  postureHours: number | null;
  workSchedule: 'business' | 'shifts' | 'night' | 'flexible' | null;
  bedtime: number | null;
  exercises: 'regular' | 'sometimes' | 'none' | null;
  blocker: string | null;
  activities: string[];
  trainDays: number[];
  trainPeriod: string | null;
  trainPlace: string | null;
  goal: string | null;
  completedAt: string | null;
};

export async function fetchLifestyle(): Promise<LifestyleProfile | null> {
  const { data } = await api.get<LifestyleProfile | null>('/lifestyle');
  return data;
}

/**
 * Grava o que já foi respondido, uma resposta por vez.
 *
 * Onboarding é onde mais se abandona: quem parou na quarta pergunta e voltou
 * amanhã não pode ser obrigado a recomeçar. Cada campo isolado já melhora uma
 * sugestão, então o progresso parcial vale por si.
 */
export async function saveLifestyle(
  patch: Record<string, unknown> & { completed?: boolean }): Promise<LifestyleProfile> {
  const { data } = await api.put<LifestyleProfile>('/lifestyle', patch);
  return data;
}

// ==========================================================================
// TREINO
//
// A geração leva de 50 a 120 segundos — duas chamadas de modelo sobre o
// catálogo inteiro. Por isso ela é assíncrona: `requestPlanGeneration` devolve
// um id na hora e `fetchGenerationStatus` é consultado até terminar. Um POST
// que segurasse a conexão por dois minutos morreria em qualquer proxy do
// caminho, e o app ficaria com "sem conexão" numa geração que deu certo.
// ==========================================================================

export type Anamnesis = Record<string, unknown>;

/**
 * Consentimento de uso dos dados de saúde para treino.
 *
 * Separado do de biometria de propósito: aceitar que o app leia o HRV não é
 * aceitar que ele guarde que você é cardiopata. Revogar apaga a anamnese e os
 * planos gerados a partir dela.
 */
export async function fetchWorkoutConsent(): Promise<boolean> {
  const { data } = await api.get<{ granted: boolean }>('/workout/consent');
  return data.granted;
}

export async function setWorkoutConsent(granted: boolean): Promise<void> {
  await api.put('/workout/consent', { granted, version: CONSENT_VERSION });
}

export async function fetchAnamnesis(): Promise<{ answers: Anamnesis; updatedAt: string } | null> {
  const { data } = await api.get('/workout/anamnesis');
  return data;
}

export async function saveAnamnesis(answers: Anamnesis): Promise<void> {
  await api.put('/workout/anamnesis', answers);
}

export type GenerationStatus = {
  id: string;
  status: 'PENDING' | 'RUNNING' | 'DONE' | 'REFERRAL' | 'BLOCKED' | 'FAILED';
  trainingPlanId: string | null;
  finished: boolean;
  /** Frase pronta para a tela. Vem do servidor de propósito — ver a rota. */
  message: string | null;
  /** Código do motivo. A tela decide por ele se oferece "tentar de novo". */
  reason: string | null;
};

export async function requestPlanGeneration(feedback?: string): Promise<string> {
  const { data } = await api.post<{ requestId: string }>('/workout/plan/generate', { feedback });
  return data.requestId;
}

export async function fetchGenerationStatus(requestId: string): Promise<GenerationStatus> {
  const { data } = await api.get<GenerationStatus>(`/workout/plan/generate/${requestId}`);
  return data;
}

export type PlanDay = {
  id: string;
  dayOfWeek: string;
  dayType: 'WORKOUT' | 'OFF';
  workout: {
    id: string;
    name: string;
    /** Slug da modalidade do dia; null = plano anterior à fusão (musculação). */
    modality: string | null;
    muscleGroups: string[];
    estimatedDuration: number | null;
    exerciseCount: number;
  } | null;
};

export type TrainingPlan = {
  id: string;
  name: string;
  goal: string | null;
  level: string | null;
  rationale: string | null;
  /**
   * O que o avaliador de segurança exigiu conter neste plano.
   *
   * Vazio na esmagadora maioria dos casos. Quando tem conteúdo, é porque o
   * plano foi revisado para caber num limite — e a pessoa precisa saber disso,
   * senão recebe um treino mais conservador sem explicação.
   */
  revisionNotes?: string[];
  startDate: string;
  endDate: string;
  /** Dia da semana no fuso da pessoa, resolvido no servidor. */
  today: string;
  days: PlanDay[];
};

export async function fetchActivePlan(): Promise<TrainingPlan | null> {
  const { data } = await api.get<TrainingPlan | null>('/workout/plan/active');
  return data;
}

export type PrescribedSet = {
  order: number;
  repetitions: string;
  restTime: number | null;
  load: number | null;
};

export type WorkoutExercise = {
  id: string;
  exerciseId: string;
  name: string;
  description: string | null;
  muscleGroup: string;
  equipment: string;
  /** Vídeo demonstrativo do catálogo do MUVX, quando há. */
  videoUrl: string | null;
  thumbnailUrl: string | null;
  subtype: 'STRENGTH' | 'CARDIO' | 'MOBILITY';
  notes: string | null;
  duration: number | null;
  intensity: string | null;
  holdTime: number | null;
  /** Carga da última sessão deste exercício. É o que a tela pré-preenche. */
  lastLoad: number | null;
  sets: PrescribedSet[];
};

export type WorkoutPhase = {
  type: 'ALONGAMENTO' | 'TREINO' | 'CARDIO';
  order: number;
  exercises: WorkoutExercise[];
};

export type WorkoutDetail = {
  id: string;
  name: string;
  /** Slug da modalidade do dia; null = plano anterior à fusão (musculação). */
  modality: string | null;
  muscleGroups: string[];
  estimatedDuration: number | null;
  phases: WorkoutPhase[];
};

export async function fetchWorkout(workoutId: string): Promise<WorkoutDetail> {
  const { data } = await api.get<WorkoutDetail>(`/workout/${workoutId}`);
  return data;
}

export type SimilarExercise = {
  id: string;
  name: string;
  muscle_group: string;
  equipment: string;
  level: string;
  type: string;
  /** Descrição e vídeo do substituto: sem eles a tela ficava com os do anterior. */
  description?: string | null;
  video_url?: string | null;
  thumbnail_url?: string | null;
  /** A última carga desta pessoa NESTE exercício. `null` quando nunca registrou. */
  last_load?: number | null;
};

/**
 * Fixa a troca no plano, para os próximos treinos deste dia.
 *
 * A troca durante a sessão continua sendo local; isto é o "para valer", e só é
 * chamado quando a pessoa pede explicitamente na folha de troca. O servidor só
 * aceita substituto da lista de similares que ele mesmo ofereceu.
 */
export async function trocarExercicioNoPlano(
  workoutExerciseId: string,
  exerciseId: string): Promise<void> {
  await api.patch(`/workout/plan/exercise/${workoutExerciseId}`, { exerciseId });
}

/**
 * O comentário do treino recém-concluído, redigido pelo modelo.
 *
 * `null` quando não há: modelo fora, sem crédito, sessão sem duração. A tela
 * não mostra o bloco, e é melhor assim do que uma frase genérica dando a
 * entender que alguém leu os números da sessão.
 */
// ============================================================================
// Imagens — todas no S3 (decisão da fundadora, 01/09/2026)
// ============================================================================

export type EscopoDeImagem = 'chat' | 'refeicao' | 'evolucao' | 'perfil';

/** A URL para SUBIR uma imagem, mais a chave que a identifica daqui em diante. */
export async function presignImagem(
  escopo: EscopoDeImagem,
  ext: 'jpg' | 'png' = 'jpg'): Promise<{ uploadUrl: string; key: string; contentType: string }> {
  const { data } = await api.post('/media/presign', { escopo, ext });
  return data;
}

/** A URL para LER uma imagem. Vale uma hora; quem exibe pede de novo quando precisa. */
export async function urlDaImagem(key: string): Promise<string | null> {
  try {
    const { data } = await api.get<{ url: string }>('/media/url', { params: { key } });
    return data.url;
  } catch {
    return null;
  }
}

/** Várias de uma vez: uma lista de refeições pediria uma requisição por foto. */
export async function urlsDasImagens(keys: string[]): Promise<Record<string, string>> {
  if (keys.length === 0) return {};
  try {
    const { data } = await api.post<{ urls: Record<string, string> }>('/media/urls', { keys });
    return data.urls;
  } catch {
    return {};
  }
}

export type FotoDeEvolucaoRemota = {
  id: string;
  angle: 'frente' | 'lado' | 'costas' | null;
  takenAt: string;
  /** URL assinada, válida por uma hora. `null` se a imagem sumiu do bucket. */
  url: string | null;
};

/** Se há consentimento ativo para guardar foto de corpo na nuvem. */
export async function fetchProgressPhotoConsent(): Promise<boolean> {
  try {
    const { data } = await api.get<{ granted: boolean }>('/progress-photos/consent');
    return data.granted;
  } catch {
    return false;
  }
}

/** Concede ou revoga. Revogar APAGA as fotos, no servidor e no bucket. */
export async function setProgressPhotoConsent(granted: boolean): Promise<boolean> {
  const { data } = await api.put<{ granted: boolean }>('/progress-photos/consent', {
    granted,
    version: CONSENT_VERSION,
  });
  return data.granted;
}

export async function fetchProgressPhotos(): Promise<FotoDeEvolucaoRemota[]> {
  const { data } = await api.get<{ fotos: FotoDeEvolucaoRemota[] }>('/progress-photos');
  return data.fotos;
}

export async function addProgressPhoto(input: {
  imageKey: string;
  angle?: 'frente' | 'lado' | 'costas';
  takenAt?: string;
}): Promise<FotoDeEvolucaoRemota> {
  const { data } = await api.post<FotoDeEvolucaoRemota>('/progress-photos', input);
  return data;
}

export async function deleteProgressPhoto(id: string): Promise<void> {
  await api.delete(`/progress-photos/${id}`);
}

export async function fetchSessionFeedback(
  executionId: string): Promise<{ headline: string; body: string } | null> {
  const { data, status } = await api.get<{ headline: string; body: string } | ''>(
    `/workout/execution/${executionId}/feedback`,
    { timeout: 30_000 });
  return status === 204 || !data ? null : data;
}

export async function fetchSimilarExercises(exerciseId: string): Promise<SimilarExercise[]> {
  const { data } = await api.get<SimilarExercise[]>(`/workout/exercise/${exerciseId}/similar`);
  return data;
}

export type Execution = {
  id: string;
  workoutId: string;
  workoutName: string;
  estimatedDuration?: number | null;
  startedAt: string;
};

/**
 * Fonte ÚNICA do estado "treino em andamento".
 *
 * Toda tela que precisa saber disso consulta esta função, e nenhuma mantém a
 * própria versão. Sem isso, a home e o check-in discordam sobre se há treino
 * aberto, e o rótulo do botão muda de tela para tela.
 */
export async function fetchCurrentExecution(): Promise<Execution | null> {
  const { data } = await api.get<Execution | null>('/workout/execution/current');
  return data;
}

export async function startExecution(workoutId: string, planDayId?: string): Promise<Execution> {
  const { data } = await api.post<Execution>('/workout/execution', { workoutId, planDayId });
  return data;
}

export async function recordSet(
  executionId: string,
  progress: {
    workoutExerciseId: string;
    setOrder: number;
    load?: number | null;
    repetitions?: number | null;
    completed: boolean;
  }): Promise<void> {
  await api.patch(`/workout/execution/${executionId}`, progress);
}

export type FinishedExecution = {
  id: string;
  workoutName: string;
  durationSec: number | null;
  completionPct: number | null;
  finishedAt: string;
};

export async function finishExecution(
  executionId: string,
  params: { perceivedEffort?: number | null; rating?: number | null; comment?: string | null }): Promise<FinishedExecution> {
  const { data } = await api.post<FinishedExecution>(`/workout/execution/${executionId}/finish`, params);
  return data;
}

export async function cancelExecution(executionId: string): Promise<void> {
  await api.delete(`/workout/execution/${executionId}`);
}

export type ExecutionHistoryItem = {
  id: string;
  workoutName: string;
  muscleGroups: string[];
  status: 'IN_PROGRESS' | 'FINISHED' | 'CANCELLED' | 'AUTO_CLOSED';
  startedAt: string;
  durationSec: number | null;
  completionPct: number | null;
  rating: number | null;
};

/** Uma série efetivamente registrada. `load` em kg, `repetitions` em contagem. */
export type ExecutedSet = {
  order: number;
  load: number | null;
  repetitions: number | null;
  completed: boolean;
};

export type ExecutionDetail = {
  id: string;
  workoutName: string;
  muscleGroups: string[];
  status: ExecutionHistoryItem['status'];
  startedAt: string;
  finishedAt: string | null;
  durationSec: number | null;
  completionPct: number | null;
  perceivedEffort: number | null;
  rating: number | null;
  comment: string | null;
  phases: {
    type: 'ALONGAMENTO' | 'TREINO' | 'CARDIO';
    exercises: {
      id: string;
      name: string;
      subtype: 'STRENGTH' | 'CARDIO' | 'MOBILITY';
      /** Quantas o plano pedia. É o denominador que dá sentido ao executado. */
      prescribedSets: number;
      sets: ExecutedSet[];
    }[];
  }[];
};

/** Um turno da entrevista. */
export type InterviewTurn = {
  role: 'ASSISTANT' | 'STUDENT';
  type: 'TEXT' | 'OPTION';
  content: string;
  questionId: string | null;
  at: string;
};

export type InterviewState = {
  id: string;
  status: 'ACTIVE' | 'COMPLETED' | 'ABANDONED';
  messages: InterviewTurn[];
  pendingQuestion: {
    questionId: string;
    type: 'TEXT' | 'NUMBER' | 'MULTIPLE_CHOICE' | 'YES_NO';
    label: string;
    ask: string;
    options: string[] | null;
    isRequired: boolean;
  } | null;
  filledFields: {
    questionId: string;
    label: string;
    type: string;
    value: string;
    options: string[] | null;
    order: number;
  }[];
  progress: number;
  readyToFinalize: boolean;
};

export async function startInterview(): Promise<InterviewState> {
  const { data } = await api.post<InterviewState>('/workout/anamnesis/conversation');
  return data;
}

export async function answerInterview(id: string, value: string): Promise<InterviewState> {
  const { data } = await api.post<InterviewState>(
    `/workout/anamnesis/conversation/${id}/answer`,
    { value });
  return data;
}

export async function editInterviewAnswer(
  id: string,
  questionId: string,
  value: string): Promise<InterviewState> {
  const { data } = await api.patch<InterviewState>(
    `/workout/anamnesis/conversation/${id}/answer`,
    { questionId, value });
  return data;
}

export async function finalizeInterview(id: string): Promise<void> {
  await api.post(`/workout/anamnesis/conversation/${id}/finalize`);
}

/** O relatório de progresso. Espelha o `buildDashboard` do backend. */
export type WorkoutDashboard = {
  summary: {
    totalWorkouts: number;
    totalSeries: number;
    totalReps: number;
    totalDuration: number;
    /** kg × reps, somado. É o número que responde progressão. */
    volumeLoad: number;
  };
  muscleDistribution: { muscleGroup: string; volume: number; series: number }[];
  exercisesDetail: {
    name: string;
    muscleGroup: string;
    series: number;
    reps: number;
    volume: number;
    maxLoad: number | null;
  }[];
  volumeEvolution: { day: string; volume: number; series: number }[];
};

/** Intervalo explícito (AAAA-MM-DD, inclusivo) — o "escolher no calendário" (ago/2026). */
export type JanelaDeDatas = { from: string; to: string };

export async function fetchDashboard(days: 1 | 7 | 30 | 90, janela?: JanelaDeDatas): Promise<WorkoutDashboard> {
  const { data } = await api.get<WorkoutDashboard>('/workout/dashboard', { params: { days, ...janela } });
  return data;
}

/** Uma versão guardada das respostas de anamnese. */
export type AnamnesisVersion = {
  id: string;
  createdAt: string;
  /** Bandeiras clínicas congeladas na época. A lista só usa a CONTAGEM. */
  flags: string[];
};

export async function fetchAnamnesisHistory(): Promise<AnamnesisVersion[]> {
  const { data } = await api.get<AnamnesisVersion[]>('/workout/anamnesis/history');
  return data;
}

export async function fetchAnamnesisVersion(
  id: string): Promise<AnamnesisVersion & { answers: Record<string, unknown> }> {
  const { data } = await api.get<AnamnesisVersion & { answers: Record<string, unknown> }>(
    `/workout/anamnesis/history/${id}`);
  return data;
}

export type MorningForecast = { temperatureC: number; humidityPct: number; hour: string };

export async function fetchMorningForecast(lat: number, lon: number): Promise<MorningForecast> {
  const { data } = await api.get<MorningForecast>('/weather/morning', { params: { lat, lon } });
  return data;
}

export type ChatTurn = {
  role: 'user' | 'assistant';
  content: string;
  /** O caminho local da imagem, resolvido a partir de `imageRef`. */
  imagemUri?: string;
  /**
   * O NOME do arquivo da foto no aparelho, quando a mensagem teve uma.
   *
   * A imagem não sobe: fica no aparelho, como a da refeição e a de evolução. O
   * servidor guarda este ponteiro, que é o que devolve a foto à bolha certa
   * quando a conversa é reaberta. Em outro aparelho o arquivo não existe, e a
   * bolha diz que houve uma foto.
   */
  imageRef?: string;
};

export type ChatReply = {
  reply: string;
  blocked: boolean;
  blockReason: string | null;
  /** Quantas mudanças o agente propôs. O diff em si fica no servidor. */
  operationCount: number;
  /**
   * A proposta guardada, para o botão de confirmar aplicar.
   *
   * `null` quando não há o que confirmar — recusa, encaminhamento ou pergunta
   * conversacional. O diff NUNCA vem para o app: mandar operações daqui de volta
   * ao servidor abriria caminho para escrever no plano por fora das travas
   * clínicas, então o que viaja é só o identificador do que a pessoa leu.
   */
  adjustmentId: string | null;
};

export type ApplyAdjustmentReply = {
  applied: number;
  /** Frase pronta quando a proposta envelheceu. `null` em caso de sucesso. */
  failReason: string | null;
};

/** Confirma a proposta do chat e a aplica no plano. */
/**
 * Teto do chat com o Personal — há uma ida ao modelo no meio.
 *
 * O padrão do cliente é 10 s, e o chat leva 6 a 10 s em produção (medido no
 * log de acesso: 6,5 s, 8,2 s, e duas conversas cortadas EXATAMENTE em 10,0 s
 * com status 0 — o app desligando na cara do servidor). Para quem mandou a
 * mensagem, "agente sem responder"; para o servidor, uma resposta entregue a
 * ninguém. O mesmo teto da análise de refeição, que é outra chamada ao modelo.
 */
const TETO_DO_AGENTE_MS = 90_000;

export async function applyAdjustment(adjustmentId: string): Promise<ApplyAdjustmentReply> {
  const { data } = await api.post<ApplyAdjustmentReply>(
    '/workout/chat/apply',
    { adjustmentId },
    { timeout: TETO_DO_AGENTE_MS });
  return data;
}

export async function chatWithAgent(
  message: string,
  imageBase64?: string,
  /** Nome do arquivo já salvo no aparelho, para o histórico reencontrá-lo. */
  imageRef?: string): Promise<ChatReply> {
  /*
   O histórico não vai mais junto: a conversa vive no servidor desde 24/08/2026,
   e é ele que monta o contexto. Mandar daqui era pedir ao aparelho que
   lembrasse por todo mundo, e a conversa morria ao fechar a tela.
  */
  /*
   O teto do agente vale AQUI também, e é o que faltava.

   Ele foi criado com o comentário certo e aplicado só no `apply`, que é a
   chamada RÁPIDA: quem conversa com o modelo é esta. Um ajuste que precisa de
   segunda tentativa de formato passa dos 10 s do padrão, e o app desligava na
   cara do servidor. O log de acesso mostra a assinatura: `POST 0` com duração
   exatamente 10,0 s, e o serviço de modelo respondendo 200 nove segundos
   depois, com três operações prontas que ninguém recebeu (Leonardo,
   01/09/2026: "personal agente não funcionou").
  */
  const { data } = await api.post<ChatReply>(
    '/workout/chat',
    // `mediaType` não vai: o preparo da foto sempre salva JPEG, e o servidor
    // assume isso na ausência do campo.
    imageBase64 ? { message, imageBase64, ...(imageRef ? { imageRef } : {}) } : { message },
    { timeout: TETO_DO_AGENTE_MS },
  );
  return data;
}

/** A conversa guardada, para a tela abrir de onde parou. */
export async function fetchChatHistory(): Promise<ChatTurn[]> {
  const { data } = await api.get<{ turnos: ChatTurn[] }>('/workout/chat');
  return data.turnos ?? [];
}

export async function fetchExecutionDetail(id: string): Promise<ExecutionDetail> {
  const { data } = await api.get<ExecutionDetail>(`/workout/execution/${id}/detail`);
  return data;
}

export async function fetchExecutionHistory(days = 30, janela?: JanelaDeDatas): Promise<ExecutionHistoryItem[]> {
  const { data } = await api.get<ExecutionHistoryItem[]>('/workout/execution/history', {
    params: { days, ...janela },
  });
  return data;
}

// ============================================================================
// Refeições — análise por foto. A imagem NÃO é armazenada; o resultado sim.
// ============================================================================

export type MealFood = {
  name: string;
  portion: string;
  grams: number | null;
  kcal_min: number;
  kcal_max: number;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  uncertain: boolean;
  /** Nome oficial da tabela TACO quando a caloria veio dela. */
  matched: string | null;
};

export type MealRecord = {
  id: string;
  at: string;
  foods: MealFood[];
  kcalMin: number;
  kcalMax: number;
  confidence: number;
  notes: string | null;
  /** A chave da foto no S3. Nula nas refeições anteriores a 01/09/2026. */
  imageKey?: string | null;
};

export type MealAnalysis = {
  is_food: boolean;
  foods: MealFood[];
  kcal_total_min: number;
  kcal_total_max: number;
  confidence: number;
  notes: string;
};

export async function analyzeMeal(input: {
  imageBase64: string;
  mediaType?: string;
  description?: string;
  /** A chave da foto já subida ao S3, para ela sobreviver na tela. */
  imageKey?: string;
}): Promise<{ record: MealRecord | null; analysis: MealAnalysis }> {
  const { data } = await api.post('/nutrition/meal', input, { timeout: 90_000 });
  return data;
}

export async function fetchMeals(days = 7): Promise<MealRecord[]> {
  const { data } = await api.get<MealRecord[]>('/nutrition/meals', { params: { days } });
  return data;
}

export async function deleteMeal(id: string): Promise<void> {
  await api.delete(`/nutrition/meal/${id}`);
}

/** Edição calibrada: nome e gramas novos repassam pela TACO no servidor. */
export async function updateMealFoods(
  id: string,
  foods: Partial<MealFood>[]): Promise<MealRecord> {
  const { data } = await api.patch(`/nutrition/meal/${id}`, { foods });
  return data.record;
}

export type TacoFood = {
  description: string;
  kcal_per_100g: number;
  protein_g_per_100g: number | null;
  carbs_g_per_100g: number | null;
  fat_g_per_100g: number | null;
};

/** Autocompletar da TACO — "frang" acha "Frango, …" antes de terminar a palavra. */
export async function searchFoods(q: string): Promise<TacoFood[]> {
  const { data } = await api.get<{ foods: TacoFood[] }>('/nutrition/foods', { params: { q } });
  return data.foods;
}

/** Reanalisa a MESMA refeição com a foto local e a observação da pessoa. */
export async function reanalyzeMeal(
  id: string,
  input: { imageBase64: string; mediaType?: string; description?: string }): Promise<{ record: MealRecord | null; analysis: MealAnalysis }> {
  const { data } = await api.post(`/nutrition/meal/${id}/reanalyze`, input, { timeout: 90_000 });
  return data;
}

// ============================================================================
// Ditado por voz — presign → upload direto ao S3 → job do Transcribe → texto.
// ============================================================================

export async function presignAudio(format = 'm4a'): Promise<{ uploadUrl: string; key: string }> {
  const { data } = await api.post('/transcribe/presign', { format });
  return data;
}

export async function startTranscription(key: string, format = 'm4a'): Promise<{ jobName: string }> {
  const { data } = await api.post('/transcribe/start', { key, format });
  return data;
}

export async function getTranscription(
  jobName: string): Promise<{ status: 'TRANSCRIBING' | 'DONE' | 'FAILED';
  reason?: string; transcript?: string }> {
  const { data } = await api.get(`/transcribe/${jobName}`);
  return data;
}

// ============================================================================
// Esporte — agregados na listagem; o percurso sobe SIMPLIFICADO (≤300 pontos,
// ~1 m) e só viaja no detalhe — política de ago/2026, para o histórico
// desenhar o mapa em qualquer aparelho.
// ============================================================================

export type SportSession = {
  id: string;
  sport: string;
  startedAt: string;
  durationS: number;
  distanceM: number | null;
  kcal: number;
  avgHr: number | null;
  maxHr: number | null;
  /** Execução do plano que esta sessão cumpriu; null = sessão avulsa. */
  workoutExecutionId?: string | null;
  /** "Como foi" da sessão avulsa; vinculada guarda na execução. */
  perceivedEffort?: number | null;
  rating?: number | null;
  comment?: string | null;
  /** O percurso simplificado. Presente só no detalhe (`fetchSportSession`). */
  track?: { lat: number; lon: number }[] | null;
};

/** A sessão com o percurso — o que desenha o mapa do histórico. */
/**
 * O texto da notificação matinal, redigido pela IA no servidor.
 *
 * O aparelho manda a previsão (ele já a consulta para o cartão de ambiente) e
 * o servidor acrescenta o que só ele sabe: o plano de amanhã e a sequência de
 * movimento. Quem AGENDA continua sendo o celular — a entrega é local, só a
 * redação é remota.
 */
export type MorningGreeting = { title: string; body: string; source: 'llm' | 'template' };

export async function fetchMorningGreeting(input: {
  temperature: number;
  humidity: number;
  city: string | null;
  /** Os últimos textos entregues, para o modelo não repetir. */
  recent?: string[];
}): Promise<MorningGreeting> {
  const { data } = await api.get<MorningGreeting>('/insights/morning', {
    params: {
      temperature: Math.round(input.temperature),
      humidity: Math.round(input.humidity),
      city: input.city ?? undefined,
      recent: input.recent?.length ? input.recent.slice(0, 7).join('\u001f') : undefined,
    },
  });
  return data;
}

export async function fetchSportSession(id: string): Promise<SportSession> {
  const { data } = await api.get<SportSession>(`/sport/session/${id}`);
  return data;
}

/** O "como foi" de uma sessão avulsa — mesma pergunta do treino guiado. */
export async function updateSportSession(
  id: string,
  feedback: { perceivedEffort?: number | null; rating?: number | null; comment?: string | null }): Promise<void> {
  await api.patch(`/sport/session/${id}`, feedback);
}

export async function saveSportSession(input: {
  sport: string;
  startedAt: string;
  durationS: number;
  distanceM: number | null;
  kcal: number;
  avgHr: number | null;
  maxHr: number | null;
  workoutExecutionId?: string | null;
  track?: { lat: number; lon: number }[] | null;
}): Promise<SportSession> {
  const { data } = await api.post<SportSession>('/sport/session', input);
  return data;
}

export async function fetchSportSessions(days = 30, janela?: JanelaDeDatas): Promise<SportSession[]> {
  const { data } = await api.get<SportSession[]>('/sport/sessions', { params: { days, ...janela } });
  return data;
}

/** O resumo semanal redigido pelo modelo. Sem modelo, o servidor responde 503 e não há texto. */
export type WeeklyReport = {
  headline: string;
  resumo: string;
  acoes: { titulo: string; porque: string }[];
};
export async function fetchWeeklyReport(): Promise<WeeklyReport> {
  const { data } = await api.get<WeeklyReport>('/insights/weekly', { timeout: 20_000 });
  return data;
}
