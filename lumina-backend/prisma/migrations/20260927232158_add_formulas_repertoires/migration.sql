-- CreateTable
CREATE TABLE "formulas" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "discipline" VARCHAR(40) NOT NULL DEFAULT 'MATEMATICA',
    "topic" VARCHAR(160),
    "latex" TEXT NOT NULL,
    "description" TEXT,
    "is_favorite" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "formulas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repertoires" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "title" VARCHAR(240) NOT NULL,
    "summary" TEXT NOT NULL,
    "source" VARCHAR(160),
    "year" INTEGER,
    "theme" VARCHAR(40) NOT NULL DEFAULT 'OUTRO',
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_studied" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "repertoires_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "formulas_user_id_discipline_idx" ON "formulas"("user_id", "discipline");

-- CreateIndex
CREATE INDEX "formulas_user_id_is_favorite_idx" ON "formulas"("user_id", "is_favorite");

-- CreateIndex
CREATE INDEX "repertoires_user_id_theme_idx" ON "repertoires"("user_id", "theme");

-- CreateIndex
CREATE INDEX "repertoires_user_id_is_studied_idx" ON "repertoires"("user_id", "is_studied");

-- AddForeignKey
ALTER TABLE "formulas" ADD CONSTRAINT "formulas_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repertoires" ADD CONSTRAINT "repertoires_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
