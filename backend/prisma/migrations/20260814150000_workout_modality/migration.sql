-- Fusão musculação + esportes (ago/2026): o treino do dia ganha modalidade.
-- Null = plano gerado antes da fusão; o app trata como musculação.
ALTER TABLE "workouts" ADD COLUMN "modality" TEXT;
