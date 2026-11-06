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

export interface AttemptCounts {
  attempts: number;
  correct: number;
}

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

  /** Última tentativa do usuário numa questão. A LuminIA usa isto para saber
   * se pode comentar o gabarito e qual alternativa o aluno marcou. */
  findLatestForUser(
    userId: string,
    questionId: string,
    db: Db = this.prisma,
  ): Promise<QuestionAttempt | null> {
    return db.questionAttempt.findFirst({
      where: { userId, questionId },
      orderBy: { createdAt: 'desc' },
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

  /** Contagens agregadas de tentativas por questão — base das estatísticas de
   * acerto do banco. Usa findMany + select (e não groupBy) para funcionar
   * igualmente no fake de testes e em drivers sem suporte a groupBy. */
  async countsByQuestionIds(
    questionIds: string[],
    db: Db = this.prisma,
  ): Promise<Map<string, AttemptCounts>> {
    const ids = [...new Set(questionIds)];
    if (ids.length === 0) return new Map();

    const rows = await db.questionAttempt.findMany({
      where: { questionId: { in: ids } },
      select: { questionId: true, isCorrect: true },
    });

    const counts = new Map<string, AttemptCounts>();
    for (const row of rows) {
      const current = counts.get(row.questionId) ?? { attempts: 0, correct: 0 };
      current.attempts += 1;
      if (row.isCorrect) current.correct += 1;
      counts.set(row.questionId, current);
    }
    return counts;
  }
}
