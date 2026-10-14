INSERT INTO "permissions" ("id", "code", "name", "description") VALUES
  (gen_random_uuid(), 'ROLE_MANAGE', 'Gerenciar cargos', 'Criar, consultar e alterar cargos do workspace.'),
  (gen_random_uuid(), 'MEMBER_MANAGE', 'Gerenciar membros', 'Convidar, suspender e alterar membros do workspace.'),
  (gen_random_uuid(), 'CLASS_MANAGE', 'Gerenciar turmas', 'Criar, editar e arquivar turmas do workspace.'),
  (gen_random_uuid(), 'REPORT_VIEW', 'Consultar relatórios', 'Consultar relatórios institucionais do workspace.')
ON CONFLICT ("code") DO NOTHING;
