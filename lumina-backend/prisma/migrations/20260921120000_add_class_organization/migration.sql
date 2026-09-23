ALTER TABLE "classes"
  ADD COLUMN "subject_id" UUID,
  ADD COLUMN "academic_period_id" UUID,
  ADD COLUMN "grade_year" INTEGER;

CREATE INDEX "classes_subject_id_idx" ON "classes"("subject_id");
CREATE INDEX "classes_academic_period_id_idx" ON "classes"("academic_period_id");

ALTER TABLE "classes"
  ADD CONSTRAINT "classes_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "classes_academic_period_id_fkey" FOREIGN KEY ("academic_period_id") REFERENCES "academic_periods"("id") ON DELETE SET NULL ON UPDATE CASCADE;
