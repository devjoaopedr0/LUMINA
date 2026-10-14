-- Cronograma adaptativo, fases 4 e 5 (docs/CRONOGRAMA_ADAPTATIVO_DESIGN.md
-- §9, §11, §12). Tudo aditivo: colunas novas são opcionais e cronogramas
-- existentes seguem funcionando sem nenhum backfill.

-- Fase 4 (§12): tarefa que o aluno decidiu não fazer.
ALTER TYPE "study_task_status" ADD VALUE IF NOT EXISTS 'SKIPPED';

-- Fase 5 (§11): objetivo do onboarding.
CREATE TYPE "study_area" AS ENUM ('LINGUAGENS', 'MATEMATICA', 'NATUREZA', 'HUMANAS');
-- Fase 5 (§9): rotina de redação.
CREATE TYPE "study_essay_frequency" AS ENUM ('WEEKLY', 'BIWEEKLY');

ALTER TABLE "study_schedules" ADD COLUMN "target_course" TEXT;
ALTER TABLE "study_schedules" ADD COLUMN "priority_area" "study_area";
ALTER TABLE "study_schedules" ADD COLUMN "essay_frequency" "study_essay_frequency";

-- Fase 5 (§11): disponibilidade por dia da semana. Sem linhas = usa
-- study_schedules.daily_minutes para todo dia de estudo, como antes.
CREATE TABLE "study_schedule_day_minutes" (
  "id" UUID NOT NULL,
  "schedule_id" UUID NOT NULL,
  "weekday" INTEGER NOT NULL,
  "minutes" INTEGER NOT NULL,

  CONSTRAINT "study_schedule_day_minutes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "study_schedule_day_minutes_schedule_id_weekday_key"
  ON "study_schedule_day_minutes" ("schedule_id", "weekday");

ALTER TABLE "study_schedule_day_minutes"
  ADD CONSTRAINT "study_schedule_day_minutes_schedule_id_fkey"
  FOREIGN KEY ("schedule_id") REFERENCES "study_schedules" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
