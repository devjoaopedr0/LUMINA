import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { assertInstitutionClassMember } from '../workspaces/class-membership-policy';
import { PrismaService } from '../database/prisma.service';
import { QuestionAccessService } from '../questions/question-access.service';
import { TopicMasteryService } from '../questions/topic-mastery.service';
import { upsertSheetTemplate } from './omr/sheet-template';
import { CreateAcademicPeriodDto, SimulationAnswerDto, UpdateAcademicPeriodDto, UpdateClassDto, UpdateInstitutionMemberDto } from './simulations.dto';
import { assertFutureInstant } from '../common/date-rules';

/** Papéis com vínculo de instituição além de aluno — só eles podem pedir o
 *  cartão-resposta automático na criação do simulado (item pedido pelo
 *  usuário: "opcional e ligado somente às instituições"). */
const INSTITUTION_STAFF_ACCOUNT_TYPES = ['TEACHER', 'COORDINATOR', 'DIRECTOR'];

/** Corrigir um simulado longo mexe no domínio de dezenas de tópicos: precisa
 *  de mais que os 5 s padrão de uma transação. */
const SUBMIT_TX_OPTIONS = { maxWait: 10_000, timeout: 60_000 };

/** Validade do link de convite da turma. */
const CLASS_INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

/** Assinatura do link: turma + validade + código atual da turma (trocar o
 *  código invalida os links antigos). Sem tabela nova: o link se confere sozinho. */
function signClassInvite(classId: string, expiresAt: number, joinCode: string): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET não configurado.');
  return createHmac('sha256', secret).update(`class-invite:${classId}:${expiresAt}:${joinCode}`).digest('base64url');
}

