-- Todas as imagens do app passam a viver no S3 (decisão da fundadora,
-- 01/09/2026). O que entra no banco é o PONTEIRO, nunca a imagem.
--
-- Escrita à mão: o `migrate dev` desta máquina arrasta deriva do banco de
-- desenvolvimento junto (drop/recreate de foreign keys, DROP DEFAULT em
-- colunas id), e nada disso é mudança pedida.

-- A foto do prato. Era analisada e descartada, com uma cópia no aparelho.
ALTER TABLE "meal_records" ADD COLUMN "image_key" TEXT;

-- A foto de perfil. Existia só no aparelho.
ALTER TABLE "users" ADD COLUMN "avatar_key" TEXT;

-- Foto de corpo é o dado mais sensível que o app guarda: finalidade própria,
-- revogável sozinha, e revogar apaga os objetos.
ALTER TYPE "ConsentPurpose" ADD VALUE IF NOT EXISTS 'progress_photos';

-- A linha do tempo do corpo, que vivia só no aparelho.
CREATE TABLE "progress_photos" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "image_key" TEXT NOT NULL,
    "angle" TEXT,
    "taken_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "progress_photos_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "progress_photos_user_id_taken_at_idx"
    ON "progress_photos"("user_id", "taken_at" DESC);

ALTER TABLE "progress_photos" ADD CONSTRAINT "progress_photos_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
