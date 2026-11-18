import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import {
  canChangeRole,
  canManageGroup,
  canModerate,
  canRemoveMember,
  displayName,
  generateJoinCode,
  GROUP_LIMITS,
  GroupRole,
  isMinor,
  normalizeJoinCode,
  readGroupInvite,
  signGroupInvite,
  studyStats,
  verifyGroupInvite,
  visibleStats,
} from './group-rules';
import { GroupRoomsService } from './group-rooms.service';
import { ChangeMemberRoleDto, CreateGroupDto, UpdateGroupDto, UpdateSharingDto } from './groups.dto';

/** Janela de logs lida para hoje/semana/sequência. O total vem de uma soma. */
const RECENT_LOG_DAYS = 60;

const NOT_FOUND = 'Grupo não encontrado.';

type Membership = { id: string; groupId: string; userId: string; role: GroupRole; status: 'ACTIVE' | 'PENDING' };
type GroupRow = { id: string; name: string; joinCode: string; requiresApproval: boolean; maxMembers: number; ownerId: string; archivedAt: Date | null };

@Injectable()
export class GroupsService {
  constructor(
    private readonly prisma: PrismaService,
    // Opcional só para os testes do MVP, que montam o serviço sem as salas.
    @Optional() private readonly rooms?: GroupRoomsService,
  ) {}

  // ------------------------------------------------------------ leitura

  /** Grupos do aluno: os que participa e os pedidos de entrada pendentes. */
  async listMine(userId: string) {
    const rows = await this.prisma.studyGroupMember.findMany({
      where: { userId },
      orderBy: { joinedAt: 'desc' },
      select: {
        role: true,
        status: true,
        group: {
          select: {
            id: true, name: true, purpose: true, imageUrl: true, archivedAt: true, maxMembers: true,
            _count: { select: { members: { where: { status: 'ACTIVE' } } } },
          },
        },
      },
    });
    return rows.map((r) => ({
      id: r.group.id,
      name: r.group.name,
      purpose: r.group.purpose,
      imageUrl: r.group.imageUrl,
      archived: r.group.archivedAt !== null,
      memberCount: r.group._count.members,
      maxMembers: r.group.maxMembers,
      myRole: r.role,
      myStatus: r.status,
    }));
  }

