import { Injectable } from '@nestjs/common';
import { Prisma, StudyActivityType, StudyArea, StudyTaskStatus, TopicMasteryStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import type { ActivityDurations } from './activity-durations';
import { Db } from './domain/types';
import type { EssayStep } from './schedule-essay';
import { PHASE_MIX, type SchedulePhase } from './schedule-phase';
import { ACTIVITY_DURATION_MINUTES, ACTIVITY_LABEL, computeTopicPriority, pickActivityType } from './schedule-priority';
import { ESSAY_SUBJECT_CODE, STUDY_SUBJECT_CODE_TO_AREA } from './study-areas';
import { STUDY_SUBJECT_CODE_TO_SUBJECT_NAME } from './study-subject-question-bank-map';
import { orderNewTopicsBySequence } from './topic-sequence';

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
  /** Fase da reta no dia da sessão (fase 3, §7). Ausente = BASE. */
  phase?: SchedulePhase;
  /** Áreas que o aluno marcou como prioritárias no onboarding (fase 5, §11). */
  priorityAreas?: StudyArea[];
  /** Etapa de redação que cai nesta sessão (fase 5, §9) — quem chama decide
   *  o dia; aqui ela só ocupa o tempo antes da divisão por matéria. */
  essay?: EssayStep | null;
  /** Minutos do dia já tomados por tarefas que ficam como estão
   *  (replanejamento, fase 4 §12): o resto do dia é planejado em volta. */
  occupiedMinutes?: number;
  /** Tópicos que já estão no dia e não devem ser agendados de novo. */
  excludeTopicIds?: string[];
  /** Quanto cada matéria (StudySubject.id) já tem no dia pelas tarefas que
   *  ficam — conta como tempo recebido na hora de revezar as matérias. */
  occupiedBySubject?: Record<string, number>;
  /** Duração de cada tipo de atividade no ritmo do aluno (calibração C2).
   *  Ausente = as durações padrão. */
  durations?: ActivityDurations;
}

/** Janela (em dias, para trás e para frente) em que um tópico já CONCLUÍDO
 *  perde a vez para os que ainda não apareceram. */
const RECENT_TOPIC_WINDOW_DAYS = 3;
/** A mesma janela para tópico com tarefa ainda por fazer. */
const PENDING_TOPIC_WINDOW_DAYS = 14;
/** Abaixo disso não vale abrir uma tarefa — sobra de arredondamento. */
const MIN_TASK_MINUTES = 10;
/** Sobra do dia menor que isso é somada à última tarefa em vez de virar outra. */
const MIN_LEFTOVER_TASK_MINUTES = 20;
/** Menor bloco que vale dar a uma matéria num dia: abaixo disso ela espera
 *  o próximo dia em vez de aparecer picada. */
const MIN_SUBJECT_BLOCK_MINUTES = 30;
/** Quanto do cronograma (para trás e para frente) conta na hora de ver qual
 *  matéria está recebendo menos tempo do que deveria. */
const SUBJECT_ROTATION_WINDOW_DAYS = 14;
/** Quanto a mais de tempo do dia recebe uma matéria da área prioritária. */
const PRIORITY_AREA_SLICE_BOOST = 1.25;
/** Tópico-coringa criado por importações sem classificação: não é assunto
 *  que se estude, então nunca vira tarefa. */
const CATCH_ALL_TOPIC_NAME = 'Geral';

