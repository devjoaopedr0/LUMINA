-- Alertas pedagógicos persistidos (item 41). Só adições.
CREATE TYPE "pedagogical_alert_status" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'DISMISSED');

CREATE TABLE "pedagogical_alerts" (
    "id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "fingerprint" VARCHAR(200) NOT NULL,
    "kind" VARCHAR(40) NOT NULL,
    "severity" VARCHAR(10) NOT NULL,
    "status" "pedagogical_alert_status" NOT NULL DEFAULT 'OPEN',
    "class_id" UUID,
    "student_id" UUID,
    "question_key" VARCHAR(120),
    "title" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "recommendation" TEXT NOT NULL,
    "metric" DOUBLE PRECISION,
    "auto_resolved" BOOLEAN NOT NULL DEFAULT false,
    "reopen_count" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "history" JSONB NOT NULL DEFAULT '[]',
    "first_seen_at" TIMESTAMP(3) NOT NULL,
    "last_seen_at" TIMESTAMP(3) NOT NULL,
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "pedagogical_alerts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "pedagogical_alerts_teacher_id_status_idx" ON "pedagogical_alerts"("teacher_id", "status");
CREATE UNIQUE INDEX "pedagogical_alerts_teacher_id_fingerprint_key" ON "pedagogical_alerts"("teacher_id", "fingerprint");
ALTER TABLE "pedagogical_alerts" ADD CONSTRAINT "pedagogical_alerts_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
