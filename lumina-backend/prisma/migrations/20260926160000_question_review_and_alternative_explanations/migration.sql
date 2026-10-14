-- Fechamento do item 11 (Resolução de questões): "marcar para revisar" e a
-- explicação de cada alternativa errada.
--
-- 1. question_alternatives.explanation: por que a alternativa está errada.
--    Texto do autor da questão, entregue ao aluno SOMENTE depois que ele
--    responde (vem no resultado da tentativa). Expor antes revelaria o
--    gabarito, então a coluna nunca entra na visão de "responder".
--
-- 2. user_question_progress.marked_for_review: compromisso de retomar a questão.
--    Diferente de is_favorite (o que o aluno achou interessante), o índice
--    dedicado dá a listagem "Para revisar" sem varrer a tabela toda.
--
-- Colunas novas são nuláveis (explicação) ou com default (false), então a
-- migration é segura em qualquer ambiente e não exige backfill.
ALTER TABLE "question_alternatives"
  ADD COLUMN IF NOT EXISTS "explanation" TEXT;

ALTER TABLE "user_question_progress"
  ADD COLUMN IF NOT EXISTS "marked_for_review" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "user_question_progress_user_id_marked_for_review_idx"
  ON "user_question_progress" ("user_id", "marked_for_review");
