-- CreateEnum
CREATE TYPE "AdaptiveSessionStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'ABANDONED');

-- AlterEnum
ALTER TYPE "AssessmentType" ADD VALUE 'ADAPTIVE';

-- CreateTable
CREATE TABLE "adaptive_simulation_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "exam_id" UUID,
    "status" "AdaptiveSessionStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "estimated_ability" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "skills" JSONB NOT NULL DEFAULT '{}',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "adaptive_simulation_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "adaptive_simulation_steps" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "difficulty" "question_difficulty" NOT NULL,
    "skill" TEXT NOT NULL,
    "sub_skill" TEXT,
    "selected_position" INTEGER NOT NULL,
    "is_correct" BOOLEAN NOT NULL,
    "ability_before" DOUBLE PRECISION NOT NULL,
    "ability_after" DOUBLE PRECISION NOT NULL,
    "time_spent_seconds" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "adaptive_simulation_steps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "adaptive_simulation_sessions_user_id_status_idx" ON "adaptive_simulation_sessions"("user_id", "status");

-- CreateIndex
CREATE INDEX "adaptive_simulation_steps_session_id_created_at_idx" ON "adaptive_simulation_steps"("session_id", "created_at");

-- CreateIndex
CREATE INDEX "adaptive_simulation_steps_user_id_created_at_idx" ON "adaptive_simulation_steps"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "adaptive_simulation_sessions" ADD CONSTRAINT "adaptive_simulation_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adaptive_simulation_sessions" ADD CONSTRAINT "adaptive_simulation_sessions_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "exams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adaptive_simulation_steps" ADD CONSTRAINT "adaptive_simulation_steps_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "adaptive_simulation_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adaptive_simulation_steps" ADD CONSTRAINT "adaptive_simulation_steps_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adaptive_simulation_steps" ADD CONSTRAINT "adaptive_simulation_steps_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
