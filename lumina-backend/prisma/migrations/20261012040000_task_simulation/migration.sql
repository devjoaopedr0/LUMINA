-- Tarefa de "Simulado" do cronograma aponta para o simulado de verdade que
-- foi montado para ela; enviar o simulado conclui a tarefa com a nota.

ALTER TABLE "study_tasks" ADD COLUMN "simulation_id" UUID;

CREATE INDEX "study_tasks_simulation_id_idx" ON "study_tasks"("simulation_id");

ALTER TABLE "study_tasks" ADD CONSTRAINT "study_tasks_simulation_id_fkey"
    FOREIGN KEY ("simulation_id") REFERENCES "simulations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
