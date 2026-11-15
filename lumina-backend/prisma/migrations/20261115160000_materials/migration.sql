-- Central de materiais (itens 48 a 50). Só adições.
CREATE TYPE "material_kind" AS ENUM ('PDF', 'SLIDES', 'APOSTILA', 'LISTA', 'LINK', 'VIDEO');

CREATE TABLE "materials" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "class_id" UUID,
    "subject_id" UUID,
    "topic_id" UUID,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "kind" "material_kind" NOT NULL,
    "url" VARCHAR(1000),
    "file" BYTEA,
    "mime_type" VARCHAR(100),
    "size_bytes" INTEGER,
    "page_count" INTEGER,
    "text_status" VARCHAR(10) NOT NULL DEFAULT 'NONE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "materials_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "material_pages" (
    "id" UUID NOT NULL,
    "material_id" UUID NOT NULL,
    "page" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    CONSTRAINT "material_pages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "materials_owner_id_idx" ON "materials"("owner_id");
CREATE INDEX "materials_class_id_idx" ON "materials"("class_id");
CREATE UNIQUE INDEX "material_pages_material_id_page_key" ON "material_pages"("material_id", "page");
ALTER TABLE "materials" ADD CONSTRAINT "materials_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "materials" ADD CONSTRAINT "materials_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "material_pages" ADD CONSTRAINT "material_pages_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;
