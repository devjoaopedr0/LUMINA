-- O cronômetro passa a registrar tempo por MATÉRIA, e não mais por tarefa
-- (subtópico). study_time_logs ganha `subject_id` e `task_id` fica opcional:
-- assim dá para registrar tempo de uma matéria do cronograma mesmo em dia
-- sem sessão programada.
ALTER TABLE "study_time_logs" ADD COLUMN "subject_id" UUID;

-- Registros antigos (ligados só à tarefa) herdam a disciplina da tarefa, para
-- que o histórico continue somando no progresso do cronograma.
UPDATE "study_time_logs" AS l
SET "subject_id" = t."subject_id"
FROM "study_tasks" AS t
WHERE t."id" = l."task_id" AND t."subject_id" IS NOT NULL;

ALTER TABLE "study_time_logs" ALTER COLUMN "task_id" DROP NOT NULL;

CREATE INDEX "study_time_logs_subject_id_idx" ON "study_time_logs"("subject_id");

ALTER TABLE "study_time_logs"
ADD CONSTRAINT "study_time_logs_subject_id_fkey"
FOREIGN KEY ("subject_id") REFERENCES "study_subjects"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
