import { Injectable } from '@nestjs/common';
import {
  Prisma,
  Question,
  QuestionDifficulty,
  QuestionAlternative,
  QuestionSourceType,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

type Db = PrismaService | Prisma.TransactionClient;

/** Questão já com as alternativas em ordem de posição. */
export type QuestionWithAlternatives = Question & {
  alternatives: QuestionAlternative[];
};

export interface CreateQuestionData {
  workspaceId: string;
  createdBy: string | null;
  sourceType: QuestionSourceType;
  sourceName: string;
  sourceId: string | null;
  contentHash: string | null;
  subject: string;
  topic: string;
  difficulty: QuestionDifficulty;
  exam: string;
  year: number | null;
  examNumber: number | null;
  stem: string;
  explanation: string | null;
  imageUrl: string | null;
  subjectId?: string | null;
  topicId?: string | null;
  examId?: string | null;
  metadata?: Prisma.JsonValue | null;
  alternatives: { text: string; position: number; isCorrect: boolean; explanation?: string | null }[];
}

export interface FindManyOptions {
  skip: number;
  take: number;
  orderBy?: Prisma.QuestionOrderByWithRelationInput | Prisma.QuestionOrderByWithRelationInput[];
}

const WITH_ALTERNATIVES = {
  alternatives: { orderBy: { position: 'asc' as const } },
} satisfies Prisma.QuestionInclude;

/**
 * Repository Pattern: isola todo acesso via Prisma às tabelas questions/
 * question_alternatives. Services dependem desta classe, nunca do
 * PrismaService diretamente para consultas de questões.
 */
@Injectable()
export class QuestionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string, db: Db = this.prisma): Promise<QuestionWithAlternatives | null> {
    return db.question.findUnique({
      where: { id },
      include: WITH_ALTERNATIVES,
    });
  }

  create(data: CreateQuestionData, db: Db = this.prisma): Promise<QuestionWithAlternatives> {
    return db.question.create({
      data: {
        workspaceId: data.workspaceId,
        createdBy: data.createdBy,
        sourceType: data.sourceType,
        sourceName: data.sourceName,
        sourceId: data.sourceId,
        contentHash: data.contentHash,
        subject: data.subject,
        topic: data.topic,
        difficulty: data.difficulty,
        exam: data.exam,
        year: data.year,
        examNumber: data.examNumber,
        stem: data.stem,
        explanation: data.explanation,
        imageUrl: data.imageUrl,
        subjectId: data.subjectId ?? null,
        topicId: data.topicId ?? null,
        examId: data.examId ?? null,
        metadata: data.metadata ?? undefined,
        alternatives: { create: data.alternatives },
      },
      include: WITH_ALTERNATIVES,
    });
  }

  updateFields(
    id: string,
    data: Prisma.QuestionUpdateInput,
    db: Db = this.prisma,
  ): Promise<QuestionWithAlternatives> {
    return db.question.update({
      where: { id },
      data,
      include: WITH_ALTERNATIVES,
    });
  }

  delete(id: string, db: Db = this.prisma): Promise<Question> {
    return db.question.delete({ where: { id } });
  }

  count(where: Prisma.QuestionWhereInput, db: Db = this.prisma): Promise<number> {
    return db.question.count({ where });
  }

  findMany(
    where: Prisma.QuestionWhereInput,
    options: FindManyOptions,
    db: Db = this.prisma,
  ): Promise<QuestionWithAlternatives[]> {
    return db.question.findMany({
      where,
      skip: options.skip,
      take: options.take,
      orderBy: options.orderBy ?? { createdAt: 'desc' },
      include: WITH_ALTERNATIVES,
    });
  }

  /** Deduplicação por conteúdo normalizado (hash sha256) — pega questões
   * equivalentes mesmo de fontes diferentes, sem id oficial. */
  findByContentHash(
    workspaceId: string,
    contentHash: string,
    db: Db = this.prisma,
  ): Promise<Question | null> {
    return db.question.findFirst({
      where: { workspaceId, contentHash },
    });
  }

  /** Deduplicação pelo identificador oficial da fonte (sourceType+sourceId). */
  findBySourceKey(
    workspaceId: string,
    sourceType: QuestionSourceType,
    sourceId: string,
    db: Db = this.prisma,
  ): Promise<Question | null> {
    return db.question.findFirst({
      where: { workspaceId, sourceType, sourceId },
    });
  }

  deleteAlternatives(questionId: string, db: Db = this.prisma): Promise<Prisma.BatchPayload> {
    return db.questionAlternative.deleteMany({ where: { questionId } });
  }

  createAlternatives(
    questionId: string,
    alternatives: { text: string; position: number; isCorrect: boolean; explanation?: string | null }[],
    db: Db = this.prisma,
  ): Promise<Prisma.BatchPayload> {
    return db.questionAlternative.createMany({
      data: alternatives.map((alternative) => ({ ...alternative, questionId })),
    });
  }
}
