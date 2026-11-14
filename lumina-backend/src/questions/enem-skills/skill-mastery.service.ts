import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { QuestionAccessService } from '../question-access.service';
import { type SkillAnswerEvent, type SkillMasteryReport, buildSkillMastery } from './skill-mastery';

/**
 * Domínio do aluno por habilidade da Matriz de Referência do ENEM. Junta as
 * respostas avulsas (QuestionAttempt) e as dos simulados enviados, sempre
 * pela habilidade ATUAL da questão: se a classificação for corrigida, o mapa
 * acompanha. Questões sem habilidade não entram.
 */
@Injectable()
export class SkillMasteryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: QuestionAccessService,
  ) {}

  async forUser(userId: string): Promise<SkillMasteryReport> {
    const [personal, bank] = await Promise.all([this.access.getPersonalWorkspace(userId), this.access.getBankWorkspace()]);
    const workspaceIds = [personal?.id, bank?.id].filter((id): id is string => Boolean(id));

    const [attempts, submissions, availableRows, pendingValidation] = await Promise.all([
      this.prisma.questionAttempt.findMany({
        where: { userId, question: { enemSkill: { not: null } } },
        select: { isCorrect: true, createdAt: true, question: { select: { enemSkill: true, enemSkillValidated: true } } },
      }),
      this.prisma.simulationSubmission.findMany({
        where: { userId },
        select: {
          answers: true,
          submittedAt: true,
          simulation: {
            select: {
              items: {
                where: { question: { enemSkill: { not: null } } },
                select: { position: true, correctPosition: true, question: { select: { enemSkill: true, enemSkillValidated: true } } },
              },
            },
          },
        },
      }),
      this.prisma.question.groupBy({
        by: ['enemSkill'],
        where: { workspaceId: { in: workspaceIds }, enemSkill: { not: null } },
        _count: true,
      }),
      this.prisma.question.count({ where: { workspaceId: { in: workspaceIds }, enemSkill: { not: null }, enemSkillValidated: false } }),
    ]);

    const events: SkillAnswerEvent[] = attempts.map((a) => ({
      code: a.question.enemSkill!,
      correct: a.isCorrect,
      at: a.createdAt,
      provisional: !a.question.enemSkillValidated,
    }));
    for (const submission of submissions) {
      events.push(...simulationEvents(submission));
    }

    const available = new Map(availableRows.map((r) => [r.enemSkill!, r._count]));
    const classifiedQuestions = availableRows.reduce((t, r) => t + r._count, 0);
    return buildSkillMastery(events, available, { classifiedQuestions, pendingValidation });
  }
}

/** Respostas de um simulado enviado. Questão deixada em branco não conta. */
export function simulationEvents(submission: {
  answers: unknown;
  submittedAt: Date;
  simulation: { items: { position: number; correctPosition: number; question: { enemSkill: string | null; enemSkillValidated: boolean } | null }[] };
}): SkillAnswerEvent[] {
  const answers = Array.isArray(submission.answers) ? (submission.answers as { position?: unknown; selectedPosition?: unknown }[]) : [];
  const selected = new Map<number, number>();
  for (const a of answers) {
    if (typeof a?.position === 'number' && typeof a.selectedPosition === 'number') selected.set(a.position, a.selectedPosition);
  }
  const events: SkillAnswerEvent[] = [];
  for (const item of submission.simulation.items) {
    const choice = selected.get(item.position);
    if (choice === undefined || !item.question?.enemSkill) continue;
    events.push({
      code: item.question.enemSkill,
      correct: choice === item.correctPosition,
      at: submission.submittedAt,
      provisional: !item.question.enemSkillValidated,
    });
  }
  return events;
}
