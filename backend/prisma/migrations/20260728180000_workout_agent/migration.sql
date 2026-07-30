-- CreateEnum
CREATE TYPE "MuscleGroup" AS ENUM ('PEITO', 'COSTAS', 'OMBROS', 'BICEPS', 'TRICEPS', 'ANTEBRACO', 'ABDOMEN', 'QUADRICEPS', 'POSTERIOR_COXA', 'GLUTEOS', 'PANTURRILHA', 'CORPO_INTEIRO');

-- CreateEnum
CREATE TYPE "ExerciseType" AS ENUM ('FORCA', 'CARDIO', 'ALONGAMENTO', 'MOBILIDADE', 'FUNCIONAL');

-- CreateEnum
CREATE TYPE "ExperienceLevel" AS ENUM ('INICIANTE', 'INTERMEDIARIO', 'AVANCADO');

-- CreateEnum
CREATE TYPE "DayOfWeek" AS ENUM ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY');

-- CreateEnum
CREATE TYPE "TrainingPlanDayType" AS ENUM ('WORKOUT', 'OFF');

-- CreateEnum
CREATE TYPE "WorkoutPhaseType" AS ENUM ('ALONGAMENTO', 'TREINO', 'CARDIO');

-- CreateEnum
CREATE TYPE "ExerciseSubtype" AS ENUM ('STRENGTH', 'CARDIO', 'MOBILITY');

-- CreateEnum
CREATE TYPE "TrainingPlanStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'REPLACED');

-- CreateEnum
CREATE TYPE "TrainingGoal" AS ENUM ('emagrecimento', 'hipertrofia', 'performance', 'mobilidade', 'saude', 'reabilitacao');

-- CreateEnum
CREATE TYPE "TrainingLocation" AS ENUM ('academia', 'casa', 'ar_livre');

-- CreateEnum
CREATE TYPE "WorkoutExecutionStatus" AS ENUM ('IN_PROGRESS', 'FINISHED', 'CANCELLED', 'AUTO_CLOSED');

-- CreateEnum
CREATE TYPE "GenerationStatus" AS ENUM ('PENDING', 'RUNNING', 'DONE', 'REFERRAL', 'BLOCKED', 'FAILED');

-- CreateEnum
CREATE TYPE "RiskTier" AS ENUM ('TIER_0', 'TIER_1', 'TIER_2', 'TIER_3', 'TIER_4');

-- AlterEnum
ALTER TYPE "ConsentPurpose" ADD VALUE 'workout_generation';

-- DropForeignKey
ALTER TABLE "menstrual_cycles" DROP CONSTRAINT "menstrual_cycles_user_id_fkey";

-- DropIndex
DROP INDEX "biometric_readings_recorded_at_idx";

