import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { TeacherAnalyticsService } from '../institutional-analytics/teacher-analytics.service';
import type { TeacherAnalyticsResult } from '../institutional-analytics/teacher-analytics';
import { SkillMasteryService } from '../questions/enem-skills/skill-mastery.service';
import {
  average,
  bySubject,
  pct,
  periodName,
  planCounts,
  previousMonthWindow,
  rollingWindow,
  strengths,
  subjectRows,
  type ReportType,
  type ReportWindow,
} from './report-build';
import { CreateSnapshotDto } from './reports.dto';

const MAX_SUBJECT_CLASSES = 30;
const MAX_MONTHLY_CLASSES = 20;

interface Scope {
  userId: string;
  teacherClasses: { id: string; name: string }[];
  institution: { workspaceId: string; name: string; role: 'COORDINATOR' | 'DIRECTOR' } | null;
  institutionClasses: { id: string; name: string }[];
}

const displayName = (u: { email: string; profile: { firstName: string | null; lastName: string | null } | null }) =>
  [u.profile?.firstName, u.profile?.lastName].filter(Boolean).join(' ') || u.email;

/**
 * Relatórios pedagógicos (item 59): individual, de turma, de matéria e
 * institucional, por janela de dias ou mês civil. Salvos como
 * ReportSnapshot quando alguém pede, e o mensal de cada turma (e o
 * institucional) é gerado no primeiro acesso do mês seguinte.
 */
