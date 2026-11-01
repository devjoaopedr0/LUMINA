-- AlterTable
ALTER TABLE "answer_sheet_uploads" ADD COLUMN     "batch_id" UUID,
ADD COLUMN     "page_index" INTEGER;

-- CreateTable
CREATE TABLE "answer_sheet_batches" (
    "id" UUID NOT NULL,
    "scanned_by_id" UUID NOT NULL,
    "pdf" BYTEA NOT NULL,
    "pages" INTEGER NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "answer_sheet_batches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "answer_sheet_batches_scanned_by_id_created_at_idx" ON "answer_sheet_batches"("scanned_by_id", "created_at");

-- AddForeignKey
ALTER TABLE "answer_sheet_uploads" ADD CONSTRAINT "answer_sheet_uploads_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "answer_sheet_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answer_sheet_batches" ADD CONSTRAINT "answer_sheet_batches_scanned_by_id_fkey" FOREIGN KEY ("scanned_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
