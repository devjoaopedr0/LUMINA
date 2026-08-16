-- CreateEnum
CREATE TYPE "question_source_type" AS ENUM ('OFFICIAL', 'PARTNER', 'GENERATED', 'IMPORTED');

-- AlterTable
ALTER TABLE "question_attempts" ADD COLUMN     "time_spent" INTEGER;

-- AlterTable
ALTER TABLE "questions" ADD COLUMN     "content_hash" TEXT,
ADD COLUMN     "created_by" UUID,
ADD COLUMN     "exam_id" UUID,
ADD COLUMN     "explanation" TEXT,
ADD COLUMN     "image_url" TEXT,
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "source_id" TEXT,
ADD COLUMN     "source_name" TEXT NOT NULL DEFAULT 'Lumina',
ADD COLUMN     "source_type" "question_source_type" NOT NULL DEFAULT 'OFFICIAL',
ADD COLUMN     "subject_id" UUID,
ADD COLUMN     "topic_id" UUID;

-- CreateTable
CREATE TABLE "subjects" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "topics" (
    "id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "topics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exams" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "year" INTEGER,
    "institution" TEXT,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_question_progress" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "correct_attempts" INTEGER NOT NULL DEFAULT 0,
    "incorrect_attempts" INTEGER NOT NULL DEFAULT 0,
    "last_attempt_at" TIMESTAMP(3),
    "is_favorite" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_question_progress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "subjects_name_key" ON "subjects"("name");

-- CreateIndex
CREATE INDEX "topics_subject_id_idx" ON "topics"("subject_id");

-- CreateIndex
CREATE UNIQUE INDEX "topics_subject_id_name_key" ON "topics"("subject_id", "name");

-- CreateIndex
CREATE INDEX "exams_name_year_idx" ON "exams"("name", "year");

-- CreateIndex
CREATE INDEX "user_question_progress_user_id_is_favorite_idx" ON "user_question_progress"("user_id", "is_favorite");

-- CreateIndex
CREATE INDEX "user_question_progress_question_id_idx" ON "user_question_progress"("question_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_question_progress_user_id_question_id_key" ON "user_question_progress"("user_id", "question_id");

-- CreateIndex
CREATE INDEX "questions_workspace_id_subject_id_idx" ON "questions"("workspace_id", "subject_id");

-- CreateIndex
CREATE INDEX "questions_workspace_id_topic_id_idx" ON "questions"("workspace_id", "topic_id");

-- CreateIndex
CREATE INDEX "questions_workspace_id_exam_id_idx" ON "questions"("workspace_id", "exam_id");

-- CreateIndex
CREATE INDEX "questions_source_type_idx" ON "questions"("source_type");

-- CreateIndex
CREATE INDEX "questions_content_hash_idx" ON "questions"("content_hash");

-- AddForeignKey
ALTER TABLE "topics" ADD CONSTRAINT "topics_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "exams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_question_progress" ADD CONSTRAINT "user_question_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_question_progress" ADD CONSTRAINT "user_question_progress_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
