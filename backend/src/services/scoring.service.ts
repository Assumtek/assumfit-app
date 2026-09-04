import { createHash } from 'node:crypto';
import { waterGoalMl } from './water-goal';

import axios from 'axios';

import { env } from '../lib/env';
import { logError } from '../lib/log';
import { prisma } from '../lib/prisma';
import { hrvBaseline, latestReading } from './biometric.service';
import { activePlan, localDayOfWeek } from './workout/execution';

/**
 * Monta as entradas do modelo a partir do banco, chama o Python e persiste.
 *
 * Existe como serviço, e não dentro da rota, porque dois caminhos precisam
 * exatamente da mesma coisa: a tela inicial pedindo o insight agora, e o job
 * horário gravando o histórico. Duplicar isso levaria os dois a divergirem em
 * silêncio — e como um deles grava o que o outro lê, a divergência apareceria
 * como correlação errada meses depois.
 */

export type Component = {
  key: string;
  label: string;
  norm: number;
  weight: number;
  value: string;
  assumed: boolean;
  deficit: number;
};

export type HomeInsight = {
  eyebrow: string;
  headline: string;
  detail: string;
  nextLabel: string | null;
  nextHour: number | null;
  action: { key: 'play' | 'calendar' | 'drop'; label: string };
  driverKey: string | null;
  driverLabel: string | null;
  context: string | null;
  source: string;
};

export type EnergyResponse = {
  score: number;
  level: 'high' | 'mid' | 'low';
  calibrating: boolean;
  chronotype: string;
  curve: { hour: number; score: number }[];
  components: Component[];
  base: number;
  calibration_days: number;
  insight: HomeInsight;
};

/**
 * Fuso padrão, em minutos. Só vale quando a conta não tem o dela.
 *
 * A hora do dia é entrada do modelo — o vale das 14h só existe em relação ao
 * relógio da pessoa. O servidor roda em UTC, então `getHours()` daria um insight
 * três horas adiantado para todo mundo. O app manda a hora local quando
 * pergunta; o job noturno, que não tem ninguém a quem perguntar, usa o fuso
 * gravado no cadastro — antes era esta constante para a base inteira, e quem
 * viajasse recebia a curva do fuso errado até voltar.
 */
export const DEFAULT_TZ_OFFSET_MIN = -180;

export function localHour(offsetMinutes = DEFAULT_TZ_OFFSET_MIN, now = new Date()): number {
  const minutes = now.getUTCHours() * 60 + now.getUTCMinutes() + offsetMinutes;
  return Math.floor((((minutes % 1440) + 1440) % 1440) / 60);
}

/**
 * Meia-noite do dia LOCAL da pessoa, expressa no instante UTC correspondente.
 *
 * `setUTCHours(0,0,0,0)` recorta o dia em UTC, o que faz o dia do assinante
 * brasileiro virar às 21h. Água registrada às 22h caía no dia seguinte — e o
 * score da noite passava a ler "não bebeu nada hoje" para quem tinha batido a
 * meta duas horas antes.
 *
 * O recorte por fuso fixo é provisório e conhecidamente frágil: ver a nota
 * sobre ciclo fisiológico em PLANO.md.
 */
export function startOfLocalDay(offsetMinutes = DEFAULT_TZ_OFFSET_MIN, now = new Date()): Date {
  const shifted = new Date(now.getTime() + offsetMinutes * 60_000);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()));
}

/** Início da hora corrente em UTC — a granularidade de `EnergyScore`. */
/**
 * Piso entre duas redações da frase da home.
 *
 * Metade da granularidade da própria frase, que é por hora. Ver o bloco que o
 * usa, logo abaixo do cálculo do hash.
 */
export const INSIGHT_PISO_MS = 15 * 60 * 1000;

function hourStart(now = new Date()): Date {
  const start = new Date(now);
  start.setUTCMinutes(0, 0, 0);
  return start;
}

/**
 * Água e sono anotados hoje.
 *
 * Zero registrado e ausência de registro são coisas diferentes: a primeira é
 * "não bebi", a segunda é "não sei". Só a primeira pode pesar no score — por
 * isso `null` quando não existe a linha do dia, e não `0`.
 */
