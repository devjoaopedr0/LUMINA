-- CreateTable
CREATE TABLE "essay_correction_usages" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "essay_id" UUID,
    "period" VARCHAR(7) NOT NULL,
    "refunded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "essay_correction_usages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "essay_correction_usages_user_id_period_idx" ON "essay_correction_usages"("user_id", "period");

-- AddForeignKey
ALTER TABLE "essay_correction_usages" ADD CONSTRAINT "essay_correction_usages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "essay_correction_usages" ADD CONSTRAINT "essay_correction_usages_essay_id_fkey" FOREIGN KEY ("essay_id") REFERENCES "essays"("id") ON DELETE SET NULL ON UPDATE CASCADE;
