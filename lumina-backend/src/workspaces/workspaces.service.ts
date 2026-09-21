import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { WorkspaceMemberStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import {
  ROLE_ALUNO,
  ROLE_COORDENADOR,
  ROLE_PROFESSOR,
} from '../institutions/institutions.service';
import { CreateInviteDto, TransferClassMemberDto } from './workspace-invites.dto';
import { SaveWorkspaceRoleDto } from './workspace-roles.dto';

const ACCOUNT_TYPE_TO_ROLE_NAME: Record<string, string> = {
  STUDENT_INSTITUTION: ROLE_ALUNO,
  TEACHER: ROLE_PROFESSOR,
  COORDINATOR: ROLE_COORDENADOR,
};

@Injectable()
export class WorkspacesService {
  constructor(private readonly prisma: PrismaService) {}

  permissions() {
    return this.prisma.permission.findMany({ orderBy: { code: 'asc' } });
  }

  async createRole(workspaceId: string, dto: SaveWorkspaceRoleDto) {
    const permissions = await this.resolvePermissions(dto.permissionCodes);
    return this.prisma.role.create({
      data: {
        workspaceId,
        name: dto.name.trim(),
        description: dto.description.trim() || null,
        rolePermissions: { create: permissions.map((permission) => ({ permissionId: permission.id })) },
      },
      include: { rolePermissions: { include: { permission: true } } },
    });
  }

  async setRolePermissions(workspaceId: string, roleId: string, permissionCodes: string[]) {
    const role = await this.prisma.role.findFirst({ where: { id: roleId, workspaceId } });
    if (!role) throw new NotFoundException('Cargo não encontrado neste workspace.');
    const permissions = await this.resolvePermissions(permissionCodes);
    await this.prisma.$transaction([
      this.prisma.rolePermission.deleteMany({ where: { roleId } }),
      this.prisma.rolePermission.createMany({ data: permissions.map((permission) => ({ roleId, permissionId: permission.id })) }),
    ]);
    return { id: role.id, permissionCodes: permissions.map((permission) => permission.code).sort() };
  }

  private async resolvePermissions(codes: string[]) {
    const unique = [...new Set(codes)];
    const permissions = await this.prisma.permission.findMany({ where: { code: { in: unique } } });
    if (permissions.length !== unique.length) throw new BadRequestException('Uma ou mais permissões são inválidas.');
    return permissions;
  }

  /** Convite: exige que a pessoa já tenha uma conta Lumina com este e-mail —
   * não há como criar um WorkspaceMember sem um userId (a FK exige), e
   * inventar uma conta para alguém que não pediu está fora de cogitação.
   * A mensagem de erro é explícita sobre isso em vez de simplesmente falhar. */
  async createInvite(workspaceId: string, dto: CreateInviteDto) {
    if (dto.accountType === 'TEACHER' && !dto.subject?.trim()) {
      throw new BadRequestException('Informe a disciplina do professor.');
    }

    const user = await this.prisma.user.findUnique({ where: { email: dto.email.trim().toLowerCase() } });
    if (!user) {
      throw new NotFoundException(
        'Não existe conta com este e-mail. Peça para a pessoa se cadastrar na Lumina primeiro e tente convidar novamente.',
      );
    }

    const roleName = ACCOUNT_TYPE_TO_ROLE_NAME[dto.accountType];
    const role = await this.prisma.role.findFirst({ where: { workspaceId, name: roleName } });
    if (!role) {
      throw new NotFoundException(`Cargo padrão "${roleName}" não encontrado neste workspace.`);
    }

    const existingMembership = await this.prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: user.id } },
    });
    if (existingMembership && existingMembership.status === WorkspaceMemberStatus.ACTIVE) {
      throw new ConflictException('Esta pessoa já é membro ativo da instituição.');
    }

    if (dto.accountType === 'TEACHER') {
      await this.prisma.teacherProfile.upsert({
        where: { userId: user.id },
        update: {},
        create: { userId: user.id, subject: dto.subject!.trim() },
      });
    }

    return this.prisma.workspaceMember.upsert({
      where: { workspaceId_userId: { workspaceId, userId: user.id } },
      update: { roleId: role.id, status: WorkspaceMemberStatus.INVITED },
      create: { workspaceId, userId: user.id, roleId: role.id, status: WorkspaceMemberStatus.INVITED },
      include: {
        user: { select: { email: true, profile: { select: { firstName: true, lastName: true } } } },
        role: true,
      },
    });
  }

  listInvites(workspaceId: string) {
    return this.prisma.workspaceMember.findMany({
      where: { workspaceId, status: WorkspaceMemberStatus.INVITED },
      include: {
        user: { select: { email: true, profile: { select: { firstName: true, lastName: true } } } },
        role: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async revokeInvite(workspaceId: string, memberId: string) {
    const invite = await this.prisma.workspaceMember.findFirst({
      where: { id: memberId, workspaceId, status: WorkspaceMemberStatus.INVITED },
    });
    if (!invite) throw new NotFoundException('Convite pendente não encontrado.');
    await this.prisma.workspaceMember.delete({ where: { id: memberId } });
    return { revoked: true };
  }

  /** Move um aluno de uma turma para outra dentro da MESMA instituição.
   * Confere explicitamente que as duas turmas pertencem ao workspaceId do
   * chamador — sem isso, um coordenador de uma instituição poderia mover um
   * aluno para a turma de OUTRA instituição só adivinhando o UUID (IDOR). */
  async transferClassMember(workspaceId: string, dto: TransferClassMemberDto) {
    if (dto.fromClassId === dto.toClassId) {
      throw new BadRequestException('A turma de origem e destino não podem ser a mesma.');
    }

    const [fromClass, toClass] = await Promise.all([
      this.prisma.class.findFirst({ where: { id: dto.fromClassId, workspaceId } }),
      this.prisma.class.findFirst({ where: { id: dto.toClassId, workspaceId } }),
    ]);
    if (!fromClass || !toClass) {
      throw new NotFoundException('Uma das turmas informadas não pertence a esta instituição.');
    }

    const membership = await this.prisma.classMember.findUnique({
      where: { classId_userId: { classId: dto.fromClassId, userId: dto.studentId } },
    });
    if (!membership) throw new NotFoundException('Aluno não é membro da turma de origem.');

    if (toClass.maxStudents !== null) {
      const currentCount = await this.prisma.classMember.count({ where: { classId: dto.toClassId } });
      if (currentCount >= toClass.maxStudents) {
        throw new BadRequestException('A turma de destino já atingiu o número máximo de alunos.');
      }
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.classMember.delete({ where: { id: membership.id } });
        return tx.classMember.create({ data: { classId: dto.toClassId, userId: dto.studentId } });
      });
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
        throw new ConflictException('O aluno já é membro da turma de destino.');
      }
      throw error;
    }
  }
}
