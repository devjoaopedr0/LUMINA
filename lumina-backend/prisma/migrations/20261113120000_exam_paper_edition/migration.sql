-- Uma prova pode ter mais de um caderno no mesmo ano (ex.: os dois dias do
-- ENEM). As provas existentes ficam com edição vazia.

-- DropIndex
DROP INDEX "exam_papers_exam_id_year_key";

-- AlterTable
ALTER TABLE "exam_papers" ADD COLUMN     "edition" VARCHAR(40) NOT NULL DEFAULT '';

-- CreateIndex
CREATE UNIQUE INDEX "exam_papers_exam_id_year_edition_key" ON "exam_papers"("exam_id", "year", "edition");
