-- Fase 3, item 47: sala de estudo da turma (só adições).
-- AlterTable
ALTER TABLE "study_time_logs" ADD COLUMN     "class_session_id" UUID;

-- CreateTable
CREATE TABLE "class_study_sessions" (
    "id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "title" VARCHAR(80),
    "opened_by_id" UUID NOT NULL,
    "simulation_id" UUID,
    "status" "GroupSessionStatus" NOT NULL DEFAULT 'OPEN',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "last_activity_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "class_study_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_session_participants" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "subject_id" UUID,
    "status" "GroupParticipantStatus" NOT NULL DEFAULT 'STUDYING',
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMP(3),
    "last_heartbeat_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "active_since" TIMESTAMP(3),
    "accumulated_seconds" INTEGER NOT NULL DEFAULT 0,
    "time_log_id" UUID,

    CONSTRAINT "class_session_participants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "class_study_sessions_class_id_status_idx" ON "class_study_sessions"("class_id", "status");

-- CreateIndex
CREATE INDEX "class_study_sessions_status_last_activity_at_idx" ON "class_study_sessions"("status", "last_activity_at");

-- CreateIndex
CREATE UNIQUE INDEX "class_session_participants_time_log_id_key" ON "class_session_participants"("time_log_id");

-- CreateIndex
CREATE INDEX "class_session_participants_session_id_status_idx" ON "class_session_participants"("session_id", "status");

-- CreateIndex
CREATE INDEX "class_session_participants_user_id_status_idx" ON "class_session_participants"("user_id", "status");

-- CreateIndex
CREATE INDEX "study_time_logs_class_session_id_idx" ON "study_time_logs"("class_session_id");

-- AddForeignKey
ALTER TABLE "study_time_logs" ADD CONSTRAINT "study_time_logs_class_session_id_fkey" FOREIGN KEY ("class_session_id") REFERENCES "class_study_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_study_sessions" ADD CONSTRAINT "class_study_sessions_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_study_sessions" ADD CONSTRAINT "class_study_sessions_opened_by_id_fkey" FOREIGN KEY ("opened_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_study_sessions" ADD CONSTRAINT "class_study_sessions_simulation_id_fkey" FOREIGN KEY ("simulation_id") REFERENCES "simulations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_session_participants" ADD CONSTRAINT "class_session_participants_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "class_study_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_session_participants" ADD CONSTRAINT "class_session_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_session_participants" ADD CONSTRAINT "class_session_participants_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "study_subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

