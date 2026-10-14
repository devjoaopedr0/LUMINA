import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { WorkspaceMemberStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { WORKSPACE_PERMISSIONS } from './workspace-permissions.constants';
import { WorkspacesRepository } from './workspaces.repository';

@Injectable()
export class AccessScopesService {
  constructor(private readonly prisma: PrismaService, private readonly workspaces: WorkspacesRepository) {}

  async assertClassAccess(userId: string, classId: string) {
    const classRoom = await this.prisma.class.findUnique({
      where: { id: classId },
      include: { teachers: { where: { userId } }, members: { where: { userId } } },
    });
    if (!classRoom || classRoom.archived) throw new NotFoundException('Turma não encontrada.');
    if (classRoom.createdBy === userId || classRoom.coordinatorId === userId || classRoom.teachers.length || classRoom.members.length) return classRoom;
    if (await this.hasWorkspacePermission(userId, classRoom.workspaceId, WORKSPACE_PERMISSIONS.CLASS_MANAGE)) return classRoom;
    throw new ForbiddenException('Você não possui acesso a esta turma.');
  }

  async assertStudentAccess(userId: string, classId: string, studentId: string) {
    if (userId === studentId) return this.assertClassAccess(userId, classId);
    const classRoom = await this.prisma.class.findUnique({
      where: { id: classId },
      include: { teachers: { where: { userId } }, members: { where: { userId: studentId } } },
    });
    if (!classRoom || !classRoom.members.length) throw new NotFoundException('Aluno não encontrado nesta turma.');
    if (classRoom.createdBy === userId || classRoom.coordinatorId === userId || classRoom.teachers.length) return classRoom;
    if (await this.hasWorkspacePermission(userId, classRoom.workspaceId, WORKSPACE_PERMISSIONS.MEMBER_MANAGE)) return classRoom;
    throw new ForbiddenException('Você não possui acesso aos dados deste aluno.');
  }

  private async hasWorkspacePermission(userId: string, workspaceId: string, permission: string) {
    const membership = await this.workspaces.findMembership(userId, workspaceId);
    return Boolean(membership && membership.status === WorkspaceMemberStatus.ACTIVE && membership.role.rolePermissions.some((item) => item.permission.code === permission));
  }
}
