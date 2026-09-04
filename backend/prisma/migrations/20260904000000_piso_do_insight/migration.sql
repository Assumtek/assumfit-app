-- Quando a frase da home foi redigida, para não recomprá-la a cada leitura.
--
-- Escrita à mão: o `migrate dev` desta máquina arrasta deriva do banco de
-- desenvolvimento junto (drop/recreate de foreign keys, DROP DEFAULT em
-- colunas id), e nada disso é mudança pedida.
ALTER TABLE "energy_scores" ADD COLUMN "insight_at" TIMESTAMPTZ(3);
