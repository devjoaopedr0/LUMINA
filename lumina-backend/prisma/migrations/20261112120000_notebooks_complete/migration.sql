-- CreateEnum
CREATE TYPE "NotebookKind" AS ENUM ('FORMULA', 'REPERTOIRE');

-- AlterTable
ALTER TABLE "formulas" ADD COLUMN     "example" TEXT,
ADD COLUMN     "is_memorized" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "is_platform" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "origin" VARCHAR(20) NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "platform_source_id" UUID,
ADD COLUMN     "variables" TEXT,
ADD COLUMN     "when_to_use" TEXT;

-- AlterTable
ALTER TABLE "repertoires" ADD COLUMN     "author" VARCHAR(200),
ADD COLUMN     "category" VARCHAR(60) NOT NULL DEFAULT 'OUTRA',
ADD COLUMN     "context" TEXT,
ADD COLUMN     "essay_use" TEXT,
ADD COLUMN     "example" TEXT,
ADD COLUMN     "importance" TEXT,
ADD COLUMN     "is_favorite" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "is_platform" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "origin" VARCHAR(20) NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "platform_source_id" UUID,
ADD COLUMN     "reference_type" VARCHAR(40) NOT NULL DEFAULT 'OUTRO',
ADD COLUMN     "related_themes" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "notebook_collections" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kind" "NotebookKind" NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notebook_collections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repertoire_collection_items" (
    "collection_id" UUID NOT NULL,
    "repertoire_id" UUID NOT NULL,
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "repertoire_collection_items_pkey" PRIMARY KEY ("collection_id","repertoire_id")
);

-- CreateTable
CREATE TABLE "formula_collection_items" (
    "collection_id" UUID NOT NULL,
    "formula_id" UUID NOT NULL,
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "formula_collection_items_pkey" PRIMARY KEY ("collection_id","formula_id")
);

-- CreateIndex
CREATE INDEX "formulas_is_platform_idx" ON "formulas"("is_platform");

-- CreateIndex
CREATE INDEX "repertoires_user_id_category_idx" ON "repertoires"("user_id", "category");

-- CreateIndex
CREATE INDEX "repertoires_user_id_is_favorite_idx" ON "repertoires"("user_id", "is_favorite");

-- CreateIndex
CREATE INDEX "repertoires_is_platform_idx" ON "repertoires"("is_platform");

-- CreateIndex
CREATE INDEX "notebook_collections_user_id_kind_idx" ON "notebook_collections"("user_id", "kind");

-- CreateIndex
CREATE INDEX "repertoire_collection_items_repertoire_id_idx" ON "repertoire_collection_items"("repertoire_id");

-- CreateIndex
CREATE INDEX "formula_collection_items_formula_id_idx" ON "formula_collection_items"("formula_id");

-- AddForeignKey
ALTER TABLE "notebook_collections" ADD CONSTRAINT "notebook_collections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repertoire_collection_items" ADD CONSTRAINT "repertoire_collection_items_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "notebook_collections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repertoire_collection_items" ADD CONSTRAINT "repertoire_collection_items_repertoire_id_fkey" FOREIGN KEY ("repertoire_id") REFERENCES "repertoires"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "formula_collection_items" ADD CONSTRAINT "formula_collection_items_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "notebook_collections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "formula_collection_items" ADD CONSTRAINT "formula_collection_items_formula_id_fkey" FOREIGN KEY ("formula_id") REFERENCES "formulas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Repertórios antigos: o tema (TECNOLOGIA, SAUDE...) vira a categoria mais
-- próxima do caderno novo; o tema continua no campo theme.
UPDATE "repertoires" SET "category" = CASE "theme"
    WHEN 'TECNOLOGIA' THEN 'CIENCIA_TECNOLOGIA'
    WHEN 'CIENCIA' THEN 'CIENCIA_TECNOLOGIA'
    WHEN 'CULTURA' THEN 'ARTES_CULTURA'
    WHEN 'POLITICA' THEN 'ATUALIDADES'
    WHEN 'ECONOMIA' THEN 'ATUALIDADES'
    WHEN 'DIREITOS_HUMANOS' THEN 'LEGISLACAO'
    ELSE 'OUTRA'
END;
