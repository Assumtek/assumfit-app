-- Coexistência treino do plano × registro de GPS (ago/2026): a sessão de
-- esporte pode cumprir o dia de esporte do plano. O vínculo é o que impede a
-- dupla contagem na agenda de movimento.
ALTER TABLE "sport_sessions" ADD COLUMN "workout_execution_id" UUID;
