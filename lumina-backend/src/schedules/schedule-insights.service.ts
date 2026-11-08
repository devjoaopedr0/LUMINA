import { Injectable } from '@nestjs/common';
import { StudyActivityType, StudyArea, StudyTaskStatus, TopicMasteryStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { SCHEDULE_CONTEXT_GUIDANCE } from '../ai/luminia-persona';
import { CutoffsService } from '../cutoffs/cutoffs.service';
import { QuestionsService } from '../questions/questions.service';
import { isReviewDayDue } from '../questions/review-day';
import type { QuestionResponseDto } from '../questions/dto/question-response.dto';
import { SchedulesRepository } from './schedules.repository';
import { SchedulesService } from './schedules.service';
import { PHASE_LABEL, type SchedulePhase } from './schedule-phase';
import { topicPriorityTerms } from './schedule-priority';
import { ESSAY_SUBJECT_CODE, STUDY_AREA_LABEL, STUDY_SUBJECT_CODE_TO_AREA } from './study-areas';
import { STUDY_SUBJECT_CODE_TO_SUBJECT_NAME } from './study-subject-question-bank-map';
import { compareByTrack, topicLevel, type TopicLevel } from './topic-sequence';
import { pickPracticeQuestions } from './schedule-practice';
import { buildWeeklySummary, type WeeklySummary } from './schedule-weekly-summary';

const MASTERY_STATUS_LABEL: Record<TopicMasteryStatus, string> = {
  NAO_ESTUDADO: 'não estudado',
  APRENDENDO: 'aprendendo',
  PRATICANDO: 'praticando',
  DOMINADO: 'dominado',
  PRECISA_REFORCO: 'precisa de reforço',
};

const PHASE_REASON: Record<SchedulePhase, string> = {
  BASE: 'o foco é cobrir o conteúdo, com mais teoria',
  CONSOLIDACAO: 'o foco passa para questões e revisão',
  PREPARACAO: 'reta final: questões, revisão e simulados',
};

/** Por que a tarefa de um tópico tem este tipo de atividade (§6). */
const ACTIVITY_REASON: Record<StudyActivityType, string> = {
  TEORIA: 'A atividade é teoria porque o primeiro passo num tópico é ver o conteúdo.',
  QUESTOES: 'A atividade é questões porque o tópico já passou da teoria: agora é praticar.',
  REVISAO: 'A atividade é revisão: retomar o que já foi estudado antes que se perca.',
  SIMULADO: 'A atividade é simulado porque, na reta final, tópico em prática é treinado em formato de prova.',
  REDACAO: 'A atividade é redação.',
};

/** Incidência a partir da qual o tópico é chamado de "muito cobrado". */
const HIGH_INCIDENCE = 60;
/** Dias parado a partir dos quais isso vira motivo dito ao aluno. */
const STALE_DAYS = 14;
const DIAGNOSTIC_QUESTIONS_PER_AREA = 5;
const CATCH_ALL_TOPIC_NAME = 'Geral';
/** Brasília está 3 horas atrás do UTC (sem horário de verão). */
const BRAZIL_UTC_OFFSET_HOURS = 3;

export interface MasterySummary {
  totalTopics: number;
  naoEstudados: number;
  aprendendo: number;
  praticando: number;
  dominados: number;
  precisaReforco: number;
  /** Tópicos com revisão espaçada vencida hoje. */
  paraRevisar: number;
}

const TOPIC_LEVEL_LABEL: Record<TopicLevel, string> = {
  BASE: 'base',
  INTERMEDIARIO: 'intermediário',
  AVANCADO: 'avançado',
};

export interface SubjectTopics {
  /** StudySubject.id (a matéria do cronograma). */
  subjectId: string;
  subjectName: string;
  /** Subject.id no banco de questões — é o filtro de matéria de lá. */
  questionBankSubjectId: string | null;
  topics: {
    id: string;
    name: string;
    /** Onde o tópico fica na trilha da matéria (a lista já vem nessa ordem);
     *  null quando ele ainda não foi colocado na trilha. */
    level: TopicLevel | null;
    status: TopicMasteryStatus;
    masteryScore: number;
    attempts: number;
    correctAttempts: number;
    /** Revisão espaçada vencida. */
    due: boolean;
    questionCount: number;
    /** false = o aluno tirou este tópico do cronograma. */
    included: boolean;
  }[];
}

export interface TaskExplanation {
  taskId: string;
  title: string;
  subject: string | null;
  topic: string | null;
  phase: SchedulePhase;
  reasons: string[];
  /** Texto pronto para entrar como contexto da LuminIA. */
  context: string;
}

export interface TaskPractice {
  taskId: string;
  title: string;
  subject: string | null;
  topic: string | null;
  /** Vazio quando a tarefa não tem tópico ou o tópico ainda não tem questões. */
  questions: QuestionResponseDto[];
}

export interface DiagnosticArea {
  area: StudyArea;
  label: string;
  questions: QuestionResponseDto[];
}

/**
 * Leituras do cronograma adaptativo que não mexem em nada: indicadores de
 * domínio (fase 4, §13), a explicação de por que uma tarefa entrou no dia
 * (fase 5, §10) e o diagnóstico inicial do onboarding (fase 5, §11).
 */
@Injectable()
export class ScheduleInsightsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: SchedulesRepository,
    private readonly schedules: SchedulesService,
    private readonly questions: QuestionsService,
    private readonly cutoffs: CutoffsService,
  ) {}

  /** Subject (banco de questões) de cada matéria do cronograma que tem
   *  catálogo de tópicos. */
  private async questionBankSubjects(scheduleSubjects: { subject: { code: string; name: string } }[]) {
    const names = scheduleSubjects
      .map((ss) => STUDY_SUBJECT_CODE_TO_SUBJECT_NAME[ss.subject.code])
      .filter((name): name is string => Boolean(name));
    if (names.length === 0) return [];
    return this.prisma.subject.findMany({ where: { name: { in: names } } });
  }

  /** Conteúdos concluídos / para revisar (§13): contagem por status de
   *  domínio, só das matérias que estão no cronograma. */
  async masterySummary(userId: string): Promise<MasterySummary | null> {
    const schedule = await this.repo.findScheduleByUserId(userId);
    if (!schedule) return null;
    const subjects = await this.questionBankSubjects(schedule.scheduleSubjects);
    const subjectIds = subjects.map((s) => s.id);

    const [topics, masteries] = await Promise.all([
      this.prisma.topic.findMany({ where: { subjectId: { in: subjectIds } }, select: { id: true, name: true } }),
      this.prisma.topicMastery.findMany({ where: { userId, subjectId: { in: subjectIds } } }),
    ]);
    // Tópico que o aluno tirou do cronograma não é conteúdo "a ver".
    const excluded = new Set(schedule.excludedTopicIds);
    const topicIds = new Set(
      topics.filter((t) => t.name !== CATCH_ALL_TOPIC_NAME && !excluded.has(t.id)).map((t) => t.id),
    );
    const rows = masteries.filter((m) => topicIds.has(m.topicId));

    const count = (status: TopicMasteryStatus) => rows.filter((m) => m.status === status).length;
    const studied = rows.filter((m) => m.status !== TopicMasteryStatus.NAO_ESTUDADO);
    const now = new Date();
    return {
      totalTopics: topicIds.size,
      naoEstudados: topicIds.size - studied.length,
      aprendendo: count(TopicMasteryStatus.APRENDENDO),
      praticando: count(TopicMasteryStatus.PRATICANDO),
      dominados: count(TopicMasteryStatus.DOMINADO),
      precisaReforco: count(TopicMasteryStatus.PRECISA_REFORCO),
      paraRevisar: studied.filter((m) => isReviewDayDue(m.nextReviewAt, now)).length,
    };
  }

  /**
   * Tópicos de cada matéria do cronograma com a situação do aluno em cada
   * um — o que ele já domina, o que está estudando, o que está para revisar
   * e o que tirou do plano. Redação não aparece: não é dividida em tópicos.
   */
  async topicsBySubject(userId: string): Promise<SubjectTopics[] | null> {
    const schedule = await this.repo.findScheduleByUserId(userId);
    if (!schedule) return null;
    const subjects = await this.questionBankSubjects(schedule.scheduleSubjects);
    const subjectIds = subjects.map((s) => s.id);
    const [topics, masteries, questionRows] = await Promise.all([
      this.prisma.topic.findMany({ where: { subjectId: { in: subjectIds } }, orderBy: { name: 'asc' } }),
      this.prisma.topicMastery.findMany({ where: { userId, subjectId: { in: subjectIds } } }),
      this.prisma.question.findMany({ where: { subjectId: { in: subjectIds } }, select: { topicId: true } }),
    ]);
    const masteryByTopic = new Map(masteries.map((m) => [m.topicId, m]));
    const questionCount = new Map<string, number>();
    for (const row of questionRows) {
      if (row.topicId) questionCount.set(row.topicId, (questionCount.get(row.topicId) ?? 0) + 1);
    }
    const excluded = new Set(schedule.excludedTopicIds);
    const subjectByName = new Map(subjects.map((s) => [s.name, s]));
    const now = new Date();

    return schedule.scheduleSubjects
      .filter((ss) => ss.subject.code !== ESSAY_SUBJECT_CODE)
      .map((ss) => {
        const bankSubject = subjectByName.get(STUDY_SUBJECT_CODE_TO_SUBJECT_NAME[ss.subject.code] ?? '');
        return {
          subjectId: ss.subjectId,
          subjectName: ss.subject.name,
          questionBankSubjectId: bankSubject?.id ?? null,
          topics: topics
            .filter((t) => t.subjectId === bankSubject?.id && t.name !== CATCH_ALL_TOPIC_NAME)
            // Na ordem em que o cronograma apresenta: base primeiro.
            .sort((a, b) => compareByTrack(bankSubject?.name ?? '', a.name, b.name))
            .map((t) => {
              const mastery = masteryByTopic.get(t.id);
              const status = mastery?.status ?? TopicMasteryStatus.NAO_ESTUDADO;
              return {
                id: t.id,
                name: t.name,
                level: topicLevel(bankSubject?.name ?? '', t.name),
                status,
                masteryScore: mastery?.masteryScore ?? 0,
                attempts: mastery?.attempts ?? 0,
                correctAttempts: mastery?.correctAttempts ?? 0,
                due:
                  status !== TopicMasteryStatus.NAO_ESTUDADO &&
                  isReviewDayDue(mastery?.nextReviewAt, now),
                questionCount: questionCount.get(t.id) ?? 0,
                included: !excluded.has(t.id),
              };
            }),
        };
      });
  }

  /**
   * Resumo da semana (domingo a sábado) que contém `date`: tarefas, tempo,
   * questões, simulados e tópicos trabalhados, com a semana anterior para
   * comparar. Só leitura.
   */
  async weeklySummary(userId: string, date: Date): Promise<WeeklySummary | null> {
    const schedule = await this.repo.findScheduleByUserId(userId);
    if (!schedule) return null;

    const day = new Date(date);
    day.setUTCHours(0, 0, 0, 0);
    const weekStart = new Date(day);
    weekStart.setUTCDate(weekStart.getUTCDate() - weekStart.getUTCDay());
    const shift = (base: Date, days: number, hours = 0) =>
      new Date(base.getTime() + days * 86_400_000 + hours * 3_600_000);
    const weekEnd = shift(weekStart, 6);
    // As sessões têm data pura (meia-noite UTC); respostas e cronômetro têm
    // hora de verdade, e a semana do aluno vira à meia-noite de Brasília.
    const period = { from: shift(weekStart, 0, BRAZIL_UTC_OFFSET_HOURS), to: shift(weekStart, 7, BRAZIL_UTC_OFFSET_HOURS) };
    const previousPeriod = { from: shift(period.from, -7), to: period.from };

    const [sessions, previousSessions, logs, previousLogs, attempts, previousAttempts, simulations, historyRows, cutoff] =
      await Promise.all([
        this.repo.findSessionsWithTasks(schedule.id, weekStart, weekEnd),
        this.repo.findSessionsWithTasks(schedule.id, shift(weekStart, -7), shift(weekStart, -1)),
        this.repo.timeLogsForSchedule(schedule.id, period),
        this.repo.timeLogsForSchedule(schedule.id, previousPeriod),
        this.prisma.questionAttempt.findMany({
          where: { userId, createdAt: { gte: period.from, lt: period.to } },
          select: { isCorrect: true },
        }),
        this.prisma.questionAttempt.count({
          where: { userId, createdAt: { gte: previousPeriod.from, lt: previousPeriod.to } },
        }),
        this.prisma.simulationSubmission.findMany({
          where: { userId, submittedAt: { gte: period.from, lt: period.to } },
          select: { correct: true, total: true },
        }),
        // Histórico do domínio: as linhas da semana dizem em que tópicos o
        // aluno mexeu e como cada um terminou (a coluna é DATE, já no dia de
        // Brasília — mesma data pura das sessões).
        this.prisma.topicMasteryHistory.findMany({
          where: { userId, day: { gte: weekStart, lte: weekEnd }, status: { not: TopicMasteryStatus.NAO_ESTUDADO } },
          orderBy: { day: 'asc' },
        }),
        this.cutoffs.targetForUser(userId),
      ]);

    // Última linha de cada tópico na semana = como ele terminou a semana.
    const endOfWeek = new Map(historyRows.map((row) => [row.topicId, row]));
    const masteries = [...endOfWeek.values()];
    const topicIds = masteries.map((m) => m.topicId);
    const [topics, earlierRows] = topicIds.length
      ? await Promise.all([
          this.prisma.topic.findMany({ where: { id: { in: topicIds } }, include: { subject: true } }),
          this.prisma.topicMasteryHistory.findMany({
            where: { userId, topicId: { in: topicIds }, day: { lt: weekStart } },
            orderBy: { day: 'asc' },
          }),
        ])
      : [[], []];
    // Última linha de cada tópico ANTES da semana = de onde ele partiu.
    const beforeWeek = new Map(earlierRows.map((row) => [row.topicId, row]));
    const topicById = new Map(topics.map((topic) => [topic.id, topic]));
    const minutes = (rows: { durationMinutes: number }[]) => rows.reduce((sum, row) => sum + row.durationMinutes, 0);
    const fmt = (value: Date) => value.toISOString().slice(0, 10);

    return buildWeeklySummary({
      weekStart: fmt(weekStart),
      weekEnd: fmt(weekEnd),
      inProgress: Date.now() < period.to.getTime() && Date.now() >= period.from.getTime(),
      tasks: sessions.flatMap((session) =>
        session.tasks.map((task) => ({
          status: task.status,
          scheduledMinutes: task.scheduledMinutes,
          subjectId: task.subjectId,
          subjectName: task.subject?.name ?? null,
        })),
      ),
      studiedMinutes: minutes(logs),
      attempts,
      simulations,
      topics: masteries
        .filter((mastery) => topicById.has(mastery.topicId) && topicById.get(mastery.topicId)!.name !== CATCH_ALL_TOPIC_NAME)
        .map((mastery) => {
          const topic = topicById.get(mastery.topicId)!;
          return {
            id: topic.id,
            name: topic.name,
            subject: topic.subject?.name ?? null,
            status: mastery.status,
            masteryScore: mastery.masteryScore,
            attempts: mastery.attempts,
            before: beforeWeek.get(topic.id) ?? null,
          };
        }),
      previous: {
        tasksDone: previousSessions
          .flatMap((session) => session.tasks)
          .filter((task) => task.status === StudyTaskStatus.DONE).length,
        questionsAnswered: previousAttempts,
        studiedMinutes: minutes(previousLogs),
      },
      target:
        cutoff.status === 'OK' && cutoff.targetScore !== null
          ? { score: cutoff.targetScore, course: cutoff.course, university: cutoff.university, year: cutoff.projectedYear }
          : null,
    });
  }

  /**
   * Bloco de questões para praticar a tarefa: questões do tópico dela, as
   * que o aluno nunca respondeu na frente.
   */
  async taskPractice(userId: string, taskId: string): Promise<TaskPractice | null> {
    const task = await this.prisma.studyTask.findUnique({
      where: { id: taskId },
      include: { subject: true, topic: true, schedule: true },
    });
    if (!task || task.schedule.userId !== userId) return null;

    const page = task.topic
      ? await this.questions.findAll(userId, {
          subjectId: task.topic.subjectId,
          topicId: task.topic.id,
          page: 1,
          limit: 50,
        })
      : null;
    return {
      taskId: task.id,
      title: task.title,
      subject: task.subject?.name ?? null,
      topic: task.topic?.name ?? null,
      questions: page ? pickPracticeQuestions(page.items) : [],
    };
  }

  /**
   * Por que esta tarefa está no cronograma (§10). Montado no servidor, com
   * os dados de domínio do próprio aluno — o cliente só manda o id da
   * tarefa, então não tem como "convencer" a LuminIA de números falsos.
   */
  async explainTask(userId: string, taskId: string): Promise<TaskExplanation | null> {
    const task = await this.prisma.studyTask.findUnique({
      where: { id: taskId },
      include: { subject: true, topic: true, session: true, schedule: true },
    });
    if (!task || task.schedule.userId !== userId) return null;

    const schedule = await this.repo.findScheduleById(task.scheduleId);
    if (!schedule) return null;
    const phase = await this.schedules.phaseFor(schedule, task.session.date);
    const scheduleSubject = schedule.scheduleSubjects.find((ss) => ss.subjectId === task.subjectId);
    const reasons: string[] = [];

    if (task.activityType === StudyActivityType.REDACAO || task.subject?.code === ESSAY_SUBJECT_CODE) {
      reasons.push(
        schedule.essayFrequency === 'BIWEEKLY'
          ? 'Redação tem rotina própria: uma atividade a cada duas semanas, num ciclo de repertório, produção e correção.'
          : 'Redação tem rotina própria: uma atividade por semana, num ciclo de repertório, produção e correção.',
      );
    } else if (!task.topic) {
      reasons.push(
        task.title.endsWith(': estudo programado')
          ? 'Essa matéria ainda não tem catálogo de tópicos, então recebe um bloco proporcional às horas que você definiu para ela.'
          : 'Essa tarefa foi criada por você, fora do plano automático.',
      );
    } else {
      const [mastery, questionRows] = await Promise.all([
        this.prisma.topicMastery.findUnique({
          where: { userId_topicId: { userId, topicId: task.topic.id } },
        }),
        this.prisma.question.findMany({
          where: { subjectId: task.topic.subjectId },
          select: { topicId: true },
        }),
      ]);
      const countByTopic = new Map<string, number>();
      for (const row of questionRows) {
        if (row.topicId) countByTopic.set(row.topicId, (countByTopic.get(row.topicId) ?? 0) + 1);
      }
      const questionCount = countByTopic.get(task.topic.id) ?? 0;
      const maxTargetHours = Math.max(...schedule.scheduleSubjects.map((ss) => ss.targetHours));
      const inPriorityArea =
        Boolean(task.subject) &&
        schedule.priorityAreas.includes(STUDY_SUBJECT_CODE_TO_AREA[task.subject!.code]);
      const terms = topicPriorityTerms({
        masteryScore: mastery?.masteryScore ?? null,
        status: mastery?.status ?? null,
        lastStudiedAt: mastery?.lastStudiedAt ?? null,
        questionCount,
        maxQuestionCountInSubject: Math.max(0, ...countByTopic.values()),
        targetHours: scheduleSubject?.targetHours ?? 0,
        maxTargetHoursInSchedule: maxTargetHours,
        inPriorityArea,
        now: task.session.date,
      });

      if (task.activityType === StudyActivityType.REVISAO && mastery?.nextReviewAt) {
        reasons.push(
          `A revisão espaçada desse tópico venceu em ${formatDayMonth(mastery.nextReviewAt)}: revisar agora evita esquecer o que você já estudou.`,
        );
      }
      if (terms.naoEstudado) {
        reasons.push('Você ainda não estudou esse tópico, e conteúdo nunca visto sobe na fila.');
        const level = task.subject
          ? topicLevel(STUDY_SUBJECT_CODE_TO_SUBJECT_NAME[task.subject.code] ?? '', task.topic.name)
          : null;
        if (level === 'BASE') {
          reasons.push(`Ele é da base de ${task.subject!.name}: vem primeiro porque outros conteúdos da matéria dependem dele.`);
        } else if (level) {
          reasons.push(
            `Na trilha de ${task.subject!.name} ele é de nível ${TOPIC_LEVEL_LABEL[level]}: entra depois dos conteúdos de que depende, que já estão no seu cronograma.`,
          );
        }
      } else if (mastery) {
        const attempts =
          mastery.attempts > 0
            ? `${mastery.correctAttempts} acerto(s) em ${mastery.attempts} questão(ões)`
            : 'ainda sem questões respondidas';
        reasons.push(
          `Seu domínio nesse tópico está em ${mastery.masteryScore}% (${MASTERY_STATUS_LABEL[mastery.status]}, ${attempts}).`,
        );
      }
      if (terms.incidencia >= HIGH_INCIDENCE && questionCount > 0) {
        reasons.push(`É um dos tópicos mais cobrados de ${task.subject?.name ?? 'sua matéria'} no banco de questões (${questionCount} questões).`);
      }
      if (!terms.naoEstudado && terms.diasSemEstudar !== null && terms.diasSemEstudar >= STALE_DAYS) {
        reasons.push(`Faz ${terms.diasSemEstudar} dias que você não estuda esse tópico.`);
      }
      if (inPriorityArea && task.subject) {
        reasons.push(`${task.subject?.name} é de uma área que você marcou como prioritária (${STUDY_AREA_LABEL[STUDY_SUBJECT_CODE_TO_AREA[task.subject.code]]}).`);
      }
    }

    if (scheduleSubject && task.subject && task.subject.code !== ESSAY_SUBJECT_CODE) {
      reasons.push(
        `${task.subject.name} recebe uma fatia do dia proporcional às ${formatHours(scheduleSubject.targetHours)} que você definiu para a matéria.`,
      );
    }
    if (task.topic) reasons.push(ACTIVITY_REASON[task.activityType]);
    reasons.push(`Você está na fase de ${PHASE_LABEL[phase]} do cronograma: ${PHASE_REASON[phase]}.`);

    // Meta de nota pela nota de corte do Sisu (curso e universidade do
    // cadastro): a LuminIA fala da média real que o aluno precisa, em vez de
    // repetir o número que ele digitou no objetivo.
    const cutoff = await this.cutoffs.targetForUser(userId);

    const context = [
      'Contexto do cronograma do aluno (dados reais do sistema; use-os para explicar, sem inventar outros números):',
      `Tarefa: "${task.title}" — ${task.scheduledMinutes} minutos em ${formatDayMonth(task.session.date)}.`,
      `Matéria: ${task.subject?.name ?? 'sem matéria'}.${task.topic ? ` Tópico: ${task.topic.name}.` : ''}`,
      schedule.objective ? `Objetivo do aluno: ${schedule.objective}.` : null,
      schedule.targetCourse ? `Curso-alvo: ${schedule.targetCourse}.` : null,
      cutoff.status === 'OK'
        ? `Meta de nota: ${cutoff.message} A nota do ENEM vai até 1000 por prova; a meta é a média das cinco e é recalculada a cada edição do Sisu.`
        : null,
      'Motivos de a tarefa estar no dia:',
      ...reasons.map((reason) => `- ${reason}`),
      SCHEDULE_CONTEXT_GUIDANCE,
    ]
      .filter((line): line is string => line !== null)
      .join('\n');

    return {
      taskId: task.id,
      title: task.title,
      subject: task.subject?.name ?? null,
      topic: task.topic?.name ?? null,
      phase,
      reasons,
      context,
    };
  }

  /**
   * Diagnóstico inicial (§11.3): até 5 questões por área do ENEM, só das
   * matérias que estão no cronograma, espalhadas por tópicos diferentes e
   * que o aluno ainda não respondeu. Responder usa o endpoint normal de
   * tentativa (`POST /questions/:id/attempt`), que já alimenta o domínio.
   *
   * `recommended` diz se vale oferecer: só para quem ainda não tem domínio
   * registrado em nenhum tópico.
   */
  async diagnostic(userId: string): Promise<{ recommended: boolean; areas: DiagnosticArea[] } | null> {
    const schedule = await this.repo.findScheduleByUserId(userId);
    if (!schedule) return null;

    const masteryCount = await this.prisma.topicMastery.count({ where: { userId } });
    const subjects = await this.questionBankSubjects(schedule.scheduleSubjects);
    const subjectIdByName = new Map(subjects.map((s) => [s.name, s.id]));

    const areas: DiagnosticArea[] = [];
    for (const area of Object.values(StudyArea)) {
      const subjectIds = schedule.scheduleSubjects
        .filter((ss) => STUDY_SUBJECT_CODE_TO_AREA[ss.subject.code] === area)
        .map((ss) => subjectIdByName.get(STUDY_SUBJECT_CODE_TO_SUBJECT_NAME[ss.subject.code] ?? ''))
        .filter((id): id is string => Boolean(id));
      if (subjectIds.length === 0) continue;

      const pools = await Promise.all(
        subjectIds.map(async (subjectId) => {
          const page = await this.questions.findAll(userId, { subjectId, page: 1, limit: 50 });
          return page.items.filter((q) => !q.progress || q.progress.attempts === 0);
        }),
      );

      // Rodízio entre as matérias da área, um tópico por vez.
      const picked: QuestionResponseDto[] = [];
      const seenTopics = new Set<string>();
      let progressed = true;
      while (picked.length < DIAGNOSTIC_QUESTIONS_PER_AREA && progressed) {
        progressed = false;
        for (const pool of pools) {
          if (picked.length >= DIAGNOSTIC_QUESTIONS_PER_AREA) break;
          const index = pool.findIndex((q) => !seenTopics.has(q.topicId ?? q.topic));
          if (index === -1) continue;
          const [question] = pool.splice(index, 1);
          seenTopics.add(question.topicId ?? question.topic);
          picked.push(question);
          progressed = true;
        }
      }
      if (picked.length > 0) areas.push({ area, label: STUDY_AREA_LABEL[area], questions: picked });
    }

    return { recommended: masteryCount === 0 && areas.length > 0, areas };
  }
}

function formatDayMonth(date: Date): string {
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${day}/${month}`;
}

function formatHours(hours: number): string {
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)}h`;
}
