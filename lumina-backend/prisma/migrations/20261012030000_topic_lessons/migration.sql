-- Resumo de teoria por tópico, para a tarefa de "Teoria" do cronograma.
-- Um por tópico, igual para todos os alunos: gerado uma vez e reaproveitado.

CREATE TABLE "topic_lessons" (
    "id" UUID NOT NULL,
    "topic_id" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "source" VARCHAR(20) NOT NULL DEFAULT 'AI',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "topic_lessons_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "topic_lessons_topic_id_key" ON "topic_lessons"("topic_id");

ALTER TABLE "topic_lessons" ADD CONSTRAINT "topic_lessons_topic_id_fkey"
    FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
