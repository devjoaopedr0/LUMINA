-- CreateEnum
CREATE TYPE "study_schedule_status" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "study_task_status" AS ENUM ('PENDING', 'IN_PROGRESS', 'DONE');

-- CreateTable
CREATE TABLE "study_schedules" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "study_days" JSONB NOT NULL,
    "daily_minutes" INTEGER NOT NULL,
    "objective" TEXT,
    "status" "study_schedule_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "study_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_subjects" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "display_order" INTEGER NOT NULL DEFAULT 99,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "study_subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_schedule_subjects" (
    "id" UUID NOT NULL,
    "schedule_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "target_hours" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "study_schedule_subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_sessions" (
    "id" UUID NOT NULL,
    "schedule_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "scheduled_minutes" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "study_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_session_subjects" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "estimated_minutes" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "study_session_subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_tasks" (
    "id" UUID NOT NULL,
    "schedule_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "subject_id" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "study_task_status" NOT NULL DEFAULT 'PENDING',
    "scheduled_minutes" INTEGER NOT NULL DEFAULT 0,
    "completed_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "study_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_time_logs" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "start_time" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3) NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "study_time_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_progress" (
    "id" UUID NOT NULL,
    "schedule_id" UUID NOT NULL,
    "completed_minutes" INTEGER NOT NULL DEFAULT 0,
    "total_scheduled_minutes" INTEGER NOT NULL DEFAULT 0,
    "streak_days" INTEGER NOT NULL DEFAULT 0,
    "last_study_date" DATE,
    "completed_tasks" INTEGER NOT NULL DEFAULT 0,
    "total_tasks" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "study_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_vestibulares" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "exam_id" UUID,
    "custom_name" TEXT,
    "target_date" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_vestibulares_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "study_schedules_user_id_key" ON "study_schedules"("user_id");

-- CreateIndex
CREATE INDEX "study_schedules_user_id_idx" ON "study_schedules"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "study_subjects_name_key" ON "study_subjects"("name");

-- CreateIndex
CREATE UNIQUE INDEX "study_subjects_code_key" ON "study_subjects"("code");

-- CreateIndex
CREATE INDEX "study_schedule_subjects_schedule_id_idx" ON "study_schedule_subjects"("schedule_id");

-- CreateIndex
CREATE INDEX "study_schedule_subjects_subject_id_idx" ON "study_schedule_subjects"("subject_id");

-- CreateIndex
CREATE UNIQUE INDEX "study_schedule_subjects_schedule_id_subject_id_key" ON "study_schedule_subjects"("schedule_id", "subject_id");

-- CreateIndex
CREATE INDEX "study_sessions_schedule_id_date_idx" ON "study_sessions"("schedule_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "study_sessions_schedule_id_date_key" ON "study_sessions"("schedule_id", "date");

-- CreateIndex
CREATE INDEX "study_session_subjects_session_id_idx" ON "study_session_subjects"("session_id");

-- CreateIndex
CREATE INDEX "study_session_subjects_subject_id_idx" ON "study_session_subjects"("subject_id");

-- CreateIndex
CREATE UNIQUE INDEX "study_session_subjects_session_id_subject_id_key" ON "study_session_subjects"("session_id", "subject_id");

-- CreateIndex
CREATE INDEX "study_tasks_schedule_id_idx" ON "study_tasks"("schedule_id");

-- CreateIndex
CREATE INDEX "study_tasks_session_id_idx" ON "study_tasks"("session_id");

-- CreateIndex
CREATE INDEX "study_tasks_subject_id_idx" ON "study_tasks"("subject_id");

-- CreateIndex
CREATE INDEX "study_time_logs_task_id_idx" ON "study_time_logs"("task_id");

-- CreateIndex
CREATE INDEX "study_time_logs_user_id_idx" ON "study_time_logs"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "study_progress_schedule_id_key" ON "study_progress"("schedule_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_vestibulares_user_id_key" ON "user_vestibulares"("user_id");

-- AddForeignKey
ALTER TABLE "study_schedules" ADD CONSTRAINT "study_schedules_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_schedule_subjects" ADD CONSTRAINT "study_schedule_subjects_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "study_subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_schedule_subjects" ADD CONSTRAINT "study_schedule_subjects_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "study_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "study_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_session_subjects" ADD CONSTRAINT "study_session_subjects_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "study_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_session_subjects" ADD CONSTRAINT "study_session_subjects_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "study_subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_tasks" ADD CONSTRAINT "study_tasks_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "study_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_tasks" ADD CONSTRAINT "study_tasks_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "study_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_tasks" ADD CONSTRAINT "study_tasks_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "study_subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_time_logs" ADD CONSTRAINT "study_time_logs_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "study_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_time_logs" ADD CONSTRAINT "study_time_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_progress" ADD CONSTRAINT "study_progress_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "study_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_vestibulares" ADD CONSTRAINT "user_vestibulares_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "exams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_vestibulares" ADD CONSTRAINT "user_vestibulares_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
