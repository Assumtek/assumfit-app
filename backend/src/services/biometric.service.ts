import { prisma } from '../lib/prisma';

export type IncomingReading = {
  recordedAt: string;
  hrvMs?: number | null;
  heartRate?: number | null;
  spo2Pct?: number | null;
  temperature?: number | null;
  steps?: number | null;
  bpSystolic?: number | null;
  bpDiastolic?: number | null;
  stressScore?: number | null;
  respRate?: number | null;
  source?: string;
  clientId?: string | null;
};

/**
 * Ingest em lote e idempotente.
 *
 * O wearable acumula offline e reenvia — reconexão, app reaberto, retry de
 * rede. Sem idempotência, cada reenvio duplicaria a série e envenenaria toda
 * média e linha de base calculada em cima dela. A chave natural
 * (user_id, recorded_at, source) resolve: reenviar o mesmo lote não muda nada.
 *
 * `skipDuplicates` faz o INSERT ignorar conflito sem abortar a transação, então
 * um lote parcialmente novo entra inteiro.
 */
export async function ingestReadings(userId: string, readings: IncomingReading[]): Promise<{ inserted: number }> {
  if (readings.length === 0) return { inserted: 0 };

  const result = await prisma.biometricReading.createMany({
    data: readings.map((r) => ({
      userId,
      recordedAt: new Date(r.recordedAt),
      hrvMs: r.hrvMs ?? null,
      heartRate: r.heartRate ?? null,
      spo2Pct: r.spo2Pct ?? null,
      temperature: r.temperature ?? null,
      steps: r.steps ?? null,
      bpSystolic: r.bpSystolic ?? null,
      bpDiastolic: r.bpDiastolic ?? null,
      stressScore: r.stressScore ?? null,
      respRate: r.respRate ?? null,
      source: r.source ?? 'staranb',
      clientId: r.clientId ?? null,
    })),
    skipDuplicates: true,
  });

  return { inserted: result.count };
}

export async function latestReading(userId: string) {
  return prisma.biometricReading.findFirst({
    where: { userId },
    orderBy: { recordedAt: 'desc' },
  });
}

export type HourlyPoint = {
  hour: Date;
  hrv_ms: number | null;
  heart_rate: number | null;
  heart_rate_min: number | null;
  heart_rate_max: number | null;
  spo2_pct: number | null;
  temperature: number | null;
  steps: number | null;
  stress_score: number | null;
};

/**
 * Série por hora, lida do agregado contínuo do TimescaleDB em vez da tabela
 * bruta. A tela quase nunca precisa da amostra de 5 minutos, e varrer a
 * hypertable inteira a cada abertura seria desperdício.
 */
export async function hourlySeries(userId: string, hours: number): Promise<HourlyPoint[]> {
  return prisma.$queryRaw<HourlyPoint[]>`
    SELECT hour, hrv_ms, heart_rate, heart_rate_min, heart_rate_max,
           spo2_pct, temperature, steps, stress_score
    FROM biometric_hourly
    WHERE user_id = ${userId}::uuid
      AND hour > now() - make_interval(hours => ${hours}::int)
    ORDER BY hour ASC
  `;
}

export type DailySummary = {
  /** `YYYY-MM-DD` no fuso de quem pediu, não em UTC. */
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
  /** Do hábito do dia, alimentado pela pulseira — não das leituras. */
  sleep_score: number | null;
  sleep_minutes: number | null;
};

/**
 * Um resumo por dia, para a faixa de histórico.
 *
 * Agrega da tabela BRUTA, não do agregado horário, por causa dos passos: eles
 * são contador ACUMULADO do dia, então a média de médias horárias não significa
 * nada — o que vale é o máximo do dia. Misturar as duas semânticas na mesma
 * consulta daria um número plausível e errado.
 *
 * `tzOffsetMin` vem do aparelho porque o servidor roda em UTC. Sem ele, tudo o
 * que a pessoa mediu depois das 21h no Brasil cairia no dia seguinte, e a faixa
 * mostraria atividade em dias que ela passou dormindo.
 */
