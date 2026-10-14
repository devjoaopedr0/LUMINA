-- CreateEnum
CREATE TYPE "AnswerSheetStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'NEEDS_REVIEW');

-- CreateEnum
CREATE TYPE "AnswerSheetProcessingStatus" AS ENUM ('PROCESSING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "answer_sheet_templates" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" TEXT,
    "markersJson" JSONB NOT NULL,
    "layoutJson" JSONB NOT NULL,
    "expectedWidth" INTEGER,
    "expectedHeight" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "answer_sheet_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "answer_sheet_uploads" (
    "id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "simulation_id" UUID,
    "student_id" UUID NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "metaJson" JSONB NOT NULL,
    "status" "AnswerSheetStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "answer_sheet_uploads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "answer_sheet_processings" (
    "id" UUID NOT NULL,
    "upload_id" UUID NOT NULL,
    "detectedAnswers" JSONB NOT NULL,
    "confidenceJson" JSONB NOT NULL,
    "warningsJson" JSONB NOT NULL,
    "totalQuestions" INTEGER NOT NULL,
    "answeredCount" INTEGER NOT NULL,
    "lowConfidenceCount" INTEGER NOT NULL,
    "status" "AnswerSheetProcessingStatus" NOT NULL DEFAULT 'PROCESSING',
    "errorMessage" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "answer_sheet_processings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "answer_sheet_submissions" (
    "id" UUID NOT NULL,
    "processing_id" UUID NOT NULL,
    "simulation_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "finalAnswers" JSONB NOT NULL,
    "correct" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMP(3),

    CONSTRAINT "answer_sheet_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "answer_sheet_uploads_simulation_id_student_id_idx" ON "answer_sheet_uploads"("simulation_id", "student_id");

-- CreateIndex
CREATE INDEX "answer_sheet_uploads_student_id_created_at_idx" ON "answer_sheet_uploads"("student_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "answer_sheet_processings_upload_id_key" ON "answer_sheet_processings"("upload_id");

-- CreateIndex
CREATE UNIQUE INDEX "answer_sheet_submissions_processing_id_key" ON "answer_sheet_submissions"("processing_id");

-- CreateIndex
CREATE INDEX "answer_sheet_submissions_simulation_id_student_id_idx" ON "answer_sheet_submissions"("simulation_id", "student_id");

-- CreateIndex
CREATE INDEX "answer_sheet_submissions_student_id_submitted_at_idx" ON "answer_sheet_submissions"("student_id", "submitted_at");

-- AddForeignKey
ALTER TABLE "answer_sheet_uploads" ADD CONSTRAINT "answer_sheet_uploads_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "answer_sheet_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answer_sheet_uploads" ADD CONSTRAINT "answer_sheet_uploads_simulation_id_fkey" FOREIGN KEY ("simulation_id") REFERENCES "simulations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answer_sheet_uploads" ADD CONSTRAINT "answer_sheet_uploads_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answer_sheet_processings" ADD CONSTRAINT "answer_sheet_processings_upload_id_fkey" FOREIGN KEY ("upload_id") REFERENCES "answer_sheet_uploads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answer_sheet_submissions" ADD CONSTRAINT "answer_sheet_submissions_processing_id_fkey" FOREIGN KEY ("processing_id") REFERENCES "answer_sheet_processings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answer_sheet_submissions" ADD CONSTRAINT "answer_sheet_submissions_simulation_id_fkey" FOREIGN KEY ("simulation_id") REFERENCES "simulations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answer_sheet_submissions" ADD CONSTRAINT "answer_sheet_submissions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answer_sheet_submissions" ADD CONSTRAINT "answer_sheet_submissions_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
