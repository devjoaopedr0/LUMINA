-- Lumina Groups, etapa 2: salas coletivas (sessão do grupo e participação de cada aluno).
-- Só adições. O tempo estudado continua sendo o StudyTimeLog do aluno, agora com
-- vínculo opcional à sessão do grupo (docs/LUMINA_GROUPS.md §2.3).
-- CreateEnum
CREATE TYPE "GroupSessionStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "GroupParticipantStatus" AS ENUM ('STUDYING', 'PAUSED', 'LEFT');

-- AlterTable
ALTER TABLE "study_time_logs" ADD COLUMN     "group_session_id" UUID;

-- CreateTable
CREATE TABLE "group_study_sessions" (
    "id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "title" VARCHAR(80),
    "opened_by_id" UUID NOT NULL,
    "status" "GroupSessionStatus" NOT NULL DEFAULT 'OPEN',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "last_activity_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_study_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_session_participants" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "subject_id" UUID,
    "status" "GroupParticipantStatus" NOT NULL DEFAULT 'STUDYING',
    "show_details" BOOLEAN NOT NULL DEFAULT false,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMP(3),
    "last_heartbeat_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "active_since" TIMESTAMP(3),
    "accumulated_seconds" INTEGER NOT NULL DEFAULT 0,
    "time_log_id" UUID,

    CONSTRAINT "group_session_participants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "group_study_sessions_group_id_status_idx" ON "group_study_sessions"("group_id", "status");

-- CreateIndex
CREATE INDEX "group_study_sessions_status_last_activity_at_idx" ON "group_study_sessions"("status", "last_activity_at");

-- CreateIndex
CREATE UNIQUE INDEX "group_session_participants_time_log_id_key" ON "group_session_participants"("time_log_id");

-- CreateIndex
CREATE INDEX "group_session_participants_session_id_status_idx" ON "group_session_participants"("session_id", "status");

-- CreateIndex
CREATE INDEX "group_session_participants_user_id_status_idx" ON "group_session_participants"("user_id", "status");

-- CreateIndex
CREATE INDEX "study_time_logs_group_session_id_idx" ON "study_time_logs"("group_session_id");

-- AddForeignKey
ALTER TABLE "study_time_logs" ADD CONSTRAINT "study_time_logs_group_session_id_fkey" FOREIGN KEY ("group_session_id") REFERENCES "group_study_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_study_sessions" ADD CONSTRAINT "group_study_sessions_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "study_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_study_sessions" ADD CONSTRAINT "group_study_sessions_opened_by_id_fkey" FOREIGN KEY ("opened_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_session_participants" ADD CONSTRAINT "group_session_participants_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "group_study_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_session_participants" ADD CONSTRAINT "group_session_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_session_participants" ADD CONSTRAINT "group_session_participants_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "study_subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

