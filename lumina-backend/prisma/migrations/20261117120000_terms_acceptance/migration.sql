-- Aceite dos Termos de Uso e da Política de Privacidade. Só adições.
ALTER TABLE "users" ADD COLUMN "terms_accepted_at" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "terms_version" VARCHAR(20);
