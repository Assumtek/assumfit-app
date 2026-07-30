-- CreateTable
CREATE TABLE "health_anamnesis_versions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "answers" JSONB NOT NULL,
    "flags" TEXT[],
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "health_anamnesis_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "health_anamnesis_versions_user_id_created_at_idx" ON "health_anamnesis_versions"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "health_anamnesis_versions" ADD CONSTRAINT "health_anamnesis_versions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

