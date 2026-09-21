import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes, randomUUID } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import { QuestionAccessService } from '../questions/question-access.service';
import { CreateAcademicPeriodDto, SimulationAnswerDto, UpdateAcademicPeriodDto, UpdateInstitutionMemberDto } from './simulations.dto';

@Injectable()
export class SimulationsService {
  constructor(private readonly prisma: PrismaService, private readonly access: QuestionAccessService) {}

  async classes(userId: string) {
    const rows = await this.prisma.class.findMany({
      where: { archived: false, OR: [{ teachers: { some: { userId } } }, { members: { some: { userId } } }] },
      select: { id: true, name: true, joinCode: true, teachers: { where: { userId }, select: { id: true } } },
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
    await this.prisma.classMember.upsert({ where: { classId_userId: { classId: row.id, userId } }, update: {}, create: { classId: row.id, userId } });
    return { id: row.id, name: row.name, isTeacher: false };
  }

  async create(userId: string, title: string, questionIds: string[], classId?: string, assessmentType: 'ACTIVITY' | 'LIST' | 'TEST' | 'SIMULATION' = 'SIMULATION', dueAt?: string) {
    if (new Set(questionIds).size !== questionIds.length) throw new BadRequestException('O simulado não pode repetir questões.');
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
      id: randomUUID(), title: title.trim(), createdBy: userId, classId: classId ?? null, workspaceId, assessmentType, dueAt: dueAt ? new Date(dueAt) : null,
      items: { create: questionIds.map((id, i) => {
        const q = byId.get(id)!;
        return { id: randomUUID(), questionId: id, position: i + 1, stem: q.stem, subject: q.subject, correctPosition: q.alternatives.find(a => a.isCorrect)!.position, alternatives: q.alternatives.map(a => ({ position: a.position, text: a.text })) };
      }) },
    }, include: { items: { orderBy: { position: 'asc' } }, class: { select: { name: true } } } });
    return this.publicSimulation(row);
  }

  async list(userId: string) {
    const rows = await this.prisma.simulation.findMany({ where: { OR: [{ createdBy: userId }, { class: { members: { some: { userId } } } }, { class: { teachers: { some: { userId } } } }] }, select: { id: true, title: true, createdAt: true, assessmentType: true, dueAt: true, class: { select: { name: true } }, submissions: { where: { userId }, select: { correct: true, total: true, submittedAt: true }, take: 1 }, _count: { select: { items: true } } }, orderBy: { createdAt: 'desc' } });
    return rows.map(({ submissions, ...r }) => ({ id: r.id, title: r.title, createdAt: r.createdAt, assessmentType: r.assessmentType, dueAt: r.dueAt, className: r.class?.name ?? null, questionCount: r._count.items, result: submissions[0] ?? null }));
  }

  async get(userId: string, id: string, includeAnswers = false) {
    const row = await this.prisma.simulation.findUnique({ where: { id }, include: { items: { orderBy: { position: 'asc' } }, class: { select: { name: true, members: { where: { userId }, select: { id: true } }, teachers: { where: { userId }, select: { id: true } } } } } });
    if (!row || (row.createdBy !== userId && !row.class?.members.length && !row.class?.teachers.length)) throw new NotFoundException('Simulado não encontrado.');
    if (includeAnswers && row.createdBy !== userId && !row.class?.teachers.length) throw new ForbiddenException('O gabarito oficial é exclusivo do autor e dos professores da turma.');
    return this.publicSimulation(row, includeAnswers);
  }

  async submit(userId: string, id: string, answers: SimulationAnswerDto[]) {
    const simulation = await this.prisma.simulation.findUnique({
      where: { id }, include: { items: { orderBy: { position: 'asc' } }, class: { select: { members: { where: { userId }, select: { id: true } }, teachers: { where: { userId }, select: { id: true } } } } },
    });
    if (!simulation || (simulation.createdBy !== userId && !simulation.class?.members.length && !simulation.class?.teachers.length)) throw new NotFoundException('Simulado não encontrado.');
    if (answers.length !== simulation.items.length || new Set(answers.map(a => a.position)).size !== answers.length) throw new BadRequestException('Responda cada questão uma única vez.');
    const byPosition = new Map(answers.map(a => [a.position, a.selectedPosition]));
    for (const item of simulation.items) {
      const choice = byPosition.get(item.position);
      const alternatives = item.alternatives as { position: number }[];
      if (!choice || !alternatives.some(a => a.position === choice)) throw new BadRequestException(`Resposta inválida para a questão ${item.position}.`);
    }
    const correct = simulation.items.filter(item => byPosition.get(item.position) === item.correctPosition).length;
    try {
      await this.prisma.simulationSubmission.create({ data: { id: randomUUID(), simulationId: id, userId, answers: answers.map(a => ({ position: a.position, selectedPosition: a.selectedPosition })), correct, total: simulation.items.length } });
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') throw new ConflictException('Este simulado já foi enviado.');
      throw error;
    }
    return this.submission(userId, id);
  }

  async submission(userId: string, id: string) {
    const row = await this.prisma.simulationSubmission.findUnique({ where: { simulationId_userId: { simulationId: id, userId } }, include: { simulation: { include: { items: { orderBy: { position: 'asc' } } } } } });
    if (!row) throw new NotFoundException('Resultado não encontrado.');
    const answers = row.answers as { position: number; selectedPosition: number }[];
    const byPosition = new Map(answers.map(a => [a.position, a.selectedPosition]));
    return { id: row.id, simulationId: id, correct: row.correct, total: row.total, submittedAt: row.submittedAt, items: row.simulation.items.map(item => ({ position: item.position, subject: item.subject, selectedPosition: byPosition.get(item.position), correctPosition: item.correctPosition, isCorrect: byPosition.get(item.position) === item.correctPosition })) };
  }

  private publicSimulation(row: { id: string; title: string; createdAt: Date; assessmentType?: string; dueAt?: Date | null; class?: { name: string } | null; items: { id: string; questionId: string | null; position: number; stem: string; subject: string; alternatives: unknown; correctPosition: number }[] }, includeAnswers = false) {
    return { id: row.id, title: row.title, createdAt: row.createdAt, assessmentType: row.assessmentType ?? 'SIMULATION', dueAt: row.dueAt ?? null, className: row.class?.name ?? null, sheetVersion: 1, items: row.items.map(i => ({ id: i.id, questionId: i.questionId, position: i.position, stem: i.stem, subject: i.subject, alternatives: i.alternatives, ...(includeAnswers ? { correctPosition: i.correctPosition } : {}) })) };
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