async function habitsToday(
  userId: string,
  tzOffsetMin: number): Promise<{ waterMl: number | null; sleepScore: number | null }> {
  const habit = await prisma.dailyHabit.findUnique({
    where: { userId_date: { userId, date: startOfLocalDay(tzOffsetMin) } },
    select: { waterMl: true, sleepScore: true },
  });
  return {
    waterMl: habit?.waterMl ?? null,
    sleepScore: habit?.sleepScore ?? null,
  };
}

/**
 * O DIA da pessoa até agora — o que tira o insight do genérico.
 *
 * A frase da home falava só de fisiologia e agenda porque era só isso que o
 * modelo enxergava. Aqui entram o treino do plano (feito ou pendente), o
 * esporte praticado, as refeições registradas e os passos — cada um lido do
 * banco na hora, para o botão Atualizar da home reler o dia de verdade.
 */
async function todayContext(userId: string, tzOffsetMin: number, steps: number | null) {
  const dayStart = startOfLocalDay(tzOffsetMin);
  const [sports, meals, plan, workoutsDone] = await Promise.all([
    prisma.sportSession.findMany({
      where: { userId, startedAt: { gte: dayStart } },
      orderBy: { startedAt: 'desc' },
      select: { sport: true, durationS: true },
    }),
    prisma.mealRecord.findMany({
      where: { userId, at: { gte: dayStart } },
      select: { kcalMin: true, kcalMax: true },
    }),
    activePlan(userId).catch(() => null),
    prisma.workoutExecution.count({
      where: { userId, status: 'FINISHED', finishedAt: { gte: dayStart } },
    }),
  ]);

  const planDay = plan?.days.find((d) => d.dayOfWeek === localDayOfWeek(tzOffsetMin));
  return {
    steps,
    sport_count: sports.length,
    last_sport: sports[0]
      ? { kind: sports[0].sport, minutes: Math.max(1, Math.round(sports[0].durationS / 60)) }
      : null,
    meals_count: meals.length,
    meals_kcal_mid: meals.length
      ? Math.round(meals.reduce((s, m) => s + (m.kcalMin + m.kcalMax) / 2, 0))
      : null,
    workout: planDay?.workout ? { name: planDay.workout.name, done: workoutsDone > 0 } : null,
  };
}

export type EnergyOptions = {
  hour?: number;
  persist?: boolean;
  force?: boolean;
  /**
   * A água que o APARELHO já registrou hoje, quando ele informa.
   *
   * O banco só tem o que subiu, e a tela mostra o que a pessoa acabou de
   * beber: o resumo dizia "0,2 L de 2,5 L" enquanto o indicador logo abaixo
   * dizia "13% da meta", com a mesma tela contando duas histórias (Leonardo,
   * 24/08/2026). Vence o MAIOR dos dois: água não diminui ao longo do dia, e
   * um app com estado velho não pode apagar o que o servidor já sabe.
   */
  waterMl?: number;
};

/**
 * A água do dia: a do banco contra a que o aparelho informa.
 *
 * Vence a MAIOR. Água não diminui ao longo do dia, então um app com estado
 * velho não pode apagar o que o servidor já sabe, e o servidor não pode
 * ignorar o copo que a pessoa acabou de registrar e que ainda não subiu, que
 * era o que fazia o resumo de saúde citar um volume contradito pelo indicador
 * da mesma tela (Leonardo, 24/08/2026).
 *
 * `null` é "não sei", e continua sendo quando nenhum dos dois lados sabe.
 */
export function aguaEfetiva(doBanco: number | null, doAparelho?: number): number | null {
  if (doAparelho == null || !Number.isFinite(doAparelho)) return doBanco;
  return Math.max(doBanco ?? 0, Math.round(doAparelho));
}

/**
 * Calcula a energia da pessoa agora.
 *
 * Devolve `null` quando não há leitura nenhuma — sem dado do wearable não há o
 * que pontuar, e inventar um score seria a pior resposta possível para a tela
 * mais vista do app.
 */
