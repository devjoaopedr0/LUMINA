import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { assertInstitutionClassMember } from './class-membership-policy';

describe('Vínculo institucional da turma', () => {
  function database(email = 'escola@example.com', member: object | null = null) {
    return {
      workspace: { findUnique: vi.fn().mockResolvedValue({ type: 'INSTITUTION', institution: { email, status: 'ACTIVE' } }) },
      workspaceMember: { findFirst: vi.fn().mockResolvedValue(member) },
    };
  }
  it('recusa aluno sem convite aceito ou com vínculo suspenso', async () => {
    const tx = database();
    await expect(assertInstitutionClassMember(tx as never, 'workspace', 'creator', 'student')).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.workspaceMember.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { workspaceId: 'workspace', userId: 'student', status: 'ACTIVE' } }));
  });
  it('permite vínculo ativo na instituição correta', async () => {
    await expect(assertInstitutionClassMember(database(undefined, { id: 'member' }) as never, 'workspace', 'creator', 'student')).resolves.toBeUndefined();
  });
  it('preserva ingresso na turma de professor independente', async () => {
    const tx = database('turmas+creator@lumina.internal');
    await expect(assertInstitutionClassMember(tx as never, 'workspace', 'creator', 'student')).resolves.toBeUndefined();
    expect(tx.workspaceMember.findFirst).not.toHaveBeenCalled();
  });
});
