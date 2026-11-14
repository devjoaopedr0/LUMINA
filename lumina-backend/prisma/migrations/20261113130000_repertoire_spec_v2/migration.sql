-- Caderno de Repertórios, especificação completa (13/11/2026): eixos
-- temáticos, mapa de aplicação argumentativa e a estrutura em 10 itens.

-- AlterTable
ALTER TABLE "repertoires" ADD COLUMN     "argument_functions" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "axes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "brazil_relation" TEXT,
ADD COLUMN     "concepts" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "connections" TEXT,
ADD COLUMN     "example_slot" VARCHAR(4),
ADD COLUMN     "pitfalls" TEXT,
ADD COLUMN     "quote" TEXT,
ADD COLUMN     "quote_source" VARCHAR(300),
ADD COLUMN     "social_problems" TEXT;

-- O tema antigo vira o eixo temático correspondente.
UPDATE "repertoires" SET "axes" = ARRAY[CASE "theme"
    WHEN 'EDUCACAO' THEN 'EDUCACAO'
    WHEN 'TECNOLOGIA' THEN 'TECNOLOGIA'
    WHEN 'CIENCIA' THEN 'TECNOLOGIA'
    WHEN 'MEIO_AMBIENTE' THEN 'MEIO_AMBIENTE'
    WHEN 'SAUDE' THEN 'SAUDE'
    WHEN 'POLITICA' THEN 'POLITICA_CIDADANIA'
    WHEN 'ECONOMIA' THEN 'TRABALHO_ECONOMIA'
    WHEN 'CULTURA' THEN 'CULTURA_IDENTIDADE'
    WHEN 'DIREITOS_HUMANOS' THEN 'DIREITOS_HUMANOS'
END]::TEXT[]
WHERE "theme" <> 'OUTRO';
