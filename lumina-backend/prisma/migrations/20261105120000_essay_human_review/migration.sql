-- CreateEnum
CREATE TYPE "EssayReviewStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'ACCEPTED', 'DISPUTED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "EssayReviewDecision" AS ENUM ('AGREE', 'DISAGREE', 'ADJUST');

-- CreateEnum
CREATE TYPE "EssayReviewMessageRole" AS ENUM ('EVALUATOR', 'AI', 'SYSTEM');

-- CreateEnum
CREATE TYPE "EssayLearningLevel" AS ENUM ('RECEIVED', 'STRUCTURED', 'VALIDATED', 'CONSOLIDATED');

-- CreateEnum
CREATE TYPE "EssayAuditAction" AS ENUM ('REVIEW_SUBMITTED', 'REVIEW_VALIDATED', 'REVIEW_CONSOLIDATED', 'REVIEW_RESET', 'LEARNING_CREATED', 'LEARNING_ARCHIVED', 'MESSAGE_CREATED');

-- CreateTable
CREATE TABLE "essay_reviews" (
    "id" UUID NOT NULL,
    "essay_id" UUID NOT NULL,
    "correction_id" UUID NOT NULL,
    "essay_version" INTEGER NOT NULL,
    "evaluator_id" UUID NOT NULL,
    "evaluator_role" "AccountType" NOT NULL,
    "status" "EssayReviewStatus" NOT NULL DEFAULT 'DRAFT',
    "decision" "EssayReviewDecision",
    "ai_competencies_json" JSONB NOT NULL,
    "ai_total_score" INTEGER NOT NULL,
    "ai_general_feedback" TEXT,
    "competencies_json" JSONB NOT NULL,
    "total_score" INTEGER NOT NULL,
    "general_feedback" TEXT,
    "divergence_json" JSONB,
    "validation_level" "EssayLearningLevel" NOT NULL DEFAULT 'RECEIVED',
    "validated_by" UUID,
    "validated_at" TIMESTAMP(3),
    "validation_notes" TEXT,
    "submitted_at" TIMESTAMP(3),
    "superseded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "essay_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "essay_review_details" (
    "id" UUID NOT NULL,
    "review_id" UUID NOT NULL,
    "competency" VARCHAR(2) NOT NULL,
    "ai_score" INTEGER NOT NULL,
    "human_score" INTEGER NOT NULL,
    "decision" "EssayReviewDecision" NOT NULL,
    "criterion" VARCHAR(240),
    "justification" TEXT,
    "evidence_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "essay_review_details_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "essay_review_messages" (
    "id" UUID NOT NULL,
    "essay_id" UUID NOT NULL,
    "correction_id" UUID,
    "review_id" UUID,
    "author_id" UUID,
    "role" "EssayReviewMessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "citations_json" JSONB,
    "anchor_json" JSONB,
    "model" VARCHAR(200),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "essay_review_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "essay_learning_records" (
    "id" UUID NOT NULL,
    "essay_id" UUID NOT NULL,
    "correction_id" UUID,
    "review_id" UUID,
    "review_detail_id" UUID,
    "competency" VARCHAR(2) NOT NULL,
    "criterion" VARCHAR(240),
    "ai_score" INTEGER,
    "human_score" INTEGER,
    "evidence" TEXT,
    "ai_justification" TEXT,
    "human_justification" TEXT,
    "divergence_reason" TEXT,
    "decision" "EssayReviewDecision",
    "learning" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION,
    "applicability" TEXT,
    "level" "EssayLearningLevel" NOT NULL DEFAULT 'RECEIVED',
    "origin" VARCHAR(40) NOT NULL DEFAULT 'HUMAN_REVIEW',
    "anonymized" BOOLEAN NOT NULL DEFAULT false,
    "consent_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "supersedes_id" UUID,
    "created_by" UUID NOT NULL,
    "validated_by" UUID,
    "validated_at" TIMESTAMP(3),
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "essay_learning_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "essay_audit_events" (
    "id" UUID NOT NULL,
    "actor_id" UUID,
    "action" "EssayAuditAction" NOT NULL,
    "entity" VARCHAR(60) NOT NULL,
    "entity_id" VARCHAR(80) NOT NULL,
    "before_json" JSONB,
    "after_json" JSONB,
    "metadata_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "essay_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "essay_reviews_essay_id_status_idx" ON "essay_reviews"("essay_id", "status");

-- CreateIndex
CREATE INDEX "essay_reviews_validation_level_updated_at_idx" ON "essay_reviews"("validation_level", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "essay_reviews_correction_id_evaluator_id_essay_version_key" ON "essay_reviews"("correction_id", "evaluator_id", "essay_version");

-- CreateIndex
CREATE INDEX "essay_review_details_review_id_idx" ON "essay_review_details"("review_id");

-- CreateIndex
CREATE UNIQUE INDEX "essay_review_details_review_id_competency_key" ON "essay_review_details"("review_id", "competency");

-- CreateIndex
CREATE INDEX "essay_review_messages_essay_id_created_at_idx" ON "essay_review_messages"("essay_id", "created_at");

-- CreateIndex
CREATE INDEX "essay_review_messages_review_id_created_at_idx" ON "essay_review_messages"("review_id", "created_at");

-- CreateIndex
CREATE INDEX "essay_learning_records_competency_level_archived_at_idx" ON "essay_learning_records"("competency", "level", "archived_at");

-- CreateIndex
CREATE INDEX "essay_learning_records_essay_id_created_at_idx" ON "essay_learning_records"("essay_id", "created_at");

-- CreateIndex
CREATE INDEX "essay_audit_events_entity_entity_id_created_at_idx" ON "essay_audit_events"("entity", "entity_id", "created_at");

-- CreateIndex
CREATE INDEX "essay_audit_events_actor_id_created_at_idx" ON "essay_audit_events"("actor_id", "created_at");

-- AddForeignKey
ALTER TABLE "essay_reviews" ADD CONSTRAINT "essay_reviews_essay_id_fkey" FOREIGN KEY ("essay_id") REFERENCES "essays"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "essay_reviews" ADD CONSTRAINT "essay_reviews_correction_id_fkey" FOREIGN KEY ("correction_id") REFERENCES "essay_corrections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "essay_reviews" ADD CONSTRAINT "essay_reviews_evaluator_id_fkey" FOREIGN KEY ("evaluator_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "essay_reviews" ADD CONSTRAINT "essay_reviews_validated_by_fkey" FOREIGN KEY ("validated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "essay_review_details" ADD CONSTRAINT "essay_review_details_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "essay_reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "essay_review_messages" ADD CONSTRAINT "essay_review_messages_essay_id_fkey" FOREIGN KEY ("essay_id") REFERENCES "essays"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "essay_review_messages" ADD CONSTRAINT "essay_review_messages_correction_id_fkey" FOREIGN KEY ("correction_id") REFERENCES "essay_corrections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "essay_review_messages" ADD CONSTRAINT "essay_review_messages_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "essay_reviews"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "essay_review_messages" ADD CONSTRAINT "essay_review_messages_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "essay_learning_records" ADD CONSTRAINT "essay_learning_records_essay_id_fkey" FOREIGN KEY ("essay_id") REFERENCES "essays"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "essay_learning_records" ADD CONSTRAINT "essay_learning_records_correction_id_fkey" FOREIGN KEY ("correction_id") REFERENCES "essay_corrections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "essay_learning_records" ADD CONSTRAINT "essay_learning_records_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "essay_reviews"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "essay_learning_records" ADD CONSTRAINT "essay_learning_records_review_detail_id_fkey" FOREIGN KEY ("review_detail_id") REFERENCES "essay_review_details"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "essay_learning_records" ADD CONSTRAINT "essay_learning_records_supersedes_id_fkey" FOREIGN KEY ("supersedes_id") REFERENCES "essay_learning_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "essay_learning_records" ADD CONSTRAINT "essay_learning_records_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "essay_learning_records" ADD CONSTRAINT "essay_learning_records_validated_by_fkey" FOREIGN KEY ("validated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "essay_audit_events" ADD CONSTRAINT "essay_audit_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
