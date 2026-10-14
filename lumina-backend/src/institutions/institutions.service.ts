import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InstitutionStatus, Prisma, WorkspaceMemberStatus, WorkspaceType } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { WORKSPACE_PERMISSIONS } from '../workspaces/workspace-permissions.constants';
import { CreateInstitutionDto } from './institutions.dto';

/** Nomes canônicos dos cargos institucionais criados no cadastro. O mapeamento
 * inverso (nome do cargo -> accountType) em acceptInvite depende deles não
 * mudarem — cargos customizados criados depois (POST /workspaces/:id/roles)
 * não entram nesse mapeamento, e aceitar um convite pra um cargo assim
 * simplesmente não altera o accountType (nunca adivinha). */
export const ROLE_DIRETOR = 'Diretor';
export const ROLE_COORDENADOR = 'Coordenador';
export const ROLE_PROFESSOR = 'Professor';
export const ROLE_ALUNO = 'Aluno';

const ROLE_NAME_TO_ACCOUNT_TYPE: Record<string, string> = {
  [ROLE_DIRETOR]: 'DIRECTOR',
  [ROLE_COORDENADOR]: 'COORDINATOR',
  [ROLE_PROFESSOR]: 'TEACHER',
  [ROLE_ALUNO]: 'STUDENT_INSTITUTION',
};

@Injectable()
export class InstitutionsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Cadastro de instituição: cria a Institution + seu Workspace, semeia os
   * 4 cargos institucionais padrão (Diretor/Coordenador com as permissões de
   * RBAC já existentes; Professor/Aluno sem permissão de workspace — a
   * autoridade deles vem do vínculo com turmas específicas, não do
   * workspace inteiro) e vincula quem criou como Diretor ACTIVE.
   * A instituição nasce ACTIVE: ainda não há fluxo de aprovação/pagamento
   * institucional e a política de turmas exige instituição ativa
   * (assertInstitutionClassMember) — deixar PENDING bloquearia toda a gestão
   * de turmas de uma escola recém-cadastrada sem caminho para ativá-la.
   * Quando o licenciamento pago com aprovação assistida existir, o cadastro
   * passa a nascer PENDING e a ativação entra no fluxo de onboarding. */
  async createInstitution(userId: string, dto: CreateInstitutionDto) {
    return this.prisma.$transaction(tx => InstitutionsService.createInTransaction(tx, userId, dto));
  }

  static async createInTransaction(tx: Prisma.TransactionClient, userId: string, dto: CreateInstitutionDto) {
    const existing = await tx.institution.findUnique({ where: { email: dto.email.trim().toLowerCase() } });
    if (existing) throw new ConflictException('Já existe uma instituição cadastrada com este e-mail.');

    const permissions = await tx.permission.findMany({
      where: { code: { in: Object.values(WORKSPACE_PERMISSIONS) } },
    });
    const permissionId = (code: string) => permissions.find((p) => p.code === code)?.id;

      const institution = await tx.institution.create({
        data: {
          name: dto.name.trim(),
          email: dto.email.trim().toLowerCase(),
          phone: dto.phone?.trim() || null,
          status: InstitutionStatus.ACTIVE,
          workspace: { create: { name: dto.name.trim(), type: WorkspaceType.INSTITUTION } },
        },
        include: { workspace: true },
      });
      const workspaceId = institution.workspace!.id;

      const diretorRole = await tx.role.create({
        data: {
          workspaceId,
          name: ROLE_DIRETOR,
          description: 'Direção da instituição — acesso completo ao workspace.',
          isSystem: true,
          rolePermissions: {
            create: Object.values(WORKSPACE_PERMISSIONS)
              .map(permissionId)
              .filter((id): id is string => !!id)
              .map((id) => ({ permissionId: id })),
          },
        },
      });
      await tx.role.create({
        data: {
          workspaceId,
          name: ROLE_COORDENADOR,
          description: 'Coordenação pedagógica — gerencia membros, turmas e relatórios.',
          isSystem: true,
          rolePermissions: {
            create: [
              WORKSPACE_PERMISSIONS.MEMBER_MANAGE,
              WORKSPACE_PERMISSIONS.CLASS_MANAGE,
              WORKSPACE_PERMISSIONS.REPORT_VIEW,
            ]
              .map(permissionId)
              .filter((id): id is string => !!id)
              .map((id) => ({ permissionId: id })),
          },
        },
      });
      await tx.role.create({
        data: {
          workspaceId,
          name: ROLE_PROFESSOR,
          description: 'Professor da instituição — gerencia as turmas em que leciona.',
          isSystem: true,
        },
      });
      await tx.role.create({
        data: {
          workspaceId,
          name: ROLE_ALUNO,
          description: 'Aluno vinculado à instituição.',
          isSystem: true,
        },
      });

      await tx.workspaceMember.create({
        data: { workspaceId, userId, roleId: diretorRole.id, status: WorkspaceMemberStatus.ACTIVE },
      });
      await tx.user.update({ where: { id: userId }, data: { accountType: 'DIRECTOR' } });

      return tx.institution.findUniqueOrThrow({ where: { id: institution.id }, include: { workspace: true } });
  }

  /** Só consulta — não muda nada. Existe para o frontend poder mostrar "você
   * foi convidado para X como Y, aceitar?" antes de chamar acceptInvite,
   * que É uma mutação (nunca deveria ser disparado só pra "checar"). */
  async pendingInvite(userId: string) {
    const invite = await this.prisma.workspaceMember.findFirst({
      where: { userId, status: WorkspaceMemberStatus.INVITED, workspace: { type: WorkspaceType.INSTITUTION } },
      include: { workspace: { include: { institution: true } }, role: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!invite) return null;
    return {
      id: invite.id,
      institutionName: invite.workspace.institution?.name ?? invite.workspace.name,
      roleName: invite.role.name,
    };
  }

  /** Resolve o convite pendente do usuário autenticado (WorkspaceMember com
   * status INVITED num workspace institucional) e o ativa. Atualiza o
   * accountType quando o cargo do convite é um dos 4 canônicos. Um usuário
   * só pode ter um convite pendente por vez nesta primeira versão (o
   * próprio findFirst já resolve o mais antigo). */
  async acceptInvite(userId: string) {
    const invite = await this.prisma.workspaceMember.findFirst({
      where: { userId, status: WorkspaceMemberStatus.INVITED, workspace: { type: WorkspaceType.INSTITUTION } },
      include: { role: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!invite) throw new NotFoundException('Nenhum convite pendente encontrado para esta conta.');

    const accountType = ROLE_NAME_TO_ACCOUNT_TYPE[invite.role.name];

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.workspaceMember.update({
        where: { id: invite.id },
        data: { status: WorkspaceMemberStatus.ACTIVE },
        include: { workspace: true, role: true },
      });
      if (accountType) {
        await tx.user.update({ where: { id: userId }, data: { accountType: accountType as never } });
      }
      return updated;
    });
  }
}