export async function energyNow(userId: string, options: EnergyOptions = {}): Promise<EnergyResponse | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { tzOffsetMin: true, sex: true } });
  const tz = user?.tzOffsetMin ?? DEFAULT_TZ_OFFSET_MIN;

  const [reading, baseline, habits, lifestyle, pesoKg] = await Promise.all([
    latestReading(userId),
    hrvBaseline(userId),
    habitsToday(userId, tz),
    prisma.lifestyleProfile.findUnique({ where: { userId } }),
    pesoDaAnamnese(userId),
  ]);
  // A meta de água com a MESMA regra da tela — sem ela o serviço de IA assumia
  // 2.500 e a Saúde contradizia a tela de Água (rodada de testes, 22/08).
  const waterGoal = waterGoalMl(pesoKg, (user?.sex as 'f' | 'm') ?? 'f');

  if (!reading?.hrvMs || !reading.heartRate) return null;
  const { sleepScore: sleep } = habits;
  const water = aguaEfetiva(habits.waterMl, options.waterMl);
  const today = await todayContext(userId, tz, reading.steps ?? null);

  // A hora do app tem precedência: ele sabe o relógio do aparelho AGORA, o que
  // cobre quem acabou de desembarcar antes de o cadastro ser atualizado.
  const hour = options.hour ?? localHour(tz);

  /*
   Uma chamada de modelo por HORA e por conjunto de entradas, não por abertura.

   A frase é redigida por LLM, e isso tem custo por chamada. Dentro da mesma
   hora, com as mesmas leituras, a resposta é idêntica — quem abre o app cinco
   vezes numa hora não deve gerar cinco chamadas.

   A hora sozinha não serve de chave: a pulseira pode mandar leitura nova no
   meio dela, e aí o score muda e a frase precisa mudar junto. Por isso a
   impressão digital cobre TODAS as entradas do cálculo.
   */
  const inputsHash = createHash('sha256')
    .update(
      JSON.stringify([
        /*
         O BATIMENTO e o HRV entram GROSSOS, pelo mesmo motivo da água e dos
         passos, e essa lição custou caro por ter sido aplicada só a eles.

         A pulseira emite uma leitura a cada poucos segundos, e cada bpm
         diferente invalidava o cache e comprava um texto novo do modelo. Em
         72h de produção foram 1007 chamadas para 143 horas-usuário de
         conteúdo: sete vezes o necessário, num cache que é POR HORA.

         A largura saiu da MEDIÇÃO, não do palpite: sobre 22 mil leituras reais
         de 72h, balde de 5 corta 48% das chamadas, de 10 corta 63% e de 15
         corta 70%. Dez é onde a curva ainda paga bem sem apagar diferença que
         importa, porque dez bpm é da ordem do passo entre faixas de avaliação,
         e a frase é por HORA: variação dentro da hora é ruído para ela.
        */
        reading.hrvMs == null ? null : Math.round(reading.hrvMs / 10),
        reading.heartRate == null ? null : Math.round(reading.heartRate / 10),
        reading.spo2Pct,
        sleep,
        /*
         A água entra GROSSA no hash, em baldes de 250 ml.
         
         Ela passou a vir do aparelho (para o resumo não contradizer a tela), e
         isso a fez mudar a cada copo registrado: cada gole invalidava o cache e
         comprava um texto novo do modelo. Um balde de 250 ml é menor que o
         menor copo do app, então a frase ainda acompanha quem bebe, sem pagar
         por cada 50 ml de diferença.
        */
        water == null ? null : Math.round(water / 250),
        hour,
        // A linha de base se move a cada leitura nova que entra na janela, e
        // um milissegundo dela não muda frase nenhuma.
        baseline == null ? null : Math.round(baseline / 10),
        lifestyle?.updatedAt ?? null,
        // O dia entra GROSSO no hash: passos em baldes de 500 para o cache não
        // virar uma chamada de modelo por passo dado; o resto muda pouco.
        today.sport_count,
        today.meals_count,
        today.workout?.done ?? null,
        today.steps === null ? null : Math.floor(today.steps / 500),
      ]))
    .digest('hex');

  const cached = await prisma.energyScore.findUnique({
    where: { userId_hourStart: { userId, hourStart: hourStart() } },
    select: { insight: true, inputsHash: true, insightAt: true },
  });
  // `force` é o botão Atualizar da home: ignora o cache e rediz a frase com o
  // dia relido — é o que faz o toque ter efeito visível.
  /*
   Cache só vale quando o texto é do MODELO. O job da hora e a rota gravam no
   mesmo ponto, e o que ficasse ali era o que a tela lia — inclusive o molde
   (`source: "model"`), quando o modelo tinha sido recusado naquela tentativa.
   Metade das horas de um dia saíram molde (ago/2026). Molde em cache é
   convite a tentar o modelo de novo; texto do modelo em cache é definitivo.
  */
  const fonteEmCache = (cached?.insight as { insight?: { source?: string } } | null)?.insight?.source;
  if (!options.force && cached?.inputsHash === inputsHash && cached.insight && fonteEmCache === 'llm') {
    return cached.insight as unknown as EnergyResponse;
  }

  /*
   O PISO: entrada diferente não basta para recomprar o texto.

   Os baldes do hash resolvem o ruído (um bpm a mais), mas não o movimento
   legítimo: durante um treino o batimento vai de 60 a 160 e cruza balde após
   balde, e cada travessia comprava um texto que ninguém leu, porque quem está
   correndo não está olhando a home. Medido em 72h de produção: 11,4 chamadas
   por hora-usuário, para uma frase que é POR HORA.

   Quinze minutos é metade da granularidade da própria frase, então ela nunca
   fica velha de um jeito que a pessoa perceba, e o teto de gasto passa a ser
   previsível: no máximo quatro por hora, e na prática 3,5. Sobre os mesmos
   dados, isso derruba a conta de US$ 21 para US$ 5 por mês.

   O botão Atualizar da home (`force`) continua furando o piso: quando a
   pessoa PEDE, ela recebe.
  */
  const redigidoHa = cached?.insightAt ? Date.now() - cached.insightAt.getTime() : Infinity;
  if (!options.force && cached?.insight && fonteEmCache === 'llm' && redigidoHa < INSIGHT_PISO_MS) {
    return cached.insight as unknown as EnergyResponse;
  }

  /*
   As frases das últimas horas vão junto, para o modelo NÃO repetir. Com os
   mesmos fatos e o mesmo prompt ele convergia para o mesmo conselho hora após
   hora — "levante por cinco minutos" às 9h, às 10h, às 11h (ago/2026). Só as
   do modelo: molde repetido não ensina nada a ele.
  */
  const recentes = await prisma.energyScore.findMany({
    where: { userId, hourStart: { lt: hourStart() } },
    orderBy: { hourStart: 'desc' },
    take: 6,
    select: { insight: true },
  });
  const recentInsights = recentes
    .map((r) => (r.insight as { insight?: { headline?: string; detail?: string; source?: string } } | null)?.insight)
    .filter((i): i is { headline?: string; detail?: string; source?: string } => !!i && i.source === 'llm')
    .map((i) => `${i.headline ?? ''}, ${i.detail ?? ''}`.trim())
    .slice(0, 4);

  const { data } = await axios.post<EnergyResponse>(
    `${env.AI_SERVICE_URL}/energy/insight`,
    {
      recent_insights: recentInsights,
      hrv_ms: reading.hrvMs,
      // Ausente é ausente. O valor fixo de 80 que ficava aqui deslocava um
      // quarto do score em cima de um número que ninguém mediu.
      sleep_score: sleep,
      resting_hr: reading.heartRate,
      temperature_c: reading.temperature ?? 36.6,
      hour,
      hrv_baseline: baseline,
      water_ml: water,
      water_goal_ml: waterGoal,
      // Dia da semana no fuso da PESSOA. O modelo não tem relógio próprio — é
      // sem estado de propósito —, e mandar o dia em UTC faria a terça de quem
      // treina virar segunda depois das 21h.
      weekday: new Date(Date.now() + tz * 60_000).getUTCDay(),
      // O perfil vai em snake_case porque é a convenção do serviço Python; a
      // conversão fica aqui, na fronteira, e não espalhada pelos dois lados.
      lifestyle: lifestyle && {
        occupation: lifestyle.occupation,
        work_posture: lifestyle.workPosture,
        posture_hours: lifestyle.postureHours,
        work_schedule: lifestyle.workSchedule,
        bedtime: lifestyle.bedtime,
        exercises: lifestyle.exercises,
        activities: lifestyle.activities,
        train_days: lifestyle.trainDays,
        train_period: lifestyle.trainPeriod,
        goal: lifestyle.goal,
      },
      today,
    },
    { timeout: 8000 });

  if (options.persist !== false) await persistEnergy(userId, data, reading.hrvMs, sleep, inputsHash);
  return data;
}

