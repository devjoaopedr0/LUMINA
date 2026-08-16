import { Injectable } from '@nestjs/common';
import { QuestionAccessService } from './question-access.service';
import { QuestionAttemptsRepository } from './question-attempts.repository';
import { UserQuestionProgressRepository, ProgressWithQuestion } from './user-question-progress.repository';
import {
  PaginatedProgressDto,
  PerformanceResponseDto,
  QuestionProgressDto,
  SubjectPerformanceDto,
  TopicPerformanceDto,
} from './dto/progress-response.dto';

/** Query aceita por GET /users/me/questions/progress e /favorites. */
export interface ProgressQuery {
  page?: number;
  limit?: number;
  favorites?: string;
}

/**
 * Desempenho do aluno: histórico de progresso por questão, favoritos e
 * estatísticas agregadas por disciplina/assunto. Estes dados são a base para
 * as futuras análises da LuminIA (dificuldades, revisões, recomendações).
 */
@Injectable()
export class QuestionPerformanceService {
  constructor(
    private readonly questionAccessService: QuestionAccessService,
    private readonly questionAttemptsRepository: QuestionAttemptsRepository,
    private readonly questionProgressRepository: UserQuestionProgressRepository,
  ) {}

  /** Progresso do usuário em questões (com filtro opcional de favoritos). */
  async getProgress(userId: string, query: ProgressQuery): Promise<PaginatedProgressDto> {
    await this.questionAccessService.getPersonalWorkspaceOrThrow(userId);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = query.favorites === 'true' ? { isFavorite: true } : undefined;

    const [total, rows] = await Promise.all([
      this.questionProgressRepository.countByUser(userId, where),
      this.questionProgressRepository.findManyByUser(userId, {
        skip: (page - 1) * limit,
        take: limit,
        where,
      }),
    ]);

    return {
      items: rows.map(toProgressDto),
      total,
      page,
      totalPages: Math.ceil(total / limit),
      limit,
    };
  }

  /** Apenas as questões favoritas do usuário. */
  async getFavorites(userId: string, query: ProgressQuery): Promise<PaginatedProgressDto> {
    return this.getProgress(userId, { ...query, favorites: 'true' });
  }

  /** Estatísticas de desempenho por disciplina e por assunto, agregadas do
   * histórico de tentativas. Considera os workspaces acessíveis do usuário
   * (pessoal + banco central). Alimenta os painéis e, no futuro, a LuminIA. */
  async getPerformance(userId: string): Promise<PerformanceResponseDto> {
    const [personal, bank] = await Promise.all([
      this.questionAccessService.getPersonalWorkspace(userId),
      this.questionAccessService.getBankWorkspace(),
    ]);
    const workspaceIds = unique(
      [personal?.id, bank?.id].filter((id): id is string => Boolean(id)),
    );
    const attempts = await this.questionAttemptsRepository.findByUser(userId, workspaceIds);

    const totalAttempts = attempts.length;
    const correct = attempts.filter((attempt) => attempt.isCorrect).length;

    return {
      summary: {
        totalAttempts,
        correct,
        accuracy: percentage(correct, totalAttempts),
      },
      bySubject: this.aggregateBySubject(attempts),
      byTopic: this.aggregateByTopic(attempts),
    };
  }

  private aggregateBySubject(
    attempts: { isCorrect: boolean; question: { subject: string } }[],
  ): SubjectPerformanceDto[] {
    const groups = new Map<string, { totalAttempts: number; correct: number }>();
    for (const attempt of attempts) {
      const current = groups.get(attempt.question.subject) ?? { totalAttempts: 0, correct: 0 };
      current.totalAttempts += 1;
      if (attempt.isCorrect) current.correct += 1;
      groups.set(attempt.question.subject, current);
    }

    return [...groups.entries()]
      .map(([subject, group]) => ({
        subject,
        subjectId: null,
        totalAttempts: group.totalAttempts,
        correct: group.correct,
        accuracy: percentage(group.correct, group.totalAttempts),
      }))
      .sort((a, b) => b.totalAttempts - a.totalAttempts);
  }

  private aggregateByTopic(
    attempts: { isCorrect: boolean; question: { subject: string; topic: string } }[],
  ): TopicPerformanceDto[] {
    const groups = new Map<string, { label: string; totalAttempts: number; correct: number }>();
    for (const attempt of attempts) {
      const label = attempt.question.topic || attempt.question.subject;
      const current = groups.get(label) ?? { label, totalAttempts: 0, correct: 0 };
      current.totalAttempts += 1;
      if (attempt.isCorrect) current.correct += 1;
      groups.set(label, current);
    }

    return [...groups.values()]
      .map((group) => ({
        topic: group.label,
        topicId: null,
        totalAttempts: group.totalAttempts,
        correct: group.correct,
        accuracy: percentage(group.correct, group.totalAttempts),
      }))
      .sort((a, b) => b.totalAttempts - a.totalAttempts);
  }
}

function toProgressDto(row: ProgressWithQuestion): QuestionProgressDto {
  return {
    questionId: row.questionId,
    subject: row.question.subject,
    topic: row.question.topic,
    exam: row.question.exam,
    year: row.question.year,
    stem: truncate(row.question.stem, 200),
    attempts: row.attempts,
    correctAttempts: row.correctAttempts,
    incorrectAttempts: row.incorrectAttempts,
    lastAttemptAt: row.lastAttemptAt,
    isFavorite: row.isFavorite,
    accuracy: percentage(row.correctAttempts, row.attempts),
  };
}

function percentage(correct: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((correct / total) * 1000) / 10;
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

/** Remove valores duplicados, preservando a ordem. */
function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}