@Injectable()
export class SimulationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: QuestionAccessService,
    private readonly topicMasteryService: TopicMasteryService,
  ) {}

  async classes(userId: string, includeArchived = false) {
    const rows = await this.prisma.class.findMany({
      where: { ...(includeArchived ? {} : { archived: false }), OR: [{ teachers: { some: { userId } } }, { members: { some: { userId } } }, { workspace: { members: { some: { userId, status: 'ACTIVE', role: { rolePermissions: { some: { permission: { code: 'CLASS_MANAGE' } } } } } } } }] },
      select: { id: true, name: true, archived: true, joinCode: true, teachers: { where: { userId }, select: { id: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(({ teachers, ...row }) => ({ ...row, isTeacher: teachers.length > 0, joinCode: teachers.length ? row.joinCode : null }));
  }

  async teacherDashboard(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { teacherProfile: { select: { subject: true } } } });
    if (!user?.teacherProfile) throw new ForbiddenException('Apenas professores podem acessar este painel.');
    const classes = await this.prisma.class.findMany({
      where: { archived: false, teachers: { some: { userId } } },
      select: {
        id: true, name: true, joinCode: true,
        members: { select: { joinedAt: true, user: { select: { id: true, email: true, profile: { select: { firstName: true, lastName: true } } } } } },
        simulations: { select: { id: true, title: true, items: { select: { position: true, subject: true, correctPosition: true } }, submissions: { select: { userId: true, correct: true, total: true, submittedAt: true, answers: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return buildTeacherDashboard(classes);
  }
  async coordinatorDashboard(userId: string) {
    const workspace = await this.coordinatorWorkspace(userId);
    const classes = await this.prisma.class.findMany({
      where: { workspaceId: workspace.id, archived: false },
      select: {
        id: true, name: true, joinCode: true,
        members: { select: { joinedAt: true, user: { select: { id: true, email: true, profile: { select: { firstName: true, lastName: true } } } } } },
        teachers: { select: { user: { select: { id: true, email: true, profile: { select: { firstName: true, lastName: true } }, teacherProfile: { select: { subject: true } } } } } },
        simulations: { select: { id: true, title: true, items: { select: { position: true, subject: true, correctPosition: true } }, submissions: { select: { userId: true, correct: true, total: true, submittedAt: true, answers: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
    const dashboard = buildTeacherDashboard(classes);
    return { workspaceId: workspace.id, ...buildCoordinatorDashboard(dashboard, classes) };
  }
  async directorDashboard(userId: string) {
    const workspace = await this.directorWorkspace(userId);
    const [classes, members] = await Promise.all([
      this.prisma.class.findMany({
        where: { workspaceId: workspace.id, archived: false },
        select: {
          id: true, name: true, joinCode: true,
          members: { select: { joinedAt: true, user: { select: { id: true, email: true, profile: { select: { firstName: true, lastName: true } } } } } },
          teachers: { select: { user: { select: { id: true, email: true, profile: { select: { firstName: true, lastName: true } }, teacherProfile: { select: { subject: true } } } } } },
          simulations: { select: { id: true, title: true, items: { select: { position: true, subject: true, correctPosition: true } }, submissions: { select: { userId: true, correct: true, total: true, submittedAt: true, answers: true } } } },
        }, orderBy: { createdAt: 'desc' },
      }),
      this.prisma.workspaceMember.findMany({
        where: { workspaceId: workspace.id }, orderBy: { joinedAt: 'asc' },
        select: { id: true, status: true, joinedAt: true, role: { select: { name: true } }, user: { select: { id: true, email: true, accountType: true, profile: { select: { firstName: true, lastName: true } }, teacherProfile: { select: { subject: true } } } } },
      }),
    ]);
    const coordinator = buildCoordinatorDashboard(buildTeacherDashboard(classes), classes);
    return { workspaceId: workspace.id, ...buildDirectorDashboard(coordinator, classes, members, workspace.name) };
  }

  async updateDirectorMember(userId: string, memberId: string, dto: UpdateInstitutionMemberDto) {
    const workspace = await this.directorWorkspace(userId);
    const member = await this.prisma.workspaceMember.findFirst({ where: { id: memberId, workspaceId: workspace.id }, select: { id: true, userId: true } });
    if (!member) throw new NotFoundException('Usuário não encontrado nesta instituição.');
    if (member.userId === userId) throw new BadRequestException('O diretor não pode alterar o próprio vínculo por esta tela.');
    if (dto.accountType === 'TEACHER' && !dto.subject?.trim()) throw new BadRequestException('Informe a disciplina do professor.');
    await this.prisma.$transaction(async (tx) => {
      if (dto.status) await tx.workspaceMember.update({ where: { id: memberId }, data: { status: dto.status } });
      if (dto.accountType) {
        await tx.user.update({ where: { id: member.userId }, data: { accountType: dto.accountType } });
        if (dto.accountType === 'TEACHER') await tx.teacherProfile.upsert({ where: { userId: member.userId }, update: { subject: dto.subject!.trim() }, create: { userId: member.userId, subject: dto.subject!.trim() } });
        else await tx.teacherProfile.deleteMany({ where: { userId: member.userId } });
      }
    });
    return { updated: true };
  }

  private async directorWorkspace(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { accountType: true } });
    if (user?.accountType !== 'DIRECTOR') throw new ForbiddenException('Apenas diretores podem acessar este painel.');
    const membership = await this.prisma.workspaceMember.findFirst({ where: { userId, status: 'ACTIVE', workspace: { type: 'INSTITUTION' } }, select: { workspace: { select: { id: true, name: true } } }, orderBy: { joinedAt: 'asc' } });
    if (!membership) throw new ForbiddenException('O diretor precisa estar vinculado a uma instituição ativa.');
    return membership.workspace;
  }

  async coordinatorPeriods(userId: string) {
    const workspace = await this.coordinatorWorkspace(userId);
    return this.prisma.academicPeriod.findMany({ where: { workspaceId: workspace.id }, orderBy: { startsAt: 'desc' } });
  }

  async createCoordinatorPeriod(userId: string, dto: CreateAcademicPeriodDto) {
    const workspace = await this.coordinatorWorkspace(userId);
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    if (startsAt > endsAt) throw new BadRequestException('A data inicial deve ser anterior à data final.');
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.academicPeriod.updateMany({ where: { workspaceId: workspace.id, active: true }, data: { active: false } });
        return tx.academicPeriod.create({ data: { id: randomUUID(), workspaceId: workspace.id, name: dto.name.trim(), startsAt, endsAt, active: true } });
      });
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') throw new ConflictException('Já existe um período com este nome.');
      throw error;
    }
  }

  async updateCoordinatorPeriod(userId: string, periodId: string, dto: UpdateAcademicPeriodDto) {
    const workspace = await this.coordinatorWorkspace(userId);
    const period = await this.prisma.academicPeriod.findFirst({ where: { id: periodId, workspaceId: workspace.id } });
    if (!period) throw new NotFoundException('Período letivo não encontrado.');
    if (dto.active === undefined) return period;
    return this.prisma.$transaction(async (tx) => {
      if (dto.active) await tx.academicPeriod.updateMany({ where: { workspaceId: workspace.id, active: true }, data: { active: false } });
      return tx.academicPeriod.update({ where: { id: periodId }, data: { active: dto.active } });
    });
  }

  private async coordinatorWorkspace(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { accountType: true } });
    if (user?.accountType !== 'COORDINATOR') throw new ForbiddenException('Apenas coordenadores podem acessar este painel.');
    const membership = await this.prisma.workspaceMember.findFirst({ where: { userId, status: 'ACTIVE', workspace: { type: 'INSTITUTION' } }, select: { workspace: { select: { id: true, name: true } } }, orderBy: { joinedAt: 'asc' } });
    if (!membership) throw new ForbiddenException('O coordenador precisa estar vinculado a uma instituição ativa.');
    return membership.workspace;
  }

  async createClass(userId: string, name: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, include: { teacherProfile: true } });
    if (!user?.teacherProfile) throw new ForbiddenException('Apenas professores podem criar turmas.');

    // Professor vinculado a uma instituição de verdade (convite aceito via
    // POST /institutions/invites/accept): a turma nasce dentro do workspace
    // dessa instituição, para que coordenação/direção enxerguem e
    // gerenciem essa turma (transferência de aluno, relatórios etc.).
    // Sem isso, toda turma criada aqui ficava presa num pseudo-workspace
    // "Turmas de <e-mail>" por professor, inacessível para qualquer
    // coordenador/diretor — um professor institucional nunca aparecia na
    // gestão da própria instituição. Reproduzido e corrigido nesta sessão.
    const institutionMembership = await this.prisma.workspaceMember.findFirst({
      where: { userId, status: 'ACTIVE', workspace: { type: 'INSTITUTION' } },
      select: { workspace: { select: { id: true } } },
      orderBy: { joinedAt: 'asc' },
    });

    const classRoom = await this.prisma.$transaction(async (tx) => {
      let workspaceId = institutionMembership?.workspace.id;
      if (!workspaceId) {
        // Professor sem instituição (autônomo/independente): mantém o
        // pseudo-workspace pessoal de turmas, um por professor.
        const email = `turmas+${userId}@lumina.internal`;
        let institution = await tx.institution.findUnique({ where: { email }, include: { workspace: true } });
        if (!institution) institution = await tx.institution.create({
          data: { name: `Turmas de ${user.email}`, email, status: 'ACTIVE', workspace: { create: { name: `Turmas de ${user.email}`, type: 'INSTITUTION' } } },
          include: { workspace: true },
        });
        workspaceId = institution.workspace!.id;
      }
      return tx.class.create({
        data: { id: randomUUID(), workspaceId, name: name.trim(), joinCode: randomBytes(6).toString('hex').toUpperCase(), createdBy: userId, coordinatorId: userId, teachers: { create: { userId } } },
      });
    });
    return { id: classRoom.id, name: classRoom.name, joinCode: classRoom.joinCode, isTeacher: true };
  }

  async joinClass(userId: string, code: string) {
    const row = await this.prisma.class.findUnique({ where: { joinCode: code.trim().toUpperCase() } });
    if (!row || row.archived) throw new NotFoundException('Código de turma inválido.');
    await this.enrollClassMember(row.id, userId);
    return { id: row.id, name: row.name, isTeacher: false };
  }

  /** Autorização para VER a turma (detalhe/histórico): qualquer membro,
   * professor, o coordenador designado, quem criou, ou quem tem
   * CLASS_MANAGE/MEMBER_MANAGE/REPORT_VIEW no workspace. */
  private async assertCanViewClass(userId: string, classId: string) {
    const classRoom = await this.prisma.class.findUnique({
      where: { id: classId },
      include: { teachers: { where: { userId } }, members: { where: { userId } } },
    });
    if (!classRoom) throw new NotFoundException('Turma não encontrada.');
    await assertInstitutionClassMember(this.prisma, classRoom.workspaceId, classRoom.createdBy, userId);
    if (classRoom.createdBy === userId || classRoom.coordinatorId === userId || classRoom.teachers.length || classRoom.members.length) return classRoom;
    const granted = await this.hasAnyWorkspacePermission(userId, classRoom.workspaceId, ['CLASS_MANAGE', 'MEMBER_MANAGE', 'REPORT_VIEW']);
    if (granted) return classRoom;
    throw new ForbiddenException('Você não possui acesso a esta turma.');
  }

  /** Autorização para GERENCIAR a turma (editar, arquivar, vincular
   * professor/aluno) — mais estrita que assertCanViewClass (que também deixa
   * qualquer membro simplesmente ver). Não filtra turma arquivada de
   * propósito: desarquivar é uma dessas ações. */
  private async assertCanManageClass(userId: string, classId: string) {
    const classRoom = await this.prisma.class.findUnique({
      where: { id: classId },
      include: { teachers: { where: { userId } } },
    });
    if (!classRoom) throw new NotFoundException('Turma não encontrada.');
    await assertInstitutionClassMember(this.prisma, classRoom.workspaceId, classRoom.createdBy, userId);
    if (classRoom.createdBy === userId || classRoom.coordinatorId === userId || classRoom.teachers.length) return classRoom;
    if (await this.hasAnyWorkspacePermission(userId, classRoom.workspaceId, ['CLASS_MANAGE'])) return classRoom;
    throw new ForbiddenException('Você não tem permissão para gerenciar esta turma.');
  }

  private async hasAnyWorkspacePermission(userId: string, workspaceId: string, codes: string[]) {
    const membership = await this.prisma.workspaceMember.findFirst({
      where: { userId, workspaceId, status: 'ACTIVE' },
      include: { role: { include: { rolePermissions: { include: { permission: true } } } } },
    });
    return Boolean(membership?.role.rolePermissions.some((rp) => codes.includes(rp.permission.code)));
  }

  async updateClass(userId: string, classId: string, dto: UpdateClassDto) {
    const classRoom = await this.assertCanManageClass(userId, classId);
    if (dto.name !== undefined && !dto.name?.trim()) throw new BadRequestException('Informe o nome da turma.');
    if (dto.subjectId) {
      const subject = await this.prisma.subject.findUnique({ where: { id: dto.subjectId } });
      if (!subject) throw new NotFoundException('Disciplina não encontrada.');
    }
    if (dto.academicPeriodId) {
      const period = await this.prisma.academicPeriod.findFirst({ where: { id: dto.academicPeriodId, workspaceId: classRoom.workspaceId } });
      if (!period) throw new NotFoundException('Período letivo não encontrado nesta instituição.');
    }
    return this.prisma.$transaction(async (tx) => {
      if (dto.maxStudents != null) {
        await tx.class.update({ where: { id: classId }, data: { updatedAt: new Date() } });
        if (await tx.classMember.count({ where: { classId } }) > dto.maxStudents) throw new BadRequestException('O limite não pode ser menor que o número de alunos matriculados.');
      }
      return tx.class.update({
      where: { id: classId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined ? { description: dto.description?.trim() || null } : {}),
        ...(dto.maxStudents !== undefined ? { maxStudents: dto.maxStudents } : {}),
        ...(dto.subjectId !== undefined ? { subjectId: dto.subjectId } : {}),
        ...(dto.academicPeriodId !== undefined ? { academicPeriodId: dto.academicPeriodId } : {}),
        ...(dto.gradeYear !== undefined ? { gradeYear: dto.gradeYear } : {}),
      },
      });
    });
  }

  async setClassArchived(userId: string, classId: string, archived: boolean) {
    await this.assertCanManageClass(userId, classId);
    return this.prisma.class.update({ where: { id: classId }, data: { archived } });
  }

  /** Vincula um professor já cadastrado (com perfil de professor) à turma —
   * mesma exigência de createClass, só que aqui pra ADICIONAR um segundo
   * professor a uma turma já existente. */
  async addClassTeacher(userId: string, classId: string, email: string) {
    const classRoom = await this.assertCanManageClass(userId, classId);
    if (classRoom.archived) throw new BadRequestException('Desarquive a turma antes de adicionar vínculos.');
    const teacher = await this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
      include: { teacherProfile: true },
    });
    if (!teacher) throw new NotFoundException('Não existe conta com este e-mail.');
    if (!teacher.teacherProfile) {
      throw new BadRequestException('Esta conta ainda não tem perfil de professor.');
    }
    await assertInstitutionClassMember(this.prisma, classRoom.workspaceId, classRoom.createdBy, teacher.id);
    await this.prisma.classTeacher.upsert({
      where: { classId_userId: { classId, userId: teacher.id } },
      update: {},
      create: { classId, userId: teacher.id },
    });
    return { linked: true };
  }

  async removeClassTeacher(userId: string, classId: string, teacherUserId: string) {
    const classRoom = await this.assertCanManageClass(userId, classId);
    if (classRoom.createdBy === teacherUserId) {
      throw new BadRequestException('Não é possível remover quem criou a turma — arquive a turma se necessário.');
    }
    await this.prisma.classTeacher.deleteMany({ where: { classId, userId: teacherUserId } });
    return { removed: true };
  }

  /** Vincula um aluno já cadastrado diretamente à turma — alternativa ao
   * código de ingresso, pra quando é o professor/coordenação que já sabe
   * quem quer matricular (não exige vínculo institucional prévio do aluno,
   * igual joinClass já não exige). */
  async addClassMember(userId: string, classId: string, email: string) {
    const classRoom = await this.assertCanManageClass(userId, classId);
    if (classRoom.archived) throw new BadRequestException('Desarquive a turma antes de adicionar vínculos.');
    const student = await this.prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (!student) throw new NotFoundException('Não existe conta com este e-mail.');
    await this.enrollClassMember(classId, student.id);
    return { linked: true };
  }

  private async enrollClassMember(classId: string, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      // Serializa matrículas da mesma turma para que duas requisições não ocupem a última vaga.
      const row = await tx.class.update({ where: { id: classId }, data: { updatedAt: new Date() } });
      if (row.archived) throw new BadRequestException('Desarquive a turma antes de adicionar vínculos.');
      await assertInstitutionClassMember(tx, row.workspaceId, row.createdBy, userId);
      const existing = await tx.classMember.findUnique({ where: { classId_userId: { classId, userId } } });
      if (existing) return existing;
      if (row.maxStudents !== null && await tx.classMember.count({ where: { classId } }) >= row.maxStudents) {
        throw new BadRequestException('A turma já atingiu o número máximo de alunos.');
      }
      return tx.classMember.upsert({ where: { classId_userId: { classId, userId } }, update: {}, create: { classId, userId } });
    });
  }

  async removeClassMember(userId: string, classId: string, studentUserId: string) {
    await this.assertCanManageClass(userId, classId);
    await this.prisma.classMember.deleteMany({ where: { classId, userId: studentUserId } });
    return { removed: true };
  }

  /** Detalhe + histórico da turma: composição (disciplina, período, ano,
   * professores, alunos) e a linha do tempo de atividades/simulados criados
   * nela, com contagem de entregas — a base de "histórico da turma". */
  /** Link de convite da turma (só quem gerencia). É o único jeito de um aluno
   *  independente entrar numa turma: o código digitado é recusado para ele. */
  async classInviteLink(userId: string, classId: string) {
    const access = await this.assertCanViewClass(userId, classId);
    const canManage = access.createdBy === userId || access.coordinatorId === userId || access.teachers.length > 0 || await this.hasAnyWorkspacePermission(userId, access.workspaceId, ['CLASS_MANAGE']);
    if (!canManage) throw new ForbiddenException('Só quem gerencia a turma gera o link de convite.');
    const row = await this.prisma.class.findUniqueOrThrow({ where: { id: classId }, select: { joinCode: true, archived: true } });
    if (row.archived) throw new BadRequestException('Desarquive a turma antes de convidar alunos.');
    const expiresAt = Date.now() + CLASS_INVITE_TTL_MS;
    const payload = Buffer.from(`${classId}.${expiresAt}`).toString('base64url');
    return { token: `${payload}.${signClassInvite(classId, expiresAt, row.joinCode)}`, expiresAt: new Date(expiresAt).toISOString() };
  }

  async acceptClassInvite(userId: string, token: string) {
    const invalid = new BadRequestException('Link de convite inválido ou expirado. Peça um novo ao professor.');
    const [payload, signature] = token.split('.');
    if (!payload || !signature) throw invalid;
    const [classId, expiresRaw] = Buffer.from(payload, 'base64url').toString().split('.');
    const expiresAt = Number(expiresRaw);
    if (!classId || !Number.isFinite(expiresAt) || expiresAt < Date.now()) throw invalid;
    const row = await this.prisma.class.findUnique({ where: { id: classId }, select: { id: true, name: true, joinCode: true, archived: true } });
    if (!row || row.archived) throw invalid;
    const expected = Buffer.from(signClassInvite(classId, expiresAt, row.joinCode));
    const given = Buffer.from(signature);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) throw invalid;
    await this.enrollClassMember(row.id, userId);
    return { id: row.id, name: row.name, isTeacher: false };
  }

  async classDetail(userId: string, classId: string) {
    const access = await this.assertCanViewClass(userId, classId);
    const canManage = access.createdBy === userId || access.coordinatorId === userId || access.teachers.length > 0 || await this.hasAnyWorkspacePermission(userId, access.workspaceId, ['CLASS_MANAGE']);
    const classRoom = await this.prisma.class.findUniqueOrThrow({
      where: { id: classId },
      include: {
        subject: { select: { id: true, name: true } },
        academicPeriod: { select: { id: true, name: true, startsAt: true, endsAt: true, active: true } },
        coordinator: { select: { id: true, email: true, profile: { select: { firstName: true, lastName: true } } } },
        teachers: {
          select: { user: { select: { id: true, email: true, profile: { select: { firstName: true, lastName: true } }, teacherProfile: { select: { subject: true } } } } },
        },
        members: {
          orderBy: { joinedAt: 'asc' },
          select: { joinedAt: true, user: { select: { id: true, email: true, profile: { select: { firstName: true, lastName: true } } } } },
        },
        simulations: {
          orderBy: { createdAt: 'desc' },
          select: { id: true, title: true, assessmentType: true, dueAt: true, createdAt: true, _count: { select: { submissions: true, items: true } } },
        },
      },
    });

    return {
      id: classRoom.id,
      canManage,
      availablePeriods: canManage ? await this.prisma.academicPeriod.findMany({ where: { workspaceId: classRoom.workspaceId }, select: { id: true, name: true }, orderBy: { startsAt: 'desc' } }) : [],
      availableSubjects: canManage ? await this.prisma.subject.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }) : [],
      name: classRoom.name,
      description: classRoom.description,
      joinCode: canManage ? classRoom.joinCode : null,
      maxStudents: classRoom.maxStudents,
      archived: classRoom.archived,
      gradeYear: classRoom.gradeYear,
      subject: classRoom.subject,
      academicPeriod: classRoom.academicPeriod,
      coordinator: classRoom.coordinator && {
        id: classRoom.coordinator.id,
        name: [classRoom.coordinator.profile?.firstName, classRoom.coordinator.profile?.lastName].filter(Boolean).join(' ') || classRoom.coordinator.email,
        email: classRoom.coordinator.email,
      },
      teachers: classRoom.teachers.map((t) => ({
        id: t.user.id,
        name: [t.user.profile?.firstName, t.user.profile?.lastName].filter(Boolean).join(' ') || t.user.email,
        email: t.user.email,
        subject: t.user.teacherProfile?.subject ?? null,
      })),
      members: classRoom.members.map((m) => ({
        id: m.user.id,
        name: [m.user.profile?.firstName, m.user.profile?.lastName].filter(Boolean).join(' ') || m.user.email,
        email: m.user.email,
        joinedAt: m.joinedAt,
      })),
      timeline: classRoom.simulations.map((s) => ({
        id: s.id,
        title: s.title,
        assessmentType: s.assessmentType,
        dueAt: s.dueAt,
        createdAt: s.createdAt,
        submissionCount: s._count.submissions,
        questionCount: s._count.items,
      })),
    };
  }

  async create(userId: string, title: string, questionIds: string[], classId?: string, assessmentType: 'ACTIVITY' | 'LIST' | 'TEST' | 'SIMULATION' = 'SIMULATION', dueAt?: string, durationMinutes?: number, isRealExam?: boolean, accountType?: string, generateAnswerSheet?: boolean) {
    if (new Set(questionIds).size !== questionIds.length) throw new BadRequestException('O simulado não pode repetir questões.');
    if (isRealExam && !durationMinutes) throw new BadRequestException('Modo prova real exige duração em minutos.');
    let workspaceId: string;
    if (classId) {
      const [teacher, user] = await Promise.all([
        this.prisma.classTeacher.findUnique({ where: { classId_userId: { classId, userId } }, include: { class: true } }),
        this.prisma.user.findUnique({ where: { id: userId }, include: { teacherProfile: true } }),
      ]);
      if (!teacher || teacher.class.archived || !user?.teacherProfile) throw new ForbiddenException('Você não leciona nesta turma.');
      workspaceId = teacher.class.workspaceId;
    } else {
      workspaceId = (await this.access.getPersonalWorkspaceOrThrow(userId)).id;
    }
    const questions = await this.prisma.question.findMany({ where: { id: { in: questionIds } }, include: { alternatives: { orderBy: { position: 'asc' } } } });
    if (questions.length !== questionIds.length) throw new BadRequestException('Uma ou mais questões não estão disponíveis.');
    for (const q of questions) {
      await this.access.assertCanUse(userId, q.workspaceId);
      if (q.alternatives.length < 2 || q.alternatives.length > 5 || q.alternatives.filter(a => a.isCorrect).length !== 1 || q.alternatives.some((a, i) => a.position !== i + 1)) {
        throw new BadRequestException('Uma questão tem alternativas incompatíveis com o cartão-resposta.');
      }
    }
    const byId = new Map(questions.map(q => [q.id, q]));
    const row = await this.prisma.simulation.create({ data: {
      id: randomUUID(), title: title.trim(), createdBy: userId, classId: classId ?? null, workspaceId, assessmentType, dueAt: dueAt ? assertFutureInstant(dueAt, 'O prazo da atividade') : null, durationMinutes, isRealExam: isRealExam ?? false,
      items: { create: questionIds.map((id, i) => {
        const q = byId.get(id)!;
        return { id: randomUUID(), questionId: id, position: i + 1, stem: q.stem, subject: q.subject, correctPosition: q.alternatives.find(a => a.isCorrect)!.position, alternatives: q.alternatives.map(a => ({ position: a.position, text: a.text })) };
      }) },
    }, include: { items: { orderBy: { position: 'asc' } }, class: { select: { name: true } } } });

    let answerSheetTemplate: { id: string } | null = null;
    if (generateAnswerSheet && accountType && INSTITUTION_STAFF_ACCOUNT_TYPES.includes(accountType)) {
      answerSheetTemplate = (await upsertSheetTemplate(this.prisma, row)).template;
    }
    return this.publicSimulation({ ...row, answerSheetTemplate });
  }

  async list(userId: string) {
    const rows = await this.prisma.simulation.findMany({ where: { OR: [{ createdBy: userId }, { class: { members: { some: { userId } } } }, { class: { teachers: { some: { userId } } } }] }, select: { id: true, title: true, createdAt: true, assessmentType: true, dueAt: true, durationMinutes: true, isRealExam: true, enemDay: true, class: { select: { name: true } }, submissions: { where: { userId }, select: { correct: true, total: true, submittedAt: true }, take: 1 }, _count: { select: { items: true } } }, orderBy: { createdAt: 'desc' } });
    return rows.map(({ submissions, ...r }) => ({ id: r.id, title: r.title, createdAt: r.createdAt, assessmentType: r.assessmentType, dueAt: r.dueAt, durationMinutes: r.durationMinutes, isRealExam: r.isRealExam, enemDay: r.enemDay ?? null, className: r.class?.name ?? null, questionCount: r._count.items, result: submissions[0] ?? null }));
  }

  async get(userId: string, id: string, includeAnswers = false) {
    const row = await this.prisma.simulation.findUnique({ where: { id }, include: { items: { orderBy: { position: 'asc' } }, class: { select: { name: true, members: { where: { userId }, select: { id: true } }, teachers: { where: { userId }, select: { id: true } } } }, answerSheetTemplate: { select: { id: true } } } });
    if (!row || (row.createdBy !== userId && !row.class?.members.length && !row.class?.teachers.length)) throw new NotFoundException('Simulado não encontrado.');
    if (includeAnswers && row.createdBy !== userId && !row.class?.teachers.length) throw new ForbiddenException('O gabarito oficial é exclusivo do autor e dos professores da turma.');
    return this.publicSimulation(row, includeAnswers);
  }

  /**
   * `allowBlank`: o cartão-resposta físico pode ter questão em branco ou anulada (0), que conta como erro.
   * `deferMastery`: não mexe no domínio por tópico agora — o cartão-resposta só o aplica no lançamento
   * final (registerSimulationMastery), depois da última correção do corretor.
   */
  async submit(userId: string, id: string, answers: SimulationAnswerDto[], options: { allowBlank?: boolean; deferMastery?: boolean } = {}) {
    const simulation = await this.prisma.simulation.findUnique({
      where: { id }, include: { items: { orderBy: { position: 'asc' } }, class: { select: { members: { where: { userId }, select: { id: true } }, teachers: { where: { userId }, select: { id: true } } } } },
    });
    if (!simulation || (simulation.createdBy !== userId && !simulation.class?.members.length && !simulation.class?.teachers.length)) throw new NotFoundException('Simulado não encontrado.');
    if (answers.length !== simulation.items.length || new Set(answers.map(a => a.position)).size !== answers.length) throw new BadRequestException('Responda cada questão uma única vez.');
    const byPosition = new Map(answers.map(a => [a.position, a.selectedPosition]));
    for (const item of simulation.items) {
      const choice = byPosition.get(item.position);
      const alternatives = item.alternatives as { position: number }[];
      // No modelo ENEM a questão pode ficar em branco (0): conta como erro.
      if (choice === 0 && (simulation.enemDay || options.allowBlank)) continue;
      if (!choice || !alternatives.some(a => a.position === choice)) throw new BadRequestException(`Resposta inválida para a questão ${item.position}.`);
    }
    const correct = simulation.items.filter(item => byPosition.get(item.position) === item.correctPosition).length;

    // Domínio por tópico (cronograma adaptativo, fase 1): SimulationItem não
    // guarda subjectId/topicId (só o texto denormalizado da matéria), então
    // busca-se a classificação estruturada nas questões de origem.
    const questionIds = simulation.items.map(item => item.questionId).filter((qid): qid is string => !!qid);
    const questions = questionIds.length
      ? await this.prisma.question.findMany({ where: { id: { in: questionIds } }, select: { id: true, subjectId: true, topicId: true } })
      : [];
    const questionById = new Map(questions.map(q => [q.id, q]));

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.simulationSubmission.create({ data: { id: randomUUID(), simulationId: id, userId, answers: answers.map(a => ({ position: a.position, selectedPosition: a.selectedPosition })), correct, total: simulation.items.length, startedAt: new Date() } });
        if (!options.deferMastery) await this.applyMastery(userId, simulation.items, questionById, byPosition, tx);
      }, SUBMIT_TX_OPTIONS);
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') throw new ConflictException('Este simulado já foi enviado.');
      throw error;
    }
    return this.submission(userId, id);
  }

  /**
   * Uma atualização de domínio por tópico, com as respostas dele na ordem da
   * prova — não uma por questão (ver registerAttempts).
   */
  private async applyMastery(
    userId: string,
    items: { position: number; questionId: string | null; correctPosition: number }[],
    questionById: Map<string, { subjectId: string | null; topicId: string | null }>,
    byPosition: Map<number, number>,
    tx: Prisma.TransactionClient,
  ) {
    const byTopic = new Map<string, { subjectId: string | null; topicId: string | null; results: boolean[] }>();
    for (const item of items) {
      if (!item.questionId) continue;
      const question = questionById.get(item.questionId);
      if (!question?.topicId) continue;
      const entry = byTopic.get(question.topicId) ?? { subjectId: question.subjectId, topicId: question.topicId, results: [] };
      entry.results.push(byPosition.get(item.position) === item.correctPosition);
      byTopic.set(question.topicId, entry);
    }
    for (const entry of byTopic.values()) {
      await this.topicMasteryService.registerAttempts(userId, entry.subjectId, entry.topicId, entry.results, tx);
    }
  }

  /**
   * Domínio por tópico de um simulado com as respostas finais — usado pelo
   * cartão-resposta no lançamento final, depois da última correção. `tx`
   * permite marcar a folha como finalizada na mesma transação.
   */
  async registerSimulationMastery(userId: string, simulationId: string, answers: { position: number; selectedPosition: number }[], tx: Prisma.TransactionClient) {
    const items = await tx.simulationItem.findMany({ where: { simulationId }, select: { position: true, questionId: true, correctPosition: true } });
    const questionIds = items.map(item => item.questionId).filter((qid): qid is string => !!qid);
    const questions = questionIds.length ? await tx.question.findMany({ where: { id: { in: questionIds } }, select: { id: true, subjectId: true, topicId: true } }) : [];
    const byPosition = new Map(answers.map(a => [a.position, a.selectedPosition]));
    await this.applyMastery(userId, items, new Map(questions.map(q => [q.id, q])), byPosition, tx);
  }

  async submission(userId: string, id: string) {
    const row = await this.prisma.simulationSubmission.findUnique({ where: { simulationId_userId: { simulationId: id, userId } }, include: { simulation: { include: { items: { orderBy: { position: 'asc' } } } } } });
    if (!row) throw new NotFoundException('Resultado não encontrado.');
    const answers = row.answers as { position: number; selectedPosition: number }[];
    const byPosition = new Map(answers.map(a => [a.position, a.selectedPosition]));
    const timeSpentMinutes = row.startedAt ? Math.max(1, Math.round((row.submittedAt.getTime() - row.startedAt.getTime()) / 60000)) : null;
    return { id: row.id, simulationId: id, correct: row.correct, total: row.total, submittedAt: row.submittedAt, startedAt: row.startedAt ?? null, timeSpentMinutes, items: row.simulation.items.map(item => ({ position: item.position, subject: item.subject, area: item.area ?? null, selectedPosition: byPosition.get(item.position), correctPosition: item.correctPosition, isCorrect: byPosition.get(item.position) === item.correctPosition })) };
  }

  private publicSimulation(row: {
    id: string; title: string; createdAt: Date; assessmentType?: string;
    dueAt?: Date | null; class?: { name: string } | null;
    durationMinutes?: number | null; isRealExam?: boolean; enemDay?: number | null;
    answerSheetTemplate?: { id: string } | null;
    items: { id: string; questionId: string | null; position: number; stem: string; subject: string; area?: string | null; alternatives: unknown; correctPosition: number }[]
  }, includeAnswers = false) {
    return {
      id: row.id, title: row.title, createdAt: row.createdAt,
      assessmentType: row.assessmentType ?? 'SIMULATION',
      dueAt: row.dueAt ?? null, className: row.class?.name ?? null,
      durationMinutes: row.durationMinutes ?? null,
      isRealExam: row.isRealExam ?? false,
      enemDay: row.enemDay ?? null,
      sheetVersion: 1,
      answerSheetTemplateId: row.answerSheetTemplate?.id ?? null,
      items: row.items.map(i => ({
        id: i.id, questionId: i.questionId, position: i.position,
        stem: i.stem, subject: i.subject, area: i.area ?? null,
        alternatives: i.alternatives,
        ...(includeAnswers ? { correctPosition: i.correctPosition } : {}),
      })),
    };
  }
}
type TeacherClassRow = {
  id: string; name: string; joinCode: string;
  members: { joinedAt: Date; user: { id: string; email: string; profile: { firstName: string; lastName: string | null } | null } }[];
  simulations: { id: string; title: string; items: { position: number; subject: string; correctPosition: number }[]; submissions: { userId: string; correct: number; total: number; submittedAt: Date; answers: unknown }[] }[];
};

