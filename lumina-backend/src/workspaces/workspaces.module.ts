import { Module } from '@nestjs/common';
import { WorkspacesRepository } from './workspaces.repository';
import { WorkspacesController } from './workspaces.controller';
import { WorkspacePermissionsGuard } from './workspace-permissions.guard';

@Module({
  controllers: [WorkspacesController],
  providers: [WorkspacesRepository, WorkspacePermissionsGuard],
  exports: [WorkspacesRepository, WorkspacePermissionsGuard],
})
export class WorkspacesModule {}
