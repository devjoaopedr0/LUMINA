CREATE TABLE "teacher_profiles" (
  "user_id" UUID PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "subject" VARCHAR(120) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "essay_themes" (
  "id" UUID PRIMARY KEY,
  "title" VARCHAR(300) NOT NULL,
  "exam" VARCHAR(60) NOT NULL,
  "year" INTEGER,
  "source_url" VARCHAR(2048),
  "created_by" UUID REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "essay_themes_exam_year_idx" ON "essay_themes"("exam", "year");

INSERT INTO "essay_themes" ("id", "title", "exam", "year", "source_url") VALUES
('1d53fbb5-7944-4d1b-a5fe-a1840bd88525', 'Perspectivas acerca do envelhecimento na sociedade brasileira', 'ENEM', 2025, 'https://download.inep.gov.br/enem/provas_e_gabaritos/2025_PV_impresso_D1_CD10_ampliada.pdf'),
('925fc934-9e20-4f53-acd4-b869c5cfc557', 'Desafios para a valorização da herança africana no Brasil', 'ENEM', 2024, 'https://download.inep.gov.br/enem/provas_e_gabaritos/2024_PV_impresso_D1_CD10.pdf'),
('e8939340-4078-46ea-bdf2-0398ecaa52ad', 'Desafios para o enfrentamento da invisibilidade do trabalho de cuidado realizado pela mulher no Brasil', 'ENEM', 2023, 'https://download.inep.gov.br/enem/provas_e_gabaritos/tema_redacao_2023.pdf'),
('7f6d9a2c-4483-4b87-b40a-7e294e943508', 'Desafios para a valorização de comunidades e povos tradicionais no Brasil', 'ENEM', 2022, 'https://download.inep.gov.br/enem/provas_e_gabaritos/2022_PV_digital_D1_CD1_espanhol.pdf');

INSERT INTO "essay_themes" ("id", "title", "exam", "year", "source_url") VALUES
('8507ddb4-2272-4498-bf75-9158886460cd', 'Invisibilidade e registro civil: garantia de acesso à cidadania no Brasil', 'ENEM', 2021, 'https://www.gov.br/inep/pt-br/areas-de-atuacao/avaliacao-e-exames-educacionais/enem/provas-e-gabaritos/2021'),
('91cd74c1-0b97-4677-b8d4-28643acf878a', 'O estigma associado às doenças mentais na sociedade brasileira', 'ENEM', 2020, 'https://download.inep.gov.br/enem/provas_e_gabaritos/2020_PV_impresso_D1_CD4_ampliada.pdf'),
('76a6e62f-90be-4d3a-8d17-e9bb7a60be7b', 'Democratização do acesso ao cinema no Brasil', 'ENEM', 2019, 'https://www.gov.br/inep/pt-br/areas-de-atuacao/avaliacao-e-exames-educacionais/enem/provas-e-gabaritos/2019'),
('8d6595d8-6044-49a9-b356-6170366f4b64', 'Manipulação do comportamento do usuário pelo controle de dados na internet', 'ENEM', 2018, 'https://www.gov.br/inep/pt-br/areas-de-atuacao/avaliacao-e-exames-educacionais/enem/provas-e-gabaritos/2018'),
('b02e9189-f7b3-4897-86a4-19b2db21ab59', 'Desafios para a formação educacional de surdos no Brasil', 'ENEM', 2017, 'https://www.gov.br/inep/pt-br/areas-de-atuacao/avaliacao-e-exames-educacionais/enem/provas-e-gabaritos/2017'),
('5529e97d-fabc-4a83-b858-6f5d3c7e99b7', 'Caminhos para combater a intolerância religiosa no Brasil', 'ENEM', 2016, 'https://download.inep.gov.br/educacao_basica/enem/provas/2016/2016_PV_impresso_D2_CD6.pdf'),
('b2f999d3-3f1e-4c72-a996-0d523bda2c65', 'A persistência da violência contra a mulher na sociedade brasileira', 'ENEM', 2015, 'https://download.inep.gov.br/educacao_basica/enem/provas/2015/2015_PV_impresso_D2_CD5.pdf'),
('94b61de1-f654-478b-bf10-b4b23f7397f7', 'Publicidade infantil em questão no Brasil', 'ENEM', 2014, 'https://www.gov.br/inep/pt-br/areas-de-atuacao/avaliacao-e-exames-educacionais/enem/provas-e-gabaritos/2014'),
('ff73923b-32dc-4a56-a3bc-87481efadf43', 'Efeitos da implantação da Lei Seca no Brasil', 'ENEM', 2013, 'https://www.gov.br/inep/pt-br/areas-de-atuacao/avaliacao-e-exames-educacionais/enem/provas-e-gabaritos/2013'),
('63528c98-f3f5-4681-9a93-ac53362553a3', 'O movimento imigratório para o Brasil no século XXI', 'ENEM', 2012, 'https://download.inep.gov.br/educacao_basica/enem/guia_participante/2013/guia_de_redacao_enem_2013.pdf'),
('326661cd-9f24-4577-bc7a-dc19ef3bd64c', 'Viver em rede no século 21: os limites entre o público e o privado', 'ENEM', 2011, 'https://download.inep.gov.br/educacao_basica/enem/provas/2011/dia2_caderno6_cinza_ledor.pdf');
