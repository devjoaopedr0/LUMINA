-- Plano de recuperação (item 42). Só adições.
CREATE TYPE "recovery_plan_status" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELLED');

CREATE TABLE "recovery_plans" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "created_by_id" UUID NOT NULL,
    "class_id" UUID,
    "alert_id" UUID,
    "subject_id" UUID NOT NULL,
    "topic_id" UUID NOT NULL,
    "subject_name" VARCHAR(120) NOT NULL,
    "topic_name" VARCHAR(160) NOT NULL,
    "status" "recovery_plan_status" NOT NULL DEFAULT 'ACTIVE',
    "steps" JSONB NOT NULL,
    "pool_info" JSONB NOT NULL,
    "baseline_mastery" INTEGER,
    "final_mastery" INTEGER,
    "review_at" TIMESTAMP(3) NOT NULL,
    "video_watched_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "recovery_plans_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "recovery_plans_student_id_status_idx" ON "recovery_plans"("student_id", "status");
CREATE INDEX "recovery_plans_created_by_id_idx" ON "recovery_plans"("created_by_id");
ALTER TABLE "recovery_plans" ADD CONSTRAINT "recovery_plans_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "recovery_plans" ADD CONSTRAINT "recovery_plans_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
