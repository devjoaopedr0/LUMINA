import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AccessScopesService } from './access-scopes.service';
import { WorkspacePermissionsGuard } from './workspace-permissions.guard';

const context = (userId = 'user-1', workspaceId = 'workspace-1') => ({
  getHandler: () => undefined,
  getClass: () => undefined,
  switchToHttp: () => ({ getRequest: () => ({ user: { id: userId }, params: { workspaceId } }) }),
}) as never;

describe('WorkspacePermissionsGuard', () => {
  const reflector = { getAllAndOverride: vi.fn().mockReturnValue(['ROLE_MANAGE']) };

  it('permite o proprietário do workspace pessoal', async () => {
    const repo = { findMembership: vi.fn().mockResolvedValue({ status: 'ACTIVE', workspace: { type: 'PERSONAL' }, role: { rolePermissions: [] } }) };
    await expect(new WorkspacePermissionsGuard(reflector as never, repo as never).canActivate(context())).resolves.toBe(true);
  });

  it('exige vínculo ativo e todas as permissões no workspace institucional', async () => {
    const deniedRepo = { findMembership: vi.fn().mockResolvedValue({ status: 'ACTIVE', workspace: { type: 'INSTITUTION' }, role: { rolePermissions: [] } }) };
    await expect(new WorkspacePermissionsGuard(reflector as never, deniedRepo as never).canActivate(context())).rejects.toBeInstanceOf(ForbiddenException);
    const allowedRepo = { findMembership: vi.fn().mockResolvedValue({ status: 'ACTIVE', workspace: { type: 'INSTITUTION' }, role: { rolePermissions: [{ permission: { code: 'ROLE_MANAGE' } }] } }) };
    await expect(new WorkspacePermissionsGuard(reflector as never, allowedRepo as never).canActivate(context())).resolves.toBe(true);
  });
});

describe('AccessScopesService', () => {
  it('permite membro, professor e coordenador somente dentro da turma', async () => {
    const prisma = { class: { findUnique: vi.fn().mockResolvedValue({ id: 'class-1', workspaceId: 'ws-1', archived: false, createdBy: 'owner', coordinatorId: null, teachers: [], members: [{ id: 'member' }] }) } };
    const service = new AccessScopesService(prisma as never, {} as never);
    await expect(service.assertClassAccess('student-1', 'class-1')).resolves.toMatchObject({ id: 'class-1' });

    prisma.class.findUnique.mockResolvedValueOnce({ id: 'class-1', workspaceId: 'ws-1', archived: false, createdBy: 'owner', coordinatorId: null, teachers: [], members: [] });
    const denied = new AccessScopesService(prisma as never, { findMembership: vi.fn().mockResolvedValue(null) } as never);
    await expect(denied.assertClassAccess('outsider', 'class-1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('não expõe aluno fora da turma solicitada', async () => {
    const prisma = { class: { findUnique: vi.fn().mockResolvedValue({ id: 'class-1', workspaceId: 'ws-1', createdBy: 'owner', coordinatorId: null, teachers: [{ id: 'teacher' }], members: [] }) } };
    const service = new AccessScopesService(prisma as never, {} as never);
    await expect(service.assertStudentAccess('teacher-1', 'class-1', 'student-outside')).rejects.toBeInstanceOf(NotFoundException);
  });
});
