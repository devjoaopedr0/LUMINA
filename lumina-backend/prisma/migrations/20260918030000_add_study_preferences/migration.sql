ALTER TABLE "user_profiles"
  ADD COLUMN "preferred_study_period" VARCHAR(20),
  ADD COLUMN "study_session_minutes" INTEGER,
  ADD COLUMN "weekly_study_days" INTEGER;
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_study_period_check"
  CHECK ("preferred_study_period" IS NULL OR "preferred_study_period" IN ('MANHA', 'TARDE', 'NOITE', 'FLEXIVEL'));
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_session_minutes_check"
  CHECK ("study_session_minutes" IS NULL OR "study_session_minutes" BETWEEN 15 AND 180);
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_weekly_days_check"
  CHECK ("weekly_study_days" IS NULL OR "weekly_study_days" BETWEEN 1 AND 7);
