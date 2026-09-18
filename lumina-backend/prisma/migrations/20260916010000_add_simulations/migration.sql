CREATE TABLE "simulations" (
  "id" UUID NOT NULL,
  "title" VARCHAR(160) NOT NULL,
  "created_by" UUID NOT NULL,
  "class_id" UUID,
  "workspace_id" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "simulations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "simulation_items" (
  "id" UUID NOT NULL,
  "simulation_id" UUID NOT NULL,
  "question_id" UUID,
  "position" INTEGER NOT NULL,
  "stem" TEXT NOT NULL,
  "alternatives" JSONB NOT NULL,
  "correct_position" INTEGER NOT NULL,
  "subject" TEXT NOT NULL,
  CONSTRAINT "simulation_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "simulations_created_by_created_at_idx" ON "simulations"("created_by", "created_at");
CREATE INDEX "simulations_class_id_idx" ON "simulations"("class_id");
CREATE UNIQUE INDEX "simulation_items_simulation_id_position_key" ON "simulation_items"("simulation_id", "position");
ALTER TABLE "simulations" ADD CONSTRAINT "simulations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "simulations" ADD CONSTRAINT "simulations_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "simulations" ADD CONSTRAINT "simulations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "simulation_items" ADD CONSTRAINT "simulation_items_simulation_id_fkey" FOREIGN KEY ("simulation_id") REFERENCES "simulations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "simulation_items" ADD CONSTRAINT "simulation_items_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "simulations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "simulation_items" ENABLE ROW LEVEL SECURITY;