/**
 * Gerador diário de tarefas (cronograma adaptativo, fases 2 a 5 — ver
 * docs/CRONOGRAMA_ADAPTATIVO_DESIGN.md §5-9). Substitui a distribuição
 * proporcional fixa (`SchedulesService.buildSessions`, removido) por
 * tópicos escolhidos por prioridade (§4) dentro da fatia de cada matéria,
 * com revisão espaçada vencida (TopicMastery.nextReviewAt) entrando primeiro.
 *
 * Só LÊ do banco — não persiste nada. Quem chama (`SchedulesService`) decide
 * quando criar as tarefas e atualizar o progresso, do mesmo jeito que já faz
 * para tarefas manuais.
 *
 * Matérias sem Subject/Topic mapeado (Inglês, Espanhol, Educação Física —
 * ver study-subject-question-bank-map.ts) não têm de onde tirar prioridade
 * por tópico ainda: recebem uma tarefa genérica com fatia proporcional às
 * horas-alvo, igual ao alocador antigo fazia para todas as matérias. Redação
 * não entra na divisão diária: tem rotina semanal própria (`session.essay`).
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
    let remainingMinutes = session.scheduledMinutes - (session.occupiedMinutes ?? 0);
    if (scheduleSubjects.length === 0 || remainingMinutes <= 0) return [];
    const durations = session.durations ?? ACTIVITY_DURATION_MINUTES;

    const tasks: Prisma.StudyTaskCreateManyInput[] = [];

    const essaySubject = scheduleSubjects.find((s) => s.subject.code === ESSAY_SUBJECT_CODE);
    if (session.essay && essaySubject) {
      const duration = Math.min(remainingMinutes, durations.REDACAO);
      tasks.push({
        scheduleId: session.scheduleId,
        sessionId: session.id,
        subjectId: essaySubject.subjectId,
        topicId: null,
        activityType: StudyActivityType.REDACAO,
        title: session.essay.title,
        description: session.essay.description,
        status: StudyTaskStatus.PENDING,
        scheduledMinutes: duration,
      });
      remainingMinutes -= duration;
    }

    const sliceSubjects = scheduleSubjects.filter((s) => s.subject.code !== ESSAY_SUBJECT_CODE);
    if (sliceSubjects.length === 0 || remainingMinutes < MIN_TASK_MINUTES) return tasks;

    const inPriorityArea = (s: ScheduleSubjectForGeneration) =>
      (session.priorityAreas ?? []).includes(STUDY_SUBJECT_CODE_TO_AREA[s.subject.code]);
    // Peso da matéria na divisão do dia: as horas-alvo, com um reforço para
    // as matérias das áreas que o aluno marcou como prioritárias (§11).
    const sliceWeight = (s: ScheduleSubjectForGeneration) =>
      s.targetHours * (inPriorityArea(s) ? PRIORITY_AREA_SLICE_BOOST : 1);
    const maxTargetHours = Math.max(...sliceSubjects.map((s) => s.targetHours));

    const todaySubjects = await this.pickSubjectsForDay(session, sliceSubjects, remainingMinutes, sliceWeight, db);
    const totalWeight = todaySubjects.reduce((sum, s) => sum + sliceWeight(s), 0);

    const covered: (ScheduleSubjectForGeneration & { qbSubjectId: string })[] = [];
    const uncovered: ScheduleSubjectForGeneration[] = [];
    for (const ss of todaySubjects) {
      const subjectName = STUDY_SUBJECT_CODE_TO_SUBJECT_NAME[ss.subject.code];
      const qbSubject = subjectName
        ? await db.subject.findUnique({ where: { name: subjectName } })
        : null;
      if (qbSubject) covered.push({ ...ss, qbSubjectId: qbSubject.id });
      else uncovered.push(ss);
    }

    // Fatia do dia por matéria, proporcional às horas-alvo. A prioridade por
    // tópico (§4) decide O QUE estudar dentro da fatia, não QUANTO cada
    // matéria recebe — ordenar a fila inteira só por prioridade deixava as
    // matérias de menor peso sem tempo nenhum, dia após dia.
    //
    // A proporção vale para o dia INTEIRO, contando o que já está nele: a
    // matéria de uma tarefa trazida de outro dia (replanejamento) desconta
    // esse tempo da própria fatia, em vez de somar a tarefa a uma fatia cheia.
    const sliceMinutes = remainingMinutes;
    const occupied = (ss: ScheduleSubjectForGeneration) => session.occupiedBySubject?.[ss.subjectId] ?? 0;
    const dayMinutes = sliceMinutes + todaySubjects.reduce((sum, ss) => sum + occupied(ss), 0);
    // Nenhuma matéria do dia fica com menos que um bloco mínimo: com pesos
    // muito diferentes a proporção pura dava 17 minutos para a menor. Quem
    // ficaria abaixo recebe o mínimo, e as outras dividem o resto pela
    // proporção. (Matéria que já tem tarefa no dia não precisa do piso.)
    const minBlock = Math.min(MIN_SUBJECT_BLOCK_MINUTES, Math.floor(dayMinutes / todaySubjects.length));
    const atMinimum = new Set<string>();
    const shareOf = (ss: ScheduleSubjectForGeneration) => {
      if (atMinimum.has(ss.subjectId)) return minBlock;
      const freeWeight = todaySubjects
        .filter((s) => !atMinimum.has(s.subjectId))
        .reduce((sum, s) => sum + sliceWeight(s), 0);
      const freeMinutes = dayMinutes - atMinimum.size * minBlock;
      return freeWeight > 0 ? Math.floor(freeMinutes * (sliceWeight(ss) / freeWeight)) : 0;
    };
    for (let changed = totalWeight > 0; changed; ) {
      const below = todaySubjects.find(
        (ss) => !atMinimum.has(ss.subjectId) && occupied(ss) === 0 && shareOf(ss) < minBlock,
      );
      if (below) atMinimum.add(below.subjectId);
      changed = Boolean(below);
    }
    const rawBudget = new Map(
      todaySubjects.map((ss) => [
        ss.subjectId,
        totalWeight > 0 ? Math.max(0, shareOf(ss) - occupied(ss)) : 0,
      ]),
    );
    // Quando o que já está no dia passa da fatia da matéria, as outras cedem
    // por igual até caber no tempo que sobrou.
    const rawTotal = [...rawBudget.values()].reduce((sum, minutes) => sum + minutes, 0);
    const scale = rawTotal > sliceMinutes ? sliceMinutes / rawTotal : 1;
    const budgetBySubject = new Map<string, number>(
      [...rawBudget].map(([subjectId, minutes]) => [subjectId, Math.floor(minutes * scale)]),
    );

    // Matérias sem catálogo de tópicos: fatia proporcional genérica, igual
    // ao comportamento antigo (nunca deixa a matéria de fora só por falta
    // de dado estruturado).
    for (const ss of uncovered) {
      const minutes = budgetBySubject.get(ss.subjectId) ?? 0;
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

    const phase = session.phase ?? 'BASE';
    // Alvo de minutos por tipo de atividade nesta fase (§7), sobre o tempo
    // que sobrou para as matérias com tópico.
    const typeBudget = Object.fromEntries(
      Object.values(StudyActivityType).map((type) => [type, PHASE_MIX[phase][type] * remainingMinutes]),
    ) as Record<StudyActivityType, number>;
    // Uma revisão vencida sempre cabe, mesmo quando a fatia da fase é menor
    // que uma revisão inteira (dia curto na fase de base).
    typeBudget.REVISAO = Math.max(typeBudget.REVISAO, durations.REVISAO);

    const qbSubjectIds = covered.map((c) => c.qbSubjectId);
    const [allTopics, masteries, questionRows, nearbyTasks] = await Promise.all([
      db.topic.findMany({ where: { subjectId: { in: qbSubjectIds } } }),
      db.topicMastery.findMany({ where: { userId, subjectId: { in: qbSubjectIds } } }),
      // findMany + select em vez de groupBy: mesma convenção do resto do
      // projeto (question-attempts.repository.ts), pra funcionar igual no
      // fake-prisma dos testes e2e.
      db.question.findMany({ where: { subjectId: { in: qbSubjectIds } }, select: { subjectId: true, topicId: true } }),
      db.studyTask.findMany({
        where: {
          scheduleId: session.scheduleId,
          topicId: { not: null },
          sessionId: { not: session.id },
          status: { not: StudyTaskStatus.SKIPPED },
          session: {
            date: {
              gte: addDays(session.date, -PENDING_TOPIC_WINDOW_DAYS),
              lte: addDays(session.date, PENDING_TOPIC_WINDOW_DAYS),
            },
          },
        },
        select: { topicId: true, activityType: true, status: true, session: { select: { date: true } } },
      }),
    ]);
    const topics = allTopics.filter((t) => t.name !== CATCH_ALL_TOPIC_NAME);
    // Tópico já agendado por perto vai pro fim da fila: sem isso o dia
    // seguinte repetia os mesmos tópicos de maior prioridade. Tarefa ainda
    // por fazer segura o tópico por mais tempo (com as matérias se revezando,
    // a mesma matéria volta a cada 4 ou 5 dias e repetia o tópico pendente);
    // tarefa concluída só por poucos dias, para o tópico poder avançar de
    // teoria para questões.
    const isNear = (task: (typeof nearbyTasks)[number]) => {
      if (task.status !== StudyTaskStatus.DONE || !task.session) return true;
      const days = Math.abs(task.session.date.getTime() - session.date.getTime()) / 86_400_000;
      return days <= RECENT_TOPIC_WINDOW_DAYS;
    };
    const nearTasks = nearbyTasks.filter(isNear);
    const nearbyTopicIds = new Set(nearTasks.map((t) => t.topicId));
    // A mesma revisão vencida não é marcada de novo em cada dia vizinho que o
    // aluno abrir — ela já tem um dia.
    const nearbyReviewTopicIds = new Set(
      nearTasks.filter((t) => t.activityType === StudyActivityType.REVISAO).map((t) => t.topicId),
    );

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

    const usedTopicIds = new Set<string>(session.excludeTopicIds ?? []);

    // Revisão espaçada vencida entra primeiro (§8) — a mais atrasada na
    // frente, até a fatia de revisão da fase. O que não couber fica para os
    // próximos dias (continua vencido). Tópico DOMINADO só reaparece por
    // aqui, nunca pela fila normal.
    const dueReviews = masteries
      .filter((m) => m.nextReviewAt && m.nextReviewAt <= session.date && m.status !== TopicMasteryStatus.NAO_ESTUDADO)
      .filter((m) => !nearbyReviewTopicIds.has(m.topicId) && !usedTopicIds.has(m.topicId))
      .sort((a, b) => a.nextReviewAt!.getTime() - b.nextReviewAt!.getTime());

    for (const mastery of dueReviews) {
      if (remainingMinutes < MIN_TASK_MINUTES || typeBudget.REVISAO <= 0) break;
      const topic = topics.find((t) => t.id === mastery.topicId);
      const studySubject = topic && studySubjectByQbId.get(topic.subjectId);
      if (!topic || !studySubject) continue;
      const duration = Math.min(remainingMinutes, durations.REVISAO);
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
      typeBudget.REVISAO -= duration;
      usedTopicIds.add(topic.id);
      budgetBySubject.set(
        studySubject.subjectId,
        Math.max(0, (budgetBySubject.get(studySubject.subjectId) ?? 0) - duration),
      );
    }

    // Tópico tirado do plano não entra, mas também não segura a vez dos
    // seguintes da trilha: sai antes da ordenação.
    const rankedCandidates = topics
      .filter((topic) => !usedTopicIds.has(topic.id))
      .map((topic) => {
        const mastery = masteryByTopic.get(topic.id) ?? null;
        if (mastery?.status === TopicMasteryStatus.DOMINADO) return null;
        const studySubject = studySubjectByQbId.get(topic.subjectId);
        if (!studySubject) return null;
        const isNew = !mastery || mastery.status === TopicMasteryStatus.NAO_ESTUDADO;
        const priority = computeTopicPriority({
          masteryScore: mastery?.masteryScore ?? null,
          status: mastery?.status ?? null,
          lastStudiedAt: mastery?.lastStudiedAt ?? null,
          questionCount: questionCountByTopic.get(topic.id) ?? 0,
          maxQuestionCountInSubject: maxQuestionCountBySubject.get(topic.subjectId) ?? 0,
          targetHours: studySubject.targetHours,
          maxTargetHoursInSchedule: maxTargetHours,
          inPriorityArea: inPriorityArea(studySubject),
          now: session.date,
        });
        return {
          topic,
          studySubject,
          priority,
          isNew,
          activityType: pickActivityType(mastery?.status ?? null, phase),
          nearby: nearbyTopicIds.has(topic.id),
        };
      })
      .filter((c): c is NonNullable<typeof c> => c !== null);
    // Conteúdo novo entra na ordem da trilha da matéria: primeiro a base,
    // depois o que depende dela. Na reta final não há tempo para percorrer a
    // trilha — ali vale o que mais cai, que é a prioridade pura.
    const sequenced = phase === 'PREPARACAO'
      ? rankedCandidates
      : orderNewTopicsBySequence(rankedCandidates, (c) => ({
          subjectName: STUDY_SUBJECT_CODE_TO_SUBJECT_NAME[c.studySubject.subject.code] ?? c.studySubject.subject.name,
          topicName: c.topic.name,
          isNew: c.isNew,
        }));
    const candidates = sequenced.sort((a, b) => Number(a.nearby) - Number(b.nearby) || b.priority - a.priority);

    const pushTopicTask = (candidate: (typeof candidates)[number], limit: number) => {
      const { activityType } = candidate;
      const duration = Math.min(limit, durations[activityType]);
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
      typeBudget[activityType] -= duration;
      usedTopicIds.add(candidate.topic.id);
      return duration;
    };
    // O mix da fase é um alvo: entre os tópicos disponíveis, vai primeiro o
    // de maior prioridade cujo tipo ainda tem tempo na fase; esgotados esses,
    // segue a prioridade pura.
    const pickNext = (pool: typeof candidates) =>
      pool.find((c) => typeBudget[c.activityType] > 0) ?? pool[0];

    // Cada matéria preenche a própria fatia com os tópicos dela.
    for (const subject of covered) {
      let budget = budgetBySubject.get(subject.subjectId) ?? 0;
      while (budget >= MIN_TASK_MINUTES && remainingMinutes >= MIN_TASK_MINUTES) {
        const candidate = pickNext(
          candidates.filter((c) => c.studySubject.subjectId === subject.subjectId && !usedTopicIds.has(c.topic.id)),
        );
        if (!candidate) break;
        budget -= pushTopicTask(candidate, Math.min(budget, remainingMinutes));
      }
    }

    // O que sobrou (arredondamento, matéria sem tópico elegível) vai pra fila
    // geral, sem olhar a matéria.
    // Sobra pequena não vira tarefa própria (um bloco de 10 minutos de teoria
    // não serve a ninguém): estica a última tarefa de tópico do dia.
    const lastTopicTask = [...tasks].reverse().find((t) => t.topicId);
    if (remainingMinutes < MIN_LEFTOVER_TASK_MINUTES && lastTopicTask) {
      lastTopicTask.scheduledMinutes = (lastTopicTask.scheduledMinutes as number) + remainingMinutes;
      remainingMinutes = 0;
    }
    while (remainingMinutes >= MIN_TASK_MINUTES) {
      const candidate = pickNext(candidates.filter((c) => !usedTopicIds.has(c.topic.id)));
      if (!candidate) break;
      pushTopicTask(candidate, remainingMinutes);
    }

    return tasks;
  }

  /**
   * Quais matérias entram no dia. Quando cabem todas com um bloco decente
   * cada, entram todas. Quando não cabem (muitas matérias, dia curto),
   * dividir o dia por todas dava blocos de 3 a 13 minutos — então entram só
   * as que estão mais "em dívida": as que, nas últimas semanas, receberam
   * menos tempo do que a fatia delas pediria. Assim as matérias se revezam
   * entre os dias e, na soma, cada uma recebe a sua proporção.
   */
  private async pickSubjectsForDay(
    session: SessionForGeneration,
    subjects: ScheduleSubjectForGeneration[],
    minutes: number,
    weight: (s: ScheduleSubjectForGeneration) => number,
    db: Db,
  ): Promise<ScheduleSubjectForGeneration[]> {
    const maxSubjects = Math.max(1, Math.floor(minutes / MIN_SUBJECT_BLOCK_MINUTES));
    if (subjects.length <= maxSubjects) return subjects;

    const nearby = await db.studyTask.findMany({
      where: {
        scheduleId: session.scheduleId,
        sessionId: { not: session.id },
        status: { not: StudyTaskStatus.SKIPPED },
        session: {
          date: {
            gte: addDays(session.date, -SUBJECT_ROTATION_WINDOW_DAYS),
            lte: addDays(session.date, SUBJECT_ROTATION_WINDOW_DAYS),
          },
        },
      },
      select: { subjectId: true, scheduledMinutes: true },
    });
    // O que já está no próprio dia (tarefa trazida de outro dia, tarefa
    // manual) também é tempo recebido: sem isso a matéria da tarefa movida
    // parecia "em dívida" e ganhava o dia inteiro.
    const received = new Map<string, number>(Object.entries(session.occupiedBySubject ?? {}));
    for (const task of nearby) {
      if (!task.subjectId) continue;
      received.set(task.subjectId, (received.get(task.subjectId) ?? 0) + (task.scheduledMinutes ?? 0));
    }
    const totalWeight = subjects.reduce((sum, s) => sum + weight(s), 0);
    const totalReceived = subjects.reduce((sum, s) => sum + (received.get(s.subjectId) ?? 0), 0);
    const debt = (s: ScheduleSubjectForGeneration) =>
      (totalWeight > 0 ? weight(s) / totalWeight : 0) * (totalReceived + minutes) - (received.get(s.subjectId) ?? 0);

    return [...subjects]
      .sort((a, b) => debt(b) - debt(a) || weight(b) - weight(a) || a.subject.name.localeCompare(b.subject.name))
      .slice(0, maxSubjects);
  }
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}
