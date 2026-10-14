CREATE TABLE "simulation_submissions" (
  "id" UUID NOT NULL,
  "simulation_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "answers" JSONB NOT NULL,
  "correct" INTEGER NOT NULL,
  "total" INTEGER NOT NULL,
  "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "simulation_submissions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "simulation_submissions_simulation_id_user_id_key" ON "simulation_submissions"("simulation_id", "user_id");
CREATE INDEX "simulation_submissions_user_id_submitted_at_idx" ON "simulation_submissions"("user_id", "submitted_at");
ALTER TABLE "simulation_submissions" ADD CONSTRAINT "simulation_submissions_simulation_id_fkey" FOREIGN KEY ("simulation_id") REFERENCES "simulations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "simulation_submissions" ADD CONSTRAINT "simulation_submissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "simulation_submissions" ENABLE ROW LEVEL SECURITY;
