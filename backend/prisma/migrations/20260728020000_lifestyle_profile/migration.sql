-- CreateEnum
CREATE TYPE "WorkPosture" AS ENUM ('sitting', 'standing', 'alternating', 'moving');

-- CreateEnum
CREATE TYPE "WorkSchedule" AS ENUM ('business', 'shifts', 'night', 'flexible');

-- CreateEnum
CREATE TYPE "ExerciseFrequency" AS ENUM ('regular', 'sometimes', 'none');


-- CreateTable
CREATE TABLE "lifestyle_profiles" (
    "user_id" UUID NOT NULL,
    "occupation" TEXT,
    "work_posture" "WorkPosture",
    "posture_hours" INTEGER,
    "work_schedule" "WorkSchedule",
    "bedtime" DOUBLE PRECISION,
    "exercises" "ExerciseFrequency",
    "blocker" TEXT,
    "activities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "train_days" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "train_period" TEXT,
    "train_place" TEXT,
    "goal" TEXT,
    "completed_at" TIMESTAMPTZ(3),
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "lifestyle_profiles_pkey" PRIMARY KEY ("user_id")
);

-- AddForeignKey
ALTER TABLE "lifestyle_profiles" ADD CONSTRAINT "lifestyle_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

