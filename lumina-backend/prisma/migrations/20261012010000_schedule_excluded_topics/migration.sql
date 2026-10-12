-- O aluno escolhe quais tópicos de cada matéria quer estudar: os que ele
-- tira ficam guardados no cronograma e o gerador não os agenda mais.

ALTER TABLE "study_schedules" ADD COLUMN "excluded_topic_ids" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[];
