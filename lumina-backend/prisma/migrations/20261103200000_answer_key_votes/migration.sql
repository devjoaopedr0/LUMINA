-- AlterTable
ALTER TABLE "answer_key_items" ADD COLUMN     "votes" INTEGER;

-- CreateTable
CREATE TABLE "answer_key_votes" (
    "id" UUID NOT NULL,
    "answer_key_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "language" VARCHAR(10) NOT NULL DEFAULT '',
    "answer" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "answer_key_votes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "answer_key_votes_answer_key_id_number_idx" ON "answer_key_votes"("answer_key_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "answer_key_votes_answer_key_id_user_id_number_language_key" ON "answer_key_votes"("answer_key_id", "user_id", "number", "language");

-- AddForeignKey
ALTER TABLE "answer_key_votes" ADD CONSTRAINT "answer_key_votes_answer_key_id_fkey" FOREIGN KEY ("answer_key_id") REFERENCES "answer_keys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answer_key_votes" ADD CONSTRAINT "answer_key_votes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Um gabarito comunitário só por prova, aplicação, dia e cor (os votos se somam nele).
CREATE UNIQUE INDEX "answer_keys_community_unique" ON "answer_keys" ("exam_id", "application", COALESCE("day", 0), COALESCE("booklet_color", '')) WHERE "origin" = 'COMMUNITY' AND "status" <> 'ARCHIVED';
