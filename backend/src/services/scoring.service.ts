import { createHash } from 'node:crypto';

import axios from 'axios';

import { env } from '../lib/env';
import { logError } from '../lib/log';
import { prisma } from '../lib/prisma';
import { hrvBaseline, latestReading } from './biometric.service';

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
  tzOffsetMin: number,
): Promise<{ waterMl: number | null; sleepScore: number | null }> {
  const habit = await prisma.dailyHabit.findUnique({
    where: { userId_date: { userId, date: startOfLocalDay(tzOffsetMin) } },
    select: { waterMl: true, sleepScore: true },
  });
  return { waterMl: habit?.waterMl ?? null, sleepScore: habit?.sleepScore ?? null };
}

export type EnergyOptions = { hour?: number; persist?: boolean };

/**
 * Calcula a energia da pessoa agora.
 *
 * Devolve `null` quando não há leitura nenhuma — sem dado do wearable não há o
 * que pontuar, e inventar um score seria a pior resposta possível para a tela
 * mais vista do app.
 */
export async function energyNow(userId: string, options: EnergyOptions = {}): Promise<EnergyResponse | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { tzOffsetMin: true } });
  const tz = user?.tzOffsetMin ?? DEFAULT_TZ_OFFSET_MIN;

  const [reading, baseline, habits, lifestyle] = await Promise.all([
    latestReading(userId),
    hrvBaseline(userId),
    habitsToday(userId, tz),
    prisma.lifestyleProfile.findUnique({ where: { userId } }),
  ]);

  if (!reading?.hrvMs || !reading.heartRate) return null;
  const { waterMl: water, sleepScore: sleep } = habits;

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
        reading.hrvMs,
        reading.heartRate,
        reading.spo2Pct,
        sleep,
        water,
        hour,
        baseline,
        lifestyle?.updatedAt ?? null,
      ]),
    )
    .digest('hex');

  const cached = await prisma.energyScore.findUnique({
    where: { userId_hourStart: { userId, hourStart: hourStart() } },
    select: { insight: true, inputsHash: true },
  });
  if (cached?.inputsHash === inputsHash && cached.insight) {
    return cached.insight as unknown as EnergyResponse;
  }

  const { data } = await axios.post<EnergyResponse>(
    `${env.AI_SERVICE_URL}/energy/insight`,
    {
      hrv_ms: reading.hrvMs,
      // Ausente é ausente. O valor fixo de 80 que ficava aqui deslocava um
      // quarto do score em cima de um número que ninguém mediu.
      sleep_score: sleep,
      resting_hr: reading.heartRate,
      temperature_c: reading.temperature ?? 36.6,
      hour,
      hrv_baseline: baseline,
      water_ml: water,
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
    },
    { timeout: 8000 },
  );

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
  inputsHash: string,
): Promise<void> {
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
      },
      update: {
        score: result.score,
        hrvUsed,
        sleepUsed,
        calibrating: result.calibrating,
        insight: result as unknown as object,
        inputsHash,
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
      spo2_pct: reading.spo2Pct,
      /*
       `null`, e NÃO a mediana da faixa.

       Aqui havia `deep_sleep_pct: 0.2` fixo, com um comentário explicando que
       era "neutro". Não era neutro: era um número inventado entrando num
       cálculo de saúde, e o fator "Sono profundo" aparecia na tela com 20% para
       quem nunca teve o sono medido. Ausente o modelo contribui zero ano e a
       tela mostra traço, que é a informação correta.
       */
      deep_sleep_pct: null,
    },
    { timeout: 8000 },
  );

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
