-- Tarefa concluída pela prática guarda o resultado do bloco de questões
-- (quantas o aluno respondeu e quantas acertou). Nulo = concluída à mão.

ALTER TABLE "study_tasks" ADD COLUMN "practice_answered" INTEGER;
ALTER TABLE "study_tasks" ADD COLUMN "practice_correct" INTEGER;
