import { Injectable } from '@nestjs/common';
import {
  ErrorNotebookStatus,
  Prisma,
  TopicMasteryStatus,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import {
  ReviewQueueItemDto,
  ReviewQueueResponseDto,
} from './dto/review-queue.dto';

const DEFAULT_QUEUE_LIMIT = 20;
const MAX_QUEUE_LIMIT = 100;

const QUESTION_SELECT = {
  id: true,
  subject: true,
  topic: true,
  subjectId: true,
  topicId: true,
  difficulty: true,
  exam: true,
  year: true,
  stem: true,
} as const;

const TOPIC_SELECT = {
  id: true,
  subjectId: true,
  topicId: true,
  masteryScore: true,
  attempts: true,
  correctAttempts: true,
  status: true,
  nextReviewAt: true,
  subject: { select: { name: true } },
  topic: { select: { name: true } },
} as const;

const ERROR_SELECT = {
  questionId: true,
  wrongAttempts: true,
  correctStreak: true,
  reviewScheduledAt: true,
  question: { select: QUESTION_SELECT },
} as const;

const MARKED_SELECT = {
  questionId: true,
  attempts: true,
  correctAttempts: true,
  lastAttemptAt: true,
  question: { select: QUESTION_SELECT },
} as const;

type TopicQueueRow = Prisma.TopicMasteryGetPayload<{ select: typeof TOPIC_SELECT }>;
type ErrorQueueRow = Prisma.ErrorNotebookEntryGetPayload<{ select: typeof ERROR_SELECT }>;
type MarkedQueueRow = Prisma.UserQuestionProgressGetPayload<{ select: typeof MARKED_SELECT }>;

export interface ReviewQueueQuery {
  limit?: number;
}

/**
 * Central de revisões (item 31). Junta as três dívidas de estudo que já
 * existiam separadas:
 *
 * - tópicos com `TopicMastery.nextReviewAt` vencido (cronograma adaptativo);
 * - questões abertas do caderno de erros com `reviewScheduledAt` vencido;
 * - questões que o aluno marcou manualmente para revisar.
 *
 * A fila manual não tem data: é um compromisso explícito do aluno, não uma
 * repetição espaçada. Por isso ela aparece separada e não entra no total de
 * "vencidas hoje". Flashcards ainda não existem (item 32); nenhum item falso é
 * criado no lugar deles.
 */
@Injectable()
export class ReviewQueueService {
  constructor(private readonly prisma: PrismaService) {}

  async getQueue(userId: string, query: ReviewQueueQuery = {}): Promise<ReviewQueueResponseDto> {
    // `?limit=abc` chega como NaN; sem esta guarda o Prisma receberia `take:
    // NaN` e a requisição inteira falharia por um parâmetro cosmético.
    const requested = query.limit;
    const limit = Number.isFinite(requested)
      ? Math.min(MAX_QUEUE_LIMIT, Math.max(1, Math.trunc(requested!)))
      : DEFAULT_QUEUE_LIMIT;
    const now = new Date();

    const dueTopicWhere: Prisma.TopicMasteryWhereInput = {
      userId,
      status: { not: TopicMasteryStatus.NAO_ESTUDADO },
      nextReviewAt: { not: null, lte: now },
    };
    const dueErrorWhere: Prisma.ErrorNotebookEntryWhereInput = {
      userId,
      status: ErrorNotebookStatus.ABERTA,
      reviewScheduledAt: { not: null, lte: now },
    };
    const markedWhere: Prisma.UserQuestionProgressWhereInput = {
      userId,
      markedForReview: true,
    };

    const [
      topicRows,
      errorRows,
      topics,
      errorNotebook,
      nextTopic,
      nextError,
      openErrorRows,
    ] = await Promise.all([
      this.prisma.topicMastery.findMany({
        where: dueTopicWhere,
        select: TOPIC_SELECT,
        orderBy: { nextReviewAt: 'asc' },
        take: limit,
      }),
      this.prisma.errorNotebookEntry.findMany({
        where: dueErrorWhere,
        select: ERROR_SELECT,
        orderBy: { reviewScheduledAt: 'asc' },
        take: limit,
      }),
      this.prisma.topicMastery.count({ where: dueTopicWhere }),
      this.prisma.errorNotebookEntry.count({ where: dueErrorWhere }),
      this.prisma.topicMastery.findFirst({
        where: {
          userId,
          status: { not: TopicMasteryStatus.NAO_ESTUDADO },
          nextReviewAt: { gt: now },
        },
        select: { nextReviewAt: true },
        orderBy: { nextReviewAt: 'asc' },
      }),
      this.prisma.errorNotebookEntry.findFirst({
        where: {
          userId,
          status: ErrorNotebookStatus.ABERTA,
          reviewScheduledAt: { gt: now },
        },
        select: { reviewScheduledAt: true },
        orderBy: { reviewScheduledAt: 'asc' },
      }),
      // A fila manual não deve repetir uma questão que já está no caderno de
      // erros: o caderno tem o histórico que explica por que ela voltou.
      this.prisma.errorNotebookEntry.findMany({
        where: { userId, status: ErrorNotebookStatus.ABERTA },
        select: { questionId: true },
      }),
    ]);

    const openErrorIds = [...new Set(openErrorRows.map((row) => row.questionId))];
    const manualWhere: Prisma.UserQuestionProgressWhereInput = openErrorIds.length
      ? { ...markedWhere, questionId: { notIn: openErrorIds } }
      : markedWhere;
    const [markedRows, markedTotal] = await Promise.all([
      this.prisma.userQuestionProgress.findMany({
        where: manualWhere,
        select: MARKED_SELECT,
        orderBy: [{ lastAttemptAt: 'desc' }, { updatedAt: 'desc' }],
        take: limit,
      }),
      this.prisma.userQuestionProgress.count({ where: manualWhere }),
    ]);

    const dueItems = [
      ...topicRows.map(toTopicItem),
      ...errorRows.map(toErrorItem),
    ]
      .sort(compareDue)
      .slice(0, limit);
    const manualItems = markedRows.map(toMarkedItem).slice(0, limit);

    return {
      generatedAt: now.toISOString(),
      due: {
        total: topics + errorNotebook,
        topics,
        errorNotebook,
        items: dueItems,
        truncated: topics + errorNotebook > dueItems.length,
      },
      manual: {
        total: markedTotal,
        items: manualItems,
        truncated: markedTotal > manualItems.length,
      },
      nextReviewAt: earliestIso([
        nextTopic?.nextReviewAt ?? null,
        nextError?.reviewScheduledAt ?? null,
      ]),
    };
  }
}

function toTopicItem(row: TopicQueueRow): ReviewQueueItemDto {
  return {
    kind: 'TOPIC',
    id: row.id,
    questionId: null,
    subjectId: row.subjectId,
    subject: row.subject.name,
    topicId: row.topicId,
    topic: row.topic.name,
    dueAt: row.nextReviewAt?.toISOString() ?? null,
    masteryScore: row.masteryScore,
    status: row.status,
    attempts: row.attempts,
    correctAttempts: row.correctAttempts,
    accuracy: row.attempts > 0 ? Math.round((row.correctAttempts / row.attempts) * 100) : null,
    wrongAttempts: null,
    correctStreak: null,
    difficulty: null,
    exam: null,
    year: null,
    stem: null,
    lastAttemptAt: null,
  };
}

function toErrorItem(row: ErrorQueueRow): ReviewQueueItemDto {
  return {
    kind: 'ERROR_NOTEBOOK',
    id: row.questionId,
    questionId: row.questionId,
    subjectId: row.question.subjectId,
    subject: row.question.subject,
    topicId: row.question.topicId,
    topic: row.question.topic,
    dueAt: row.reviewScheduledAt?.toISOString() ?? null,
    masteryScore: null,
    status: ErrorNotebookStatus.ABERTA,
    attempts: null,
    correctAttempts: null,
    accuracy: null,
    wrongAttempts: row.wrongAttempts,
    correctStreak: row.correctStreak,
    difficulty: row.question.difficulty,
    exam: row.question.exam,
    year: row.question.year,
    stem: row.question.stem,
    lastAttemptAt: null,
  };
}

function toMarkedItem(row: MarkedQueueRow): ReviewQueueItemDto {
  return {
    kind: 'MARKED_QUESTION',
    id: row.questionId,
    questionId: row.questionId,
    subjectId: row.question.subjectId,
    subject: row.question.subject,
    topicId: row.question.topicId,
    topic: row.question.topic,
    dueAt: null,
    masteryScore: null,
    status: null,
    attempts: row.attempts,
    correctAttempts: row.correctAttempts,
    accuracy: row.attempts > 0 ? Math.round((row.correctAttempts / row.attempts) * 100) : null,
    wrongAttempts: null,
    correctStreak: null,
    difficulty: row.question.difficulty,
    exam: row.question.exam,
    year: row.question.year,
    stem: row.question.stem,
    lastAttemptAt: row.lastAttemptAt?.toISOString() ?? null,
  };
}

function compareDue(a: ReviewQueueItemDto, b: ReviewQueueItemDto): number {
  const left = a.dueAt ? Date.parse(a.dueAt) : Number.POSITIVE_INFINITY;
  const right = b.dueAt ? Date.parse(b.dueAt) : Number.POSITIVE_INFINITY;
  if (left !== right) return left - right;
  return a.kind.localeCompare(b.kind);
}

function earliestIso(values: (Date | null | undefined)[]): string | null {
  let earliest: Date | null = null;
  for (const value of values) {
    if (!value) continue;
    if (!earliest || value.getTime() < earliest.getTime()) earliest = value;
  }
  return earliest?.toISOString() ?? null;
}
