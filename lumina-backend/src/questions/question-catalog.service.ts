import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { QuestionAccessService } from './question-access.service';
import { QuestionsRepository } from './questions.repository';
import { SubjectsRepository } from './subjects.repository';
import { ExamsRepository } from './exams.repository';
import { QueryQuestionsDto } from './dto/query-questions.dto';
import {
  PaginatedExamsDto,
  SubjectResponseDto,
  SubjectWithTopicsDto,
} from './dto/catalog-response.dto';
import { PaginatedQuestionsDto } from './dto/question-response.dto';

/**
 * Catálogo de classificação do banco de questões: disciplinas, assuntos e
 * provas. Os endpoints são públicos para usuários autenticados (qualquer
 * membro pode navegar o catálogo; o conteúdo das questões é que respeita o
 * acesso por workspace).
 */
@Injectable()
export class QuestionCatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly questionAccessService: QuestionAccessService,
    private readonly subjectsRepository: SubjectsRepository,
    private readonly examsRepository: ExamsRepository,
    private readonly questionsRepository: QuestionsRepository,
  ) {}

  async listSubjects(userId: string): Promise<SubjectResponseDto[]> {
    await this.questionAccessService.getPersonalWorkspaceOrThrow(userId);
    return this.subjectsRepository.findAll();
  }

  async listSubjectTopics(userId: string, subjectId: string): Promise<SubjectWithTopicsDto> {
    await this.questionAccessService.getPersonalWorkspaceOrThrow(userId);
    const subject = await this.subjectsRepository.findById(subjectId);
    if (!subject) throw new NotFoundException('Disciplina não encontrada.');

    const topics = await this.subjectsRepository.findTopicsBySubjectId(subjectId);
    return { ...subject, topics };
  }

  async getSubject(userId: string, subjectId: string): Promise<SubjectResponseDto> {
    await this.questionAccessService.getPersonalWorkspaceOrThrow(userId);
    const subject = await this.subjectsRepository.findById(subjectId);
    if (!subject) throw new NotFoundException('Disciplina não encontrada.');
    return subject;
  }

  async listExams(userId: string, page: number, limit: number): Promise<PaginatedExamsDto> {
    await this.questionAccessService.getPersonalWorkspaceOrThrow(userId);
    const [total, items] = await Promise.all([
      this.examsRepository.count(),
      this.examsRepository.findAll({ skip: (page - 1) * limit, take: limit }),
    ]);

    return { items, total, page, totalPages: Math.ceil(total / limit), limit };
  }

  /** Questões de uma prova específica (reaproveita a listagem de questões,
   * com paginação). Considera o banco central público e o workspace pessoal. */
  async listExamQuestions(
    userId: string,
    examId: string,
    query: QueryQuestionsDto,
  ): Promise<PaginatedQuestionsDto> {
    const [personal, bank] = await Promise.all([
      this.questionAccessService.getPersonalWorkspace(userId),
      this.questionAccessService.getBankWorkspace(),
    ]);
    const workspaceIds = unique(
      [personal?.id, bank?.id].filter((id): id is string => Boolean(id)),
    );
    const exam = await this.examsRepository.findById(examId);
    if (!exam) throw new NotFoundException('Prova não encontrada.');

    const where = {
      workspaceId: { in: workspaceIds },
      examId,
      ...(query.difficulty ? { difficulty: query.difficulty } : {}),
      ...(query.subjectId ? { subjectId: query.subjectId } : {}),
      ...(query.topicId ? { topicId: query.topicId } : {}),
      ...(query.sourceType ? { sourceType: query.sourceType } : {}),
    };

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const orderBy = resolveExamSort(query.sort);

    const [total, items, canManageBank] = await Promise.all([
      this.questionsRepository.count(where),
      this.questionsRepository.findMany(where, {
        skip: (page - 1) * limit,
        take: limit,
        orderBy,
      }),
      bank ? this.questionAccessService.hasManagePermission(userId, bank.id) : false,
    ]);

    return {
      items: items.map((question) => ({
        id: question.id,
        sourceType: question.sourceType,
        sourceName: question.sourceName,
        sourceId: question.sourceId,
        subject: question.subject,
        topic: question.topic,
        subjectId: question.subjectId,
        topicId: question.topicId,
        examId: question.examId,
        difficulty: question.difficulty,
        exam: question.exam,
        year: question.year,
        examNumber: question.examNumber,
        stem: question.stem,
        explanation: question.explanation,
        imageUrl: question.imageUrl,
        canManage:
          question.workspaceId === personal?.id ||
          (question.workspaceId === bank?.id && canManageBank),
        alternatives: question.alternatives.map((alternative) => ({
          id: alternative.id,
          text: alternative.text,
          position: alternative.position,
        })),
        createdAt: question.createdAt,
        updatedAt: question.updatedAt,
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
      limit,
    };
  }

  /** Provas antigas completas (PDF/páginas/gabarito) — item 19. Só as
   * publicadas aparecem para o aluno; rascunho/arquivada não têm fluxo de
   * autoria ainda (nenhuma tela de edição existe), então por ora ficam
   * simplesmente fora da listagem em vez de meio-visíveis. */
  async listExamPapers(userId: string) {
    await this.questionAccessService.getPersonalWorkspaceOrThrow(userId);
    return this.prisma.examPaper.findMany({
      where: { status: 'PUBLISHED' },
      include: { exam: { select: { id: true, name: true } } },
      orderBy: [{ year: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async getExamPaper(userId: string, paperId: string) {
    await this.questionAccessService.getPersonalWorkspaceOrThrow(userId);
    const paper = await this.prisma.examPaper.findFirst({
      where: { id: paperId, status: 'PUBLISHED' },
      include: { exam: { select: { id: true, name: true } } },
    });
    if (!paper) throw new NotFoundException('Prova não encontrada.');
    return paper;
  }

  async getExamPaperPages(userId: string, paperId: string) {
    await this.questionAccessService.getPersonalWorkspaceOrThrow(userId);
    await this.assertPublishedExamPaper(paperId);
    return this.prisma.examPaperPage.findMany({
      where: { paperId },
      orderBy: { pageNumber: 'asc' },
    });
  }

  async getExamPaperQuestions(userId: string, paperId: string) {
    await this.questionAccessService.getPersonalWorkspaceOrThrow(userId);
    await this.assertPublishedExamPaper(paperId);
    const rows = await this.prisma.examPaperQuestion.findMany({
      where: { paperId },
      include: { question: { select: { subject: true } } },
      orderBy: { number: 'asc' },
    });
    return rows.map((row) => ({
      id: row.id,
      number: row.number,
      pageNumber: row.pageNumber,
      boundsJson: row.boundsJson,
      area: row.area,
      subject: row.question.subject,
    }));
  }

  private async assertPublishedExamPaper(paperId: string): Promise<void> {
    const paper = await this.prisma.examPaper.findUnique({ where: { id: paperId } });
    if (!paper || paper.status !== 'PUBLISHED') {
      throw new NotFoundException('Prova não encontrada.');
    }
  }

  /** Quantas questões a edição comparada repete da edição base. Só faz
   * sentido dentro do mesmo vestibular: ENEM 2023 x FUVEST 2023 não tem
   * nenhuma relação, e o número misleadaria o aluno. */
  async compareExamPapers(userId: string, baseId: string, compareId: string) {
    await this.questionAccessService.getPersonalWorkspaceOrThrow(userId);
    if (baseId === compareId) throw new BadRequestException('Escolha duas edições diferentes.');

    const [base, compare] = await Promise.all([
      this.prisma.examPaper.findFirst({ where: { id: baseId, status: 'PUBLISHED' } }),
      this.prisma.examPaper.findFirst({ where: { id: compareId, status: 'PUBLISHED' } }),
    ]);
    if (!base || !compare) throw new NotFoundException('Prova não encontrada.');
    if (base.examId !== compare.examId) {
      throw new BadRequestException('Só é possível comparar edições do mesmo vestibular.');
    }

    const [baseRows, compareRows] = await Promise.all([
      this.prisma.examPaperQuestion.findMany({ where: { paperId: baseId }, select: { questionId: true } }),
      this.prisma.examPaperQuestion.findMany({ where: { paperId: compareId }, select: { questionId: true } }),
    ]);
    const baseIds = new Set(baseRows.map((row) => row.questionId));
    const compareIds = new Set(compareRows.map((row) => row.questionId));
    const repeated = [...compareIds].filter((questionId) => baseIds.has(questionId)).length;
    const union = new Set([...baseIds, ...compareIds]).size;
    return {
      base: { id: base.id, year: base.year },
      compare: { id: compare.id, year: compare.year },
      repeatedCount: repeated,
      newCount: compareIds.size - repeated,
      similarityScore: union === 0 ? 0 : Math.round((repeated / union) * 100),
    };
  }
}

/** Remove valores duplicados, preservando a ordem. */
function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

/** Ordenação padrão de questões de uma prova: por ano (decrescente) e número
 * na prova (crescente), a menos que o usuário peça uma ordenação explícita. */
function resolveExamSort(
  sort: QueryQuestionsDto['sort'],
): { year: 'desc' | 'asc'; examNumber: 'asc' | 'desc' } {
  switch (sort) {
    case 'year_asc':
      return { year: 'asc', examNumber: 'asc' };
    case 'year_desc':
    default:
      return { year: 'desc', examNumber: 'asc' };
  }
}