  /** Detalhe do grupo para um membro ativo, com o perfil de estudo de cada colega filtrado pela privacidade dele. */
  async detail(userId: string, groupId: string, now = new Date()) {
    const me = await this.activeMembership(userId, groupId);
    const group = await this.prisma.studyGroup.findUniqueOrThrow({
      where: { id: groupId },
      select: {
        id: true, name: true, description: true, purpose: true, imageUrl: true, rules: true, joinCode: true,
        requiresApproval: true, maxMembers: true, archivedAt: true, createdAt: true,
        members: {
          orderBy: { joinedAt: 'asc' },
          select: {
            userId: true, role: true, status: true, joinedAt: true,
            shareStudyTime: true, shareSubjects: true, shareStreak: true, shareLastActivity: true, rankingOptIn: true,
            user: { select: { email: true, profile: { select: { firstName: true, lastName: true, avatarUrl: true, birthDate: true } } } },
          },
        },
      },
    });
    const active = group.members.filter((m) => m.status === 'ACTIVE');
    const pending = group.members.filter((m) => m.status === 'PENDING');

    // Só lê o tempo de quem compartilha algo (ou do próprio aluno).
    const readable = active.filter((m) => m.userId === userId || m.shareStudyTime || m.shareSubjects || m.shareStreak || m.shareLastActivity).map((m) => m.userId);
    const since = new Date(now.getTime() - RECENT_LOG_DAYS * 24 * 60 * 60 * 1000);
    const [recent, totals] = readable.length
      ? await Promise.all([
          this.prisma.studyTimeLog.findMany({
            where: { userId: { in: readable }, endTime: { gte: since } },
            select: { userId: true, endTime: true, durationMinutes: true, subject: { select: { name: true } } },
          }),
          this.prisma.studyTimeLog.groupBy({ by: ['userId'], where: { userId: { in: readable } }, _sum: { durationMinutes: true } }),
        ])
      : [[], []];
    const totalBy = new Map(totals.map((t) => [t.userId, t._sum.durationMinutes ?? 0]));

    const myRole = me.role;
    const myRow = active.find((m) => m.userId === userId)!;
    return {
      id: group.id,
      name: group.name,
      description: group.description,
      purpose: group.purpose,
      imageUrl: group.imageUrl,
      rules: group.rules,
      archived: group.archivedAt !== null,
      requiresApproval: group.requiresApproval,
      maxMembers: group.maxMembers,
      createdAt: group.createdAt,
      // Todo membro ativo pode convidar; com aprovação ligada, a entrada fica pendente.
      joinCode: group.archivedAt ? null : group.joinCode,
      myRole,
      canManage: canManageGroup(myRole),
      canModerate: canModerate(myRole),
      mySharing: {
        shareStudyTime: myRow.shareStudyTime,
        shareSubjects: myRow.shareSubjects,
        shareStreak: myRow.shareStreak,
        shareLastActivity: myRow.shareLastActivity,
      },
      // Menor de idade: o aviso é só para o próprio aluno, não para os colegas.
      iAmMinor: isMinor(myRow.user.profile?.birthDate, now),
      members: active.map((m) => {
        const isSelf = m.userId === userId;
        const logs = readable.includes(m.userId)
          ? recent.filter((l) => l.userId === m.userId).map((l) => ({ endTime: l.endTime, durationMinutes: l.durationMinutes, subjectName: l.subject?.name ?? null }))
          : [];
        const stats = { ...studyStats(logs, now), totalMinutes: totalBy.get(m.userId) ?? 0 };
        return {
          userId: m.userId,
          name: displayName(m.user),
          avatarUrl: m.user.profile?.avatarUrl ?? null,
          role: m.role,
          joinedAt: m.joinedAt,
          isMe: isSelf,
          stats: visibleStats(stats, m, isSelf),
        };
      }),
      pendingRequests: canModerate(myRole)
        ? pending.map((m) => ({ userId: m.userId, name: displayName(m.user), avatarUrl: m.user.profile?.avatarUrl ?? null, requestedAt: m.joinedAt }))
        : [],
    };
  }

  // ------------------------------------------------------------ criação e gestão

