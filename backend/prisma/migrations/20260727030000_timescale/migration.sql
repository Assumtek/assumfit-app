-- Partes que o Prisma não sabe gerenciar. Rodar DEPOIS de `prisma migrate deploy`.

CREATE EXTENSION IF NOT EXISTS timescaledb;

-- `biometric_readings` vira hypertable particionada por tempo.
-- A PK já é composta (id, recorded_at) no schema.prisma porque o Timescale
-- exige a coluna de particionamento em toda PK/UNIQUE — uma PK só em `id`
-- faz esta chamada falhar.
SELECT create_hypertable(
  'biometric_readings',
  'recorded_at',
  chunk_time_interval => INTERVAL '7 days',
  if_not_exists => TRUE,
  migrate_data => TRUE
);

-- Compressão dos chunks antigos. Leitura bruta a 5 min por usuário cresce
-- rápido; comprimir por usuário mantém a consulta por período eficiente.
ALTER TABLE biometric_readings SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'user_id',
  timescaledb.compress_orderby = 'recorded_at DESC'
);

SELECT add_compression_policy('biometric_readings', INTERVAL '14 days', if_not_exists => TRUE);

-- Retenção. Dado biométrico é dado pessoal sensível: guardar indefinidamente
-- sem finalidade é passivo jurídico, não patrimônio.
-- 24 meses cobre a análise de tendência anual que o produto promete.
SELECT add_retention_policy('biometric_readings', INTERVAL '24 months', if_not_exists => TRUE);

-- Agregado contínuo por hora. As telas quase nunca precisam da amostra bruta;
-- pedir média por hora direto na hypertable a cada abertura de tela seria
-- varredura desnecessária.
CREATE MATERIALIZED VIEW IF NOT EXISTS biometric_hourly
WITH (timescaledb.continuous) AS
SELECT
  user_id,
  time_bucket(INTERVAL '1 hour', recorded_at) AS hour,
  avg(hrv_ms)       AS hrv_ms,
  avg(heart_rate)   AS heart_rate,
  min(heart_rate)   AS heart_rate_min,
  max(heart_rate)   AS heart_rate_max,
  avg(spo2_pct)     AS spo2_pct,
  avg(temperature)  AS temperature,
  max(steps)        AS steps,
  avg(stress_score) AS stress_score
FROM biometric_readings
GROUP BY user_id, hour
WITH NO DATA;

SELECT add_continuous_aggregate_policy(
  'biometric_hourly',
  start_offset => INTERVAL '3 days',
  end_offset   => INTERVAL '1 hour',
  schedule_interval => INTERVAL '30 minutes',
  if_not_exists => TRUE
);

-- Uma idade biológica por usuário por dia.
-- Precisa ser índice por expressão, não constraint de tabela: constraint não
-- aceita expressão. E o fuso tem de ser explícito — `timestamptz::date` não é
-- imutável, porque depende do TimeZone da sessão, e o índice é rejeitado.
CREATE UNIQUE INDEX IF NOT EXISTS bio_age_scores_user_day
  ON bio_age_scores (user_id, ((calculated_at AT TIME ZONE INTERVAL '-03:00')::date));
