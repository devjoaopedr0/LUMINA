-- CreateEnum
CREATE TYPE "EssayScanStatus" AS ENUM ('PROCESSING', 'READY', 'CONFIRMED', 'FAILED');

-- AlterTable
ALTER TABLE "essay_corrections" ADD COLUMN     "annulment_json" JSONB,
ADD COLUMN     "audit_json" JSONB,
ADD COLUMN     "error_message" TEXT,
ADD COLUMN     "essay_version" INTEGER;

-- CreateTable
CREATE TABLE "essay_scans" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "essay_id" UUID,
    "theme" VARCHAR(300) NOT NULL DEFAULT '',
    "status" "EssayScanStatus" NOT NULL DEFAULT 'PROCESSING',
    "lines_json" JSONB,
    "transcribed_text" TEXT,
    "title" VARCHAR(160),
    "line_count" INTEGER,
    "illegible_words" INTEGER,
    "ocr_confidence" DOUBLE PRECISION,
    "ocr_model" VARCHAR(300),
    "warnings_json" JSONB,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "essay_scans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "essay_scan_pages" (
    "id" UUID NOT NULL,
    "scan_id" UUID NOT NULL,
    "index" INTEGER NOT NULL,
    "mime_type" VARCHAR(40) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "image" BYTEA NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "essay_scan_pages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "essay_scans_user_id_created_at_idx" ON "essay_scans"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "essay_scan_pages_scan_id_index_key" ON "essay_scan_pages"("scan_id", "index");

-- AddForeignKey
ALTER TABLE "essay_scans" ADD CONSTRAINT "essay_scans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "essay_scans" ADD CONSTRAINT "essay_scans_essay_id_fkey" FOREIGN KEY ("essay_id") REFERENCES "essays"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "essay_scan_pages" ADD CONSTRAINT "essay_scan_pages_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "essay_scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

