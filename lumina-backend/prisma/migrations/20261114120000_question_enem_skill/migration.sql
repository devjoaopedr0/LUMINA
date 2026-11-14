-- Habilidade da Matriz de Referência do ENEM por questão (só adições).
ALTER TABLE "questions" ADD COLUMN "enem_skill" VARCHAR(6);
ALTER TABLE "questions" ADD COLUMN "enem_skill_origin" VARCHAR(10);
ALTER TABLE "questions" ADD COLUMN "enem_skill_validated" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "questions" ADD COLUMN "enem_skill_note" TEXT;

CREATE INDEX "questions_workspace_id_enem_skill_idx" ON "questions"("workspace_id", "enem_skill");
