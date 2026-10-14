-- CreateEnum
CREATE TYPE "ExamPaperStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "EssayCorrectionStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "exam_papers" (
    "id" UUID NOT NULL,
    "exam_id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "pdfUrl" TEXT,
    "pageImagesJson" JSONB,
    "metadataJson" JSONB,
    "gabaritoJson" JSONB,
    "cadernoJson" JSONB,
    "status" "ExamPaperStatus" NOT NULL DEFAULT 'DRAFT',
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exam_papers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_paper_pages" (
    "id" UUID NOT NULL,
    "paper_id" UUID NOT NULL,
    "pageNumber" INTEGER NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "dimensionsJson" JSONB,
    "textContent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exam_paper_pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_paper_questions" (
    "id" UUID NOT NULL,
    "paper_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "pageNumber" INTEGER NOT NULL,
    "boundsJson" JSONB,
    "area" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exam_paper_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_paper_comparisons" (
    "id" UUID NOT NULL,
    "base_paper_id" UUID NOT NULL,
    "compare_paper_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "detailsJson" JSONB NOT NULL,
    "similarity_score" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exam_paper_comparisons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "essay_corrections" (
    "id" UUID NOT NULL,
    "essay_id" UUID NOT NULL,
    "competenciesJson" JSONB NOT NULL,
    "totalScore" INTEGER NOT NULL,
    "status" "EssayCorrectionStatus" NOT NULL DEFAULT 'PENDING',
    "corrected_by" TEXT,
    "is_ai_correction" BOOLEAN NOT NULL DEFAULT false,
    "confidence" DOUBLE PRECISION,
    "general_feedback" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "essay_corrections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "essay_correction_details" (
    "id" UUID NOT NULL,
    "correction_id" UUID NOT NULL,
    "competency" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "justification" TEXT,
    "evidenceJson" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "essay_correction_details_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "essay_versions" (
    "id" UUID NOT NULL,
    "essay_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "word_count" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,

    CONSTRAINT "essay_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "essay_feedbacks" (
    "id" UUID NOT NULL,
    "essay_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "author_id" UUID,
    "content" TEXT NOT NULL,
    "anchorJson" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "essay_feedbacks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "exam_papers_exam_id_year_idx" ON "exam_papers"("exam_id", "year");

-- CreateIndex
CREATE UNIQUE INDEX "exam_papers_exam_id_year_key" ON "exam_papers"("exam_id", "year");

-- CreateIndex
CREATE INDEX "exam_paper_pages_paper_id_idx" ON "exam_paper_pages"("paper_id");

-- CreateIndex
CREATE UNIQUE INDEX "exam_paper_pages_paper_id_pageNumber_key" ON "exam_paper_pages"("paper_id", "pageNumber");

-- CreateIndex
CREATE INDEX "exam_paper_questions_paper_id_pageNumber_idx" ON "exam_paper_questions"("paper_id", "pageNumber");

-- CreateIndex
CREATE UNIQUE INDEX "exam_paper_questions_paper_id_number_key" ON "exam_paper_questions"("paper_id", "number");

-- CreateIndex
CREATE INDEX "exam_paper_comparisons_base_paper_id_idx" ON "exam_paper_comparisons"("base_paper_id");

-- CreateIndex
CREATE INDEX "exam_paper_comparisons_compare_paper_id_idx" ON "exam_paper_comparisons"("compare_paper_id");

-- CreateIndex
CREATE UNIQUE INDEX "exam_paper_comparisons_base_paper_id_compare_paper_id_key" ON "exam_paper_comparisons"("base_paper_id", "compare_paper_id");

-- CreateIndex
CREATE UNIQUE INDEX "essay_corrections_essay_id_key" ON "essay_corrections"("essay_id");

-- CreateIndex
CREATE INDEX "essay_correction_details_correction_id_idx" ON "essay_correction_details"("correction_id");

-- CreateIndex
CREATE UNIQUE INDEX "essay_correction_details_correction_id_competency_key" ON "essay_correction_details"("correction_id", "competency");

-- CreateIndex
CREATE INDEX "essay_versions_essay_id_idx" ON "essay_versions"("essay_id");

-- CreateIndex
CREATE UNIQUE INDEX "essay_versions_essay_id_version_key" ON "essay_versions"("essay_id", "version");

-- CreateIndex
CREATE INDEX "essay_feedbacks_essay_id_created_at_idx" ON "essay_feedbacks"("essay_id", "created_at");

-- AddForeignKey
ALTER TABLE "exam_papers" ADD CONSTRAINT "exam_papers_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_paper_pages" ADD CONSTRAINT "exam_paper_pages_paper_id_fkey" FOREIGN KEY ("paper_id") REFERENCES "exam_papers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_paper_questions" ADD CONSTRAINT "exam_paper_questions_paper_id_fkey" FOREIGN KEY ("paper_id") REFERENCES "exam_papers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_paper_questions" ADD CONSTRAINT "exam_paper_questions_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_paper_comparisons" ADD CONSTRAINT "exam_paper_comparisons_base_paper_id_fkey" FOREIGN KEY ("base_paper_id") REFERENCES "exam_papers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_paper_comparisons" ADD CONSTRAINT "exam_paper_comparisons_compare_paper_id_fkey" FOREIGN KEY ("compare_paper_id") REFERENCES "exam_papers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "essay_corrections" ADD CONSTRAINT "essay_corrections_essay_id_fkey" FOREIGN KEY ("essay_id") REFERENCES "essays"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "essay_correction_details" ADD CONSTRAINT "essay_correction_details_correction_id_fkey" FOREIGN KEY ("correction_id") REFERENCES "essay_corrections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "essay_versions" ADD CONSTRAINT "essay_versions_essay_id_fkey" FOREIGN KEY ("essay_id") REFERENCES "essays"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "essay_feedbacks" ADD CONSTRAINT "essay_feedbacks_essay_id_fkey" FOREIGN KEY ("essay_id") REFERENCES "essays"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "essay_feedbacks" ADD CONSTRAINT "essay_feedbacks_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
