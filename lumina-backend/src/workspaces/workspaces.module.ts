import { Module } from '@nestjs/common';
import { WorkspacesRepository } from './workspaces.repository';
import { WorkspacesController } from './workspaces.controller';
import { WorkspacePermissionsGuard } from './workspace-permissions.guard';
import { WorkspacesService } from './workspaces.service';
import { AccessScopesService } from './access-scopes.service';

@Module({
  controllers: [WorkspacesController],
  providers: [WorkspacesRepository, WorkspacePermissionsGuard, WorkspacesService, AccessScopesService],
  exports: [WorkspacesRepository, WorkspacePermissionsGuard, AccessScopesService],
})
export class WorkspacesModule {}
