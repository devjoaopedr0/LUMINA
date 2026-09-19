import { SetMetadata } from '@nestjs/common';

export const WORKSPACE_PERMISSIONS_KEY = 'workspacePermissions';

export const RequireWorkspacePermissions = (...permissions: string[]) =>
  SetMetadata(WORKSPACE_PERMISSIONS_KEY, permissions);
