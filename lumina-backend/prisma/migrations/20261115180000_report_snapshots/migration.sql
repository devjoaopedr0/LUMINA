-- Relatórios salvos (item 59). Só adições.
CREATE TABLE "report_snapshots" (
    "id" UUID NOT NULL,
    "type" VARCHAR(20) NOT NULL,
    "scope_key" VARCHAR(200) NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "requested_by_id" UUID NOT NULL,
    "period_label" VARCHAR(60) NOT NULL,
    "from" TIMESTAMP(3) NOT NULL,
    "to" TIMESTAMP(3) NOT NULL,
    "automatic" BOOLEAN NOT NULL DEFAULT false,
    "data" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "report_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "report_snapshots_requested_by_id_type_scope_key_period_label_key" ON "report_snapshots"("requested_by_id", "type", "scope_key", "period_label");
CREATE INDEX "report_snapshots_requested_by_id_created_at_idx" ON "report_snapshots"("requested_by_id", "created_at");
ALTER TABLE "report_snapshots" ADD CONSTRAINT "report_snapshots_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
