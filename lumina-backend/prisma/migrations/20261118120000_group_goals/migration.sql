-- Lumina Groups, etapa 3: metas coletivas do grupo (só adições).
-- CreateEnum
CREATE TYPE "GroupGoalMetric" AS ENUM ('GROUP_MINUTES', 'GROUP_STUDY_DAYS');

-- CreateTable
CREATE TABLE "group_goals" (
    "id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "title" VARCHAR(80) NOT NULL,
    "metric" "GroupGoalMetric" NOT NULL,
    "target" INTEGER NOT NULL,
    "start_date" VARCHAR(10) NOT NULL,
    "end_date" VARCHAR(10) NOT NULL,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelled_at" TIMESTAMP(3),

    CONSTRAINT "group_goals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "group_goals_group_id_end_date_idx" ON "group_goals"("group_id", "end_date");

-- AddForeignKey
ALTER TABLE "group_goals" ADD CONSTRAINT "group_goals_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "study_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_goals" ADD CONSTRAINT "group_goals_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

