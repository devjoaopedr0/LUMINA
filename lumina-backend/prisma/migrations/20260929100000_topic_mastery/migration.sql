-- Cronograma adaptativo, fase 1 (docs/CRONOGRAMA_ADAPTATIVO_DESIGN.md §2).
--
-- TopicMastery é a peça que faltava para o cronograma priorizar por
-- desempenho real: uma linha por (aluno, tópico), atualizada a cada
-- tentativa de questão e a cada simulado respondido.
--
-- review_scheduled semantics segue exatamente ErrorNotebookEntry
-- (reviewScheduledAt/due): comparação por dia de calendário, meia-noite UTC.

CREATE TYPE "TopicMasteryStatus" AS ENUM (
  'NAO_ESTUDADO',
  'APRENDENDO',
  'PRATICANDO',
  'DOMINADO',
  'PRECISA_REFORCO'
);

CREATE TABLE IF NOT EXISTS "topic_masteries" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "subject_id" UUID NOT NULL,
  "topic_id" UUID NOT NULL,
  "mastery_score" INTEGER NOT NULL DEFAULT 0,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "correct_attempts" INTEGER NOT NULL DEFAULT 0,
  "correct_streak" INTEGER NOT NULL DEFAULT 0,
  "status" "TopicMasteryStatus" NOT NULL DEFAULT 'NAO_ESTUDADO',
  "last_studied_at" TIMESTAMP(3),
  "next_review_at" TIMESTAMP(3),
  "review_interval_days" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "topic_masteries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "topic_masteries_user_id_topic_id_key"
  ON "topic_masteries" ("user_id", "topic_id");

CREATE INDEX IF NOT EXISTS "topic_masteries_user_id_status_idx"
  ON "topic_masteries" ("user_id", "status");

CREATE INDEX IF NOT EXISTS "topic_masteries_user_id_next_review_at_idx"
  ON "topic_masteries" ("user_id", "next_review_at");

ALTER TABLE "topic_masteries"
  ADD CONSTRAINT "topic_masteries_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "topic_masteries"
  ADD CONSTRAINT "topic_masteries_subject_id_fkey"
  FOREIGN KEY ("subject_id") REFERENCES "subjects" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "topic_masteries"
  ADD CONSTRAINT "topic_masteries_topic_id_fkey"
  FOREIGN KEY ("topic_id") REFERENCES "topics" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
