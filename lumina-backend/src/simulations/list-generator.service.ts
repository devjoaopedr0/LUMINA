import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma, QuestionDifficulty } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { QuestionAccessService } from '../questions/question-access.service';
import { LIST_RULES, isSheetCompatible, pickBalanced, suggestedTitle } from './list-generator';

export interface GenerateListInput {
  count: number;
  basis: 'filters' | 'weaknesses';
  subjectId?: string;
  topicId?: string;
  difficulty?: QuestionDifficulty;
  exam?: string;
  year?: number;
  /** Professor: gera para a turma (e, em "dificuldades", usa as da turma). */
  classId?: string;
  /** Aluno: não repetir questões que acertou nos últimos 90 dias. */
  skipMastered?: boolean;
}

/**
 * Gerador de listas (item 37). Devolve uma PRÉVIA; a lista só é criada
 * quando o usuário confirma (POST /simulations com assessmentType LIST),
 * passando pelas mesmas checagens da criação manual.
 */
@Injectable()
export class ListGeneratorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: QuestionAccessService,
  ) {}

  async generate(userId: string, input: GenerateListInput, now = new Date()) {
    const count = Math.max(LIST_RULES.minCount, Math.min(LIST_RULES.maxCount, Math.round(input.count)));
    const warnings: string[] = [];
    let klass: { id: string; name: string } | null = null;
    if (input.classId) {
      const teacher = await this.prisma.classTeacher.findUnique({
        where: { classId_userId: { classId: input.classId, userId } },
        select: { class: { select: { id: true, name: true, archived: true } } },
      });
      if (!teacher || teacher.class.archived) throw new ForbiddenException('Você não leciona nesta turma.');
      klass = { id: teacher.class.id, name: teacher.class.name };
    }

    // Espaços cujas questões a pessoa pode usar: o banco central e os que ela participa.
    const [bank, memberships] = await Promise.all([
      this.access.getBankWorkspace(),
      this.prisma.workspaceMember.findMany({ where: { userId, status: 'ACTIVE' }, select: { workspaceId: true } }),
    ]);
    const workspaceIds = [...new Set([...(bank ? [bank.id] : []), ...memberships.map((m) => m.workspaceId)])];
    if (!workspaceIds.length) throw new BadRequestException('Nenhum banco de questões disponível.');

    // Base "dificuldades": os assuntos mais fracos do aluno ou da turma.
    let weak: Array<{ topicId: string; name: string; mastery: number }> = [];
    if (input.basis === 'weaknesses') {
      weak = klass ? await this.classWeakTopics(klass.id) : await this.studentWeakTopics(userId);
      if (!weak.length) {
        warnings.push(klass
          ? 'A turma ainda não tem histórico suficiente para apontar dificuldades; a lista usou só os filtros.'
          : 'Você ainda não tem histórico suficiente para apontar dificuldades; a lista usou só os filtros.');
      }
    }

    let excluded: string[] = [];
    if (input.skipMastered && !klass) {
      const since = new Date(now.getTime() - LIST_RULES.recentDays * 24 * 3600_000);
      excluded = (await this.prisma.questionAttempt.findMany({
        where: { userId, isCorrect: true, createdAt: { gte: since } },
        select: { questionId: true },
        distinct: ['questionId'],
      })).map((a) => a.questionId);
    }

    const where: Prisma.QuestionWhereInput = {
      workspaceId: { in: workspaceIds },
      ...(input.subjectId ? { subjectId: input.subjectId } : {}),
      ...(weak.length ? { topicId: { in: weak.map((w) => w.topicId) } } : input.topicId ? { topicId: input.topicId } : {}),
      ...(input.difficulty ? { difficulty: input.difficulty } : {}),
      ...(input.exam ? { exam: { equals: input.exam, mode: 'insensitive' as const } } : {}),
      ...(input.year ? { year: input.year } : {}),
      ...(excluded.length ? { id: { notIn: excluded } } : {}),
    };
    const rows = await this.prisma.question.findMany({
      where,
      take: LIST_RULES.candidatePool,
      select: {
        id: true, stem: true, subject: true, topic: true, topicId: true, difficulty: true, exam: true, year: true,
        alternatives: { select: { position: true, isCorrect: true } },
      },
    });
    const usable = rows.filter((q) => isSheetCompatible(q.alternatives));
    const weakOrder = weak.map((w) => w.topicId);
    const pickedIds = pickBalanced(
      usable.map((q) => ({ id: q.id, bucket: q.topicId ?? `${q.subject}/${q.topic}` })),
      count,
      weakOrder,
    );
    const byId = new Map(usable.map((q) => [q.id, q]));
    const questions = pickedIds.map((id) => byId.get(id)!).map((q) => ({
      id: q.id,
      stem: q.stem.length > 220 ? `${q.stem.slice(0, 219)}…` : q.stem,
      subject: q.subject,
      topic: q.topic,
      difficulty: q.difficulty,
      exam: q.exam,
      year: q.year,
    }));
    if (questions.length < count) {
      warnings.push(questions.length
        ? `Só encontramos ${questions.length} de ${count} questões com esses critérios. Tire algum filtro para ampliar.`
        : 'Nenhuma questão encontrada com esses critérios. Tire algum filtro e tente de novo.');
    }

    const subjectName = input.subjectId ? (await this.prisma.subject.findUnique({ where: { id: input.subjectId }, select: { name: true } }))?.name ?? null : null;
    const topicName = input.topicId && !weak.length ? (await this.prisma.topic.findUnique({ where: { id: input.topicId }, select: { name: true } }))?.name ?? null : null;
    return {
      requested: count,
      found: questions.length,
      title: suggestedTitle({ basis: weak.length ? 'weaknesses' : 'filters', subject: subjectName, topic: topicName, forClass: klass?.name, count: questions.length || count }),
      basis: weak.length ? 'weaknesses' : 'filters',
      weakTopics: weak.map((w) => ({ name: w.name, mastery: w.mastery })),
      forClass: klass,
      warnings,
      questions,
    };
  }

  /** Assuntos com domínio abaixo de 70%, do mais fraco para o menos. */
  private async studentWeakTopics(userId: string) {
    const rows = await this.prisma.topicMastery.findMany({
      where: { userId, attempts: { gt: 0 }, masteryScore: { lt: LIST_RULES.weakMastery } },
      orderBy: { masteryScore: 'asc' },
      take: LIST_RULES.weakTopics,
      select: { topicId: true, masteryScore: true, topic: { select: { name: true } } },
    });
    return rows.map((r) => ({ topicId: r.topicId, name: r.topic.name, mastery: r.masteryScore }));
  }

  /** Média de domínio da turma por assunto (só agregado), com pelo menos 2 alunos quando possível. */
  private async classWeakTopics(classId: string) {
    const members = (await this.prisma.classMember.findMany({ where: { classId }, select: { userId: true } })).map((m) => m.userId);
    if (!members.length) return [];
    const grouped = await this.prisma.topicMastery.groupBy({
      by: ['topicId'],
      where: { userId: { in: members }, attempts: { gt: 0 } },
      _avg: { masteryScore: true },
      _count: { _all: true },
    });
    const minStudents = members.length >= 2 ? 2 : 1;
    const weak = grouped
      .filter((g) => g._count._all >= minStudents && (g._avg.masteryScore ?? 100) < LIST_RULES.weakMastery)
      .sort((a, b) => (a._avg.masteryScore ?? 0) - (b._avg.masteryScore ?? 0))
      .slice(0, LIST_RULES.weakTopics);
    if (!weak.length) return [];
    const names = new Map((await this.prisma.topic.findMany({ where: { id: { in: weak.map((w) => w.topicId) } }, select: { id: true, name: true } })).map((t) => [t.id, t.name]));
    return weak.map((w) => ({ topicId: w.topicId, name: names.get(w.topicId) ?? 'Assunto', mastery: Math.round(w._avg.masteryScore ?? 0) }));
  }
}
