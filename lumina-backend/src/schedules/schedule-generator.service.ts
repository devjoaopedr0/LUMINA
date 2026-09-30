import { Injectable } from '@nestjs/common';
import { Prisma, StudyActivityType, StudyTaskStatus, TopicMasteryStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { Db } from './domain/types';
import { ACTIVITY_DURATION_MINUTES, ACTIVITY_LABEL, computeTopicPriority, pickActivityType } from './schedule-priority';
import { STUDY_SUBJECT_CODE_TO_SUBJECT_NAME } from './study-subject-question-bank-map';

export interface ScheduleSubjectForGeneration {
  subjectId: string; // StudySubject.id
  targetHours: number;
  subject: { name: string; code: string };
}

export interface SessionForGeneration {
  id: string;
  scheduleId: string;
  date: Date;
  scheduledMinutes: number;
}

/**
 * Gerador diário de tarefas (cronograma adaptativo, fase 2 — ver
 * docs/CRONOGRAMA_ADAPTATIVO_DESIGN.md §5). Substitui a distribuição
 * proporcional fixa (`SchedulesService.buildSessions`, removido) por uma
 * fila de tópicos ordenada por prioridade (§4), com revisão espaçada vencida
 * (TopicMastery.nextReviewAt) entrando primeiro.
 *
 * Só LÊ do banco — não persiste nada. Quem chama (`SchedulesService`) decide
 * quando criar as tarefas e atualizar o progresso, do mesmo jeito que já faz
 * para tarefas manuais.
 *
 * Matérias sem Subject/Topic mapeado (Inglês, Espanhol, Educação Física,
 * Redação — ver study-subject-question-bank-map.ts) não têm de onde tirar
 * prioridade por tópico ainda: recebem uma tarefa genérica com fatia
 * proporcional às horas-alvo, igual ao alocador antigo fazia para todas as
 * matérias.
 */
@Injectable()
export class ScheduleGeneratorService {
  constructor(private readonly prisma: PrismaService) {}

  async buildTasksForSession(
    session: SessionForGeneration,
    userId: string,
    scheduleSubjects: ScheduleSubjectForGeneration[],
    db: Db = this.prisma,
  ): Promise<Prisma.StudyTaskCreateManyInput[]> {
    if (scheduleSubjects.length === 0 || session.scheduledMinutes <= 0) return [];

    const totalTargetHours = scheduleSubjects.reduce((sum, s) => sum + s.targetHours, 0);
    const maxTargetHours = Math.max(...scheduleSubjects.map((s) => s.targetHours));

    const covered: (ScheduleSubjectForGeneration & { qbSubjectId: string })[] = [];
    const uncovered: ScheduleSubjectForGeneration[] = [];
    for (const ss of scheduleSubjects) {
      const subjectName = STUDY_SUBJECT_CODE_TO_SUBJECT_NAME[ss.subject.code];
      const qbSubject = subjectName
        ? await db.subject.findUnique({ where: { name: subjectName } })
        : null;
      if (qbSubject) covered.push({ ...ss, qbSubjectId: qbSubject.id });
      else uncovered.push(ss);
    }

    const tasks: Prisma.StudyTaskCreateManyInput[] = [];
    let remainingMinutes = session.scheduledMinutes;

    // Matérias sem catálogo de tópicos: fatia proporcional genérica, igual
    // ao comportamento antigo (nunca deixa a matéria de fora só por falta
    // de dado estruturado).
    for (const ss of uncovered) {
      if (totalTargetHours <= 0) continue;
      const minutes = Math.floor(session.scheduledMinutes * (ss.targetHours / totalTargetHours));
      if (minutes <= 0) continue;
      tasks.push({
        scheduleId: session.scheduleId,
        sessionId: session.id,
        subjectId: ss.subjectId,
        topicId: null,
        activityType: StudyActivityType.QUESTOES,
        title: `${ss.subject.name}: estudo programado`,
        description: `Conteúdo de ${ss.subject.name}`,
        status: StudyTaskStatus.PENDING,
        scheduledMinutes: minutes,
      });
      remainingMinutes -= minutes;
    }

    if (covered.length === 0 || remainingMinutes <= 0) return tasks;

    const qbSubjectIds = covered.map((c) => c.qbSubjectId);
    const [topics, masteries, questionRows] = await Promise.all([
      db.topic.findMany({ where: { subjectId: { in: qbSubjectIds } } }),
      db.topicMastery.findMany({ where: { userId, subjectId: { in: qbSubjectIds } } }),
      // findMany + select em vez de groupBy: mesma convenção do resto do
      // projeto (question-attempts.repository.ts), pra funcionar igual no
      // fake-prisma dos testes e2e.
      db.question.findMany({ where: { subjectId: { in: qbSubjectIds } }, select: { subjectId: true, topicId: true } }),
    ]);

    const questionCountByTopic = new Map<string, number>();
    for (const q of questionRows) {
      if (!q.topicId) continue;
      questionCountByTopic.set(q.topicId, (questionCountByTopic.get(q.topicId) ?? 0) + 1);
    }
    const maxQuestionCountBySubject = new Map<string, number>();
    for (const qbSubjectId of qbSubjectIds) {
      const topicIds = topics.filter((t) => t.subjectId === qbSubjectId).map((t) => t.id);
      const max = topicIds.reduce((m, id) => Math.max(m, questionCountByTopic.get(id) ?? 0), 0);
      maxQuestionCountBySubject.set(qbSubjectId, max);
    }
    const masteryByTopic = new Map(masteries.map((m) => [m.topicId, m]));
    const studySubjectByQbId = new Map(covered.map((c) => [c.qbSubjectId, c]));

    // Revisão espaçada vencida entra primeiro (§8) — a mais atrasada na
    // frente. Tópico DOMINADO só reaparece por aqui, nunca pela fila normal.
    const dueReviews = masteries
      .filter((m) => m.nextReviewAt && m.nextReviewAt <= session.date && m.status !== TopicMasteryStatus.NAO_ESTUDADO)
      .sort((a, b) => a.nextReviewAt!.getTime() - b.nextReviewAt!.getTime());

    const usedTopicIds = new Set<string>();
    for (const mastery of dueReviews) {
      if (remainingMinutes <= 0) break;
      const topic = topics.find((t) => t.id === mastery.topicId);
      const studySubject = topic && studySubjectByQbId.get(topic.subjectId);
      if (!topic || !studySubject) continue;
      const duration = Math.min(remainingMinutes, ACTIVITY_DURATION_MINUTES.REVISAO);
      tasks.push({
        scheduleId: session.scheduleId,
        sessionId: session.id,
        subjectId: studySubject.subjectId,
        topicId: topic.id,
        activityType: StudyActivityType.REVISAO,
        title: `${ACTIVITY_LABEL.REVISAO} — ${topic.name}`,
        description: `${studySubject.subject.name} · revisão espaçada`,
        status: StudyTaskStatus.PENDING,
        scheduledMinutes: duration,
      });
      remainingMinutes -= duration;
      usedTopicIds.add(topic.id);
    }

    const candidates = topics
      .filter((topic) => !usedTopicIds.has(topic.id))
      .map((topic) => {
        const mastery = masteryByTopic.get(topic.id) ?? null;
        if (mastery?.status === TopicMasteryStatus.DOMINADO) return null;
        const studySubject = studySubjectByQbId.get(topic.subjectId);
        if (!studySubject) return null;
        const priority = computeTopicPriority({
          masteryScore: mastery?.masteryScore ?? null,
          status: mastery?.status ?? null,
          lastStudiedAt: mastery?.lastStudiedAt ?? null,
          questionCount: questionCountByTopic.get(topic.id) ?? 0,
          maxQuestionCountInSubject: maxQuestionCountBySubject.get(topic.subjectId) ?? 0,
          targetHours: studySubject.targetHours,
          maxTargetHoursInSchedule: maxTargetHours,
          now: session.date,
        });
        return { topic, mastery, studySubject, priority };
      })
      .filter((c): c is NonNullable<typeof c> => c !== null)
      .sort((a, b) => b.priority - a.priority);

    for (const candidate of candidates) {
      if (remainingMinutes <= 0) break;
      const activityType = pickActivityType(candidate.mastery?.status ?? null);
      const duration = Math.min(remainingMinutes, ACTIVITY_DURATION_MINUTES[activityType]);
      tasks.push({
        scheduleId: session.scheduleId,
        sessionId: session.id,
        subjectId: candidate.studySubject.subjectId,
        topicId: candidate.topic.id,
        activityType,
        title: `${ACTIVITY_LABEL[activityType]} — ${candidate.topic.name}`,
        description: candidate.studySubject.subject.name,
        status: StudyTaskStatus.PENDING,
        scheduledMinutes: duration,
      });
      remainingMinutes -= duration;
    }

    return tasks;
  }
}
