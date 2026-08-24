-- A conversa com o personal passa a viver na conta, não na tela.
--
-- Antes, o histórico era estado do aparelho e voltava ao servidor a cada
-- mensagem. Fechou o app, a conversa recomeçava; e o contexto que chegava ao
-- modelo era o que o cliente dissesse que era.
CREATE TABLE "plan_chat_messages" (
  "id"            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"       UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "role"          TEXT NOT NULL,
  "content"       TEXT NOT NULL,
  "adjustment_id" UUID,
  "created_at"    TIMESTAMPTZ(3) NOT NULL DEFAULT now()
);

-- A leitura é sempre "as últimas mensagens desta pessoa, em ordem".
CREATE INDEX "plan_chat_messages_user_id_created_at_idx"
  ON "plan_chat_messages" ("user_id", "created_at");
