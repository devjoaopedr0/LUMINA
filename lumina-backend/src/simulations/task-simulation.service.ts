import { BadRequestException, Injectable } from '@nestjs/common';
import { StudyActivityType, TopicMasteryStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { QuestionsService } from '../questions/questions.service';
import { pickPracticeQuestions } from '../schedules/schedule-practice';
import { SchedulesService } from '../schedules/schedules.service';
import { SimulationsService } from './simulations.service';

/** Tamanho do simulado de uma tarefa e quanto dele é do tópico da tarefa —
 *  o resto vem do que o aluno já estudou na matéria, para ser prova e não
 *  só uma lista do mesmo assunto. */
export const TASK_SIMULATION_QUESTIONS = 15;
export const TASK_SIMULATION_TOPIC_QUESTIONS = 8;
/** Com menos que isso não é simulado: a tarefa segue pela prática normal. */
export const TASK_SIMULATION_MIN_QUESTIONS = 5;

/**
 * Liga a tarefa de "Simulado" do cronograma a um simulado de verdade: monta
 * um simulado cronometrado com questões do tópico e da matéria e, quando o
 * aluno envia as respostas, conclui a tarefa com a nota.
 */
@Injectable()
export class TaskSimulationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly questions: QuestionsService,
    private readonly simulations: SimulationsService,
    private readonly schedules: SchedulesService,
  ) {}

  /**
   * Simulado da tarefa: o que já foi criado para ela, ou um novo. null =
   * tarefa inexistente ou de outro aluno.
   */
  async startForTask(userId: string, taskId: string): Promise<{ simulationId: string; created: boolean } | null> {
    const task = await this.prisma.studyTask.findUnique({
      where: { id: taskId },
      include: { subject: true, topic: true, schedule: true },
    });
    if (!task || task.schedule.userId !== userId) return null;
    if (task.activityType !== StudyActivityType.SIMULADO || !task.topic) {
      throw new BadRequestException('Só tarefas de simulado com tópico abrem um simulado.');
    }

    // Abrir de novo leva ao mesmo simulado (em andamento ou já corrigido).
    if (task.simulationId) {
      const existing = await this.prisma.simulation.findUnique({ where: { id: task.simulationId } });
      if (existing) return { simulationId: existing.id, created: false };
    }

    const questionIds = await this.pickQuestionIds(userId, task.topic);
    if (questionIds.length < TASK_SIMULATION_MIN_QUESTIONS) {
      throw new BadRequestException(
        'Ainda não há questões suficientes dessa matéria para montar um simulado. Use "Praticar" nesta tarefa.',
      );
    }

    const simulation = await this.simulations.create(
      userId,
      `Simulado — ${task.subject?.name ?? 'Cronograma'}: ${task.topic.name}`.slice(0, 160),
      questionIds,
      undefined,
      'SIMULATION',
      undefined,
      // O tempo do simulado é o tempo que o cronograma reservou para a tarefa.
      task.scheduledMinutes > 0 ? task.scheduledMinutes : undefined,
      false,
    );
    await this.prisma.studyTask.update({ where: { id: task.id }, data: { simulationId: simulation.id } });
    return { simulationId: simulation.id, created: true };
  }

  /** Simulado enviado: a tarefa do cronograma ligada a ele se conclui com a nota. */
  async completeFromSubmission(userId: string, simulationId: string, correct: number, total: number): Promise<void> {
    await this.schedules.completeTasksFromSimulation(userId, simulationId, correct, total);
  }

  /**
   * Questões do simulado: a maior parte do tópico da tarefa, o resto de
   * outros tópicos da matéria que o aluno já começou a estudar (assunto
   * nunca visto não entra em simulado). Só questão com alternativas no
   * formato do cartão-resposta.
   */
  private async pickQuestionIds(userId: string, topic: { id: string; subjectId: string }): Promise<string[]> {
    const [topicPage, subjectPage, masteries] = await Promise.all([
      this.questions.findAll(userId, { subjectId: topic.subjectId, topicId: topic.id, page: 1, limit: 50 }),
      this.questions.findAll(userId, { subjectId: topic.subjectId, page: 1, limit: 50 }),
      this.prisma.topicMastery.findMany({
        where: { userId, subjectId: topic.subjectId, status: { not: TopicMasteryStatus.NAO_ESTUDADO } },
        select: { topicId: true },
      }),
    ]);
    const studiedTopicIds = new Set(masteries.map((mastery) => mastery.topicId));
    const fromTopic = pickPracticeQuestions(topicPage.items, 50);
    const fromSubject = pickPracticeQuestions(
      subjectPage.items.filter((q) => q.topicId && q.topicId !== topic.id && studiedTopicIds.has(q.topicId)),
      50,
    );

    const candidateIds = [...fromTopic, ...fromSubject].map((q) => q.id);
    const withAlternatives = await this.prisma.question.findMany({
      where: { id: { in: candidateIds } },
      select: { id: true, alternatives: { select: { position: true, isCorrect: true }, orderBy: { position: 'asc' } } },
    });
    const usable = new Set(
      withAlternatives
        .filter(
          ({ alternatives }) =>
            alternatives.length >= 2 &&
            alternatives.length <= 5 &&
            alternatives.filter((a) => a.isCorrect).length === 1 &&
            alternatives.every((a, index) => a.position === index + 1),
        )
        .map((q) => q.id),
    );

    const topicIds = fromTopic.map((q) => q.id).filter((id) => usable.has(id));
    const subjectIds = fromSubject.map((q) => q.id).filter((id) => usable.has(id));
    const picked = [
      ...topicIds.slice(0, TASK_SIMULATION_TOPIC_QUESTIONS),
      ...subjectIds.slice(0, TASK_SIMULATION_QUESTIONS - Math.min(topicIds.length, TASK_SIMULATION_TOPIC_QUESTIONS)),
    ];
    // Faltou questão de outros tópicos: completa com o que sobrou do próprio.
    const leftover = topicIds.slice(TASK_SIMULATION_TOPIC_QUESTIONS);
    return [...picked, ...leftover].slice(0, TASK_SIMULATION_QUESTIONS);
  }
}
