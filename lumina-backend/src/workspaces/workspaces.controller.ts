import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireWorkspacePermissions } from '../common/decorators/require-workspace-permissions.decorator';
import type { UserWithProfile } from '../users/users.repository';
import { WORKSPACE_PERMISSIONS } from './workspace-permissions.constants';
import { WorkspacePermissionsGuard } from './workspace-permissions.guard';
import { WorkspacesRepository } from './workspaces.repository';
import { WorkspacesService } from './workspaces.service';
import { SaveWorkspaceRoleDto, SetRolePermissionsDto } from './workspace-roles.dto';
import { CreateInviteDto, TransferClassMemberDto } from './workspace-invites.dto';
import { AccessScopesService } from './access-scopes.service';

@ApiTags('workspaces')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workspaces')
export class WorkspacesController {
  constructor(private readonly workspaces: WorkspacesRepository, private readonly service: WorkspacesService, private readonly scopes: AccessScopesService) {}

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

  @Get(':workspaceId/permissions')
  @UseGuards(WorkspacePermissionsGuard)
  @RequireWorkspacePermissions(WORKSPACE_PERMISSIONS.ROLE_MANAGE)
  permissionCatalog() { return this.service.permissions(); }

  @Post(':workspaceId/roles')
  @UseGuards(WorkspacePermissionsGuard)
  @RequireWorkspacePermissions(WORKSPACE_PERMISSIONS.ROLE_MANAGE)
  createRole(@Param('workspaceId') workspaceId: string, @Body() dto: SaveWorkspaceRoleDto) {
    return this.service.createRole(workspaceId, dto);
  }

  @Patch(':workspaceId/roles/:roleId/permissions')
  @UseGuards(WorkspacePermissionsGuard)
  @RequireWorkspacePermissions(WORKSPACE_PERMISSIONS.ROLE_MANAGE)
  setRolePermissions(@Param('workspaceId') workspaceId: string, @Param('roleId') roleId: string, @Body() dto: SetRolePermissionsDto) {
    return this.service.setRolePermissions(workspaceId, roleId, dto.permissionCodes);
  }

  @Post(':workspaceId/invites')
  @UseGuards(WorkspacePermissionsGuard)
  @RequireWorkspacePermissions(WORKSPACE_PERMISSIONS.MEMBER_MANAGE)
  @ApiOperation({ summary: 'Convida um usuário já cadastrado na Lumina para entrar na instituição.' })
  createInvite(@Param('workspaceId') workspaceId: string, @Body() dto: CreateInviteDto) {
    return this.service.createInvite(workspaceId, dto);
  }

  @Get(':workspaceId/invites')
  @UseGuards(WorkspacePermissionsGuard)
  @RequireWorkspacePermissions(WORKSPACE_PERMISSIONS.MEMBER_MANAGE)
  @ApiOperation({ summary: 'Lista os convites institucionais pendentes.' })
  listInvites(@Param('workspaceId') workspaceId: string) {
    return this.service.listInvites(workspaceId);
  }

  @Delete(':workspaceId/invites/:memberId')
  @UseGuards(WorkspacePermissionsGuard)
  @RequireWorkspacePermissions(WORKSPACE_PERMISSIONS.MEMBER_MANAGE)
  @ApiOperation({ summary: 'Revoga um convite institucional ainda pendente.' })
  revokeInvite(@Param('workspaceId') workspaceId: string, @Param('memberId') memberId: string) {
    return this.service.revokeInvite(workspaceId, memberId);
  }

  @Patch(':workspaceId/classes/transfer')
  @UseGuards(WorkspacePermissionsGuard)
  @RequireWorkspacePermissions(WORKSPACE_PERMISSIONS.CLASS_MANAGE)
  @ApiOperation({ summary: 'Transfere um aluno de uma turma para outra dentro da mesma instituição.' })
  transferClassMember(@Param('workspaceId') workspaceId: string, @Body() dto: TransferClassMemberDto) {
    return this.service.transferClassMember(workspaceId, dto);
  }

  @Get('access/classes/:classId')
  async classAccess(@CurrentUser() user: UserWithProfile, @Param('classId') classId: string) {
    const classRoom = await this.scopes.assertClassAccess(user.id, classId);
    return { allowed: true, classId: classRoom.id, workspaceId: classRoom.workspaceId };
  }

  @Get('access/classes/:classId/students/:studentId')
  async studentAccess(@CurrentUser() user: UserWithProfile, @Param('classId') classId: string, @Param('studentId') studentId: string) {
    const classRoom = await this.scopes.assertStudentAccess(user.id, classId, studentId);
    return { allowed: true, classId: classRoom.id, studentId };
  }
}