/**
 * Grava o ponto da hora.
 *
 * `upsert` na chave `(usuário, hora)` porque a rota e o job escrevem no mesmo
 * lugar: a tela inicial aberta às 14h05 e o job das 14h produzem o mesmo ponto,
 * e o segundo a chegar deve atualizar, não duplicar. Sem isso o histórico
 * ganharia mais amostras nas horas em que a pessoa usou o app — um viés que
 * envenenaria qualquer correlação calculada depois.
 */
async function persistEnergy(
  userId: string,
  result: EnergyResponse,
  hrvUsed: number,
  sleepUsed: number | null,
  inputsHash: string): Promise<void> {
  const hour = hourStart();
  await prisma.energyScore
    .upsert({
      where: { userId_hourStart: { userId, hourStart: hour } },
      create: {
        userId,
        hourStart: hour,
        score: result.score,
        hrvUsed,
        sleepUsed,
        calibrating: result.calibrating,
        insight: result as unknown as object,
        inputsHash,
        /*
         O carimbo é o da REDAÇÃO, e por isso só avança quando o texto veio do
         modelo. Marcar a hora ao gravar um molde faria o piso segurar
         justamente o texto que a gente quer trocar assim que o modelo voltar.
        */
        insightAt: result.insight?.source === 'llm' ? new Date() : null,
      },
      update: {
        score: result.score,
        hrvUsed,
        sleepUsed,
        calibrating: result.calibrating,
        insight: result as unknown as object,
        inputsHash,
        ...(result.insight?.source === 'llm' ? { insightAt: new Date() } : {}),
      },
    })
    // Persistir é efeito colateral do cálculo, não a razão dele. Uma falha de
    // escrita não pode derrubar a tela inicial de quem só queria ver o número.
    .catch((err: unknown) => logError('scoring:energy_score', err));
}

