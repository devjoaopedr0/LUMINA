-- CreateEnum
CREATE TYPE "QuestionScanStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "QuestionScanProcessingStatus" AS ENUM ('PROCESSING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "question_scan_uploads" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "metaJson" JSONB NOT NULL,
    "status" "QuestionScanStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "question_scan_uploads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_scan_processings" (
    "id" UUID NOT NULL,
    "upload_id" UUID NOT NULL,
    "stemText" TEXT,
    "alternativesJson" JSONB,
    "subject" TEXT,
    "topic" TEXT,
    "difficulty" "question_difficulty",
    "explanationJson" JSONB,
    "confidence" DOUBLE PRECISION,
    "warningsJson" JSONB,
    "status" "QuestionScanProcessingStatus" NOT NULL DEFAULT 'PROCESSING',
    "errorMessage" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "question_scan_processings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_scan_results" (
    "id" UUID NOT NULL,
    "processing_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "question_id" UUID,
    "error_notebook_entry_id" UUID,
    "finalStem" TEXT NOT NULL,
    "finalAlternatives" JSONB NOT NULL,
    "finalSubject" TEXT NOT NULL,
    "finalTopic" TEXT NOT NULL,
    "finalDifficulty" "question_difficulty" NOT NULL,
    "finalExplanation" JSONB,
    "saved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "question_scan_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "question_scan_uploads_user_id_created_at_idx" ON "question_scan_uploads"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "question_scan_processings_upload_id_key" ON "question_scan_processings"("upload_id");

-- CreateIndex
CREATE UNIQUE INDEX "question_scan_results_processing_id_key" ON "question_scan_results"("processing_id");

-- CreateIndex
CREATE INDEX "question_scan_results_user_id_saved_at_idx" ON "question_scan_results"("user_id", "saved_at");

-- AddForeignKey
ALTER TABLE "question_scan_uploads" ADD CONSTRAINT "question_scan_uploads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_scan_processings" ADD CONSTRAINT "question_scan_processings_upload_id_fkey" FOREIGN KEY ("upload_id") REFERENCES "question_scan_uploads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_scan_results" ADD CONSTRAINT "question_scan_results_processing_id_fkey" FOREIGN KEY ("processing_id") REFERENCES "question_scan_processings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_scan_results" ADD CONSTRAINT "question_scan_results_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_scan_results" ADD CONSTRAINT "question_scan_results_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_scan_results" ADD CONSTRAINT "question_scan_results_error_notebook_entry_id_fkey" FOREIGN KEY ("error_notebook_entry_id") REFERENCES "error_notebook_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
