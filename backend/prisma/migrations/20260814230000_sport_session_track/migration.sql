-- O percurso do esporte com GPS passa a subir SIMPLIFICADO (ago/2026): o
-- histórico mostra o mapa em qualquer aparelho, como o Strava. A trilha é
-- minimizada no aparelho antes do envio e sai junto com a conta (cascade).
ALTER TABLE "sport_sessions" ADD COLUMN "track" JSONB;
