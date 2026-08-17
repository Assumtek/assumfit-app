-- "Como foi" no registro de esporte (ago/2026): esforço percebido, nota e
-- observação — os mesmos campos do fim de treino guiado, para sessão avulsa.
ALTER TABLE "sport_sessions"
  ADD COLUMN "perceived_effort" INTEGER,
  ADD COLUMN "rating" INTEGER,
  ADD COLUMN "comment" TEXT;
