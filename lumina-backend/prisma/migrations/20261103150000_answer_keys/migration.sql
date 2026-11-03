-- CreateEnum
CREATE TYPE "AnswerKeyOrigin" AS ENUM ('OFFICIAL', 'TEACHER', 'AI_SUGGESTED', 'COMMUNITY');

-- CreateEnum
CREATE TYPE "AnswerKeyStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "answer_keys" (
    "id" UUID NOT NULL,
    "exam_id" UUID NOT NULL,
    "application" VARCHAR(60) NOT NULL DEFAULT 'Regular',
    "day" INTEGER,
    "booklet_color" VARCHAR(30),
    "area" VARCHAR(80),
    "origin" "AnswerKeyOrigin" NOT NULL,
    "status" "AnswerKeyStatus" NOT NULL DEFAULT 'DRAFT',
    "source_name" VARCHAR(120),
    "source_url" VARCHAR(500),
    "published_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "correction_note" TEXT,
    "workspace_id" UUID,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "answer_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "answer_key_items" (
    "id" UUID NOT NULL,
    "answer_key_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "language" VARCHAR(10) NOT NULL DEFAULT '',
    "answer" INTEGER,
    "area" VARCHAR(80),
    "question_id" UUID,
    "justification" TEXT,
    "confidence" DOUBLE PRECISION,
    "validated" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "answer_key_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "answer_key_checks" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "answer_key_id" UUID NOT NULL,
    "answer_key_version" INTEGER NOT NULL,
    "language" VARCHAR(10),
    "input_mode" VARCHAR(10) NOT NULL DEFAULT 'MANUAL',
    "answers_json" JSONB NOT NULL,
    "correct" INTEGER NOT NULL,
    "wrong" INTEGER NOT NULL,
    "blank" INTEGER NOT NULL,
    "pending" INTEGER NOT NULL,
    "annulled" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "answer_key_checks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "answer_keys_exam_id_origin_status_idx" ON "answer_keys"("exam_id", "origin", "status");

-- CreateIndex
CREATE INDEX "answer_keys_created_by_idx" ON "answer_keys"("created_by");

-- CreateIndex
CREATE INDEX "answer_key_items_question_id_idx" ON "answer_key_items"("question_id");

-- CreateIndex
CREATE UNIQUE INDEX "answer_key_items_answer_key_id_number_language_key" ON "answer_key_items"("answer_key_id", "number", "language");

-- CreateIndex
CREATE INDEX "answer_key_checks_user_id_created_at_idx" ON "answer_key_checks"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "answer_key_checks_answer_key_id_idx" ON "answer_key_checks"("answer_key_id");

-- AddForeignKey
ALTER TABLE "answer_keys" ADD CONSTRAINT "answer_keys_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answer_keys" ADD CONSTRAINT "answer_keys_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answer_key_items" ADD CONSTRAINT "answer_key_items_answer_key_id_fkey" FOREIGN KEY ("answer_key_id") REFERENCES "answer_keys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answer_key_items" ADD CONSTRAINT "answer_key_items_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answer_key_checks" ADD CONSTRAINT "answer_key_checks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answer_key_checks" ADD CONSTRAINT "answer_key_checks_answer_key_id_fkey" FOREIGN KEY ("answer_key_id") REFERENCES "answer_keys"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Gabarito oficial único por prova, aplicação, dia e cor (evita duplicar o oficial).
CREATE UNIQUE INDEX "answer_keys_official_unique" ON "answer_keys" ("exam_id", "application", COALESCE("day", 0), COALESCE("booklet_color", '')) WHERE "origin" = 'OFFICIAL' AND "status" <> 'ARCHIVED';
