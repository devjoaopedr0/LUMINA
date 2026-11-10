-- CreateEnum
CREATE TYPE "FlashcardSource" AS ENUM ('MANUAL', 'ERROR_NOTEBOOK', 'AI');

-- CreateEnum
CREATE TYPE "FlashcardRating" AS ENUM ('AGAIN', 'HARD', 'GOOD', 'EASY');

-- CreateTable
CREATE TABLE "flashcards" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "subject_id" UUID,
    "topic_id" UUID,
    "source_question_id" UUID,
    "source" "FlashcardSource" NOT NULL DEFAULT 'MANUAL',
    "front" TEXT NOT NULL,
    "back" TEXT NOT NULL,
    "metadata" JSONB,
    "review_count" INTEGER NOT NULL DEFAULT 0,
    "correct_count" INTEGER NOT NULL DEFAULT 0,
    "streak" INTEGER NOT NULL DEFAULT 0,
    "interval_days" INTEGER NOT NULL DEFAULT 0,
    "ease_factor" DOUBLE PRECISION NOT NULL DEFAULT 2.5,
    "next_review_at" TIMESTAMP(3),
    "last_reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "flashcards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flashcard_reviews" (
    "id" UUID NOT NULL,
    "flashcard_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "rating" "FlashcardRating" NOT NULL,
    "reviewed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "interval_days" INTEGER NOT NULL,
    "ease_factor" DOUBLE PRECISION NOT NULL,
    "next_review_at" TIMESTAMP(3),

    CONSTRAINT "flashcard_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "flashcards_user_id_next_review_at_idx" ON "flashcards"("user_id", "next_review_at");

-- CreateIndex
CREATE INDEX "flashcards_user_id_subject_id_idx" ON "flashcards"("user_id", "subject_id");

-- CreateIndex
CREATE INDEX "flashcards_user_id_topic_id_idx" ON "flashcards"("user_id", "topic_id");

-- CreateIndex
CREATE UNIQUE INDEX "flashcards_user_id_source_question_id_key" ON "flashcards"("user_id", "source_question_id");

-- CreateIndex
CREATE INDEX "flashcard_reviews_flashcard_id_reviewed_at_idx" ON "flashcard_reviews"("flashcard_id", "reviewed_at");

-- CreateIndex
CREATE INDEX "flashcard_reviews_user_id_reviewed_at_idx" ON "flashcard_reviews"("user_id", "reviewed_at");

-- AddForeignKey
ALTER TABLE "flashcards" ADD CONSTRAINT "flashcards_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flashcards" ADD CONSTRAINT "flashcards_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flashcards" ADD CONSTRAINT "flashcards_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flashcards" ADD CONSTRAINT "flashcards_source_question_id_fkey" FOREIGN KEY ("source_question_id") REFERENCES "questions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flashcard_reviews" ADD CONSTRAINT "flashcard_reviews_flashcard_id_fkey" FOREIGN KEY ("flashcard_id") REFERENCES "flashcards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flashcard_reviews" ADD CONSTRAINT "flashcard_reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
