import { Injectable } from '@nestjs/common';
import { QuestionDifficulty } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { areaOfSubjectName } from '../schedules/study-areas';
import { calibrateQuestions, type QuestionCalibration, type QuestionResponseStats } from './question-calibration';

/** A calibração muda devagar (precisa de muitas respostas novas): uma hora basta. */
const CACHE_MS = 60 * 60_000;

/**
 * Lê as primeiras respostas de todos os alunos — avulsas e de simulados — e
 * devolve o ajuste de dificuldade de cada questão (question-calibration.ts).
 *
 * Calcula o banco inteiro de uma vez, porque a referência de cada nível depende
 * de todas as questões dele, e guarda em memória. Com muito mais respostas do
 * que hoje, vale trocar por uma tabela atualizada em segundo plano.
 */
@Injectable()
export class QuestionCalibrationService {
  private cache: { at: number; value: Promise<Map<string, QuestionCalibration>> } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async all(): Promise<Map<string, QuestionCalibration>> {
    if (!this.cache || Date.now() - this.cache.at > CACHE_MS) {
      const value = this.compute();
      this.cache = { at: Date.now(), value };
      // Se falhar, a próxima chamada tenta de novo em vez de repetir o erro.
      value.catch(() => (this.cache = null));
    }
    return this.cache.value;
  }

  /** Ajuste de b por questão; questões sem dado suficiente ficam fora (0). */
  async offsets(questionIds: string[]): Promise<Map<string, number>> {
    const calibration = await this.all();
    const offsets = new Map<string, number>();
    for (const id of questionIds) {
      const offset = calibration.get(id)?.offset ?? 0;
      if (offset !== 0) offsets.set(id, offset);
    }
    return offsets;
  }

  private async compute(): Promise<Map<string, QuestionCalibration>> {
    const [attempts, submissions] = await Promise.all([
      // Primeira tentativa de cada aluno em cada questão.
      this.prisma.$queryRaw<{ user_id: string; question_id: string; is_correct: boolean; created_at: Date }[]>`
        SELECT DISTINCT ON (user_id, question_id) user_id, question_id, is_correct, created_at
        FROM question_attempts
        ORDER BY user_id, question_id, created_at`,
      this.prisma.simulationSubmission.findMany({
        select: {
          userId: true,
          answers: true,
          submittedAt: true,
          simulation: { select: { items: { select: { position: true, correctPosition: true, questionId: true } } } },
        },
      }),
    ]);

    // Por aluno e questão, vale a resposta mais antiga de qualquer origem.
    const first = new Map<string, { questionId: string; isCorrect: boolean; at: number }>();
    const keep = (userId: string, questionId: string, isCorrect: boolean, at: Date) => {
      const key = `${userId}:${questionId}`;
      const current = first.get(key);
      if (!current || at.getTime() < current.at) first.set(key, { questionId, isCorrect, at: at.getTime() });
    };
    for (const attempt of attempts) keep(attempt.user_id, attempt.question_id, attempt.is_correct, attempt.created_at);
    for (const submission of submissions) {
      const chosen = new Map(
        (submission.answers as { position: number; selectedPosition: number }[]).map((a) => [a.position, a.selectedPosition]),
      );
      for (const item of submission.simulation.items) {
        // Em branco (0) conta como erro, como na nota.
        if (item.questionId) keep(submission.userId, item.questionId, chosen.get(item.position) === item.correctPosition, submission.submittedAt);
      }
    }

    const counts = new Map<string, { respondents: number; correct: number }>();
    for (const answer of first.values()) {
      const count = counts.get(answer.questionId) ?? { respondents: 0, correct: 0 };
      count.respondents += 1;
      if (answer.isCorrect) count.correct += 1;
      counts.set(answer.questionId, count);
    }
    if (counts.size === 0) return new Map();

    const questions = await this.prisma.question.findMany({
      where: { id: { in: [...counts.keys()] } },
      select: {
        id: true,
        difficulty: true,
        subject: true,
        subjectRef: { select: { name: true } },
        _count: { select: { alternatives: true } },
      },
    });
    const stats: QuestionResponseStats[] = [];
    for (const question of questions) {
      const area = areaOfSubjectName(question.subjectRef?.name ?? question.subject);
      if (!area) continue;
      stats.push({
        questionId: question.id,
        area,
        difficulty: question.difficulty ?? QuestionDifficulty.MEDIA,
        alternatives: question._count?.alternatives || undefined,
        ...counts.get(question.id)!,
      });
    }
    return calibrateQuestions(stats);
  }
}
