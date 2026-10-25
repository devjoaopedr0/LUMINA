import { BadRequestException, Injectable } from '@nestjs/common';
import { QuestionDifficulty, StudyArea } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { QuestionAccessService } from '../questions/question-access.service';
import { QuestionCalibrationService } from '../questions/question-calibration.service';
import { triScore, type TriItem } from '../schedules/enem-tri';
import { STUDY_AREA_LABEL, areaOfSubjectName, subjectNamesOfArea } from '../schedules/study-areas';
import {
  ENEM_AREA_NAME,
  ENEM_DAYS,
  ENEM_QUESTIONS_PER_AREA,
  areaOfEnemName,
  pickEnemQuestions,
} from './enem-simulation';
import { SimulationsService } from './simulations.service';

/** Com menos questões que isso numa área, a nota dela é só indicativa. */
const TRI_MIN_QUESTIONS = 10;

export interface SimulationTriResult {
  /** 1 ou 2 quando é um simulado modelo ENEM; null nos demais. */
  enemDay: number | null;
  areas: {
    area: StudyArea;
    label: string;
    correct: number;
    total: number;
    /** Nota estilo TRI da área e a faixa de incerteza. */
    score: number;
    low: number;
    high: number;
    /** Poucas questões da área no simulado: nota só indicativa. */
    lowConfidence: boolean;
  }[];
  /** Média das áreas — só no simulado modelo ENEM. */
  average: number | null;
}

@Injectable()
export class EnemSimulationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: QuestionAccessService,
    private readonly simulations: SimulationsService,
    private readonly calibration: QuestionCalibrationService,
  ) {}

  /**
   * Monta um simulado modelo ENEM de um dia de prova: 45 questões de cada
   * área do dia, com o tempo oficial. O aluno pode enviar antes do fim e
   * deixar questões em branco (contam como erro, como na prova).
   */
  async create(userId: string, day: 1 | 2): Promise<{ simulationId: string }> {
    const config = ENEM_DAYS[day];
    const [personal, bank] = await Promise.all([
      this.access.getPersonalWorkspace(userId),
      this.access.getBankWorkspace(),
    ]);
    const workspaceIds = [personal?.id, bank?.id].filter((id): id is string => Boolean(id));

    const picked: { area: StudyArea; ids: string[] }[] = [];
    for (const area of config.areas) {
      const names = subjectNamesOfArea(area);
      const pool = await this.prisma.question.findMany({
        where: {
          workspaceId: { in: workspaceIds },
          OR: [{ subjectRef: { name: { in: names } } }, { subjectId: null, subject: { in: names } }],
        },
        select: {
          id: true,
          subject: true,
          subjectRef: { select: { name: true } },
          alternatives: { select: { position: true, isCorrect: true }, orderBy: { position: 'asc' } },
        },
      });
      // Só questão que cabe no cartão-resposta (mesma regra do simulado comum).
      const usable = pool.filter(
        ({ alternatives }) =>
          alternatives.length >= 2 &&
          alternatives.length <= 5 &&
          alternatives.filter((a) => a.isCorrect).length === 1 &&
          alternatives.every((a, index) => a.position === index + 1),
      );
      const attempted = await this.prisma.questionAttempt.findMany({
        where: { userId, questionId: { in: usable.map((q) => q.id) } },
        select: { questionId: true },
        distinct: ['questionId'],
      });
      const answered = new Set(attempted.map((attempt) => attempt.questionId));
      const chosen = pickEnemQuestions(
        usable.map((q) => ({ id: q.id, subject: q.subjectRef?.name ?? q.subject, answered: answered.has(q.id) })),
      );
      if (chosen.length < ENEM_QUESTIONS_PER_AREA) {
        throw new BadRequestException(
          `O banco tem só ${chosen.length} questões de ${STUDY_AREA_LABEL[area]}; o simulado modelo ENEM precisa de ${ENEM_QUESTIONS_PER_AREA} por área.`,
        );
      }
      picked.push({ area, ids: chosen.map((q) => q.id) });
    }

    const simulation = await this.simulations.create(
      userId,
      config.title,
      picked.flatMap((entry) => entry.ids),
      undefined,
      'SIMULATION',
      undefined,
      config.minutes,
      // Não é o "modo prova real" do app: lá o envio só acontece no fim do
      // tempo, e ninguém deve ficar preso 5 horas para ver o resultado.
      false,
    );
    await this.prisma.simulation.update({ where: { id: simulation.id }, data: { enemDay: day } });
    for (const { area, ids } of picked) {
      await this.prisma.simulationItem.updateMany({
        where: { simulationId: simulation.id, questionId: { in: ids } },
        data: { area: ENEM_AREA_NAME[area] },
      });
    }
    return { simulationId: simulation.id };
  }

  /**
   * Nota estilo TRI de um simulado enviado, por área do ENEM. Vale para
   * qualquer simulado; a média só sai no modelo ENEM, em que cada área tem
   * prova inteira. null = simulado sem resultado do aluno.
   */
  async triForSubmission(userId: string, simulationId: string): Promise<SimulationTriResult | null> {
    const submission = await this.prisma.simulationSubmission.findUnique({
      where: { simulationId_userId: { simulationId, userId } },
      select: {
        answers: true,
        simulation: {
          select: {
            enemDay: true,
            items: { select: { position: true, correctPosition: true, questionId: true, subject: true, area: true, alternatives: true } },
          },
        },
      },
    });
    if (!submission) return null;

    const items = submission.simulation.items;
    const questionIds = items.map((item) => item.questionId).filter((id): id is string => Boolean(id));
    const questions = questionIds.length
      ? await this.prisma.question.findMany({ where: { id: { in: questionIds } }, select: { id: true, difficulty: true } })
      : [];
    const difficultyById = new Map(questions.map((question) => [question.id, question.difficulty]));
    const offsets = await this.calibration.offsets(questionIds);
    const chosen = new Map(
      (submission.answers as { position: number; selectedPosition: number }[]).map((a) => [a.position, a.selectedPosition]),
    );

    const byArea = new Map<StudyArea, TriItem[]>();
    for (const item of items) {
      const area = areaOfEnemName(item.area) ?? areaOfSubjectName(item.subject);
      if (!area) continue;
      const list = byArea.get(area) ?? [];
      list.push({
        // Em branco (0) conta como erro.
        isCorrect: chosen.get(item.position) === item.correctPosition,
        difficulty: (item.questionId && difficultyById.get(item.questionId)) || QuestionDifficulty.MEDIA,
        alternatives: Array.isArray(item.alternatives) ? item.alternatives.length : undefined,
        bOffset: item.questionId ? offsets.get(item.questionId) : undefined,
      });
      byArea.set(area, list);
    }

    const areas = [...byArea.entries()].map(([area, answers]) => ({
      area,
      label: STUDY_AREA_LABEL[area],
      correct: answers.filter((answer) => answer.isCorrect).length,
      total: answers.length,
      ...triScore(area, answers),
      lowConfidence: answers.length < TRI_MIN_QUESTIONS,
    }));
    const enemDay = submission.simulation.enemDay;
    return {
      enemDay,
      areas,
      average:
        enemDay && areas.length > 0
          ? Math.round(areas.reduce((sum, area) => sum + area.score, 0) / areas.length)
          : null,
    };
  }
}