export async function dailySummary(userId: string, days: number, tzOffsetMin: number): Promise<DailySummary[]> {
  // Minutos, e não horas: há fusos com deslocamento de 30 e 45 minutos.
  const offset = `${tzOffsetMin} minutes`;

  return prisma.$queryRaw<DailySummary[]>`
    WITH leituras AS (
      SELECT
        to_char((recorded_at + ${offset}::interval), 'YYYY-MM-DD') AS day,
        heart_rate, hrv_ms, spo2_pct, stress_score, steps, bp_systolic, bp_diastolic
      FROM biometric_readings
      WHERE user_id = ${userId}::uuid
        AND recorded_at > now() - make_interval(days => ${days}::int)
    ),
    energia AS (
      SELECT
        to_char((hour_start + ${offset}::interval), 'YYYY-MM-DD') AS day,
        avg(score) AS energy_score
      FROM energy_scores
      WHERE user_id = ${userId}::uuid
        AND hour_start > now() - make_interval(days => ${days}::int)
      GROUP BY 1
    ),
    -- Sono vem do HÁBITO do dia, não das leituras: a noite é um evento com
    -- score e duração, alimentado pela pulseira, e a data do hábito já é o dia
    -- local de quem dormiu — não passa pelo deslocamento de fuso das leituras.
    habitos AS (
      SELECT
        to_char(date, 'YYYY-MM-DD') AS day,
        sleep_score, sleep_minutes
      FROM daily_habits
      WHERE user_id = ${userId}::uuid
        AND date > now() - make_interval(days => ${days}::int)
    )
    SELECT
      l.day,
      count(*)::int                        AS readings,
      round(avg(l.heart_rate))::int        AS heart_rate,
      min(l.heart_rate)::int               AS heart_rate_min,
      max(l.heart_rate)::int               AS heart_rate_max,
      round(avg(l.hrv_ms))::int            AS hrv_ms,
      round(avg(l.spo2_pct))::int          AS spo2_pct,
      min(l.spo2_pct)::int                 AS spo2_min,
      round(avg(l.stress_score))::int      AS stress_score,
      round(avg(l.bp_systolic))::int       AS bp_systolic,
      round(avg(l.bp_diastolic))::int      AS bp_diastolic,
      -- Contador acumulado: o dia vale o maior valor, não a soma nem a média.
      max(l.steps)::int                    AS steps,
      round(e.energy_score)::int           AS energy_score,
      round(h.sleep_score)::int            AS sleep_score,
      h.sleep_minutes::int                 AS sleep_minutes
    FROM leituras l
    LEFT JOIN energia e ON e.day = l.day
    LEFT JOIN habitos h ON h.day = l.day
    GROUP BY l.day, e.energy_score, h.sleep_score, h.sleep_minutes
    ORDER BY l.day DESC
  `;
}

/**
 * Linha de base pessoal de HRV.
 *
 * É o número que falta para o score de energia significar alguma coisa: HRV
 * saudável vai de ~20 a ~200 ms entre pessoas, então só o desvio contra a
 * própria média informa. Devolve `null` enquanto não houver dias suficientes —
 * quem chama cai na referência populacional e marca o app como calibrando.
 *
 * **Uma fonte só, e é a da leitura mais recente.**
 *
 * Antes a média varria tudo. Parecia inofensivo enquanto só existia uma origem,
 * e deixa de ser no instante em que aparece a segunda: HRV não é um número
 * universal, é o resultado de um método. A nossa banda calcula RMSSD; o Apple
 * Watch reporta SDNN; o gerador do seed produz a própria distribuição. Misturar
 * as três produz uma média que não corresponde a nenhuma — e essa média é o
 * DENOMINADOR do score inteiro.
 *
 * O modo de falha era silencioso: nada quebra, nada dá erro, e o score fica
 * sutilmente errado para sempre. Ninguém desconfiaria de uma média.
 *
 * A regra de "fonte da leitura mais recente" também se corrige sozinha na
 * troca de aparelho: ao ligar a banda real sobre uma base semeada, o baseline
 * passa a ser da banda e volta a `null` até haver sete dias dela. O app se
 * declara calibrando — que é a verdade, e é melhor que herdar a média de outro
 * método fingindo precisão que não existe.
 */
export async function hrvBaseline(userId: string, minDays = 7): Promise<number | null> {
  const rows = await prisma.$queryRaw<{ avg_hrv: number | null; days: bigint }[]>`
    WITH atual AS (
      SELECT source
      FROM biometric_readings
      WHERE user_id = ${userId}::uuid
      ORDER BY recorded_at DESC
      LIMIT 1
    )
    SELECT avg(hrv_ms) AS avg_hrv,
           count(DISTINCT date_trunc('day', recorded_at)) AS days
    FROM biometric_readings
    WHERE user_id = ${userId}::uuid
      AND source = (SELECT source FROM atual)
      AND hrv_ms IS NOT NULL
      AND recorded_at > now() - INTERVAL '30 days'
  `;

  const row = rows[0];
  if (!row?.avg_hrv || Number(row.days) < minDays) return null;
  return row.avg_hrv;
}
