-- CreateEnum
CREATE TYPE "AnamnesisConversationStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'ABANDONED');

-- CreateTable
CREATE TABLE "anamnesis_conversations" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "status" "AnamnesisConversationStatus" NOT NULL DEFAULT 'ACTIVE',
    "answers" JSONB NOT NULL DEFAULT '{}',
    "messages" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "anamnesis_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "anamnesis_conversations_user_id_status_idx" ON "anamnesis_conversations"("user_id", "status");

-- AddForeignKey
ALTER TABLE "anamnesis_conversations" ADD CONSTRAINT "anamnesis_conversations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

