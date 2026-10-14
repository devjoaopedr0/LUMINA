-- Simulado modelo ENEM: 1 ou 2 = o dia de prova que ele reproduz (90
-- questões, 45 por área). Nulo nos simulados comuns.

ALTER TABLE "simulations" ADD COLUMN "enem_day" INTEGER;
