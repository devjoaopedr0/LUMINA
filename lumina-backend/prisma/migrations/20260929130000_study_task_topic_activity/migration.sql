-- Cronograma adaptativo, fase 2 (docs/CRONOGRAMA_ADAPTATIVO_DESIGN.md §5-6).
--
-- StudyTask ganha topic_id (aponta pro catálogo de questões, não pro
-- StudySubject — é de lá que vem TopicMastery) e activity_type (teoria/
-- questões/revisão/simulado/redação). Tarefas existentes (geradas pelo
-- alocador antigo) viram QUESTOES por padrão — não é preciso reclassificar
-- histórico, só as tarefas novas passam a ter o tipo certo desde a criação.

CREATE TYPE "StudyActivityType" AS ENUM (
  'TEORIA',
  'QUESTOES',
  'REVISAO',
  'SIMULADO',
  'REDACAO'
);

ALTER TABLE "study_tasks" ADD COLUMN "topic_id" UUID;
ALTER TABLE "study_tasks" ADD COLUMN "activity_type" "StudyActivityType" NOT NULL DEFAULT 'QUESTOES';

CREATE INDEX IF NOT EXISTS "study_tasks_topic_id_idx" ON "study_tasks" ("topic_id");

ALTER TABLE "study_tasks"
  ADD CONSTRAINT "study_tasks_topic_id_fkey"
  FOREIGN KEY ("topic_id") REFERENCES "topics" ("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