export function buildTeacherDashboard(classes: TeacherClassRow[]) {
  const dashboardClasses = classes.map(classRoom => {
    const submissions = classRoom.simulations.flatMap(simulation => simulation.submissions.map(submission => ({ ...submission, simulation })));
    const students = classRoom.members.map(member => {
      const own = submissions.filter(item => item.userId === member.user.id);
      const correct = own.reduce((sum, item) => sum + item.correct, 0);
      const total = own.reduce((sum, item) => sum + item.total, 0);
      const accuracy = dashboardPercentage(correct, total);
      return { id: member.user.id, name: [member.user.profile?.firstName, member.user.profile?.lastName].filter(Boolean).join(' ') || member.user.email, email: member.user.email, joinedAt: member.joinedAt, submissions: own.length, accuracy, alert: total > 0 && accuracy < 60 };
    });
    const subjects = new Map<string, { total: number; correct: number }>();
    for (const submission of submissions) {
      const selected = new Map((submission.answers as { position: number; selectedPosition: number }[]).map(answer => [answer.position, answer.selectedPosition]));
      for (const item of submission.simulation.items) {
        if (!selected.has(item.position)) continue;
        const current = subjects.get(item.subject) ?? { total: 0, correct: 0 };
        current.total += 1;
        if (selected.get(item.position) === item.correctPosition) current.correct += 1;
        subjects.set(item.subject, current);
      }
    }
    const correct = submissions.reduce((sum, item) => sum + item.correct, 0);
    const total = submissions.reduce((sum, item) => sum + item.total, 0);
    return { id: classRoom.id, name: classRoom.name, joinCode: classRoom.joinCode, studentCount: students.length, simulationCount: classRoom.simulations.length, submissionCount: submissions.length, accuracy: dashboardPercentage(correct, total), students, weakSubjects: [...subjects.entries()].map(([subject, value]) => ({ subject, attempts: value.total, accuracy: dashboardPercentage(value.correct, value.total) })).sort((a, b) => a.accuracy - b.accuracy) };
  });
  const allStudents = dashboardClasses.flatMap(item => item.students);
  const totalCorrect = classes.flatMap(item => item.simulations).flatMap(item => item.submissions).reduce((sum, item) => sum + item.correct, 0);
  const totalQuestions = classes.flatMap(item => item.simulations).flatMap(item => item.submissions).reduce((sum, item) => sum + item.total, 0);
  return { summary: { classCount: dashboardClasses.length, studentCount: new Set(allStudents.map(item => item.id)).size, submissionCount: dashboardClasses.reduce((sum, item) => sum + item.submissionCount, 0), averageAccuracy: dashboardPercentage(totalCorrect, totalQuestions), studentsAtRisk: new Set(allStudents.filter(item => item.alert).map(item => item.id)).size }, classes: dashboardClasses };
}

