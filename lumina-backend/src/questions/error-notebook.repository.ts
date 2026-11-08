import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import {
  ERROR_NOTEBOOK_EVOLUTION_LIMIT,
  ERROR_NOTEBOOK_MASTERED_STREAK,
} from './dto/error-notebook.dto';
import { nextErrorReviewAt } from './review-schedule';

type Db = PrismaService | Prisma.TransactionClient;

/** Cliente de banco que o caderno aceita: a conexão principal ou a transação
 *  da tentativa (o registro do erro roda junto com o registro da tentativa). */
export type ErrorNotebookDb = Db;

/** Campos da questão que o caderno carrega junto do registro. É o suficiente
 *  para o cartão do caderno ser autossuficiente (matéria, assunto,
 *  dificuldade, enunciado) sem uma segunda consulta por item. */
const QUESTION_SUMMARY = {
  id: true,
  subject: true,
  topic: true,
  difficulty: true,
  exam: true,
  year: true,
  examNumber: true,
  stem: true,
} as const;

const QUESTION_INCLUDE = { question: { select: QUESTION_SUMMARY } } as const;

export type ErrorNotebookRow = Prisma.ErrorNotebookEntryGetPayload<{
  include: typeof QUESTION_INCLUDE;
}>;

/** Entrada com o resumo da questão, como a listagem devolve. */
export type ErrorNotebookWithQuestion = ErrorNotebookRow & {
  question: {
    id: string;
    subject: string;
    topic: string;
    difficulty: string;
    exam: string;
    year: number | null;
    examNumber: number | null;
    stem: string;
  };
};

/** Projeção enxuta para montar os recortes do caderno (contagens por matéria,
 * assunto, motivo). O caderno é dado do próprio aluno — poucas centenas de
 * linhas no máximo —, então agregar em memória é mais simples do que quatro
 * `groupBy` que o Prisma não consegue fazer sobre campos de relação. */
export type ErrorNotebookSlice = {
  questionId: string;
  subject: string;
  topic: string;
  difficulty: string;
  reason: string | null;
  status: string;
  reviewScheduledAt: Date | null;
};

const ENTRY_SELECT = {
  id: true,
  userId: true,
  questionId: true,
  reason: true,
  notes: true,
  status: true,
  wrongAttempts: true,
  correctStreak: true,
  evolution: true,
  reviewScheduledAt: true,
  firstWrongAt: true,
  lastWrongAt: true,
  resolvedAt: true,
  createdAt: true,
  updatedAt: true,
  question: { select: QUESTION_SUMMARY },
} as const;

/**
 * Acesso via Prisma a error_notebook_entries — o caderno de erros do aluno
 * (item 12) com a classificação do motivo (item 13).
 *
 * A escrita por tentativa mora aqui, e não no serviço, para que a regra do
 * caderno (errar cria e reabre; acertar duas vezes seguidas domina) fique em
 * um lugar só e rode dentro da mesma transação da tentativa.
 */
@Injectable()
export class ErrorNotebookRepository {
  constructor(private readonly prisma: PrismaService) {}

  find(userId: string, questionId: string, db: Db = this.prisma): Promise<ErrorNotebookRow | null> {
    return db.errorNotebookEntry.findUnique({
      where: { userId_questionId: { userId, questionId } },
      include: QUESTION_INCLUDE,
    });
  }

  /**
   * Registra um erro no caderno. Cria a entrada na primeira falha e, se já
   * existia, reabre: erro novo zera a sequência de acertos, soma um erro e
   * devolve a questão para a fila (status ABERTA, sem `resolvedAt`).
   */
  async registerWrongAttempt(
    userId: string,
    questionId: string,
    db: Db = this.prisma,
  ): Promise<ErrorNotebookRow> {
    const now = new Date();
    const reviewScheduledAt = nextErrorReviewAt(
      now,
      'WRONG',
      0,
      ERROR_NOTEBOOK_MASTERED_STREAK,
    );
    const entry = await db.errorNotebookEntry.upsert({
      where: { userId_questionId: { userId, questionId } },
      create: {
        userId,
        questionId,
        wrongAttempts: 1,
        correctStreak: 0,
        evolution: '',
        firstWrongAt: now,
        lastWrongAt: now,
        status: 'ABERTA',
        resolvedAt: null,
        reviewScheduledAt,
      },
      update: {
        wrongAttempts: { increment: 1 },
        correctStreak: 0,
        status: 'ABERTA',
        resolvedAt: null,
        lastWrongAt: now,
        reviewScheduledAt,
      },
      include: QUESTION_INCLUDE,
    });
    return this.appendEvolution(entry, 'E', db);
  }

