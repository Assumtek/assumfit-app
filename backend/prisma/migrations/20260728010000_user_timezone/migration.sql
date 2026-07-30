-- Fuso por usuário.
--
-- Substitui a constante DEFAULT_TZ_OFFSET do scoring.service. O padrão é o
-- horário de Brasília, que é onde estão todos os assinantes atuais — assim a
-- coluna nasce correta para a base existente e passa a ser ajustável.
ALTER TABLE "users" ADD COLUMN "tz_offset_min" INTEGER NOT NULL DEFAULT -180;
