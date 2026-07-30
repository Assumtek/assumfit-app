-- CreateTable
CREATE TABLE "meal_records" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "foods" JSONB NOT NULL,
    "kcal_min" INTEGER NOT NULL,
    "kcal_max" INTEGER NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "notes" TEXT,

    CONSTRAINT "meal_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "meal_records_user_id_at_idx" ON "meal_records"("user_id", "at");

-- AddForeignKey
ALTER TABLE "meal_records" ADD CONSTRAINT "meal_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
