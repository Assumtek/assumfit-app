-- O plano nasce em RASCUNHO e só vale depois de aprovado.
--
-- Escrita à mão: o `migrate dev` desta máquina arrasta deriva do banco de
-- desenvolvimento junto, e nada disso é mudança pedida.
ALTER TYPE "TrainingPlanStatus" ADD VALUE IF NOT EXISTS 'DRAFT' BEFORE 'ACTIVE';
