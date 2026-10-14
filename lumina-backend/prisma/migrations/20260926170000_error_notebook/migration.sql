-- Item 12 (Caderno de erros) e item 13 (classificação do motivo do erro).
--
-- O caderno é por aluno e por questão: uma linha por par (user_id,
-- question_id), criada automaticamente no primeiro erro e mantida nas
-- repetições. É o registro do que o aluno precisa voltar a fazer, com o motivo
-- do erro, a observação pessoal, a data de revisão combinada e a evolução das
-- tentativas.
--
-- Decisões que valem registro:
--
-- 1. reason é ENUM e não texto livre: o item 13 pede classificação (falta de
--    conteúdo, erro de interpretação, erro de cálculo, falta de atenção,
--    chute, tempo insuficiente, confusão entre conceitos), e é essa
--    classificação que permite agrupar e comparar. "OUTRO" existe para o que
--    não cabe na lista — com a explicação em notes, sem inventar um motivo.
--
-- 2. A dificuldade NÃO é duplicada aqui: a da questão é a fonte única, e o
--    caderno mostra e filtra por ela. Se o autor reclassificar a questão, o
--    caderno acompanha sem migración.
--
-- 3. A sequência de tentativas (evolution) é um texto curto ("EEAA"): a
--    interface mostra a linha do tempo do aprendizado sem uma tabela de
--    histórico que só cresceria. O serviço limita em 40 caracteres.
--
-- 4. question_id com ON DELETE CASCADE: questão apagada não deixa pendência
--    órfã no caderno de quem errou.
CREATE TYPE "ErrorReason" AS ENUM (
  'FALTA_CONTEUDO',
  'ERRO_INTERPRETACAO',
  'ERRO_CALCULO',
  'FALTA_ATENCAO',
  'CHUTE',
  'TEMPO_INSUFICIENTE',
  'CONFUSAO_CONCEITOS',
  'OUTRO'
);

CREATE TYPE "ErrorNotebookStatus" AS ENUM ('ABERTA', 'DOMINADA');

CREATE TABLE IF NOT EXISTS "error_notebook_entries" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "question_id" UUID NOT NULL,
  "reason" "ErrorReason",
  "notes" TEXT,
  "status" "ErrorNotebookStatus" NOT NULL DEFAULT 'ABERTA',
  "wrong_attempts" INTEGER NOT NULL DEFAULT 1,
  "correct_streak" INTEGER NOT NULL DEFAULT 0,
  "evolution" TEXT NOT NULL DEFAULT '',
  "review_scheduled_at" TIMESTAMP(3),
  "first_wrong_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_wrong_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolved_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "error_notebook_entries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "error_notebook_entries_user_id_question_id_key"
  ON "error_notebook_entries" ("user_id", "question_id");

CREATE INDEX IF NOT EXISTS "error_notebook_entries_user_id_status_idx"
  ON "error_notebook_entries" ("user_id", "status");

CREATE INDEX IF NOT EXISTS "error_notebook_entries_user_id_review_scheduled_at_idx"
  ON "error_notebook_entries" ("user_id", "review_scheduled_at");

CREATE INDEX IF NOT EXISTS "error_notebook_entries_question_id_idx"
  ON "error_notebook_entries" ("question_id");

ALTER TABLE "error_notebook_entries"
  ADD CONSTRAINT "error_notebook_entries_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "error_notebook_entries"
  ADD CONSTRAINT "error_notebook_entries_question_id_fkey"
  FOREIGN KEY ("question_id") REFERENCES "questions" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