-- CreateTable
CREATE TABLE "exercises" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "muscle_group" "MuscleGroup" NOT NULL,
    "equipment" TEXT NOT NULL,
    "level" "ExperienceLevel" NOT NULL DEFAULT 'INICIANTE',
    "type" "ExerciseType" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "exercises_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "health_anamneses" (
    "user_id" UUID NOT NULL,
    "answers" JSONB NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "health_anamneses_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "training_plans" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "goal" "TrainingGoal",
    "level" "ExperienceLevel",
    "frequency_per_week" INTEGER,
    "location" "TrainingLocation",
    "status" "TrainingPlanStatus" NOT NULL DEFAULT 'ACTIVE',
    "rationale" TEXT,
    "start_date" TIMESTAMPTZ(3) NOT NULL,
    "end_date" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "training_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_plan_days" (
    "id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "day_of_week" "DayOfWeek" NOT NULL,
    "day_type" "TrainingPlanDayType" NOT NULL DEFAULT 'OFF',
    "workout_id" UUID,

    CONSTRAINT "training_plan_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workouts" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "muscle_groups" "MuscleGroup"[],
    "estimated_duration" INTEGER,
    "observations" TEXT,

    CONSTRAINT "workouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workout_phases" (
    "id" UUID NOT NULL,
    "workout_id" UUID NOT NULL,
    "type" "WorkoutPhaseType" NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "workout_phases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workout_exercises" (
    "id" UUID NOT NULL,
    "workout_id" UUID NOT NULL,
    "phase_id" UUID NOT NULL,
    "exercise_id" UUID NOT NULL,
    "order" INTEGER NOT NULL,
    "subtype" "ExerciseSubtype" NOT NULL DEFAULT 'STRENGTH',
    "notes" TEXT,
    "duration" INTEGER,
    "intensity" TEXT,
    "hold_time" INTEGER,

    CONSTRAINT "workout_exercises_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workout_exercise_sets" (
    "id" UUID NOT NULL,
    "workout_exercise_id" UUID NOT NULL,
    "order" INTEGER NOT NULL,
    "repetitions" TEXT NOT NULL,
    "rest_time" INTEGER,
    "load" DOUBLE PRECISION,

    CONSTRAINT "workout_exercise_sets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workout_executions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "workout_id" UUID NOT NULL,
    "training_plan_day_id" UUID,
    "status" "WorkoutExecutionStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(3),
    "duration_sec" INTEGER,
    "completion_pct" DOUBLE PRECISION,
    "perceived_effort" INTEGER,
    "rating" INTEGER,
    "comment" TEXT,

    CONSTRAINT "workout_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exercise_executions" (
    "id" UUID NOT NULL,
    "execution_id" UUID NOT NULL,
    "workout_exercise_id" UUID NOT NULL,
    "set_order" INTEGER NOT NULL,
    "load" DOUBLE PRECISION,
    "repetitions" INTEGER,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exercise_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_generation_requests" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "status" "GenerationStatus" NOT NULL DEFAULT 'PENDING',
    "risk_tier" "RiskTier",
    "flags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "training_plan_id" UUID,
    "score" DOUBLE PRECISION,
    "trace_id" TEXT,
    "block_reason" TEXT,
    "feedback" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(3),

    CONSTRAINT "plan_generation_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "exercises_muscle_group_idx" ON "exercises"("muscle_group");

-- CreateIndex
CREATE INDEX "exercises_type_idx" ON "exercises"("type");

-- CreateIndex
CREATE INDEX "exercises_active_idx" ON "exercises"("active");

-- CreateIndex
CREATE INDEX "training_plans_user_id_status_idx" ON "training_plans"("user_id", "status");

-- CreateIndex
CREATE INDEX "training_plan_days_plan_id_idx" ON "training_plan_days"("plan_id");

-- CreateIndex
CREATE UNIQUE INDEX "training_plan_days_plan_id_day_of_week_key" ON "training_plan_days"("plan_id", "day_of_week");

-- CreateIndex
CREATE INDEX "workout_phases_workout_id_idx" ON "workout_phases"("workout_id");

-- CreateIndex
CREATE UNIQUE INDEX "workout_phases_workout_id_type_key" ON "workout_phases"("workout_id", "type");

-- CreateIndex
CREATE INDEX "workout_exercises_workout_id_idx" ON "workout_exercises"("workout_id");

-- CreateIndex
CREATE INDEX "workout_exercises_phase_id_idx" ON "workout_exercises"("phase_id");

-- CreateIndex
CREATE INDEX "workout_exercise_sets_workout_exercise_id_idx" ON "workout_exercise_sets"("workout_exercise_id");

-- CreateIndex
CREATE INDEX "workout_executions_user_id_started_at_idx" ON "workout_executions"("user_id", "started_at");

-- CreateIndex
CREATE INDEX "workout_executions_user_id_status_idx" ON "workout_executions"("user_id", "status");

-- CreateIndex
CREATE INDEX "exercise_executions_execution_id_idx" ON "exercise_executions"("execution_id");

-- CreateIndex
CREATE UNIQUE INDEX "exercise_executions_execution_id_workout_exercise_id_set_or_key" ON "exercise_executions"("execution_id", "workout_exercise_id", "set_order");

-- CreateIndex
CREATE INDEX "plan_generation_requests_user_id_created_at_idx" ON "plan_generation_requests"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "plan_generation_requests_status_idx" ON "plan_generation_requests"("status");

-- AddForeignKey
ALTER TABLE "menstrual_cycles" ADD CONSTRAINT "menstrual_cycles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "health_anamneses" ADD CONSTRAINT "health_anamneses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_plans" ADD CONSTRAINT "training_plans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_plan_days" ADD CONSTRAINT "training_plan_days_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "training_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_plan_days" ADD CONSTRAINT "training_plan_days_workout_id_fkey" FOREIGN KEY ("workout_id") REFERENCES "workouts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_phases" ADD CONSTRAINT "workout_phases_workout_id_fkey" FOREIGN KEY ("workout_id") REFERENCES "workouts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_exercises" ADD CONSTRAINT "workout_exercises_workout_id_fkey" FOREIGN KEY ("workout_id") REFERENCES "workouts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_exercises" ADD CONSTRAINT "workout_exercises_phase_id_fkey" FOREIGN KEY ("phase_id") REFERENCES "workout_phases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_exercises" ADD CONSTRAINT "workout_exercises_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "exercises"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_exercise_sets" ADD CONSTRAINT "workout_exercise_sets_workout_exercise_id_fkey" FOREIGN KEY ("workout_exercise_id") REFERENCES "workout_exercises"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_executions" ADD CONSTRAINT "workout_executions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_executions" ADD CONSTRAINT "workout_executions_workout_id_fkey" FOREIGN KEY ("workout_id") REFERENCES "workouts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_executions" ADD CONSTRAINT "workout_executions_training_plan_day_id_fkey" FOREIGN KEY ("training_plan_day_id") REFERENCES "training_plan_days"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exercise_executions" ADD CONSTRAINT "exercise_executions_execution_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "workout_executions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exercise_executions" ADD CONSTRAINT "exercise_executions_workout_exercise_id_fkey" FOREIGN KEY ("workout_exercise_id") REFERENCES "workout_exercises"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_generation_requests" ADD CONSTRAINT "plan_generation_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "menstrual_cycles_user_start_key" RENAME TO "menstrual_cycles_user_id_started_at_key";

-- RenameIndex
ALTER INDEX "menstrual_cycles_user_started_idx" RENAME TO "menstrual_cycles_user_id_started_at_idx";

