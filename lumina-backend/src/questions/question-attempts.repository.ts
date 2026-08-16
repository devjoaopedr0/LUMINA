import { Injectable } from '@nestjs/common';
import { Prisma, QuestionAttempt } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

type Db = PrismaService | Prisma.TransactionClient;

export interface CreateAttemptData {
  questionId: string;
  workspaceId: string;
  userId: string;
  selectedPosition: number;
  isCorrect: boolean;
  timeSpent?: number | null;
}

export type AttemptWithQuestion = QuestionAttempt & {
  question: {
    id: string;
    subject: string;
    topic: string;
    difficulty: string;
    exam: string;
    year: number | null;
    stem: string;
  };
};

/** Acesso via Prisma à tabela question_attempts (histórico de respostas). */
@Injectable()
export class QuestionAttemptsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: CreateAttemptData, db: Db = this.prisma): Promise<QuestionAttempt> {
    return db.questionAttempt.create({
      data: {
        questionId: data.questionId,
        workspaceId: data.workspaceId,
        userId: data.userId,
        selectedPosition: data.selectedPosition,
        isCorrect: data.isCorrect,
        timeSpent: data.timeSpent ?? null,
      },
    });
  }

  /** Histórico de tentativas do usuário nos workspaces acessíveis (pessoal +
   * banco central), com a classificação da questão — base para as estatísticas
   * de desempenho por disciplina/assunto. */
  findByUser(
    userId: string,
    workspaceIds: string[],
    take = 500,
    db: Db = this.prisma,
  ): Promise<AttemptWithQuestion[]> {
    return db.questionAttempt.findMany({
      where: { userId, workspaceId: { in: workspaceIds } },
      take,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        questionId: true,
        workspaceId: true,
        userId: true,
        selectedPosition: true,
        isCorrect: true,
        timeSpent: true,
        createdAt: true,
        question: {
          select: {
            id: true,
            subject: true,
            topic: true,
            difficulty: true,
            exam: true,
            year: true,
            stem: true,
          },
        },
      },
    });
  }
}
