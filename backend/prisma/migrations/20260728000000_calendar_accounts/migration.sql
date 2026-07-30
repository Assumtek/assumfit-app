-- Conexão com agenda de terceiros (Google, Microsoft).
-- CreateEnum
CREATE TYPE "CalendarProvider" AS ENUM ('google', 'microsoft');

-- AlterEnum
ALTER TYPE "ConsentPurpose" ADD VALUE 'calendar_read';

-- NÃO derrubar o índice de recorded_at.
--
-- O `migrate diff` propôs `DROP INDEX biometric_readings_recorded_at_idx`
-- porque esse índice foi criado pelo TimescaleDB ao transformar a tabela em
-- hypertable, e o Prisma não o enxerga no schema. Aplicá-lo faria toda consulta
-- por janela de tempo — que é praticamente toda consulta de biometria — virar
-- varredura completa. A linha foi removida de propósito; se ela reaparecer num
-- diff futuro, remova de novo.

-- CreateTable
CREATE TABLE "calendar_accounts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "provider" "CalendarProvider" NOT NULL,
    "account_email" TEXT NOT NULL,
    "access_token" TEXT NOT NULL,
    "refresh_token" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "scope" TEXT NOT NULL,
    "connected_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_sync_at" TIMESTAMPTZ(3),

    CONSTRAINT "calendar_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "calendar_accounts_user_id_provider_key" ON "calendar_accounts"("user_id", "provider");

-- AddForeignKey
ALTER TABLE "calendar_accounts" ADD CONSTRAINT "calendar_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

