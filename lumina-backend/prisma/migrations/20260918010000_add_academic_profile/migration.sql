ALTER TABLE "user_profiles"
  ADD COLUMN "education_level" VARCHAR(30),
  ADD COLUMN "school_year" INTEGER,
  ADD COLUMN "school_name" VARCHAR(120);

ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_education_level_check"
  CHECK ("education_level" IS NULL OR "education_level" IN ('FUNDAMENTAL_II', 'ENSINO_MEDIO', 'CURSINHO', 'SUPERIOR', 'OUTRO'));
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_school_year_check"
  CHECK ("school_year" IS NULL OR "school_year" BETWEEN 1 AND 9);
