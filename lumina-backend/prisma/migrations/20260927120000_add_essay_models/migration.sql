CREATE TABLE "essay_models" (
  "id" UUID NOT NULL,
  "year" INTEGER NOT NULL,
  "exam" VARCHAR(60) NOT NULL,
  "theme" VARCHAR(300) NOT NULL,
  "text" TEXT NOT NULL,
  "competencies_json" JSONB NOT NULL,
  "total_score" INTEGER NOT NULL,
  "pdf_url" VARCHAR(2048),
  "highlights_json" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "essay_models_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "essay_models_exam_year_idx" ON "essay_models"("exam", "year");
