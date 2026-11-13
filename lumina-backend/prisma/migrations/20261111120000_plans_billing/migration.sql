-- CreateEnum
CREATE TYPE "PlanTier" AS ENUM ('FREE', 'PREMIUM', 'INSTITUTIONAL');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('PENDING', 'ACTIVE', 'PAST_DUE', 'CANCELED');

-- CreateEnum
CREATE TYPE "SubscriptionSource" AS ENUM ('ASAAS', 'FOUNDER', 'MANUAL');

-- CreateEnum
CREATE TYPE "BillingCycle" AS ENUM ('MONTHLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "PlanFeature" AS ENUM ('ESSAY_CORRECTION', 'SIMULATION', 'LUMINIA_MESSAGE', 'FLASHCARD_AI');

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "institution_id" UUID,
    "tier" "PlanTier" NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'PENDING',
    "source" "SubscriptionSource" NOT NULL,
    "founder_number" INTEGER,
    "provider_customer_id" TEXT,
    "provider_subscription_id" TEXT,
    "provider_installment_id" TEXT,
    "billing_cycle" "BillingCycle" NOT NULL DEFAULT 'MONTHLY',
    "installment_count" INTEGER,
    "billing_type" VARCHAR(20),
    "invoice_url" TEXT,
    "price_cents" INTEGER,
    "current_period_end" TIMESTAMP(3),
    "canceled_at" TIMESTAMP(3),
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_usages" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "feature" "PlanFeature" NOT NULL,
    "period" VARCHAR(10) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plan_usages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_webhook_events" (
    "id" UUID NOT NULL,
    "provider" VARCHAR(20) NOT NULL,
    "event_id" TEXT NOT NULL,
    "type" VARCHAR(60) NOT NULL,
    "payload" JSONB NOT NULL,
    "processed_at" TIMESTAMP(3),
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_founder_number_key" ON "subscriptions"("founder_number");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_provider_subscription_id_key" ON "subscriptions"("provider_subscription_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_provider_installment_id_key" ON "subscriptions"("provider_installment_id");

-- CreateIndex
CREATE INDEX "subscriptions_user_id_status_idx" ON "subscriptions"("user_id", "status");

-- CreateIndex
CREATE INDEX "subscriptions_institution_id_status_idx" ON "subscriptions"("institution_id", "status");

-- CreateIndex
CREATE INDEX "subscriptions_source_idx" ON "subscriptions"("source");

-- CreateIndex
CREATE UNIQUE INDEX "plan_usages_user_id_feature_period_key" ON "plan_usages"("user_id", "feature", "period");

-- CreateIndex
CREATE UNIQUE INDEX "payment_webhook_events_provider_event_id_key" ON "payment_webhook_events"("provider", "event_id");

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_usages" ADD CONSTRAINT "plan_usages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Benefício de fundador para os alunos independentes que já existem: até 100,
-- por ordem de cadastro, com 4 meses de Premium a partir de agora. Ficam de
-- fora contas internas e de teste (@lumina.app, @lumina.dev, @lumina.internal).
-- Os cadastros novos recebem o benefício pelo FoundersService, com as vagas e
-- o prazo configuráveis (FOUNDER_STUDENT_SLOTS, FOUNDER_GRANT_MONTHS,
-- FOUNDER_CAMPAIGN_ENDS_AT); ver docs/PLANOS_E_ASSINATURAS.md.
INSERT INTO "subscriptions" ("id", "user_id", "tier", "status", "source", "founder_number", "current_period_end", "note", "updated_at")
SELECT gen_random_uuid(), u."id", 'PREMIUM', 'ACTIVE', 'FOUNDER',
       ROW_NUMBER() OVER (ORDER BY u."created_at", u."id"),
       CURRENT_TIMESTAMP + INTERVAL '4 months',
       'Fundador: concedido na criação dos planos (cadastro anterior à campanha).',
       CURRENT_TIMESTAMP
FROM (
    SELECT "id", "created_at"
    FROM "users"
    WHERE "account_type" = 'STUDENT_INDEPENDENT'
      AND "deleted_at" IS NULL
      AND "email" NOT LIKE '%@lumina.app'
      AND "email" NOT LIKE '%@lumina.dev'
      AND "email" NOT LIKE '%@lumina.internal'
    ORDER BY "created_at", "id"
    LIMIT 100
) u;
