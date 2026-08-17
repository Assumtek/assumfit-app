-- Sessão de foco e agenda de terceiros SAEM do produto (ago/2026, decisão da
-- fundadora): o AssumFit é de esporte, bem-estar e recuperação, e nada de
-- produtividade sobrevive nem como tela de menu.
--
-- Isto APAGA dado de pessoa real. É a intenção: manter tabela de recurso
-- extinto é guardar dado sem finalidade, o oposto do que a LGPD pede.

DROP TABLE IF EXISTS "productivity_sessions";
DROP TABLE IF EXISTS "calendar_accounts";

ALTER TABLE "daily_habits" DROP COLUMN IF EXISTS "focus_sessions";

DROP TYPE IF EXISTS "CalendarProvider";

-- O Postgres não remove valor de enum: o tipo precisa ser recriado, e as
-- colunas que o usam, reapontadas. Os consentimentos de leitura de agenda são
-- apagados ANTES — sem o recurso, não há finalidade que os sustente.
DELETE FROM "consents" WHERE "purpose" = 'calendar_read';

ALTER TYPE "ConsentPurpose" RENAME TO "ConsentPurpose_old";

CREATE TYPE "ConsentPurpose" AS ENUM (
  'menstrual_tracking',
  'biometric_processing',
  'international_transfer',
  'marketing',
  'workout_generation'
);

ALTER TABLE "consents"
  ALTER COLUMN "purpose" TYPE "ConsentPurpose"
  USING ("purpose"::text::"ConsentPurpose");

DROP TYPE "ConsentPurpose_old";
