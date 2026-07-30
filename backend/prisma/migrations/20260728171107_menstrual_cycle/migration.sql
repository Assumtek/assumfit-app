-- Ciclo menstrual registrado pela pessoa, com consentimento próprio.
--
-- Escrita à mão: `prisma migrate dev` pede reset do banco por causa das
-- hypertables do TimescaleDB, que ele não gerencia. Resetar apagaria dado real.
ALTER TYPE "ConsentPurpose" ADD VALUE IF NOT EXISTS 'menstrual_tracking';

CREATE TABLE IF NOT EXISTS menstrual_cycles (
  id            BIGSERIAL PRIMARY KEY,
  user_id       UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- DATE e não TIMESTAMP: ninguém registra o minuto, e guardar hora criaria
  -- uma precisão que o dado não tem.
  started_at    DATE        NOT NULL,
  duration_days INTEGER,
  created_at    TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  CONSTRAINT menstrual_cycles_user_start_key UNIQUE (user_id, started_at)
);

CREATE INDEX IF NOT EXISTS menstrual_cycles_user_started_idx
  ON menstrual_cycles (user_id, started_at DESC);
