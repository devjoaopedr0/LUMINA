import { Injectable } from '@nestjs/common';
import { EssayCorrectionStatus, QuestionDifficulty, StudyArea } from '@prisma/client';
import { CutoffsService } from '../cutoffs/cutoffs.service';
import { PrismaService } from '../database/prisma.service';
import { buildScoreEstimate, type AreaAnswer, type ScoreEstimate } from './score-estimate';
import { STUDY_AREA_LABEL, areaOfSubjectName } from './study-areas';

/** Só o desempenho recente conta: quem estudou evoluiu desde o começo. */
const ESTIMATE_WINDOW_DAYS = 120;
/** Redação: média das últimas correções concluídas. */
const ESSAY_CORRECTIONS = 3;
/** Quantas semanas a evolução da estimativa mostra. */
export const SCORE_HISTORY_WEEKS = 8;
const DAY_MS = 86_400_000;
/** Brasília está 3 horas atrás do UTC (sem horário de verão). */
const BRAZIL_UTC_OFFSET_MS = 3 * 3_600_000;

/** Uma resposta do aluno a uma questão do banco, de qualquer origem. */
interface Answer {
  questionId: string;
  isCorrect: boolean;
  at: Date;
  area: StudyArea;
  difficulty: QuestionDifficulty;
  alternatives?: number;
}

interface EstimateData {
  /** Em ordem de data. */
  answers: Answer[];
  /** Da mais recente para a mais antiga. */
  essays: { score: number; at: Date }[];
  target: ScoreEstimate['target'];
}

export interface ScoreHistoryPoint {
  /** Domingo e sábado da semana, AAAA-MM-DD. */
  weekStart: string;
  weekEnd: string;
  /** Média estimada ao fim da semana; null se ainda não havia dados suficientes. */
  estimate: number | null;
  low: number | null;
  high: number | null;
  /** Quantas das 5 notas entraram na média. */
  parts: number;
}

@Injectable()
export class ScoreEstimateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cutoffs: CutoffsService,
  ) {}

  /**
   * Estimativa da nota do ENEM do aluno hoje — ver score-estimate.ts para o
   * método e os limites. Cada questão conta uma vez, pela PRIMEIRA resposta
   * do período (refazer depois de ver o gabarito não mede o que ele sabe);
   * entram as respostas avulsas e as dos simulados enviados.
   */
  async forUser(userId: string): Promise<ScoreEstimate> {
    const now = new Date();
    return this.estimateAsOf(await this.load(userId, new Date(now.getTime() - ESTIMATE_WINDOW_DAYS * DAY_MS)), now);
  }

  /**
   * A estimativa ao fim de cada uma das últimas semanas (a atual vai até
   * agora). Não depende de nada guardado: é recalculada pelas respostas, que
   * têm data — por isso vale também para as semanas anteriores a este recurso.
   */
  async history(userId: string, weeks = SCORE_HISTORY_WEEKS): Promise<ScoreHistoryPoint[]> {
    const now = new Date();
    // Domingo desta semana, em Brasília, como data pura (meia-noite UTC).
    const local = new Date(now.getTime() - BRAZIL_UTC_OFFSET_MS);
    const thisSunday = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - local.getUTCDay());
    const firstSunday = thisSunday - (weeks - 1) * 7 * DAY_MS;
    const data = await this.load(userId, new Date(firstSunday - ESTIMATE_WINDOW_DAYS * DAY_MS));

    const fmt = (time: number) => new Date(time).toISOString().slice(0, 10);
    return Array.from({ length: weeks }, (_, index) => {
      const sunday = firstSunday + index * 7 * DAY_MS;
      // A semana acaba à meia-noite de Brasília do domingo seguinte.
      const end = new Date(Math.min(now.getTime(), sunday + 7 * DAY_MS + BRAZIL_UTC_OFFSET_MS));
      const { average } = this.estimateAsOf(data, end);
      return {
        weekStart: fmt(sunday),
        weekEnd: fmt(sunday + 6 * DAY_MS),
        estimate: average?.estimate ?? null,
        low: average?.low ?? null,
        high: average?.high ?? null,
        parts: average?.parts ?? 0,
      };
    });
  }

  /** A estimativa como seria calculada no instante `asOf`. */
  private estimateAsOf(data: EstimateData, asOf: Date): ScoreEstimate {
    const from = asOf.getTime() - ESTIMATE_WINDOW_DAYS * DAY_MS;
    const first = new Map<string, Answer>();
    for (const answer of data.answers) {
      const time = answer.at.getTime();
      if (time < from || time > asOf.getTime()) continue;
      if (!first.has(answer.questionId)) first.set(answer.questionId, answer);
    }
    const answersByArea: Partial<Record<StudyArea, AreaAnswer[]>> = {};
    for (const answer of first.values()) {
      (answersByArea[answer.area] ??= []).push({
        isCorrect: answer.isCorrect,
        difficulty: answer.difficulty,
        alternatives: answer.alternatives,
      });
    }
    return buildScoreEstimate({
      answersByArea,
      areaLabels: STUDY_AREA_LABEL,
      essayScores: data.essays
        .filter((essay) => essay.at <= asOf)
        .slice(0, ESSAY_CORRECTIONS)
        .map((essay) => essay.score),
      target: data.target,
    });
  }

  /** Respostas (avulsas e de simulados) desde `since`, com a área e a
   *  dificuldade de cada questão, mais as redações corrigidas e a meta. */
  private async load(userId: string, since: Date): Promise<EstimateData> {
    const [attempts, submissions, corrections, cutoff] = await Promise.all([
      this.prisma.questionAttempt.findMany({
        where: { userId, createdAt: { gte: since } },
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
        select: { totalScore: true, updatedAt: true },
      }),
      this.cutoffs.targetForUser(userId),
    ]);

    const raw = [
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
    ];

    const questionIds = [...new Set(raw.map((answer) => answer.questionId))];
    const questions = questionIds.length
      ? await this.prisma.question.findMany({
          where: { id: { in: questionIds } },
          select: {
            id: true,
            difficulty: true,
            subject: true,
            subjectRef: { select: { name: true } },
            _count: { select: { alternatives: true } },
          },
        })
      : [];
    const questionById = new Map(questions.map((question) => [question.id, question]));

    const answers: Answer[] = [];
    for (const answer of raw) {
      const question = questionById.get(answer.questionId);
      // Questão antiga sem matéria estruturada: vale o nome em texto.
      const area = question && areaOfSubjectName(question.subjectRef?.name ?? question.subject);
      if (!question || !area) continue;
      answers.push({
        ...answer,
        area,
        difficulty: question.difficulty ?? QuestionDifficulty.MEDIA,
        alternatives: question._count?.alternatives || undefined,
      });
    }
    answers.sort((a, b) => a.at.getTime() - b.at.getTime());

    return {
      answers,
      essays: corrections.map((correction) => ({ score: correction.totalScore, at: correction.updatedAt })),
      target:
        cutoff.status === 'OK' && cutoff.targetScore !== null
          ? { score: cutoff.targetScore, course: cutoff.course, university: cutoff.university, year: cutoff.projectedYear }
          : null,
    };
  }
}
