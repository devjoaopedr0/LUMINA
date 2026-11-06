-- Permissões do fluxo de revisão humana da redação (item 21).
-- A revisão por cargo (professor/coordenação/direção) já funciona pelo
-- AccountType; estas linhas permitem conceder as mesmas capacidades a cargos
-- personalizados do workspace.
INSERT INTO "permissions" ("id", "code", "name", "description")
VALUES
  (gen_random_uuid(), 'ESSAY_REVIEW', 'Revisar redações', 'Registrar notas humanas, evidências e chat sobre a correção da IA.'),
  (gen_random_uuid(), 'ESSAY_VALIDATE', 'Validar aprendizado de redação', 'Validar e consolidar aprendizados extraídos de revisões humanas.')
ON CONFLICT ("code") DO NOTHING;