  async create(userId: string, dto: CreateGroupDto) {
    await this.assertCanJoinAnother(userId);
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const createdToday = await this.prisma.studyGroup.count({ where: { ownerId: userId, createdAt: { gte: since } } });
    if (createdToday >= GROUP_LIMITS.maxCreatedPerDay) {
      throw new BadRequestException(`Você já criou ${GROUP_LIMITS.maxCreatedPerDay} grupos nas últimas 24 horas. Tente de novo amanhã.`);
    }
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const group = await this.prisma.studyGroup.create({
          data: {
            name: dto.name,
            description: dto.description ?? null,
            purpose: dto.purpose ?? null,
            imageUrl: dto.imageUrl ?? null,
            rules: dto.rules ?? null,
            requiresApproval: dto.requiresApproval ?? false,
            maxMembers: dto.maxMembers ?? GROUP_LIMITS.defaultMaxMembers,
            joinCode: generateJoinCode(),
            ownerId: userId,
            members: { create: { userId, role: 'OWNER', status: 'ACTIVE' } },
          },
          select: { id: true },
        });
        return this.detail(userId, group.id);
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') continue;
        throw error;
      }
    }
    throw new ConflictException('Não foi possível gerar um código para o grupo. Tente de novo.');
  }

  async update(userId: string, groupId: string, dto: UpdateGroupDto) {
    const { group, me } = await this.editable(userId, groupId);
    if (!canManageGroup(me.role)) throw new ForbiddenException('Só o dono e os administradores editam o grupo.');
    if (dto.maxMembers !== undefined) {
      const count = await this.activeCount(groupId);
      if (dto.maxMembers < count) throw new BadRequestException(`O grupo já tem ${count} membros; o limite não pode ser menor.`);
    }
    await this.prisma.studyGroup.update({
      where: { id: group.id },
      data: {
        name: dto.name,
        description: dto.description,
        purpose: dto.purpose,
        imageUrl: dto.imageUrl,
        rules: dto.rules,
        requiresApproval: dto.requiresApproval,
        maxMembers: dto.maxMembers,
      },
    });
    return this.detail(userId, groupId);
  }

  /** Troca o código; os links de convite gerados antes deixam de valer. */
  async regenerateCode(userId: string, groupId: string) {
    const { me } = await this.editable(userId, groupId);
    if (!canManageGroup(me.role)) throw new ForbiddenException('Só o dono e os administradores trocam o código.');
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const row = await this.prisma.studyGroup.update({ where: { id: groupId }, data: { joinCode: generateJoinCode() }, select: { joinCode: true } });
        return { joinCode: row.joinCode };
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') continue;
        throw error;
      }
    }
    throw new ConflictException('Não foi possível gerar um código novo. Tente de novo.');
  }

  /** Link de convite assinado, sem tabela (como o da turma). Qualquer membro ativo pode convidar. */
  async inviteLink(userId: string, groupId: string) {
    const { group } = await this.editable(userId, groupId);
    const { token, expiresAt } = signGroupInvite(group.id, group.joinCode, this.secret());
    return { token, expiresAt: expiresAt.toISOString() };
  }

  // ------------------------------------------------------------ entrada

  /** Prévia do grupo antes de entrar (nome, propósito, tamanho), pelo código ou pelo link. */
  async preview(input: { code?: string; token?: string }) {
    const group = await this.groupFromInvite(input);
    const count = await this.activeCount(group.id);
    const full = await this.prisma.studyGroup.findUniqueOrThrow({ where: { id: group.id }, select: { name: true, purpose: true, description: true, imageUrl: true } });
    return { ...full, id: group.id, memberCount: count, maxMembers: group.maxMembers, requiresApproval: group.requiresApproval, full: count >= group.maxMembers };
  }

  async join(userId: string, input: { code?: string; token?: string }) {
    const group = await this.groupFromInvite(input);
    const existing = await this.prisma.studyGroupMember.findUnique({ where: { groupId_userId: { groupId: group.id, userId } }, select: { status: true } });
    if (existing) return { groupId: group.id, status: existing.status, alreadyMember: true };
    await this.assertCanJoinAnother(userId);
    if ((await this.activeCount(group.id)) >= group.maxMembers) throw new BadRequestException('O grupo está cheio.');
    const status = group.requiresApproval ? 'PENDING' : 'ACTIVE';
    try {
      await this.prisma.studyGroupMember.create({ data: { groupId: group.id, userId, role: 'MEMBER', status } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return { groupId: group.id, status, alreadyMember: true };
      throw error;
    }
    return { groupId: group.id, status, alreadyMember: false };
  }

  async approve(userId: string, groupId: string, targetUserId: string) {
    const { group, me } = await this.editable(userId, groupId);
    if (!canModerate(me.role)) throw new ForbiddenException('Só moderadores, administradores e o dono aprovam pedidos.');
    const target = await this.membership(targetUserId, groupId);
    if (!target || target.status !== 'PENDING') throw new NotFoundException('Pedido de entrada não encontrado.');
    if ((await this.activeCount(groupId)) >= group.maxMembers) throw new BadRequestException('O grupo está cheio. Aumente o limite ou remova alguém antes de aprovar.');
    await this.prisma.studyGroupMember.update({ where: { id: target.id }, data: { status: 'ACTIVE', joinedAt: new Date() } });
    return { userId: targetUserId, status: 'ACTIVE' as const };
  }

  async reject(userId: string, groupId: string, targetUserId: string) {
    const { me } = await this.editable(userId, groupId);
    if (!canModerate(me.role)) throw new ForbiddenException('Só moderadores, administradores e o dono recusam pedidos.');
    const target = await this.membership(targetUserId, groupId);
    if (!target || target.status !== 'PENDING') throw new NotFoundException('Pedido de entrada não encontrado.');
    await this.rooms?.endForMember(groupId, targetUserId);
    await this.prisma.studyGroupMember.delete({ where: { id: target.id } });
    return { userId: targetUserId, removed: true };
  }

  // ------------------------------------------------------------ membros

  async changeRole(userId: string, groupId: string, targetUserId: string, dto: ChangeMemberRoleDto) {
    const { me } = await this.editable(userId, groupId);
    const target = await this.membership(targetUserId, groupId);
    if (!target || target.status !== 'ACTIVE') throw new NotFoundException('Membro não encontrado.');
    if (!canChangeRole(me.role, target.role, dto.role)) throw new ForbiddenException('Seu papel não permite essa mudança.');
    await this.prisma.studyGroupMember.update({ where: { id: target.id }, data: { role: dto.role } });
    return { userId: targetUserId, role: dto.role };
  }

  async removeMember(userId: string, groupId: string, targetUserId: string) {
    if (targetUserId === userId) throw new BadRequestException('Para sair do grupo, use "sair".');
    const { me } = await this.editable(userId, groupId);
    const target = await this.membership(targetUserId, groupId);
    if (!target || target.status !== 'ACTIVE') throw new NotFoundException('Membro não encontrado.');
    if (!canRemoveMember(me.role, target.role)) throw new ForbiddenException('Seu papel não permite remover este membro.');
    await this.prisma.studyGroupMember.delete({ where: { id: target.id } });
    return { userId: targetUserId, removed: true };
  }

  /** Sair do grupo (ou cancelar o pedido pendente). O tempo de estudo pessoal continua do aluno. */
  async leave(userId: string, groupId: string) {
    const me = await this.membership(userId, groupId);
    if (!me) throw new NotFoundException(NOT_FOUND);
    if (me.role === 'OWNER') throw new BadRequestException('O dono não pode sair: transfira a posse para outro membro ou arquive o grupo.');
    // Sair do grupo tira da sala; o tempo estudado continua do aluno.
    await this.rooms?.endForMember(groupId, userId);
    await this.prisma.studyGroupMember.delete({ where: { id: me.id } });
    return { left: true };
  }

  async transferOwnership(userId: string, groupId: string, targetUserId: string) {
    const { me } = await this.editable(userId, groupId);
    if (me.role !== 'OWNER') throw new ForbiddenException('Só o dono transfere a posse do grupo.');
    if (targetUserId === userId) throw new BadRequestException('Escolha outro membro.');
    const target = await this.membership(targetUserId, groupId);
    if (!target || target.status !== 'ACTIVE') throw new NotFoundException('Membro não encontrado.');
    await this.prisma.$transaction([
      this.prisma.studyGroupMember.update({ where: { id: target.id }, data: { role: 'OWNER' } }),
      this.prisma.studyGroupMember.update({ where: { id: me.id }, data: { role: 'ADMIN' } }),
      this.prisma.studyGroup.update({ where: { id: groupId }, data: { ownerId: targetUserId } }),
    ]);
    return { ownerId: targetUserId };
  }

  async updateSharing(userId: string, groupId: string, dto: UpdateSharingDto) {
    const me = await this.activeMembership(userId, groupId);
    const row = await this.prisma.studyGroupMember.update({
      where: { id: me.id },
      data: { shareStudyTime: dto.shareStudyTime, shareSubjects: dto.shareSubjects, shareStreak: dto.shareStreak, shareLastActivity: dto.shareLastActivity },
      select: { shareStudyTime: true, shareSubjects: true, shareStreak: true, shareLastActivity: true },
    });
    return row;
  }

  // ------------------------------------------------------------ arquivo e exclusão

  async setArchived(userId: string, groupId: string, archived: boolean) {
    const me = await this.activeMembership(userId, groupId);
    if (me.role !== 'OWNER') throw new ForbiddenException('Só o dono arquiva ou reativa o grupo.');
    if (archived) await this.rooms?.closeAllInGroup(groupId);
    await this.prisma.studyGroup.update({ where: { id: groupId }, data: { archivedAt: archived ? new Date() : null } });
    return { archived };
  }

  /** Exclusão definitiva: só o dono, e só depois de arquivar. */
  async remove(userId: string, groupId: string) {
    const me = await this.activeMembership(userId, groupId);
    if (me.role !== 'OWNER') throw new ForbiddenException('Só o dono exclui o grupo.');
    const group = await this.prisma.studyGroup.findUniqueOrThrow({ where: { id: groupId }, select: { archivedAt: true } });
    if (!group.archivedAt) throw new BadRequestException('Arquive o grupo antes de excluí-lo.');
    await this.prisma.studyGroup.delete({ where: { id: groupId } });
    return { deleted: true };
  }

  // ------------------------------------------------------------ auxiliares

  private secret(): string {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('JWT_SECRET não configurado.');
    return secret;
  }

  private membership(userId: string, groupId: string): Promise<Membership | null> {
    return this.prisma.studyGroupMember.findUnique({
      where: { groupId_userId: { groupId, userId } },
      select: { id: true, groupId: true, userId: true, role: true, status: true },
    }) as Promise<Membership | null>;
  }

  /** Membro ativo ou 404 (quem não é membro não descobre que o grupo existe). */
  private async activeMembership(userId: string, groupId: string): Promise<Membership> {
    const me = await this.membership(userId, groupId);
    if (!me || me.status !== 'ACTIVE') throw new NotFoundException(NOT_FOUND);
    return me;
  }

  /** Membro ativo de um grupo não arquivado (para qualquer mudança). */
  private async editable(userId: string, groupId: string): Promise<{ group: GroupRow; me: Membership }> {
    const me = await this.activeMembership(userId, groupId);
    const group = await this.prisma.studyGroup.findUniqueOrThrow({
      where: { id: groupId },
      select: { id: true, name: true, joinCode: true, requiresApproval: true, maxMembers: true, ownerId: true, archivedAt: true },
    });
    if (group.archivedAt) throw new BadRequestException('O grupo está arquivado. O dono pode reativá-lo.');
    return { group, me };
  }

  private activeCount(groupId: string): Promise<number> {
    return this.prisma.studyGroupMember.count({ where: { groupId, status: 'ACTIVE' } });
  }

  private async assertCanJoinAnother(userId: string) {
    const count = await this.prisma.studyGroupMember.count({ where: { userId, group: { archivedAt: null } } });
    if (count >= GROUP_LIMITS.maxGroupsPerUser) {
      throw new BadRequestException(`Você já participa de ${GROUP_LIMITS.maxGroupsPerUser} grupos. Saia de um para entrar em outro.`);
    }
  }

  private async groupFromInvite(input: { code?: string; token?: string }): Promise<GroupRow> {
    const select = { id: true, name: true, joinCode: true, requiresApproval: true, maxMembers: true, ownerId: true, archivedAt: true } as const;
    let group: GroupRow | null = null;
    if (input.token) {
      const invalid = new BadRequestException('Link de convite inválido ou expirado. Peça um novo a um membro do grupo.');
      const read = readGroupInvite(input.token);
      if (!read) throw invalid;
      group = await this.prisma.studyGroup.findUnique({ where: { id: read.groupId }, select });
      if (!group || verifyGroupInvite(input.token, group.joinCode, this.secret()) !== group.id) throw invalid;
    } else if (input.code) {
      group = await this.prisma.studyGroup.findUnique({ where: { joinCode: normalizeJoinCode(input.code) }, select });
      if (!group) throw new NotFoundException('Código de grupo não encontrado.');
    } else {
      throw new BadRequestException('Informe o código ou o link de convite.');
    }
    if (group.archivedAt) throw new BadRequestException('Este grupo está arquivado e não aceita novos membros.');
    return group;
  }
}
