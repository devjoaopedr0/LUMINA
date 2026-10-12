-- O aluno passa a escolher até três áreas prioritárias no cronograma, em vez
-- de uma. A área já escolhida é levada para a lista antes de a coluna antiga
-- sair.

ALTER TABLE "study_schedules" ADD COLUMN "priority_areas" "study_area"[] NOT NULL DEFAULT ARRAY[]::"study_area"[];

UPDATE "study_schedules"
SET "priority_areas" = ARRAY["priority_area"]
WHERE "priority_area" IS NOT NULL;

ALTER TABLE "study_schedules" DROP COLUMN "priority_area";
