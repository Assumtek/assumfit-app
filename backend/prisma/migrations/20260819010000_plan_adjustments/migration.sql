-- A proposta do chat do Personal, guardada até a pessoa confirmar.
--
-- Até agora o chat só CONVERSAVA: o agente devolvia operações e o backend as
-- descartava, porque o caminho de aplicar nunca existiu. Do lado de quem usa,
-- isso aparecia como um "sim" que não fazia nada — a pessoa aceitava a mudança
-- e o treino continuava igual.
--
-- A proposta mora no SERVIDOR e não no app, e a razão é de segurança: se o
-- aplicar recebesse as operações do cliente, qualquer requisição poderia
-- escrever um diff arbitrário no plano, por fora das travas clínicas que
-- decidem quem pode receber prescrição automática. O app só devolve o id.
--
-- A linha sobrevive à aplicação de propósito. Mudança de prescrição precisa de
-- rastro: "por que meu treino de quinta mudou?" se responde com a conversa que
-- produziu a mudança, e ela fica aqui junto do diff que foi aplicado.
CREATE TYPE "PlanAdjustmentStatus" AS ENUM ('PENDING', 'APPLIED', 'STALE', 'SUPERSEDED');

CREATE TABLE "plan_adjustments" (
  "id"          UUID PRIMARY KEY,
  "user_id"     UUID NOT NULL,
  "plan_id"     UUID NOT NULL,
  "message"     TEXT NOT NULL,
  "reply"       TEXT NOT NULL,
  "operations"  JSONB NOT NULL,
  "status"      "PlanAdjustmentStatus" NOT NULL DEFAULT 'PENDING',
  "fail_reason" TEXT,
  "trace_id"    TEXT,
  "created_at"  TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "applied_at"  TIMESTAMPTZ(3),

  CONSTRAINT "plan_adjustments_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "plan_adjustments_plan_id_fkey"
    FOREIGN KEY ("plan_id") REFERENCES "training_plans"("id") ON DELETE CASCADE
);

CREATE INDEX "plan_adjustments_user_id_created_at_idx"
  ON "plan_adjustments" ("user_id", "created_at");

-- A consulta quente é "existe proposta pendente para este plano?", feita a cada
-- confirmação e a cada nova mensagem que supera a anterior.
CREATE INDEX "plan_adjustments_plan_id_status_idx"
  ON "plan_adjustments" ("plan_id", "status");
