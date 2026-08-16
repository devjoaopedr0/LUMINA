import { Injectable } from '@nestjs/common';
import { Prisma, UserQuestionProgress } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

type Db = PrismaService | Prisma.TransactionClient;

export type ProgressWithQuestion = UserQuestionProgress & {
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

/**
 * Acesso via Prisma a user_question_progress — o acompanhamento da evolução
 * do aluno em cada questão (tentativas certas/erradas, último acesso,
 * favorito). É o dado que alimenta as futuras análises da LuminIA.
 */
@Injectable()
export class UserQuestionProgressRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Registra o resultado de uma nova tentativa, incrementando os contadores
   * de forma atômica (cria o registro no primeiro contato com a questão). */
  recordAttempt(
    userId: string,
    questionId: string,
    isCorrect: boolean,
    db: Db = this.prisma,
  ): Promise<UserQuestionProgress> {
    return db.userQuestionProgress.upsert({
      where: { userId_questionId: { userId, questionId } },
      update: {
        attempts: { increment: 1 },
        ...(isCorrect
          ? { correctAttempts: { increment: 1 } }
          : { incorrectAttempts: { increment: 1 } }),
        lastAttemptAt: new Date(),
      },
      create: {
        userId,
        questionId,
        attempts: 1,
        correctAttempts: isCorrect ? 1 : 0,
        incorrectAttempts: isCorrect ? 0 : 1,
        lastAttemptAt: new Date(),
      },
    });
  }

  find(userId: string, questionId: string, db: Db = this.prisma): Promise<UserQuestionProgress | null> {
    return db.userQuestionProgress.findUnique({
      where: { userId_questionId: { userId, questionId } },
    });
  }

  setFavorite(
    userId: string,
    questionId: string,
    isFavorite: boolean,
    db: Db = this.prisma,
  ): Promise<UserQuestionProgress> {
    return db.userQuestionProgress.upsert({
      where: { userId_questionId: { userId, questionId } },
      update: { isFavorite },
      create: { userId, questionId, isFavorite },
    });
  }

  findManyByUser(
    userId: string,
    options: { skip: number; take: number; where?: Prisma.UserQuestionProgressWhereInput },
    db: Db = this.prisma,
  ): Promise<ProgressWithQuestion[]> {
    return db.userQuestionProgress.findMany({
      where: { userId, ...options.where },
      skip: options.skip,
      take: options.take,
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        userId: true,
        questionId: true,
        attempts: true,
        correctAttempts: true,
        incorrectAttempts: true,
        lastAttemptAt: true,
        isFavorite: true,
        createdAt: true,
        updatedAt: true,
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

  countByUser(
    userId: string,
    where?: Prisma.UserQuestionProgressWhereInput,
    db: Db = this.prisma,
  ): Promise<number> {
    return db.userQuestionProgress.count({ where: { userId, ...where } });
  }
}
