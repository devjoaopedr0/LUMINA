import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { WorkspacesService } from './workspaces.service';

describe('WorkspacesService — convites institucionais', () => {
  describe('createInvite', () => {
    it('exige disciplina ao convidar um professor', async () => {
      const prisma = { user: { findUnique: vi.fn() } };
      const service = new WorkspacesService(prisma as never);

      await expect(
        service.createInvite('workspace-1', { email: 'prof@exemplo.com', accountType: 'TEACHER' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('recusa convidar um e-mail sem conta cadastrada', async () => {
      const prisma = { user: { findUnique: vi.fn().mockResolvedValue(null) } };
      const service = new WorkspacesService(prisma as never);

      await expect(
        service.createInvite('workspace-1', { email: 'ninguem@exemplo.com', accountType: 'STUDENT_INSTITUTION' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('recusa quando o cargo padrão não existe no workspace', async () => {
      const prisma = {
        user: { findUnique: vi.fn().mockResolvedValue({ id: 'user-1' }) },
        role: { findFirst: vi.fn().mockResolvedValue(null) },
      };
      const service = new WorkspacesService(prisma as never);

      await expect(
        service.createInvite('workspace-1', { email: 'aluno@exemplo.com', accountType: 'STUDENT_INSTITUTION' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('recusa convidar quem já é membro ativo', async () => {
      const prisma = {
        user: { findUnique: vi.fn().mockResolvedValue({ id: 'user-1' }) },
        role: { findFirst: vi.fn().mockResolvedValue({ id: 'role-aluno' }) },
        workspaceMember: {
          findUnique: vi.fn().mockResolvedValue({ status: 'ACTIVE' }),
        },
      };
      const service = new WorkspacesService(prisma as never);

      await expect(
        service.createInvite('workspace-1', { email: 'aluno@exemplo.com', accountType: 'STUDENT_INSTITUTION' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('cria o convite (INVITED) e o perfil de professor quando accountType é TEACHER', async () => {
      const prisma = {
        user: { findUnique: vi.fn().mockResolvedValue({ id: 'user-1' }) },
        role: { findFirst: vi.fn().mockResolvedValue({ id: 'role-professor' }) },
        workspaceMember: {
          findUnique: vi.fn().mockResolvedValue(null),
          upsert: vi.fn().mockResolvedValue({ id: 'member-1', status: 'INVITED' }),
        },
        teacherProfile: { upsert: vi.fn().mockResolvedValue({}) },
      };
      const service = new WorkspacesService(prisma as never);

      await service.createInvite('workspace-1', {
        email: 'prof@exemplo.com',
        accountType: 'TEACHER',
        subject: 'Matemática',
      });

      expect(prisma.teacherProfile.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ create: { userId: 'user-1', subject: 'Matemática' } }),
      );
      expect(prisma.workspaceMember.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: { workspaceId: 'workspace-1', userId: 'user-1', roleId: 'role-professor', status: 'INVITED' },
        }),
      );
    });
  });

  describe('revokeInvite', () => {
    it('lança NotFoundException quando o convite não está mais pendente', async () => {
      const prisma = { workspaceMember: { findFirst: vi.fn().mockResolvedValue(null), delete: vi.fn() } };
      const service = new WorkspacesService(prisma as never);

      await expect(service.revokeInvite('workspace-1', 'member-1')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.workspaceMember.delete).not.toHaveBeenCalled();
    });
  });

  describe('transferClassMember', () => {
    it('recusa transferir para a mesma turma', async () => {
      const service = new WorkspacesService({} as never);
      await expect(
        service.transferClassMember('workspace-1', { studentId: 's1', fromClassId: 'c1', toClassId: 'c1' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('recusa quando uma das turmas não pertence a esta instituição (evita IDOR)', async () => {
      const prisma = {
        class: {
          findFirst: vi
            .fn()
            .mockResolvedValueOnce({ id: 'c1', workspaceId: 'workspace-1' })
            .mockResolvedValueOnce(null),
        },
      };
      const service = new WorkspacesService(prisma as never);

      await expect(
        service.transferClassMember('workspace-1', { studentId: 's1', fromClassId: 'c1', toClassId: 'c2' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('recusa quando o aluno não é membro da turma de origem', async () => {
      const prisma = {
        class: {
          findFirst: vi
            .fn()
            .mockResolvedValueOnce({ id: 'c1', workspaceId: 'workspace-1' })
            .mockResolvedValueOnce({ id: 'c2', workspaceId: 'workspace-1' }),
        },
        classMember: { findUnique: vi.fn().mockResolvedValue(null) },
      };
      const service = new WorkspacesService(prisma as never);

      await expect(
        service.transferClassMember('workspace-1', { studentId: 's1', fromClassId: 'c1', toClassId: 'c2' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('recusa quando a turma de destino já está lotada', async () => {
      const prisma = {
        class: {
          findFirst: vi
            .fn()
            .mockResolvedValueOnce({ id: 'c1', workspaceId: 'workspace-1' })
            .mockResolvedValueOnce({ id: 'c2', workspaceId: 'workspace-1', maxStudents: 1 }),
        },
        classMember: {
          findUnique: vi.fn().mockResolvedValue({ id: 'membership-1' }),
          count: vi.fn().mockResolvedValue(1),
        },
      };
      const service = new WorkspacesService(prisma as never);

      await expect(
        service.transferClassMember('workspace-1', { studentId: 's1', fromClassId: 'c1', toClassId: 'c2' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('move o aluno para a turma de destino dentro de uma transação', async () => {
      const tx = { classMember: { delete: vi.fn().mockResolvedValue({}), create: vi.fn().mockResolvedValue({ id: 'new-membership' }) } };
      const prisma = {
        class: {
          findFirst: vi
            .fn()
            .mockResolvedValueOnce({ id: 'c1', workspaceId: 'workspace-1' })
            .mockResolvedValueOnce({ id: 'c2', workspaceId: 'workspace-1', maxStudents: null }),
        },
        classMember: { findUnique: vi.fn().mockResolvedValue({ id: 'membership-1' }) },
        $transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(tx)),
      };
      const service = new WorkspacesService(prisma as never);

      const result = await service.transferClassMember('workspace-1', {
        studentId: 's1',
        fromClassId: 'c1',
        toClassId: 'c2',
      });

      expect(tx.classMember.delete).toHaveBeenCalledWith({ where: { id: 'membership-1' } });
      expect(tx.classMember.create).toHaveBeenCalledWith({ data: { classId: 'c2', userId: 's1' } });
      expect(result).toEqual({ id: 'new-membership' });
    });
  });
});
