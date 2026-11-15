import { ConflictException, ForbiddenException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma, RecoveryPlan } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { QuestionAccessService } from '../questions/question-access.service';
import { CreateRecoveryPlanDto } from './recovery-plans.dto';
import {
  REVIEW_AFTER_DAYS,
  buildSteps,
  computeProgress,
  weakestTopic,
  type Difficulty,
  type PoolQuestion,
  type PoolSource,
  type StepDef,
} from './recovery-plan';

const DAY_MS = 24 * 60 * 60 * 1000;
export const MAX_ACTIVE_PLANS = 3;
const POOL_LIMIT = 60;

/**
 * Planos de recuperação (item 42). O aluno cria para si; o professor cria
 * para um aluno de uma turma em que ele leciona. Quem vê: o aluno, quem criou
 * e professores das turmas do aluno.
 */
@Injectable()
export class RecoveryPlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: QuestionAccessService,
  ) {}

  async create(actorId: string, dto: CreateRecoveryPlanDto, now: Date = new Date()) {
    const studentId = dto.studentId ?? actorId;
    if (studentId !== actorId) await this.assertTeachesStudent(actorId, studentId, dto.classId);

    const active = await this.prisma.recoveryPlan.findMany({ where: { studentId, status: 'ACTIVE' }, select: { topicId: true } });
    if (active.length >= MAX_ACTIVE_PLANS) {
      throw new ConflictException(`Já há ${MAX_ACTIVE_PLANS} planos de recuperação ativos. Conclua ou cancele um antes de criar outro.`);
    }

    // 1) Detectar a dificuldade: o assunto escolhido ou o mais fraco do aluno.
    let topic: { id: string; name: string; subjectId: string; subject: { name: string } } | null = null;
    if (dto.topicId) {
      topic = await this.prisma.topic.findUnique({ where: { id: dto.topicId }, select: { id: true, name: true, subjectId: true, subject: { select: { name: true } } } });
      if (!topic) throw new NotFoundException('Assunto não encontrado.');
    } else {
      const mastery = await this.prisma.topicMastery.findMany({
        where: { userId: studentId, ...(dto.subjectId ? { subjectId: dto.subjectId } : {}) },
        select: { topicId: true, masteryScore: true, attempts: true },
      });
      const weakest = weakestTopic(mastery, new Set(active.map((a) => a.topicId)));
      if (!weakest) {
        throw new UnprocessableEntityException('Ainda não há respostas suficientes para identificar a dificuldade. Escolha um assunto.');
      }
      topic = await this.prisma.topic.findUnique({ where: { id: weakest.topicId }, select: { id: true, name: true, subjectId: true, subject: { select: { name: true } } } });
      if (!topic) throw new NotFoundException('Assunto não encontrado.');
    }
    if (active.some((a) => a.topicId === topic!.id)) {
      throw new ConflictException(`Já existe um plano ativo para ${topic.name}.`);
    }

    // 2) Escolher o conteúdo de reforço: funil assunto → habilidade → matéria.
    const { pool, info } = await this.buildPool(studentId, topic.id, topic.subjectId);
    const steps = buildSteps(pool, topic.name);
    if (!steps.some((s) => s.questionIds.length)) {
      throw new UnprocessableEntityException(`O banco ainda não tem questões de ${topic.name} nem da matéria para montar o plano.`);
    }
    const baseline = await this.prisma.topicMastery.findUnique({ where: { userId_topicId: { userId: studentId, topicId: topic.id } }, select: { masteryScore: true } });

    const plan = await this.prisma.recoveryPlan.create({
      data: {
        studentId,
        createdById: actorId,
        classId: dto.classId ?? null,
        alertId: dto.alertId ?? null,
        subjectId: topic.subjectId,
        topicId: topic.id,
        subjectName: topic.subject.name,
        topicName: topic.name,
        steps: steps as unknown as Prisma.InputJsonValue,
        poolInfo: info as unknown as Prisma.InputJsonValue,
        baselineMastery: baseline?.masteryScore ?? null,
        reviewAt: new Date(now.getTime() + REVIEW_AFTER_DAYS * DAY_MS),
      },
    });
    return this.view(plan, now);
  }

  private async buildPool(studentId: string, topicId: string, subjectId: string) {
    const [personal, bank] = await Promise.all([this.access.getPersonalWorkspace(studentId), this.access.getBankWorkspace()]);
    const workspaceId = { in: [personal?.id, bank?.id].filter((id): id is string => Boolean(id)) };
    const select = { id: true, difficulty: true, enemSkill: true } as const;

    const byTopic = await this.prisma.question.findMany({ where: { workspaceId, topicId }, select, take: POOL_LIMIT });
    const skills = [...new Set(byTopic.map((q) => q.enemSkill).filter((s): s is string => Boolean(s)))];
    const bySkill = skills.length
      ? await this.prisma.question.findMany({ where: { workspaceId, subjectId, enemSkill: { in: skills }, NOT: { topicId } }, select, take: POOL_LIMIT })
      : [];
    const seen = new Set([...byTopic, ...bySkill].map((q) => q.id));
    const bySubject = (await this.prisma.question.findMany({ where: { workspaceId, subjectId, NOT: { topicId } }, select, take: POOL_LIMIT })).filter((q) => !seen.has(q.id));

    const all = [
      ...byTopic.map((q) => ({ ...q, source: 'TOPIC' as PoolSource })),
      ...bySkill.map((q) => ({ ...q, source: 'SKILL' as PoolSource })),
      ...bySubject.map((q) => ({ ...q, source: 'SUBJECT' as PoolSource })),
    ];
    const attempts = await this.prisma.questionAttempt.findMany({
      where: { userId: studentId, questionId: { in: all.map((q) => q.id) } },
      select: { questionId: true, isCorrect: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
    const lastCorrect = new Map<string, boolean>();
    for (const a of attempts) lastCorrect.set(a.questionId, a.isCorrect);
    const pool: PoolQuestion[] = all.map((q) => ({
      id: q.id,
      difficulty: q.difficulty as Difficulty,
      source: q.source,
      answeredBefore: lastCorrect.has(q.id),
      alreadyCorrect: lastCorrect.get(q.id) === true,
    }));
    return { pool, info: { topic: byTopic.length, skill: bySkill.length, subject: bySubject.length, skills } };
  }

  /** Professor só age sobre aluno de turma ativa em que leciona. */
  private async assertTeachesStudent(teacherId: string, studentId: string, classId?: string) {
    const shared = await this.prisma.class.findFirst({
      where: {
        archived: false,
        ...(classId ? { id: classId } : {}),
        teachers: { some: { userId: teacherId } },
        members: { some: { userId: studentId } },
      },
      select: { id: true },
    });
    if (!shared) throw new ForbiddenException('Você só pode criar planos para alunos das suas turmas.');
  }

  private async canView(plan: RecoveryPlan, viewerId: string): Promise<boolean> {
    if (plan.studentId === viewerId || plan.createdById === viewerId) return true;
    const shared = await this.prisma.class.count({
      where: { archived: false, teachers: { some: { userId: viewerId } }, members: { some: { userId: plan.studentId } } },
    });
    return shared > 0;
  }

  private async findViewable(id: string, viewerId: string): Promise<RecoveryPlan> {
    const plan = await this.prisma.recoveryPlan.findUnique({ where: { id } });
    if (!plan || !(await this.canView(plan, viewerId))) throw new NotFoundException('Plano não encontrado.');
    return plan;
  }

  async get(id: string, viewerId: string, now: Date = new Date()) {
    return this.view(await this.findViewable(id, viewerId), now);
  }

  async listMine(studentId: string, now: Date = new Date()) {
    const plans = await this.prisma.recoveryPlan.findMany({ where: { studentId }, orderBy: { createdAt: 'desc' }, take: 20 });
    return Promise.all(plans.map((p) => this.view(p, now)));
  }

  /** Planos dos alunos das turmas do professor (opcionalmente de um aluno). */
  async listForTeacher(teacherId: string, studentId: string | undefined, now: Date = new Date()) {
    const members = await this.prisma.classMember.findMany({
      where: { class: { archived: false, teachers: { some: { userId: teacherId } } }, ...(studentId ? { userId: studentId } : {}) },
      select: { userId: true },
    });
    const ids = [...new Set(members.map((m) => m.userId))];
    if (!ids.length) return [];
    const plans = await this.prisma.recoveryPlan.findMany({ where: { studentId: { in: ids } }, orderBy: { createdAt: 'desc' }, take: 100 });
    return Promise.all(plans.map((p) => this.view(p, now)));
  }

  async markVideo(id: string, studentId: string, now: Date = new Date()) {
    const plan = await this.prisma.recoveryPlan.findUnique({ where: { id } });
    if (!plan || plan.studentId !== studentId) throw new NotFoundException('Plano não encontrado.');
    const saved = await this.prisma.recoveryPlan.update({ where: { id }, data: { videoWatchedAt: plan.videoWatchedAt ?? now } });
    return this.view(saved, now);
  }

  async cancel(id: string, actorId: string, now: Date = new Date()) {
    const plan = await this.findViewable(id, actorId);
    if (plan.studentId !== actorId && plan.createdById !== actorId) throw new ForbiddenException('Só o aluno ou quem criou o plano pode cancelá-lo.');
    if (plan.status !== 'ACTIVE') return this.view(plan, now);
    const saved = await this.prisma.recoveryPlan.update({ where: { id }, data: { status: 'CANCELLED', completedAt: now } });
    return this.view(saved, now);
  }

  /** Monta a resposta com o progresso; conclui o plano quando a revisão termina (reavaliação). */
  private async view(plan: RecoveryPlan, now: Date) {
    const steps = plan.steps as unknown as StepDef[];
    const ids = [...new Set(steps.flatMap((s) => s.questionIds))];
    const attempts = ids.length
      ? await this.prisma.questionAttempt.findMany({
          where: { userId: plan.studentId, questionId: { in: ids }, createdAt: { gte: plan.createdAt } },
          select: { questionId: true, isCorrect: true, createdAt: true },
        })
      : [];
    const progress = computeProgress(steps, attempts.map((a) => ({ questionId: a.questionId, isCorrect: a.isCorrect, at: a.createdAt })), plan, now);
    const mastery = await this.prisma.topicMastery.findUnique({
      where: { userId_topicId: { userId: plan.studentId, topicId: plan.topicId } },
      select: { masteryScore: true },
    });
    const student = await this.prisma.user.findUnique({
      where: { id: plan.studentId },
      select: { email: true, profile: { select: { firstName: true, lastName: true } } },
    });
    const studentName = [student?.profile?.firstName, student?.profile?.lastName].filter(Boolean).join(' ') || student?.email || '';
    let current = plan;
    if (plan.status === 'ACTIVE' && progress.finished) {
      current = await this.prisma.recoveryPlan.update({
        where: { id: plan.id },
        data: { status: 'COMPLETED', completedAt: now, finalMastery: mastery?.masteryScore ?? null },
      });
    }
    return {
      id: current.id,
      studentId: current.studentId,
      studentName,
      createdById: current.createdById,
      createdBySelf: current.createdById === current.studentId,
      classId: current.classId,
      subjectId: current.subjectId,
      topicId: current.topicId,
      subjectName: current.subjectName,
      topicName: current.topicName,
      status: current.status,
      poolInfo: current.poolInfo,
      baselineMastery: current.baselineMastery,
      currentMastery: current.finalMastery ?? mastery?.masteryScore ?? null,
      reviewAt: current.reviewAt.toISOString(),
      videoWatchedAt: current.videoWatchedAt?.toISOString() ?? null,
      completedAt: current.completedAt?.toISOString() ?? null,
      createdAt: current.createdAt.toISOString(),
      steps: progress.steps,
    };
  }
}