export type BioAgeResponse = {
  real_age: number;
  bio_age: number;
  delta: number;
  factors: { key: string; label: string; value: string; reference: string; years: number }[];
  /** VO₂máx estimado (mL/kg/min) — o eixo principal do cálculo. */
  vo2max: number | null;
};

/** Idade biológica de hoje, gravada uma vez por execução do job. */
export async function bioAgeNow(userId: string): Promise<BioAgeResponse | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { birthDate: true, sex: true },
  });
  const reading = await latestReading(userId);
  /*
   Só o batimento é obrigatório.

   Antes exigia HRV e SpO₂ juntos, e por isso a idade biológica simplesmente NÃO
   EXISTIA para quem tem um aparelho que ainda não mediu HRV — a tela ficava
   vazia sem explicar por quê. O modelo já sabe lidar com sinal ausente: ele
   contribui zero ano, em vez de penalizar quem não tem o sensor. É a mesma
   regra do score de energia.
   */
  if (!user || !reading?.heartRate) return null;

  const realAge = Math.floor((Date.now() - user.birthDate.getTime()) / (365.25 * 86_400_000));

  const { data } = await axios.post<BioAgeResponse>(
    `${env.AI_SERVICE_URL}/bioage/calcular`,
    {
      real_age: realAge,
      sex: user.sex,
      hrv_ms: reading.hrvMs,
      resting_hr: reading.heartRate,
      /*
       `null`, e NÃO a mediana da faixa.

       Aqui havia `deep_sleep_pct: 0.2` fixo, com um comentário explicando que
       era "neutro". Não era neutro: era um número inventado entrando num
       cálculo de saúde, e o fator "Sono profundo" aparecia na tela com 20% para
       quem nunca teve o sono medido. Ausente, o marcador sai da média e a tela
       mostra traço, que é a informação correta.
       */
      deep_sleep_pct: null,
      // Os dois que o cálculo fundamentado passou a exigir (ago/2026): o IMC
      // sai do peso e da altura declarados na anamnese, e os minutos ativos,
      // do que foi de fato registrado nos últimos sete dias.
      bmi: await imcDaAnamnese(userId),
      weekly_active_min: await minutosAtivosNaSemana(userId),
    },
    { timeout: 8000 });

  const byKey = Object.fromEntries(data.factors.map((f) => [f.key, f.years]));
  await prisma.bioAgeScore
    .create({
      data: {
        userId,
        calculatedAt: new Date(),
        realAge: data.real_age,
        bioAge: data.bio_age,
        delta: data.delta,
        dHrv: byKey.hrv ?? null,
        dHr: byKey.hr ?? null,
        dSpo2: byKey.spo2 ?? null,
        dSleep: byKey.sleep ?? null,
        dTemp: byKey.temp ?? null,
      },
    })
    .catch((err: unknown) => logError('scoring:bio_age_score', err));

  return data;
}