function dashboardPercentage(correct: number, total: number) { return total ? Math.round((correct / total) * 1000) / 10 : 0; }
type CoordinatorClassRow = TeacherClassRow & {
  teachers: { user: { id: string; email: string; profile: { firstName: string; lastName: string | null } | null; teacherProfile: { subject: string } | null } }[];
};

export function buildCoordinatorDashboard(dashboard: ReturnType<typeof buildTeacherDashboard>, classes: CoordinatorClassRow[]) {
  const teacherMap = new Map<string, { id: string; name: string; email: string; subject: string; classes: string[] }>();
  for (const classRoom of classes) for (const relation of classRoom.teachers) {
    const teacher = relation.user;
    const current = teacherMap.get(teacher.id) ?? { id: teacher.id, name: [teacher.profile?.firstName, teacher.profile?.lastName].filter(Boolean).join(' ') || teacher.email, email: teacher.email, subject: teacher.teacherProfile?.subject ?? 'Não informada', classes: [] };
    current.classes.push(classRoom.name);
    teacherMap.set(teacher.id, current);
  }
  const subjectMap = new Map<string, { attempts: number; correctEstimate: number }>();
  for (const classRoom of dashboard.classes) for (const subject of classRoom.weakSubjects) {
    const current = subjectMap.get(subject.subject) ?? { attempts: 0, correctEstimate: 0 };
    current.attempts += subject.attempts;
    current.correctEstimate += subject.attempts * subject.accuracy / 100;
    subjectMap.set(subject.subject, current);
  }
  const bySubject = [...subjectMap.entries()].map(([subject, value]) => ({ subject, attempts: value.attempts, accuracy: value.attempts ? Math.round(value.correctEstimate / value.attempts * 1000) / 10 : 0 })).sort((a, b) => a.accuracy - b.accuracy);
  return { summary: { ...dashboard.summary, teacherCount: teacherMap.size }, classes: dashboard.classes, teachers: [...teacherMap.values()], bySubject };
}


