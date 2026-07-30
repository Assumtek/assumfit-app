-- CreateTable
CREATE TABLE "sport_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "sport" TEXT NOT NULL,
    "started_at" TIMESTAMPTZ(3) NOT NULL,
    "duration_s" INTEGER NOT NULL,
    "distance_m" INTEGER,
    "kcal" INTEGER NOT NULL,
    "avg_hr" INTEGER,
    "max_hr" INTEGER,

    CONSTRAINT "sport_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sport_sessions_user_id_started_at_idx" ON "sport_sessions"("user_id", "started_at" DESC);

-- AddForeignKey
ALTER TABLE "sport_sessions" ADD CONSTRAINT "sport_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
