-- Histórico do domínio por tópico: uma linha por aluno, tópico e dia em que
-- o domínio mudou. É o que permite dizer quanto um tópico subiu na semana.

CREATE TABLE "topic_mastery_history" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "topic_id" UUID NOT NULL,
    "day" DATE NOT NULL,
    "mastery_score" INTEGER NOT NULL,
    "status" "TopicMasteryStatus" NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "correct_attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "topic_mastery_history_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "topic_mastery_history_user_id_topic_id_day_key" ON "topic_mastery_history"("user_id", "topic_id", "day");
CREATE INDEX "topic_mastery_history_user_id_day_idx" ON "topic_mastery_history"("user_id", "day");

ALTER TABLE "topic_mastery_history" ADD CONSTRAINT "topic_mastery_history_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "topic_mastery_history" ADD CONSTRAINT "topic_mastery_history_topic_id_fkey"
    FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Ponto de partida: o domínio que cada aluno já tem vira a primeira linha do
-- histórico, no dia do último estudo (em horário de Brasília). Sem isso, a
-- primeira semana mostraria todo tópico antigo como se tivesse saído do zero.
INSERT INTO "topic_mastery_history"
    ("id", "user_id", "topic_id", "day", "mastery_score", "status", "attempts", "correct_attempts", "updated_at")
SELECT gen_random_uuid(), "user_id", "topic_id",
       (COALESCE("last_studied_at", "updated_at") - INTERVAL '3 hours')::date,
       "mastery_score", "status", "attempts", "correct_attempts", CURRENT_TIMESTAMP
FROM "topic_masteries"
WHERE "status" <> 'NAO_ESTUDADO';