@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly analytics: TeacherAnalyticsService,
    private readonly skills: SkillMasteryService,
  ) {}

  /** O que o usuário pode consultar. */
  async scope(userId: string): Promise<Scope> {
    const [user, teaching] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { accountType: true } }),
      this.prisma.class.findMany({ where: { archived: false, teachers: { some: { userId } } }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    ]);
    let institution: Scope['institution'] = null;
    let institutionClasses: Scope['institutionClasses'] = [];
    if (user?.accountType === 'COORDINATOR' || user?.accountType === 'DIRECTOR') {
      const membership = await this.prisma.workspaceMember.findFirst({
        where: { userId, status: 'ACTIVE', workspace: { type: 'INSTITUTION' } },
        select: { workspace: { select: { id: true, name: true } } },
        orderBy: { joinedAt: 'asc' },
      });
      if (membership) {
        institution = { workspaceId: membership.workspace.id, name: membership.workspace.name, role: user.accountType };
        institutionClasses = await this.prisma.class.findMany({
          where: { workspaceId: membership.workspace.id, archived: false },
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        });
      }
    }
    return { userId, teacherClasses: teaching, institution, institutionClasses };
  }

  private allClasses(scope: Scope) {
    const map = new Map([...scope.teacherClasses, ...scope.institutionClasses].map((c) => [c.id, c]));
    return [...map.values()];
  }

  private assertClass(scope: Scope, classId: string) {
    if (!this.allClasses(scope).some((c) => c.id === classId)) throw new NotFoundException('Turma não encontrada.');
  }

  private async assertStudent(scope: Scope, studentId: string) {
    if (studentId === scope.userId) return;
    const classIds = this.allClasses(scope).map((c) => c.id);
    const member = classIds.length ? await this.prisma.classMember.count({ where: { userId: studentId, classId: { in: classIds } } }) : 0;
    if (!member) throw new NotFoundException('Aluno não encontrado nas suas turmas.');
  }

  // ------------------------------------------------------------------ turma

  async classReport(userId: string, classId: string, window: ReportWindow, scope?: Scope) {
    const s = scope ?? (await this.scope(userId));
    this.assertClass(s, classId);
    const data = await this.analytics.analyticsForClasses({ id: classId }, window.days, window.now);
    const klass = data.classes[0];
    const studentIds = klass?.students.map((st) => st.id) ?? [];
    const [plans, openAlerts] = await Promise.all([
      studentIds.length ? this.prisma.recoveryPlan.findMany({ where: { studentId: { in: studentIds }, createdAt: { lt: window.now } }, select: { status: true } }) : [],
      this.prisma.pedagogicalAlert.count({ where: { classId, status: { in: ['OPEN', 'ACKNOWLEDGED'] } } }),
    ]);
    return {
      type: 'CLASS' as const,
      title: `Turma ${klass?.name ?? ''}`.trim(),
      period: this.period(window),
      summary: data.summary,
      class: klass ?? null,
      subjects: data.subjects,
      difficultQuestions: data.questions.filter((q) => q.attempts >= 3 && q.accuracy !== null && q.accuracy < 60).slice(0, 10),
      evolution: data.evolution,
      signals: data.signals.slice(0, 15),
      recoveryPlans: planCounts(plans),
      openAlerts,
    };
  }

  // ---------------------------------------------------------------- matéria

  async subjectReport(userId: string, subject: string, window: ReportWindow, classId?: string) {
    const s = await this.scope(userId);
    const classes = classId ? (this.assertClass(s, classId), this.allClasses(s).filter((c) => c.id === classId)) : this.allClasses(s);
    if (!classes.length) throw new ForbiddenException('Relatório de matéria é para professores, coordenação e direção.');
    const perClass: TeacherAnalyticsResult[] = [];
    for (const c of classes.slice(0, MAX_SUBJECT_CLASSES)) perClass.push(await this.analytics.analyticsForClasses({ id: c.id }, window.days, window.now));
    const rows = subjectRows(perClass, subject);
    const total = rows.reduce((a, r) => ({ attempts: a.attempts + r.attempts, correct: a.correct + r.correctCount }), { attempts: 0, correct: 0 });
    const norm = (v: string) => v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const questions = perClass
      .flatMap((r) => r.questions)
      .filter((q) => norm(q.subject) === norm(subject) && q.attempts >= 3 && q.accuracy !== null)
      .sort((a, b) => (a.accuracy ?? 0) - (b.accuracy ?? 0))
      .slice(0, 10);
    return {
      type: 'SUBJECT' as const,
      title: `${subject}${classId ? ` · ${classes[0].name}` : ''}`,
      period: this.period(window),
      subject,
      attempts: total.attempts,
      accuracy: pct(total.correct, total.attempts),
      classes: rows,
      hardestQuestions: questions,
      truncated: classes.length > MAX_SUBJECT_CLASSES,
    };
  }

  // ---------------------------------------------------------- institucional

  async institutionReport(userId: string, window: ReportWindow, scope?: Scope) {
    const s = scope ?? (await this.scope(userId));
    if (!s.institution) throw new ForbiddenException('Relatório institucional é para coordenação e direção.');
    const data = await this.analytics.analyticsForClasses({ workspaceId: s.institution.workspaceId, archived: false }, window.days, window.now);
    const studentIds = [...new Set(data.classes.flatMap((c) => c.students.map((st) => st.id)))];
    const plans = studentIds.length ? await this.prisma.recoveryPlan.findMany({ where: { studentId: { in: studentIds }, createdAt: { lt: window.now } }, select: { status: true } }) : [];
    const bySeverity = { HIGH: 0, MEDIUM: 0, LOW: 0 } as Record<string, number>;
    for (const sig of data.signals) bySeverity[sig.severity] = (bySeverity[sig.severity] ?? 0) + 1;
    return {
      type: 'INSTITUTION' as const,
      title: s.institution.name,
      period: this.period(window),
      summary: data.summary,
      classes: data.classes.map((c) => ({
        id: c.id,
        name: c.name,
        studentCount: c.studentCount,
        activeStudentCount: c.activeStudentCount,
        participationRate: c.participationRate,
        accuracy: c.accuracy,
        studyMinutes: c.studyMinutes,
        studentsAtRisk: c.studentsAtRisk,
      })),
      subjects: data.subjects,
      signalsBySeverity: bySeverity,
      recoveryPlans: planCounts(plans),
    };
  }

  // ------------------------------------------------------------- individual

  async studentReport(userId: string, studentId: string, window: ReportWindow) {
    const s = await this.scope(userId);
    await this.assertStudent(s, studentId);
    const range = { gte: window.from, lt: window.now };
    const [student, attempts, submissions, logs, mastery, essays, plans, skillReport] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: studentId }, select: { email: true, profile: { select: { firstName: true, lastName: true } } } }),
      this.prisma.questionAttempt.findMany({ where: { userId: studentId, createdAt: range }, select: { isCorrect: true, question: { select: { subject: true } } } }),
      this.prisma.simulationSubmission.findMany({ where: { userId: studentId, submittedAt: range }, select: { correct: true, total: true } }),
      this.prisma.studyTimeLog.aggregate({ where: { userId: studentId, startTime: range }, _sum: { durationMinutes: true } }),
      this.prisma.topicMastery.findMany({
        where: { userId: studentId, attempts: { gt: 0 } },
        select: { masteryScore: true, attempts: true, topic: { select: { name: true } }, subject: { select: { name: true } } },
      }),
      this.prisma.essay.findMany({
        where: { userId: studentId, updatedAt: range, correction: { status: 'COMPLETED' } },
        select: { title: true, theme: true, updatedAt: true, correction: { select: { totalScore: true } } },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.recoveryPlan.findMany({ where: { studentId }, select: { topicName: true, status: true, baselineMastery: true, finalMastery: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 10 }),
      this.skills.forUser(studentId),
    ]);
    if (!student) throw new NotFoundException('Aluno não encontrado.');

    const subjects = bySubject(attempts.map((a) => ({ subject: a.question.subject, isCorrect: a.isCorrect })));
    const simTotal = submissions.reduce((a, sub) => ({ correct: a.correct + sub.correct, total: a.total + sub.total }), { correct: 0, total: 0 });
    const topics = mastery.map((m) => ({ topic: m.topic.name, subject: m.subject.name, masteryScore: m.masteryScore, attempts: m.attempts }));
    const skillRows = skillReport.areas.flatMap((a) => a.competencies.flatMap((c) => c.skills.map((sk) => ({ ...sk, area: a.area }))));
    const scores = essays.map((e) => e.correction!.totalScore);

    return {
      type: 'STUDENT' as const,
      title: displayName(student),
      period: this.period(window),
      student: { id: studentId, name: displayName(student), email: student.email },
      questions: { answered: attempts.length, correct: attempts.filter((a) => a.isCorrect).length, accuracy: pct(attempts.filter((a) => a.isCorrect).length, attempts.length), bySubject: subjects, ...strengths(subjects) },
      simulations: { count: submissions.length, answers: simTotal.total, accuracy: pct(simTotal.correct, simTotal.total) },
      studyMinutes: logs._sum.durationMinutes ?? 0,
      mastery: {
        // Faixas separadas: o mesmo assunto não aparece como fraco e forte.
        weakest: topics.filter((t) => t.masteryScore < 70).sort((a, b) => a.masteryScore - b.masteryScore).slice(0, 5),
        strongest: topics.filter((t) => t.masteryScore >= 70).sort((a, b) => b.masteryScore - a.masteryScore).slice(0, 5),
      },
      skills: {
        weakest: skillRows.filter((sk) => sk.attempts >= skillReport.minAttempts && sk.accuracy !== null).sort((a, b) => a.accuracy! - b.accuracy!).slice(0, 5).map((sk) => ({ code: sk.code, text: sk.text, attempts: sk.attempts, accuracy: sk.accuracy })),
      },
      essays: { count: essays.length, average: average(scores), latest: essays.slice(0, 3).map((e) => ({ title: e.title || e.theme, score: e.correction!.totalScore, date: e.updatedAt.toISOString() })) },
      recoveryPlans: plans.map((p) => ({ topic: p.topicName, status: p.status, baselineMastery: p.baselineMastery, finalMastery: p.finalMastery, createdAt: p.createdAt.toISOString() })),
    };
  }

  // -------------------------------------------------------------- salvos

  private period(window: ReportWindow) {
    return { from: window.from.toISOString(), to: window.now.toISOString(), days: window.days, label: window.label, name: periodName(window.label) };
  }

  private async build(userId: string, type: ReportType, scopeId: string, window: ReportWindow, subject?: string, scope?: Scope) {
    switch (type) {
      case 'CLASS':
        return this.classReport(userId, scopeId, window, scope);
      case 'STUDENT':
        return this.studentReport(userId, scopeId, window);
      case 'SUBJECT':
        if (!subject) throw new BadRequestException('Informe a matéria.');
        return this.subjectReport(userId, subject, window, scopeId === 'all' ? undefined : scopeId);
      case 'INSTITUTION':
        return this.institutionReport(userId, window, scope);
    }
  }

  private async save(userId: string, type: ReportType, scopeKey: string, window: ReportWindow, data: { title: string }, automatic: boolean) {
    return this.prisma.reportSnapshot.upsert({
      where: { requestedById_type_scopeKey_periodLabel: { requestedById: userId, type, scopeKey, periodLabel: window.label } },
      update: { data: data as unknown as Prisma.InputJsonValue, title: data.title },
      create: { requestedById: userId, type, scopeKey, title: data.title, periodLabel: window.label, from: window.from, to: window.now, automatic, data: data as unknown as Prisma.InputJsonValue },
      select: { id: true, type: true, title: true, periodLabel: true, automatic: true, createdAt: true },
    });
  }

  async createSnapshot(userId: string, dto: CreateSnapshotDto, now: Date = new Date()) {
    const window = dto.month ? previousMonthWindow(now) : rollingWindow(dto.days ?? 30, now);
    const scopeId = dto.scopeId === 'me' ? userId : dto.scopeId;
    const data = await this.build(userId, dto.type, scopeId, window, dto.subject);
    const scopeKey = dto.type === 'SUBJECT' ? `${dto.subject}|${scopeId}` : scopeId;
    return this.save(userId, dto.type, scopeKey, window, data, false);
  }

  /**
   * Relatórios periódicos: no primeiro acesso de cada mês, gera o do mês
   * anterior para cada turma do professor (e o institucional para
   * coordenação e direção). Não refaz o que já existe.
   */
  async ensureMonthly(userId: string, now: Date = new Date()) {
    const scope = await this.scope(userId);
    const window = previousMonthWindow(now);
    const existing = await this.prisma.reportSnapshot.findMany({
      where: { requestedById: userId, periodLabel: window.label, automatic: true },
      select: { type: true, scopeKey: true },
    });
    const has = (type: string, key: string) => existing.some((e) => e.type === type && e.scopeKey === key);
    let created = 0;
    for (const c of scope.teacherClasses.slice(0, MAX_MONTHLY_CLASSES)) {
      if (has('CLASS', c.id)) continue;
      await this.save(userId, 'CLASS', c.id, window, await this.classReport(userId, c.id, window, scope), true);
      created += 1;
    }
    if (scope.institution && !has('INSTITUTION', scope.institution.workspaceId)) {
      await this.save(userId, 'INSTITUTION', scope.institution.workspaceId, window, await this.institutionReport(userId, window, scope), true);
      created += 1;
    }
    return created;
  }

  async listSnapshots(userId: string, now: Date = new Date()) {
    await this.ensureMonthly(userId, now);
    const rows = await this.prisma.reportSnapshot.findMany({
      where: { requestedById: userId },
      select: { id: true, type: true, title: true, periodLabel: true, automatic: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows.map((r) => ({ ...r, periodName: periodName(r.periodLabel), createdAt: r.createdAt.toISOString() }));
  }

  async getSnapshot(userId: string, id: string) {
    const row = await this.prisma.reportSnapshot.findFirst({ where: { id, requestedById: userId } });
    if (!row) throw new NotFoundException('Relatório não encontrado.');
    return { id: row.id, type: row.type, title: row.title, periodLabel: row.periodLabel, periodName: periodName(row.periodLabel), automatic: row.automatic, createdAt: row.createdAt.toISOString(), data: row.data };
  }
}
