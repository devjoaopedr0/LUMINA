CREATE TABLE "essays" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "title" VARCHAR(160) NOT NULL DEFAULT '',
  "theme" VARCHAR(300) NOT NULL DEFAULT '',
  "content" TEXT NOT NULL DEFAULT '',
  "version" INTEGER NOT NULL DEFAULT 0,
  "word_count" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "essays_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "essays_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "essays_user_id_updated_at_idx" ON "essays"("user_id", "updated_at");
CREATE TABLE "essay_revisions" (
  "id" UUID NOT NULL,
  "essay_id" UUID NOT NULL,
  "version" INTEGER NOT NULL,
  "title" VARCHAR(160) NOT NULL,
  "theme" VARCHAR(300) NOT NULL,
  "content" TEXT NOT NULL,
  "word_count" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "essay_revisions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "essay_revisions_essay_id_fkey" FOREIGN KEY ("essay_id") REFERENCES "essays"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "essay_revisions_essay_id_version_key" ON "essay_revisions"("essay_id", "version");