  /**
   * Registra um acerto. Devolve null quando a questão não está no caderno —
   * acertar não cria nada, senão o caderno viraria histórico de acertos. Quando
   * a sequência de acertos fecha o critério de dominada, a entrada muda de
   * status e ganha `resolvedAt`.
   */
  async registerCorrectAttempt(
    userId: string,
    questionId: string,
    db: Db = this.prisma,
  ): Promise<ErrorNotebookRow | null> {
    const current = await this.find(userId, questionId, db);
    if (!current) return null;

    const now = new Date();
    // O incremento é atômico: duas requisições concorrentes não podem ler o
    // mesmo `correctStreak` e gravar 1 duas vezes. A primeira gravação apenas
    // estica a revisão; se a sequência resultante fechar o critério, uma
    // segunda gravação encerra a entrada com base no valor devolvido pelo banco.
    const updated = await db.errorNotebookEntry.update({
      where: { id: current.id },
      data: {
        correctStreak: { increment: 1 },
        reviewScheduledAt: nextErrorReviewAt(
          now,
          'CORRECT',
          1,
          ERROR_NOTEBOOK_MASTERED_STREAK,
        ),
      },
      include: QUESTION_INCLUDE,
    });
    const mastered = updated.correctStreak >= ERROR_NOTEBOOK_MASTERED_STREAK;
    const final = mastered
      ? await db.errorNotebookEntry.update({
          where: { id: updated.id },
          data: {
            status: 'DOMINADA',
            resolvedAt: updated.resolvedAt ?? now,
            reviewScheduledAt: null,
          },
          include: QUESTION_INCLUDE,
        })
      : updated;
    return this.appendEvolution(final, 'A', db);
  }

  /** Acréscimo de 'E' ou 'A' na linha do tempo, mantendo o tamanho limitado. */
  private async appendEvolution(
    entry: ErrorNotebookRow,
    mark: 'E' | 'A',
    db: Db,
  ): Promise<ErrorNotebookRow> {
    const evolution = `${entry.evolution}${mark}`.slice(-ERROR_NOTEBOOK_EVOLUTION_LIMIT);
    if (evolution === entry.evolution) return entry;
    return db.errorNotebookEntry.update({
      where: { id: entry.id },
      data: { evolution },
      include: QUESTION_INCLUDE,
    });
  }

  /** Entrada manual: o aluno registra uma questão que errou fora da plataforma
   *  (ou que quer revisitar mesmo tendo acertado aqui). */
  create(
    userId: string,
    questionId: string,
    data: { reason?: ErrorNotebookRow['reason']; notes?: string | null } = {},
    db: Db = this.prisma,
  ): Promise<ErrorNotebookRow> {
    return db.errorNotebookEntry.create({
      data: {
        userId,
        questionId,
        reason: data.reason ?? null,
        notes: data.notes ?? null,
        // Inclusão manual também entra na fila: sem data, a questão ficaria
        // aberta para sempre e nunca apareceria na central de revisões.
        reviewScheduledAt: nextErrorReviewAt(
          new Date(),
          'WRONG',
          0,
          ERROR_NOTEBOOK_MASTERED_STREAK,
        ),
      },
      include: QUESTION_INCLUDE,
    });
  }

  update(
    id: string,
    data: {
      reason?: ErrorNotebookRow['reason'];
      notes?: string | null;
      reviewScheduledAt?: Date | null;
    },
    db: Db = this.prisma,
  ): Promise<ErrorNotebookRow> {
    return db.errorNotebookEntry.update({
      where: { id },
      data: {
        ...(data.reason !== undefined ? { reason: data.reason } : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
        ...(data.reviewScheduledAt !== undefined
          ? { reviewScheduledAt: data.reviewScheduledAt }
          : {}),
      },
      include: QUESTION_INCLUDE,
    });
  }

  remove(userId: string, questionId: string, db: Db = this.prisma): Promise<{ count: number }> {
    return db.errorNotebookEntry.deleteMany({ where: { userId, questionId } });
  }

  findManyByUser(
    userId: string,
    options: { skip: number; take: number; where: Prisma.ErrorNotebookEntryWhereInput },
    db: Db = this.prisma,
  ): Promise<ErrorNotebookWithQuestion[]> {
    return db.errorNotebookEntry.findMany({
      where: { userId, ...options.where },
      skip: options.skip,
      take: options.take,
      // Abertas antes das dominadas, e dentro de cada grupo o erro mais
      // recente primeiro: o topo do caderno é o que mais dói.
      orderBy: [{ status: 'asc' }, { lastWrongAt: 'desc' }],
      select: ENTRY_SELECT,
    }) as Promise<ErrorNotebookWithQuestion[]>;
  }

  countByUser(
    userId: string,
    where: Prisma.ErrorNotebookEntryWhereInput = {},
    db: Db = this.prisma,
  ): Promise<number> {
    return db.errorNotebookEntry.count({ where: { userId, ...where } });
  }

  /** Todas as entradas em projeção enxuta, para os recortes do resumo. */
  async slices(userId: string, db: Db = this.prisma): Promise<ErrorNotebookSlice[]> {
    const rows: {
      questionId: string;
      reason: string | null;
      status: string;
      reviewScheduledAt: Date | null;
      question: { subject: string; topic: string; difficulty: string };
    }[] = await db.errorNotebookEntry.findMany({
      where: { userId },
      select: {
        questionId: true,
        reason: true,
        status: true,
        reviewScheduledAt: true,
        question: { select: { subject: true, topic: true, difficulty: true } },
      },
    });
    return rows.map((row) => ({
      questionId: row.questionId,
      subject: row.question.subject,
      topic: row.question.topic,
      difficulty: row.question.difficulty,
      reason: row.reason,
      status: row.status,
      reviewScheduledAt: row.reviewScheduledAt,
    }));
  }
}
