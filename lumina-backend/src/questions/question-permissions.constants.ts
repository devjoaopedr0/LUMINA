/** Códigos do catálogo de permissões (tabela permissions) usados no controle
 * de acesso do banco de questões. Cargos institucionais recebem estas
 * permissões via RolePermission; o dono do workspace pessoal tem acesso
 * implícito a tudo (é ele quem cria as próprias questões). */
export const QUESTION_PERMISSIONS = {
  MANAGE: 'QUESTION_MANAGE',
} as const;
