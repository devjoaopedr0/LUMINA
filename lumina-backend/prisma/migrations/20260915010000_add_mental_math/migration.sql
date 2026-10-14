CREATE TABLE "mental_math_sessions" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "mode" TEXT NOT NULL,
  "daily_key" TEXT,
  "state" JSONB NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 0,
  "completed" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "mental_math_sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "mental_math_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "mental_math_sessions_user_id_daily_key_key" ON "mental_math_sessions"("user_id", "daily_key");
CREATE INDEX "mental_math_sessions_user_id_created_at_idx" ON "mental_math_sessions"("user_id", "created_at");
