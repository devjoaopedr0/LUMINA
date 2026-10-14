-- Meta de nota do aluno a partir da nota de corte do Sisu.
--
-- sisu_cutoffs guarda a nota de corte de cada curso ofertado por edição
-- (relatórios "Inscrições e notas de corte" do MEC), uma linha por curso e
-- ano com a nota de cada modalidade em coluna. user_profiles ganha a
-- modalidade de concorrência do aluno. Tudo aditivo.

ALTER TABLE "user_profiles" ADD COLUMN "sisu_modality" VARCHAR(10);

CREATE TABLE "sisu_cutoffs" (
  "id" UUID NOT NULL,
  "year" INTEGER NOT NULL,
  "course_code" INTEGER NOT NULL,
  "institution_code" INTEGER NOT NULL,
  "institution_name" TEXT NOT NULL,
  "institution_acronym" TEXT NOT NULL,
  "campus" TEXT NOT NULL,
  "city" TEXT NOT NULL,
  "state" CHAR(2) NOT NULL,
  "course_name" TEXT NOT NULL,
  "degree" TEXT NOT NULL,
  "shift" TEXT NOT NULL,
  "course_key" TEXT NOT NULL,
  "institution_key" TEXT NOT NULL,
  "score_ac" DOUBLE PRECISION,
  "score_lb_ppi" DOUBLE PRECISION,
  "score_lb_q" DOUBLE PRECISION,
  "score_lb_pcd" DOUBLE PRECISION,
  "score_lb_ep" DOUBLE PRECISION,
  "score_li_ppi" DOUBLE PRECISION,
  "score_li_q" DOUBLE PRECISION,
  "score_li_pcd" DOUBLE PRECISION,
  "score_li_ep" DOUBLE PRECISION,

  CONSTRAINT "sisu_cutoffs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sisu_cutoffs_year_course_code_key" ON "sisu_cutoffs" ("year", "course_code");
CREATE INDEX "sisu_cutoffs_course_key_idx" ON "sisu_cutoffs" ("course_key");
