-- CreateEnum
CREATE TYPE "Sex" AS ENUM ('f', 'm');

-- CreateEnum
CREATE TYPE "ConsentPurpose" AS ENUM ('biometric_processing', 'international_transfer', 'marketing');

-- CreateEnum
CREATE TYPE "DeviceStatus" AS ENUM ('in_use', 'returned', 'lost');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('trialing', 'active', 'past_due', 'canceled');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "birth_date" DATE NOT NULL,
    "sex" "Sex" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consents" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "purpose" "ConsentPurpose" NOT NULL,
    "version" TEXT NOT NULL,
    "granted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(3),

    CONSTRAINT "consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devices" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "serial_number" TEXT NOT NULL,
    "ble_address" TEXT,
    "model" TEXT NOT NULL DEFAULT 'ANB-X1',
    "status" "DeviceStatus" NOT NULL DEFAULT 'in_use',
    "shipped_at" TIMESTAMPTZ(3),
    "returned_at" TIMESTAMPTZ(3),
    "battery_pct" INTEGER,
    "last_seen_at" TIMESTAMPTZ(3),

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'trialing',
    "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "canceled_at" TIMESTAMPTZ(3),
    "current_period_end" TIMESTAMPTZ(3),
    "hardware_cost_cents" INTEGER NOT NULL DEFAULT 0,
    "price_cents" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "biometric_readings" (
    "id" BIGSERIAL NOT NULL,
    "user_id" UUID NOT NULL,
    "recorded_at" TIMESTAMPTZ(3) NOT NULL,
    "hrv_ms" DOUBLE PRECISION,
    "heart_rate" INTEGER,
    "spo2_pct" DOUBLE PRECISION,
    "temperature" DOUBLE PRECISION,
    "steps" INTEGER,
    "bp_systolic" INTEGER,
    "bp_diastolic" INTEGER,
    "stress_score" DOUBLE PRECISION,
    "resp_rate" DOUBLE PRECISION,
    "source" TEXT NOT NULL DEFAULT 'staranb',
    "client_id" TEXT,

    CONSTRAINT "biometric_readings_pkey" PRIMARY KEY ("id","recorded_at")
);

-- CreateTable
CREATE TABLE "energy_scores" (
    "id" BIGSERIAL NOT NULL,
    "user_id" UUID NOT NULL,
    "hour_start" TIMESTAMPTZ(3) NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "hrv_used" DOUBLE PRECISION,
    "sleep_used" DOUBLE PRECISION,
    "calibrating" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "energy_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bio_age_scores" (
    "id" BIGSERIAL NOT NULL,
    "user_id" UUID NOT NULL,
    "calculated_at" TIMESTAMPTZ(3) NOT NULL,
    "real_age" INTEGER NOT NULL,
    "bio_age" INTEGER NOT NULL,
    "delta" INTEGER NOT NULL,
    "d_hrv" DOUBLE PRECISION,
    "d_hr" DOUBLE PRECISION,
    "d_spo2" DOUBLE PRECISION,
    "d_sleep" DOUBLE PRECISION,
    "d_temp" DOUBLE PRECISION,

    CONSTRAINT "bio_age_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "productivity_sessions" (
    "id" BIGSERIAL NOT NULL,
    "user_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "started_at" TIMESTAMPTZ(3) NOT NULL,
    "ended_at" TIMESTAMPTZ(3),
    "duration_min" INTEGER,
    "energy_score_at_start" DOUBLE PRECISION,

    CONSTRAINT "productivity_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_habits" (
    "id" BIGSERIAL NOT NULL,
    "user_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "water_ml" INTEGER NOT NULL DEFAULT 0,
    "sleep_score" DOUBLE PRECISION,
    "focus_sessions" INTEGER NOT NULL DEFAULT 0,
    "mood" TEXT,

    CONSTRAINT "daily_habits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "consents_user_id_purpose_idx" ON "consents"("user_id", "purpose");

-- CreateIndex
CREATE UNIQUE INDEX "devices_serial_number_key" ON "devices"("serial_number");

-- CreateIndex
CREATE INDEX "devices_user_id_idx" ON "devices"("user_id");

-- CreateIndex
CREATE INDEX "subscriptions_user_id_idx" ON "subscriptions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "biometric_readings_user_id_recorded_at_idx" ON "biometric_readings"("user_id", "recorded_at");

-- CreateIndex
CREATE UNIQUE INDEX "biometric_readings_user_id_recorded_at_source_key" ON "biometric_readings"("user_id", "recorded_at", "source");

-- CreateIndex
CREATE UNIQUE INDEX "energy_scores_user_id_hour_start_key" ON "energy_scores"("user_id", "hour_start");

-- CreateIndex
CREATE INDEX "bio_age_scores_user_id_calculated_at_idx" ON "bio_age_scores"("user_id", "calculated_at");

-- CreateIndex
CREATE INDEX "productivity_sessions_user_id_started_at_idx" ON "productivity_sessions"("user_id", "started_at");

-- CreateIndex
CREATE UNIQUE INDEX "daily_habits_user_id_date_key" ON "daily_habits"("user_id", "date");

-- AddForeignKey
ALTER TABLE "consents" ADD CONSTRAINT "consents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "energy_scores" ADD CONSTRAINT "energy_scores_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bio_age_scores" ADD CONSTRAINT "bio_age_scores_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "productivity_sessions" ADD CONSTRAINT "productivity_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_habits" ADD CONSTRAINT "daily_habits_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
