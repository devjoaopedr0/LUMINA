-- AlterTable
ALTER TABLE "answer_sheet_processings" ADD COLUMN     "details_json" JSONB,
ADD COLUMN     "threshold" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "answer_sheet_uploads" ADD COLUMN     "image" BYTEA,
ADD COLUMN     "image_mime" VARCHAR(40),
ADD COLUMN     "scanned_by_id" UUID,
ADD COLUMN     "sheet_code" INTEGER;

-- CreateTable
CREATE TABLE "answer_sheet_codes" (
    "code" INTEGER NOT NULL,
    "template_id" UUID NOT NULL,
    "student_id" UUID,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "answer_sheet_codes_pkey" PRIMARY KEY ("code")
);

-- CreateIndex
CREATE INDEX "answer_sheet_codes_template_id_student_id_idx" ON "answer_sheet_codes"("template_id", "student_id");

-- AddForeignKey
ALTER TABLE "answer_sheet_uploads" ADD CONSTRAINT "answer_sheet_uploads_scanned_by_id_fkey" FOREIGN KEY ("scanned_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answer_sheet_codes" ADD CONSTRAINT "answer_sheet_codes_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "answer_sheet_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answer_sheet_codes" ADD CONSTRAINT "answer_sheet_codes_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
