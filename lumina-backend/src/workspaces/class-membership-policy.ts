import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/** Workspaces legados de professores independentes usam uma instituição técnica. */
export async function assertInstitutionClassMember(tx: Prisma.TransactionClient, workspaceId: string, creatorId: string | null, userId: string) {
  const workspace = await tx.workspace.findUnique({ where: { id: workspaceId }, select: { type: true, institution: { select: { email: true, status: true } } } });
  if (!workspace) throw new NotFoundException('Instituição da turma não encontrada.');
  if (workspace.type !== 'INSTITUTION' || workspace.institution?.email === `turmas+${creatorId}@lumina.internal`) return;
  if (workspace.institution?.status !== 'ACTIVE') throw new ForbiddenException('A instituição não está ativa.');
  const membership = await tx.workspaceMember.findFirst({ where: { workspaceId, userId, status: 'ACTIVE' }, select: { id: true } });
  if (!membership) throw new ForbiddenException('É necessário aceitar um convite e possuir vínculo ativo nesta instituição.');
}