/**
 * IMC a partir do peso e da altura declarados na anamnese.
 *
 * `null` quando a pessoa ainda não respondeu — o modelo usa o meio da faixa
 * saudável nesse caso, e a tela diz que o dado melhora com a anamnese
 * preenchida. Inventar um peso aqui seria o mesmo erro do sono fixo em 20%.
 */
async function pesoDaAnamnese(userId: string): Promise<number | null> {
  const anamnese = await prisma.healthAnamnesis.findUnique({ where: { userId }, select: { answers: true } });
  const peso = (anamnese?.answers as { weightKg?: number } | null)?.weightKg;
  return typeof peso === 'number' && peso > 0 ? peso : null;
}

async function imcDaAnamnese(userId: string): Promise<number | null> {
  const anamnese = await prisma.healthAnamnesis.findUnique({
    where: { userId },
    select: { answers: true },
  });
  const respostas = anamnese?.answers as { weightKg?: number; heightCm?: number } | null;
  const peso = respostas?.weightKg;
  const altura = respostas?.heightCm;
  if (!peso || !altura || altura < 100) return null;
  return peso / (altura / 100) ** 2;
}

/**
 * Minutos de movimento dos últimos sete dias — treino do plano CONCLUÍDO mais
 * sessão de esporte.
 *
 * É o que alimenta a categoria de atividade física da equação de Jurca. O
 * artigo original pergunta por autorrelato; aqui o número é medido, o que
 * torna a estimativa melhor que a do próprio estudo nesse ponto.
 */
async function minutosAtivosNaSemana(userId: string): Promise<number> {
  const desde = new Date(Date.now() - 7 * 86_400_000);
  const [execucoes, sessoes] = await Promise.all([
    prisma.workoutExecution.findMany({
      where: { userId, status: 'FINISHED', startedAt: { gte: desde } },
      select: { id: true, durationSec: true },
    }),
    prisma.sportSession.findMany({
      where: { userId, startedAt: { gte: desde } },
      select: { durationS: true, workoutExecutionId: true },
    }),
  ]);

  // Sessão VINCULADA a uma execução é o mesmo ato contado por dois sistemas:
  // vale a sessão, que é o registro mais rico, e a execução sai da soma. Mesma
  // regra da agenda de movimento do app — sem ela, o dia de corrida do plano
  // registrado por GPS contaria em dobro e inflaria a aptidão.
  const vinculadas = new Set(
    sessoes.map((s) => s.workoutExecutionId).filter((id): id is string => !!id));
  const minutosDeTreino = execucoes
    .filter((e) => !vinculadas.has(e.id))
    .reduce((soma, e) => soma + (e.durationSec ?? 0) / 60, 0);
  const minutosDeEsporte = sessoes.reduce((soma, s) => soma + s.durationS / 60, 0);
  return Math.round(minutosDeTreino + minutosDeEsporte);
}
