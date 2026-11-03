-- AlterTable
ALTER TABLE "answer_sheet_submissions" ADD COLUMN     "finalized_at" TIMESTAMP(3);

-- Folhas lançadas antes desta migration já aplicaram o domínio por tópico
-- no lançamento (fluxo antigo): ficam como finalizadas para não contar duas vezes.
UPDATE "answer_sheet_submissions" SET "finalized_at" = "submitted_at" WHERE "finalized_at" IS NULL;
