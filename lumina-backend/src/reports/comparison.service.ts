import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { TeacherAnalyticsService } from '../institutional-analytics/teacher-analytics.service';
import { ReportsService } from './reports.service';
import { rollingWindow } from './report-build';
import {
  MAX_CLASSES_COMPARED,
  comparableAccuracy,
  delta,
  perActive,
  subjectEvolution,
  subjectMatrix,
  versusAverage,
} from './compare-rules';

const DAY_MS = 24 * 3600_000;

/**
 * Comparação de desempenho (Fase 3, item 43): turmas entre si e com o
 * período anterior; aluno consigo mesmo e com a média da turma. Só agregados:
 * nenhuma nota individual de outro aluno sai daqui.
 */
@Injectable()
export class ComparisonService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reports: ReportsService,
    private readonly analytics: TeacherAnalyticsService,
  ) {}

  /** Turmas lado a lado, cada uma comparada com o próprio período anterior. */
  async compareClasses(userId: string, classIds: string[], days: number, now = new Date()) {
    const ids = [...new Set(classIds)];
    if (ids.length < 1 || ids.length > MAX_CLASSES_COMPARED) throw new BadRequestException(`Escolha de 1 a ${MAX_CLASSES_COMPARED} turmas.`);
    const scope = await this.reports.scope(userId);
    const allowed = new Map([...scope.teacherClasses, ...scope.institutionClasses].map((c) => [c.id, c.name]));
    for (const id of ids) if (!allowed.has(id)) throw new NotFoundException('Turma não encontrada entre as suas.');
    const previousNow = new Date(now.getTime() - days * DAY_MS);

    const rows = await Promise.all(ids.map(async (id) => {
      const [cur, prev] = await Promise.all([
        this.analytics.analyticsForClasses({ id }, days, now),
        this.analytics.analyticsForClasses({ id }, days, previousNow),
      ]);
      const c = cur.classes[0];
      const p = prev.classes[0];
      const metrics = (k: typeof c | undefined) => ({
        accuracy: k ? comparableAccuracy(k.accuracy, k.answerCount) : null,
        participationRate: k ? k.participationRate : null,
        minutesPerActive: k ? perActive(k.studyMinutes, k.activeStudentCount) : null,
        submissions: k ? k.submissionCount : null,
        studentsAtRisk: k ? k.studentsAtRisk : null,
      });
      const now_ = metrics(c);
      const before = metrics(p);
      return {
        id,
        name: c?.name ?? allowed.get(id)!,
        studentCount: c?.studentCount ?? 0,
        activeStudentCount: c?.activeStudentCount ?? 0,
        answers: c?.answerCount ?? 0,
        accuracy: delta(now_.accuracy, before.accuracy),
        participationRate: delta(now_.participationRate, before.participationRate),
        minutesPerActive: delta(now_.minutesPerActive, before.minutesPerActive, 5),
        submissions: delta(now_.submissions, before.submissions),
        // Em risco: menos é melhor; a tela inverte a cor.
        studentsAtRisk: delta(now_.studentsAtRisk, before.studentsAtRisk),
        subjects: cur.subjects,
      };
    }));

    return {
      period: { days, from: new Date(now.getTime() - days * DAY_MS).toISOString(), to: now.toISOString(), previousFrom: new Date(previousNow.getTime() - days * DAY_MS).toISOString() },
      classes: rows.map(({ subjects, ...r }) => r),
      subjects: subjectMatrix(rows.map((r) => ({ classId: r.id, subjects: r.subjects }))),
    };
  }

  /** Aluno consigo mesmo (período atual × anterior) e com a média de cada turma dele. */
  async compareStudent(viewerId: string, studentId: string, days: number, now = new Date()) {
    const current = rollingWindow(days, now);
    const previous = rollingWindow(days, new Date(now.getTime() - days * DAY_MS));
    // studentReport já confere o acesso: o próprio aluno, ou professor/coordenação dele.
    const [cur, prev] = await Promise.all([
      this.reports.studentReport(viewerId, studentId, current),
      this.reports.studentReport(viewerId, studentId, previous),
    ]);

    let classIds = (await this.prisma.classMember.findMany({ where: { userId: studentId, class: { archived: false } }, select: { classId: true } })).map((m) => m.classId);
    if (viewerId !== studentId) {
      const scope = await this.reports.scope(viewerId);
      const allowed = new Set([...scope.teacherClasses, ...scope.institutionClasses].map((c) => c.id));
      classIds = classIds.filter((id) => allowed.has(id));
    }
    const classes = await Promise.all(classIds.slice(0, MAX_CLASSES_COMPARED).map(async (id) => {
      const data = await this.analytics.analyticsForClasses({ id }, days, now);
      const k = data.classes[0];
      if (!k) return null;
      const me = k.students.find((s) => s.id === studentId);
      return {
        id,
        name: k.name,
        activeStudentCount: k.activeStudentCount,
        accuracy: versusAverage(me ? comparableAccuracy(me.accuracy, me.answerCount) : null, comparableAccuracy(k.accuracy, k.answerCount)),
        studyMinutes: versusAverage(me ? me.studyMinutes : null, perActive(k.studyMinutes, k.activeStudentCount)),
      };
    }));

    return {
      student: cur.student,
      period: { days, current: cur.period, previous: prev.period },
      self: {
        questionAccuracy: delta(comparableAccuracy(cur.questions.accuracy, cur.questions.answered), comparableAccuracy(prev.questions.accuracy, prev.questions.answered)),
        questionsAnswered: delta(cur.questions.answered, prev.questions.answered),
        simulationAccuracy: delta(comparableAccuracy(cur.simulations.accuracy, cur.simulations.answers), comparableAccuracy(prev.simulations.accuracy, prev.simulations.answers)),
        studyMinutes: delta(cur.studyMinutes, prev.studyMinutes, 5),
        essayAverage: delta(cur.essays.average, prev.essays.average, 10),
        subjects: subjectEvolution(
          cur.questions.bySubject.map((s) => ({ subject: s.subject, attempts: s.answered, accuracy: s.accuracy })),
          prev.questions.bySubject.map((s) => ({ subject: s.subject, attempts: s.answered, accuracy: s.accuracy })),
        ),
      },
      classes: classes.filter((c): c is NonNullable<typeof c> => c !== null),
    };
  }
}
