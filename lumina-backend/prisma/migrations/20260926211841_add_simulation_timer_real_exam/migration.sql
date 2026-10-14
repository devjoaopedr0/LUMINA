-- AlterTable
ALTER TABLE "simulation_items" ADD COLUMN     "area" VARCHAR(80);

-- AlterTable
ALTER TABLE "simulation_submissions" ADD COLUMN     "started_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "simulations" ADD COLUMN     "duration_minutes" INTEGER,
ADD COLUMN     "is_real_exam" BOOLEAN NOT NULL DEFAULT false;
