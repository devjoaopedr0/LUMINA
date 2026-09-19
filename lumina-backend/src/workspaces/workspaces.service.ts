import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { SaveWorkspaceRoleDto } from './workspace-roles.dto';

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
}
