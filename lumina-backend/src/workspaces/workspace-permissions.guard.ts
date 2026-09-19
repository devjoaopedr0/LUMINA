import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { WorkspaceMemberStatus } from '@prisma/client';
import { WORKSPACE_PERMISSIONS_KEY } from '../common/decorators/require-workspace-permissions.decorator';
import { WorkspacesRepository } from './workspaces.repository';

@Injectable()
export class WorkspacePermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly workspaces: WorkspacesRepository) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(WORKSPACE_PERMISSIONS_KEY, [context.getHandler(), context.getClass()]) ?? [];
    if (!required.length) return true;
    const request = context.switchToHttp().getRequest();
    const workspaceId = request.params?.workspaceId ?? request.body?.workspaceId ?? request.query?.workspaceId;
    if (!workspaceId || !request.user?.id) throw new ForbiddenException('Workspace ou usuário não identificado.');
    const membership = await this.workspaces.findMembership(request.user.id, workspaceId);
    if (!membership || membership.status !== WorkspaceMemberStatus.ACTIVE) {
      throw new ForbiddenException('Você não possui acesso ativo a este workspace.');
    }
    if (membership.workspace.type === 'PERSONAL') return true;
    const granted = new Set(membership.role.rolePermissions.map((item) => item.permission.code));
    if (!required.every((permission) => granted.has(permission))) {
      throw new ForbiddenException('Seu cargo não possui as permissões necessárias.');
    }
    return true;
  }
}