type DirectorMemberRow = { id: string; status: string; joinedAt: Date; role: { name: string }; user: { id: string; email: string; accountType: string; profile: { firstName: string; lastName: string | null } | null; teacherProfile: { subject: string } | null } };

export function buildDirectorDashboard(coordinator: ReturnType<typeof buildCoordinatorDashboard>, classes: CoordinatorClassRow[], members: DirectorMemberRow[], institutionName: string) {
  const monthly = new Map<string, { correct: number; total: number; submissions: number }>();
  for (const submission of classes.flatMap(item => item.simulations).flatMap(item => item.submissions)) {
    const key = submission.submittedAt.toISOString().slice(0, 7);
    const current = monthly.get(key) ?? { correct: 0, total: 0, submissions: 0 };
    current.correct += submission.correct; current.total += submission.total; current.submissions += 1; monthly.set(key, current);
  }
  const evolution = [...monthly.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-12).map(([month, value]) => ({ month, accuracy: dashboardPercentage(value.correct, value.total), submissions: value.submissions }));
  return {
    institutionName,
    summary: { ...coordinator.summary, memberCount: members.length, activeMemberCount: members.filter(item => item.status === 'ACTIVE').length },
    classes: coordinator.classes, bySubject: coordinator.bySubject, evolution,
    members: members.map(member => ({ id: member.id, userId: member.user.id, name: [member.user.profile?.firstName, member.user.profile?.lastName].filter(Boolean).join(' ') || member.user.email, email: member.user.email, accountType: member.user.accountType, subject: member.user.teacherProfile?.subject ?? null, status: member.status, role: member.role.name, joinedAt: member.joinedAt })),
  };
}
