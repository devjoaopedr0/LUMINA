import { Injectable } from '@nestjs/common';
import { Prisma, Workspace, WorkspaceMember } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

type Db = PrismaService | Prisma.TransactionClient;

/** Membership com o necessário para checagem de permissão (cargo + códigos
 * de permissão do cargo no workspace). */
export type WorkspaceMembership = WorkspaceMember & {
  workspace: Workspace;
  role: {
    rolePermissions: { permission: { code: string } }[];
  };
};

/**
 * Acesso via Prisma a workspaces/workspace_members. Expõe a resolução do
 * Workspace pessoal e a checagem de cargo/permissões de um usuário dentro de
 * um workspace — base para o controle de acesso do banco de questões.
 */
@Injectable()
export class WorkspacesRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Retorna o Workspace do tipo PERSONAL do usuário (o criado no registro).
   * Se o usuário tiver múltiplos, prioriza o mais antigo — o pessoal é sempre
   * o primeiro a existir. */
  async findPersonalByUserId(userId: string, db: Db = this.prisma): Promise<Workspace | null> {
    const member = await db.workspaceMember.findFirst({
      where: { userId, workspace: { type: 'PERSONAL' } },
      orderBy: { joinedAt: 'asc' },
      include: { workspace: true },
    });
    return member?.workspace ?? null;
  }

  /** Vínculo ativo do usuário com o workspace, incluindo o cargo e os códigos
   * de permissão concedidos a esse cargo. Usado pelo QuestionAccessService
   * para decidir se o usuário pode gerenciar questões no workspace. */
  findMembership(
    userId: string,
    workspaceId: string,
    db: Db = this.prisma,
  ): Promise<WorkspaceMembership | null> {
    return db.workspaceMember.findFirst({
      where: { userId, workspaceId },
      include: {
        workspace: true,
        role: { include: { rolePermissions: { include: { permission: true } } } },
      },
    }) as Promise<WorkspaceMembership | null>;
  }

  findById(id: string, db: Db = this.prisma): Promise<Workspace | null> {
    return db.workspace.findUnique({ where: { id } });
  }

  /** Workspace do banco central de questões: o workspace vinculado à
   * Institution identificada pelo e-mail informado (estável, criado pelo
   * seed). Retorna null quando o banco ainda não existe. */
  async findBankWorkspace(
    institutionEmail: string,
    db: Db = this.prisma,
  ): Promise<Workspace | null> {
    const institution = await db.institution.findUnique({
      where: { email: institutionEmail },
      include: { workspace: true },
    });
    return institution?.workspace ?? null;
  }
}
