-- AlterTable
ALTER TABLE "answer_sheet_templates" ADD COLUMN "simulation_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "answer_sheet_templates_simulation_id_key" ON "answer_sheet_templates"("simulation_id");

-- AddForeignKey
ALTER TABLE "answer_sheet_templates" ADD CONSTRAINT "answer_sheet_templates_simulation_id_fkey" FOREIGN KEY ("simulation_id") REFERENCES "simulations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
