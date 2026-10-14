CREATE TABLE "academic_periods" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "starts_at" DATE NOT NULL,
  "ends_at" DATE NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "academic_periods_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "academic_periods_workspace_id_name_key" ON "academic_periods"("workspace_id", "name");
CREATE INDEX "academic_periods_workspace_id_starts_at_idx" ON "academic_periods"("workspace_id", "starts_at");
ALTER TABLE "academic_periods" ADD CONSTRAINT "academic_periods_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "academic_periods" ENABLE ROW LEVEL SECURITY;
