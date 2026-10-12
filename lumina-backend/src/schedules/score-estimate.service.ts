import { Injectable } from '@nestjs/common';
import { EssayCorrectionStatus, QuestionDifficulty, StudyArea } from '@prisma/client';
import { CutoffsService } from '../cutoffs/cutoffs.service';
import { PrismaService } from '../database/prisma.service';
import { buildScoreEstimate, type AreaAnswer, type ScoreEstimate } from './score-estimate';
import { STUDY_AREA_LABEL, STUDY_SUBJECT_CODE_TO_AREA } from './study-areas';
import { STUDY_SUBJECT_CODE_TO_SUBJECT_NAME } from './study-subject-question-bank-map';

/** Só o desempenho recente conta: quem estudou evoluiu desde o começo. */
const ESTIMATE_WINDOW_DAYS = 120;
/** Redação: média das últimas correções concluídas. */
const ESSAY_CORRECTIONS = 3;

/** Área do ENEM de cada matéria do banco de questões, pelo nome dela. */
const AREA_BY_SUBJECT_NAME = new Map<string, StudyArea>(
  Object.entries(STUDY_SUBJECT_CODE_TO_SUBJECT_NAME)
    .filter(([code]) => code in STUDY_SUBJECT_CODE_TO_AREA)
    .map(([code, name]) => [name, STUDY_SUBJECT_CODE_TO_AREA[code]]),
);

@Injectable()
export class ScoreEstimateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cutoffs: CutoffsService,
  ) {}

  /**
   * Estimativa da nota do ENEM do aluno — ver score-estimate.ts para o
   * método e os limites. Cada questão conta uma vez, pela PRIMEIRA resposta
   * do período (refazer depois de ver o gabarito não mede o que ele sabe);
   * entram as respostas avulsas e as dos simulados enviados.
   */
  async forUser(userId: string): Promise<ScoreEstimate> {
    const since = new Date(Date.now() - ESTIMATE_WINDOW_DAYS * 86_400_000);
    const [attempts, submissions, corrections, cutoff] = await Promise.all([
      this.prisma.questionAttempt.findMany({
        where: { userId, createdAt: { gte: since } },
        orderBy: { createdAt: 'asc' },
        select: { questionId: true, isCorrect: true, createdAt: true },
      }),
      this.prisma.simulationSubmission.findMany({
        where: { userId, submittedAt: { gte: since } },
        select: {
          answers: true,
          submittedAt: true,
          simulation: { select: { items: { select: { position: true, correctPosition: true, questionId: true } } } },
        },
      }),
      this.prisma.essayCorrection.findMany({
        where: { status: EssayCorrectionStatus.COMPLETED, essay: { userId } },
        orderBy: { updatedAt: 'desc' },
        take: ESSAY_CORRECTIONS,
        select: { totalScore: true },
      }),
      this.cutoffs.targetForUser(userId),
    ]);

    // Primeira resposta de cada questão, venha de onde vier.
    const answers = [
      ...attempts.map((attempt) => ({ questionId: attempt.questionId, isCorrect: attempt.isCorrect, at: attempt.createdAt })),
      ...submissions.flatMap((submission) => {
        const chosen = new Map(
          (submission.answers as { position: number; selectedPosition: number }[]).map((a) => [a.position, a.selectedPosition]),
        );
        return submission.simulation.items
          .filter((item) => item.questionId)
          .map((item) => ({
            questionId: item.questionId!,
            isCorrect: chosen.get(item.position) === item.correctPosition,
            at: submission.submittedAt,
          }));
      }),
    ].sort((a, b) => a.at.getTime() - b.at.getTime());
    const firstAnswer = new Map<string, boolean>();
    for (const answer of answers) {
      if (!firstAnswer.has(answer.questionId)) firstAnswer.set(answer.questionId, answer.isCorrect);
    }

    const questions = firstAnswer.size
      ? await this.prisma.question.findMany({
          where: { id: { in: [...firstAnswer.keys()] } },
          select: { id: true, difficulty: true, subject: true, subjectRef: { select: { name: true } } },
        })
      : [];
    const answersByArea: Partial<Record<StudyArea, AreaAnswer[]>> = {};
    for (const question of questions) {
      // Questão antiga sem matéria estruturada: vale o nome em texto.
      const area = AREA_BY_SUBJECT_NAME.get(question.subjectRef?.name ?? question.subject);
      if (!area) continue;
      (answersByArea[area] ??= []).push({
        isCorrect: firstAnswer.get(question.id)!,
        difficulty: question.difficulty ?? QuestionDifficulty.MEDIA,
      });
    }

    return buildScoreEstimate({
      answersByArea,
      areaLabels: STUDY_AREA_LABEL,
      essayScores: corrections.map((correction) => correction.totalScore),
      target:
        cutoff.status === 'OK' && cutoff.targetScore !== null
          ? { score: cutoff.targetScore, course: cutoff.course, university: cutoff.university, year: cutoff.projectedYear }
          : null,
    });
  }
}
