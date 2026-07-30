-- Cache da frase do insight, para não pagar uma chamada de LLM por abertura.
--
-- Escrita à mão em vez de gerada: `prisma migrate dev` pede reset do banco
-- porque as hypertables do TimescaleDB são criadas por SQL fora do controle
-- dele, e ele lê isso como divergência. Resetar apagaria dado real.
ALTER TABLE energy_scores ADD COLUMN IF NOT EXISTS insight JSONB;
ALTER TABLE energy_scores ADD COLUMN IF NOT EXISTS inputs_hash VARCHAR(64);
