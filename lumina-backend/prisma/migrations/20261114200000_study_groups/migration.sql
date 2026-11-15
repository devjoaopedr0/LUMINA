-- Lumina Groups (Fase 2, MVP): grupos de estudo e membros (só adições).
-- CreateEnum
CREATE TYPE "StudyGroupRole" AS ENUM ('OWNER', 'ADMIN', 'MODERATOR', 'MEMBER');

-- CreateEnum
CREATE TYPE "StudyGroupMemberStatus" AS ENUM ('ACTIVE', 'PENDING');

-- CreateTable
CREATE TABLE "study_groups" (
    "id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "description" VARCHAR(500),
    "purpose" VARCHAR(60),
    "image_url" TEXT,
    "rules" VARCHAR(2000),
    "join_code" VARCHAR(12) NOT NULL,
    "requires_approval" BOOLEAN NOT NULL DEFAULT false,
    "max_members" INTEGER NOT NULL DEFAULT 30,
    "owner_id" UUID NOT NULL,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "study_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_group_members" (
    "id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "StudyGroupRole" NOT NULL DEFAULT 'MEMBER',
    "status" "StudyGroupMemberStatus" NOT NULL DEFAULT 'ACTIVE',
    "share_study_time" BOOLEAN NOT NULL DEFAULT false,
    "share_subjects" BOOLEAN NOT NULL DEFAULT false,
    "share_streak" BOOLEAN NOT NULL DEFAULT false,
    "share_last_activity" BOOLEAN NOT NULL DEFAULT false,
    "ranking_opt_in" BOOLEAN NOT NULL DEFAULT false,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "study_group_members_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "study_groups_join_code_key" ON "study_groups"("join_code");

-- CreateIndex
CREATE INDEX "study_groups_owner_id_idx" ON "study_groups"("owner_id");

-- CreateIndex
CREATE INDEX "study_group_members_user_id_idx" ON "study_group_members"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "study_group_members_group_id_user_id_key" ON "study_group_members"("group_id", "user_id");

-- AddForeignKey
ALTER TABLE "study_groups" ADD CONSTRAINT "study_groups_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_group_members" ADD CONSTRAINT "study_group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "study_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_group_members" ADD CONSTRAINT "study_group_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

