-- CreateEnum
CREATE TYPE "question_difficulty" AS ENUM ('FACIL', 'MEDIA', 'DIFICIL');

-- CreateTable
CREATE TABLE "questions" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "subject" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "difficulty" "question_difficulty" NOT NULL,
    "exam" TEXT NOT NULL,
    "year" INTEGER,
    "exam_number" INTEGER,
    "stem" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_alternatives" (
    "id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "is_correct" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "question_alternatives_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_attempts" (
    "id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "selected_position" INTEGER NOT NULL,
    "is_correct" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "question_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "questions_workspace_id_idx" ON "questions"("workspace_id");

-- CreateIndex
CREATE INDEX "questions_workspace_id_subject_idx" ON "questions"("workspace_id", "subject");

-- CreateIndex
CREATE INDEX "questions_workspace_id_difficulty_idx" ON "questions"("workspace_id", "difficulty");

-- CreateIndex
CREATE INDEX "questions_workspace_id_exam_idx" ON "questions"("workspace_id", "exam");

-- CreateIndex
CREATE INDEX "question_alternatives_question_id_idx" ON "question_alternatives"("question_id");

-- CreateIndex
CREATE INDEX "question_attempts_workspace_id_idx" ON "question_attempts"("workspace_id");

-- CreateIndex
CREATE INDEX "question_attempts_question_id_idx" ON "question_attempts"("question_id");

-- CreateIndex
CREATE INDEX "question_attempts_user_id_idx" ON "question_attempts"("user_id");

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_alternatives" ADD CONSTRAINT "question_alternatives_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_attempts" ADD CONSTRAINT "question_attempts_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_attempts" ADD CONSTRAINT "question_attempts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_attempts" ADD CONSTRAINT "question_attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
