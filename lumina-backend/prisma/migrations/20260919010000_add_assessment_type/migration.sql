CREATE TYPE "AssessmentType" AS ENUM ('ACTIVITY', 'LIST', 'TEST', 'SIMULATION');
ALTER TABLE "simulations"
  ADD COLUMN "assessment_type" "AssessmentType" NOT NULL DEFAULT 'SIMULATION',
  ADD COLUMN "due_at" TIMESTAMP(3);
CREATE INDEX "simulations_class_id_due_at_idx" ON "simulations"("class_id", "due_at");
