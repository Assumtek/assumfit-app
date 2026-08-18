-- O que o avaliador de segurança exigiu conter no plano.
--
-- A regra do produto mudou (ago/2026): reprovação do avaliador deixou de
-- descartar o plano e passou a pedir revisão. Esgotadas as revisões, o plano
-- sai com as ressalvas — e elas precisam chegar a quem vai treinar, senão a
-- pessoa recebe um treino mais conservador sem saber por quê.
--
-- Default de array vazio para os planos que já existem: eles foram gerados no
-- regime antigo, em que reprovado não virava plano, e nenhum tem ressalva.
ALTER TABLE "training_plans"
  ADD COLUMN "revision_notes" TEXT[] NOT NULL DEFAULT '{}';
