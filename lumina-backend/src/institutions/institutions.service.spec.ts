import { ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { InstitutionsService, ROLE_ALUNO, ROLE_COORDENADOR, ROLE_DIRETOR, ROLE_PROFESSOR } from './institutions.service';

function makeTx(overrides: Record<string, unknown> = {}) {
  return {
    institution: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'institution-1', workspace: { id: 'workspace-1' } }),
      findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 'institution-1', workspace: { id: 'workspace-1' } }),
    },
    permission: {
      findMany: vi.fn().mockResolvedValue([
        { id: 'perm-role', code: 'ROLE_MANAGE' },
        { id: 'perm-member', code: 'MEMBER_MANAGE' },
        { id: 'perm-class', code: 'CLASS_MANAGE' },
        { id: 'perm-report', code: 'REPORT_VIEW' },
      ]),
    },
    role: {
      create: vi.fn().mockImplementation(({ data }: { data: { name: string } }) =>
        Promise.resolve({ id: `role-${data.name}`, name: data.name }),
      ),
    },
    workspaceMember: { create: vi.fn().mockResolvedValue({}), update: vi.fn(), findFirst: vi.fn() },
    user: { update: vi.fn().mockResolvedValue({}) },
    ...overrides,
  };
}

describe('InstitutionsService', () => {
  describe('createInstitution', () => {
    it('recusa quando já existe instituição com o mesmo e-mail', async () => {
      const tx = {
        institution: { findUnique: vi.fn().mockResolvedValue({ id: 'existing' }) },
        permission: { findMany: vi.fn() },
      };
      const prisma = { $transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(tx)) };
      const service = new InstitutionsService(prisma as never);

      await expect(
        service.createInstitution('user-1', { name: 'Escola', email: 'escola@exemplo.com' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(tx.permission.findMany).not.toHaveBeenCalled();
    });

    it('cria a instituição, os 4 cargos e vincula o criador como Diretor ACTIVE', async () => {
      const tx = makeTx();
      const prisma = { $transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(tx)) };
      const service = new InstitutionsService(prisma as never);

      await service.createInstitution('user-1', { name: 'Escola Lumina', email: 'Escola@Exemplo.com' });

      expect(tx.institution.findUnique).toHaveBeenCalledWith({ where: { email: 'escola@exemplo.com' } });
      // Instituição nasce ACTIVE: sem fluxo de ativação ainda, e a política
      // de turmas exige instituição ativa (assertInstitutionClassMember).
      expect(tx.institution.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'ACTIVE' }) }),
      );
      const roleNames = tx.role.create.mock.calls.map((call) => call[0].data.name);
      expect(roleNames).toEqual([ROLE_DIRETOR, ROLE_COORDENADOR, ROLE_PROFESSOR, ROLE_ALUNO]);

      // Diretor recebe as 4 permissões; Coordenador recebe 3 (sem ROLE_MANAGE).
      const diretorCall = tx.role.create.mock.calls[0][0];
      expect(diretorCall.data.rolePermissions.create).toHaveLength(4);
      const coordenadorCall = tx.role.create.mock.calls[1][0];
      expect(coordenadorCall.data.rolePermissions.create).toHaveLength(3);
      // Professor e Aluno não recebem nenhuma permissão de workspace.
      expect(tx.role.create.mock.calls[2][0].data.rolePermissions).toBeUndefined();
      expect(tx.role.create.mock.calls[3][0].data.rolePermissions).toBeUndefined();

      expect(tx.workspaceMember.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: 'user-1', roleId: 'role-Diretor', status: 'ACTIVE' }),
        }),
      );
      expect(tx.user.update).toHaveBeenCalledWith({ where: { id: 'user-1' }, data: { accountType: 'DIRECTOR' } });
    });
  });

  describe('pendingInvite', () => {
    it('retorna null quando não há convite pendente', async () => {
      const prisma = { workspaceMember: { findFirst: vi.fn().mockResolvedValue(null) } };
      const service = new InstitutionsService(prisma as never);

      await expect(service.pendingInvite('user-1')).resolves.toBeNull();
    });

    it('retorna o nome da instituição e do cargo sem alterar o status', async () => {
      const findFirst = vi.fn().mockResolvedValue({
        id: 'member-1',
        role: { name: ROLE_PROFESSOR },
        workspace: { name: 'Workspace Fallback', institution: { name: 'Escola Lumina' } },
      });
      const prisma = { workspaceMember: { findFirst, update: vi.fn() } };
      const service = new InstitutionsService(prisma as never);

      await expect(service.pendingInvite('user-1')).resolves.toEqual({
        id: 'member-1',
        institutionName: 'Escola Lumina',
        roleName: ROLE_PROFESSOR,
      });
      expect(prisma.workspaceMember.update).not.toHaveBeenCalled();
    });
  });

  describe('acceptInvite', () => {
    it('lança NotFoundException quando não há convite pendente', async () => {
      const prisma = { workspaceMember: { findFirst: vi.fn().mockResolvedValue(null) } };
      const service = new InstitutionsService(prisma as never);

      await expect(service.acceptInvite('user-1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('ativa o convite e atualiza o accountType para um cargo canônico', async () => {
      const tx = {
        workspaceMember: {
          update: vi.fn().mockResolvedValue({ id: 'member-1', status: 'ACTIVE' }),
        },
        user: { update: vi.fn().mockResolvedValue({}) },
      };
      const prisma = {
        workspaceMember: {
          findFirst: vi.fn().mockResolvedValue({ id: 'member-1', role: { name: ROLE_PROFESSOR } }),
        },
        $transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(tx)),
      };
      const service = new InstitutionsService(prisma as never);

      await service.acceptInvite('user-1');

      expect(tx.workspaceMember.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'member-1' }, data: { status: 'ACTIVE' } }),
      );
      expect(tx.user.update).toHaveBeenCalledWith({ where: { id: 'user-1' }, data: { accountType: 'TEACHER' } });
    });

    it('ativa o convite mas NÃO altera o accountType quando o cargo é customizado', async () => {
      const tx = { workspaceMember: { update: vi.fn().mockResolvedValue({ id: 'member-1' }) }, user: { update: vi.fn() } };
      const prisma = {
        workspaceMember: {
          findFirst: vi.fn().mockResolvedValue({ id: 'member-1', role: { name: 'Monitor de Laboratório' } }),
        },
        $transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(tx)),
      };
      const service = new InstitutionsService(prisma as never);

      await service.acceptInvite('user-1');

      expect(tx.user.update).not.toHaveBeenCalled();
    });
  });
});
