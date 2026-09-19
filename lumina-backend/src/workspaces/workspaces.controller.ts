import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireWorkspacePermissions } from '../common/decorators/require-workspace-permissions.decorator';
import type { UserWithProfile } from '../users/users.repository';
import { WORKSPACE_PERMISSIONS } from './workspace-permissions.constants';
import { WorkspacePermissionsGuard } from './workspace-permissions.guard';
import { WorkspacesRepository } from './workspaces.repository';

@ApiTags('workspaces')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workspaces')
export class WorkspacesController {
  constructor(private readonly workspaces: WorkspacesRepository) {}

  @Get('me/access')
  @ApiOperation({ summary: 'Lista workspaces, cargos e permissões efetivas do usuário.' })
  async myAccess(@CurrentUser() user: UserWithProfile) {
    const memberships = await this.workspaces.findMemberships(user.id);
    return memberships.map((membership) => ({
      workspace: { id: membership.workspace.id, name: membership.workspace.name, type: membership.workspace.type },
      role: { id: membership.role.id, name: membership.role.name },
      permissions: membership.workspace.type === 'PERSONAL'
        ? ['*']
        : membership.role.rolePermissions.map((item) => item.permission.code).sort(),
    }));
  }

  @Get(':workspaceId/roles')
  @UseGuards(WorkspacePermissionsGuard)
  @RequireWorkspacePermissions(WORKSPACE_PERMISSIONS.ROLE_MANAGE)
  @ApiOperation({ summary: 'Lista os cargos do workspace quando o usuário pode gerenciá-los.' })
  listRoles(@Param('workspaceId') workspaceId: string) {
    return this.workspaces.findRoles(workspaceId);
  }
}
