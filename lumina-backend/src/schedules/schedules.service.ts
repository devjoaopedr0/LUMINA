import { BadRequestException, Injectable, Optional } from "@nestjs/common";
import { StudyActivityType, StudyTaskStatus, type Prisma } from "@prisma/client";
import { SchedulesRepository } from "./schedules.repository";
import { ScheduleGeneratorService } from "./schedule-generator.service";
import { TopicMasteryService } from "../questions/topic-mastery.service";
import { essayStepForWeek, pickEssaySession, scheduleWeekIndex, type EssayStep } from "./schedule-essay";
import { computeSchedulePhase, type SchedulePhase } from "./schedule-phase";
import { ESSAY_SUBJECT_CODE } from "./study-areas";
import { STUDY_SUBJECT_CODE_TO_SUBJECT_NAME } from "./study-subject-question-bank-map";
import { Db } from "./domain/types";
import { assertNotPastDay, brazilToday, formatBr } from "../common/date-rules";
import { scheduleLimits, weeklyMinutes, type ScheduleLimits, type SubjectContent } from "./schedule-limits";
import { goalFromProfile } from "./schedule-goal";
import { withReadCache } from "./calendar-cache";
import { personalDurations, type ActivityDurations } from "./activity-durations";
import { PriorityCalibrationService } from "./priority-calibration.service";
import { PRACTICE_WINDOW_HOURS, summarizePractice } from "./schedule-practice";
import type {
  CreateStudyScheduleDto,
  ReplanTaskDto,
  UpdateStudyScheduleDto,
} from "./dto/create-study-schedule.dto";

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(23, 59, 59, 999);
  return d;
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}

function formatDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function eachDayOfInterval(start: Date, end: Date): Date[] {
  const days: Date[] = [];
  const current = startOfDay(start);
  const last = endOfDay(end);
  while (current <= last) {
    days.push(new Date(current));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return days;
}

/**
 * O app identifica a tarefa pela MATÉRIA (`subjectName`). O Prisma devolve a
 * disciplina aninhada em `subject`, então sem este achatamento o front recebia
 * `subjectName` indefinido e caía no título da tarefa — que é o subtópico.
 * É a razão de o cronograma parecer organizado por subtópico.
 */
function withSubjectName<T extends object>(task: T): T & { subjectName: string | null } {
  const subject = (task as { subject?: { name: string } | null }).subject;
  return { ...task, subjectName: subject?.name ?? null };
}

/** Maior período do calendário de uma vez (um mês com as semanas das bordas). */
export const CALENDAR_MAX_DAYS = 42;

type ScheduleWithSubjects = NonNullable<
  Awaited<ReturnType<SchedulesRepository["findScheduleByUserId"]>>
>;

/** Título das tarefas genéricas ("Inglês: estudo programado") — e de TODAS
 *  as tarefas dos cronogramas criados antes do gerador adaptativo. */
const STATIC_TASK_SUFFIX = ": estudo programado";

/**
 * Tarefa que o gerador criou e o aluno ainda não tocou — pode ser apagada e
 * refeita num replanejamento. Tarefa manual (título livre, sem tópico), em
 * andamento, concluída ou com tempo registrado nunca entra aqui.
 */
const REPLACEABLE_TASK_WHERE: Prisma.StudyTaskWhereInput = {
  status: StudyTaskStatus.PENDING,
  timeLogs: { none: {} },
  OR: [
    { topicId: { not: null } },
    { activityType: StudyActivityType.REDACAO },
    { title: { endsWith: STATIC_TASK_SUFFIX } },
  ],
};

/** Gerar um dia faz mais de uma dezena de consultas; o limite padrão de 5s
 *  da transação interativa não comporta um banco remoto. */
const PLAN_TX_OPTIONS = { maxWait: 10_000, timeout: 60_000 };
/** Até quanto tempo para trás as tarefas medidas contam no ritmo do aluno. */
const DURATION_WINDOW_DAYS = 60;

export interface ReplanPreview {
  date: string;
  subjects: { subjectName: string; beforeMinutes: number; afterMinutes: number }[];
  warnings: string[];
}

export interface ReplanResult {
  strategy: ReplanTaskDto["strategy"];
  /** false = só a prévia do AUTO; nada foi gravado. */
  applied: boolean;
  movedTo: string | null;
  preview?: ReplanPreview;
}

/** Desfaz a transação do AUTO quando o aluno só pediu a prévia. */
class ReplanPreviewRollback extends Error {
  constructor(readonly result: ReplanResult) {
    super("replan-preview");
  }
}

@Injectable()
export class SchedulesService {
  constructor(
    private readonly repo: SchedulesRepository,
    private readonly generator: ScheduleGeneratorService,
    private readonly topicMastery: TopicMasteryService,
    // Opcional: sem ela (testes de unidade), a prioridade usa os pesos padrão.
    @Optional() private readonly priorityCalibration?: PriorityCalibrationService,
  ) {}

  async findStudySubjects() {
    return this.repo.findStudySubjects();
  }

  async getUserVestibular(userId: string) {
    return this.repo.findUserVestibular(userId);
  }

  async setVestibular(
    userId: string,
    data: { examId?: string | null; customName?: string | null; targetDate?: Date | null },
  ) {
    if (data.targetDate) assertNotPastDay(data.targetDate, "A data da prova");
    return this.repo.upsertUserVestibular(userId, data);
  }

  async getSchedule(userId: string) {
    return this.repo.findScheduleByUserId(userId);
  }

  /**
   * Edita o cronograma inteiro: período, disponibilidade, objetivo e
   * disciplinas. Os dias a partir de hoje são refeitos — sessão que deixou de
   * existir sai (se o aluno não tiver nada feito nela), dia novo ganha
   * sessão, e as tarefas que o gerador criou e o aluno não tocou são apagadas
   * para nascerem de novo com os parâmetros novos. O passado não muda.
   */
  async updateSchedule(userId: string, scheduleId: string, dto: UpdateStudyScheduleDto) {
    const schedule = await this.repo.findScheduleById(scheduleId);
    if (!schedule || schedule.userId !== userId) return null;

    const startDate = dto.startDate ? startOfDay(new Date(dto.startDate)) : schedule.startDate;
    const endDate = dto.endDate ? startOfDay(new Date(dto.endDate)) : schedule.endDate;
    const studyDays = dto.studyDays ?? (schedule.studyDays as number[]);
    const dailyMinutes = dto.dailyMinutes ?? schedule.dailyMinutes;
    const dayMinutes =
      dto.dayMinutes ?? schedule.dayMinutes.map(({ weekday, minutes }) => ({ weekday, minutes }));

    // Mudar o início não pode levá-lo para o passado; manter o início antigo pode.
    if (dto.startDate && startDate.getTime() !== startOfDay(schedule.startDate).getTime()) {
      assertNotPastDay(startDate, "A data de início do cronograma");
    }
    if (dto.endDate) assertNotPastDay(endDate, "A data final do cronograma");
    if (endDate < startDate) {
      throw new BadRequestException("A data final deve ser igual ou posterior à inicial.");
    }
    if (dto.subjects && !dto.subjects.some((subject) => subject.targetHours > 0)) {
      throw new BadRequestException("Informe horas de estudo para pelo menos uma disciplina.");
    }
    const minutesByWeekday = this.minutesByWeekday(studyDays, dailyMinutes, dayMinutes);
    if (dto.startDate || dto.endDate || dto.subjects || dto.studyDays || dto.dailyMinutes || dto.dayMinutes) {
      const subjects = dto.subjects ?? schedule.scheduleSubjects.map((s) => ({ subjectId: s.subjectId, targetHours: Number(s.targetHours) }));
      await this.assertWithinContent(startDate, endDate, subjects, minutesByWeekday);
    }
    if (!eachDayOfInterval(startDate, endDate).some((d) => minutesByWeekday.has(d.getUTCDay()))) {
      throw new BadRequestException("O período deve incluir pelo menos um dia de estudo selecionado.");
    }

    // Objetivo e curso vêm do perfil (fonte única); o texto livre só vale para quem ainda não preencheu o perfil.
    const goal = goalFromProfile(await this.profileGoal(userId));
    const update: Prisma.StudyScheduleUpdateInput = { startDate, endDate, studyDays, dailyMinutes };
    if (goal.objective) {
      update.objective = goal.objective;
      update.targetCourse = goal.targetCourse;
    } else {
      if (dto.objective !== undefined) update.objective = dto.objective || null;
      if (dto.targetCourse !== undefined) update.targetCourse = dto.targetCourse || null;
    }
    if (dto.priorityAreas !== undefined) update.priorityAreas = dto.priorityAreas;
    if (dto.essayFrequency !== undefined) update.essayFrequency = dto.essayFrequency ?? null;

    await this.repo.prisma.$transaction(async (tx: Db) => {
      await tx.studySchedule.update({ where: { id: scheduleId }, data: update });
      if (dto.subjects) {
        await this.repo.deleteScheduleSubjects(tx, scheduleId);
        await this.repo.createScheduleSubjects(tx, scheduleId, dto.subjects);
      }
      if (dto.dayMinutes !== undefined) {
        await this.repo.replaceDayMinutes(tx, scheduleId, dayMinutes);
      }

      // Mesma tolerância de um dia do gatilho de geração: o "hoje" do aluno
      // pode ser o "ontem" UTC do servidor.
      const yesterday = addDays(startOfDay(new Date()), -1);
      const from = startDate > yesterday ? startDate : yesterday;

      await tx.studyTask.deleteMany({
        where: { scheduleId, session: { date: { gte: from } }, ...REPLACEABLE_TASK_WHERE },
      });
      const sessions = await tx.studySession.findMany({
        where: { scheduleId, date: { gte: from } },
        include: { _count: { select: { tasks: true } } },
      });
      const wanted = new Map<number, { date: Date; scheduledMinutes: number }>();
      for (const date of eachDayOfInterval(from, endDate)) {
        const minutes = minutesByWeekday.get(date.getUTCDay());
        if (minutes) wanted.set(date.getTime(), { date, scheduledMinutes: minutes });
      }
      for (const session of sessions) {
        const want = wanted.get(session.date.getTime());
        if (!want) {
          // Dia que saiu do plano: só some se não sobrou nada do aluno nele.
          if (session._count.tasks === 0) await tx.studySession.delete({ where: { id: session.id } });
          continue;
        }
        wanted.delete(session.date.getTime());
        if (session.scheduledMinutes !== want.scheduledMinutes) {
          await tx.studySession.update({
            where: { id: session.id },
            data: { scheduledMinutes: want.scheduledMinutes },
          });
        }
      }
      await this.repo.createSessions(tx, scheduleId, [...wanted.values()]);
      await this.updateProgress(tx, scheduleId);
    }, PLAN_TX_OPTIONS);

    return this.repo.findScheduleById(scheduleId);
  }

  async getScheduleTasks(
    userId: string,
    params: { status?: string; subjectId?: string; page: number; limit: number },
  ) {
    const schedule = await this.repo.findScheduleByUserId(userId);
    if (!schedule) return null;
    const result = await this.repo.findTasks({
      scheduleId: schedule.id,
      status: params.status,
      subjectId: params.subjectId,
      page: params.page,
      limit: params.limit,
    });
    return { ...result, items: result.items.map(withSubjectName) };
  }

  async getTasks(
    userId: string,
    params: { status?: string; subjectId?: string; page: number; limit: number },
  ) {
    return this.getScheduleTasks(userId, params);
  }

  async createSchedule(
    userId: string,
    dto: CreateStudyScheduleDto,
  ): Promise<void> {
    const startDate = assertNotPastDay(dto.startDate, "A data de início do cronograma");
    const endDate = startOfDay(new Date(dto.endDate));
    if (endDate < startDate) {
      throw new BadRequestException("A data final deve ser igual ou posterior à inicial.");
    }
    if (!dto.subjects.some((subject) => subject.targetHours > 0)) {
      throw new BadRequestException("Informe horas de estudo para pelo menos uma disciplina.");
    }
    await this.assertWithinContent(
      startDate,
      endDate,
      dto.subjects,
      this.minutesByWeekday(dto.studyDays, dto.dailyMinutes, dto.dayMinutes),
    );

    // As tarefas de cada dia não são mais geradas aqui: ficam pra quando o
    // dia for de fato consultado (getDailySession), com a prioridade calculada
    // na hora — é o que torna o cronograma adaptativo (fase 2, ver
    // docs/CRONOGRAMA_ADAPTATIVO_DESIGN.md §5). Gerar tudo de uma vez na
    // criação, pra meses no futuro, é exatamente o comportamento estático que
    // essa fase substitui.
    const minutesByWeekday = this.minutesByWeekday(dto.studyDays, dto.dailyMinutes, dto.dayMinutes);
    const sessions = eachDayOfInterval(startDate, endDate)
      .filter((d) => minutesByWeekday.has(d.getUTCDay()))
      .map((date) => ({ date, scheduledMinutes: minutesByWeekday.get(date.getUTCDay())! }));
    if (sessions.length === 0) {
      throw new BadRequestException("O período deve incluir pelo menos um dia de estudo selecionado.");
    }

    const goal = goalFromProfile(await this.profileGoal(userId));
    await this.repo.prisma.$transaction(async (tx: Db) => {
      const scheduleRecord = await this.repo.createSchedule(tx, {
        userId,
        startDate,
        endDate,
        studyDays: dto.studyDays,
        dailyMinutes: dto.dailyMinutes,
        objective: goal.objective ?? dto.objective ?? null,
        targetCourse: goal.targetCourse ?? dto.targetCourse ?? null,
        priorityAreas: dto.priorityAreas ?? [],
        essayFrequency: dto.essayFrequency ?? null,
      });

      await this.repo.createScheduleSubjects(tx, scheduleRecord.id, dto.subjects);
      if (dto.dayMinutes?.length) {
        await this.repo.replaceDayMinutes(tx, scheduleRecord.id, dto.dayMinutes);
      }
      await this.repo.createSessions(tx, scheduleRecord.id, sessions);

      await this.repo.upsertProgress(tx, scheduleRecord.id, {
        completedMinutes: 0,
        totalScheduledMinutes: sessions.reduce((sum, s) => sum + s.scheduledMinutes, 0),
        streakDays: 0,
        lastStudyDate: null,
        completedTasks: 0,
        totalTasks: 0,
      });
    });
  }

  async deleteSchedule(userId: string, scheduleId: string): Promise<void> {
    const schedule = await this.repo.findScheduleById(scheduleId);
    if (!schedule || schedule.userId !== userId) return;

    await this.repo.prisma.$transaction(async (tx: Db) => {
      await this.repo.deleteScheduleSubjects(tx, scheduleId);
      await this.repo.deleteSchedule(tx, scheduleId);
    });
  }

  async getSessionForDate(scheduleId: string, date: Date) {
    return this.repo.findSessionByDate(scheduleId, startOfDay(date));
  }

  async getDailySession(userId: string, date: Date) {
    const schedule = await this.repo.findScheduleByUserId(userId);
    if (!schedule) return null;
    const day = startOfDay(date);
    let session = await this.repo.findSessionByDate(schedule.id, day);

    // Gera as tarefas na hora, só quando faltam e o dia é hoje ou no futuro —
    // dia passado nunca visitado fica mesmo vazio (não tem o que "planejar"
    // retroativamente). É isso que torna o cronograma adaptativo: a
    // prioridade usada é a de agora, não a de quando o cronograma foi criado.
    //
    // `date` é o dia de calendário do ALUNO; o relógio do servidor é UTC. Em
    // fuso atrás de UTC (Brasil) o "hoje" do aluno ainda é o "ontem" do
    // servidor durante algumas horas da noite — por isso a tolerância de um
    // dia, senão o dia de hoje deixava de ser gerado depois das 21h.
    if (session && day.getTime() >= addDays(startOfDay(new Date()), -1).getTime()) {
      // Cronograma criado antes do gerador adaptativo tem o dia preenchido
      // com tarefas estáticas ("Matemática: estudo programado"). Enquanto o
      // aluno não mexeu em nenhuma, o dia é refeito pelo gerador novo.
      const legacy = this.isUntouchedLegacySession(session.tasks);
      if (session.tasks.length === 0 || legacy) {
        const current = session;
        await this.repo.prisma.$transaction(async (tx: Db) => {
          await this.planSession(tx, schedule, current, { replace: legacy });
          await this.updateProgress(tx, schedule.id);
        }, PLAN_TX_OPTIONS);
        session = await this.repo.findSessionByDate(schedule.id, day);
      }
    }

    // O cronômetro registra por matéria, então o tempo do dia vive em dois
    // lugares: nas tarefas (registro antigo) e por disciplina (registro novo).
    // Sem somar os dois, a linha "Estudado" da visão diária ficaria zerada
    // justamente depois de o aluno usar o cronômetro.
    const logs = await this.repo.timeLogsForSchedule(schedule.id, {
      from: day,
      to: endOfDay(date),
    });

    const minutesByTask = new Map<string, number>();
    const minutesBySubject = new Map<string, number>();
    for (const log of logs) {
      if (log.taskId) {
        minutesByTask.set(
          log.taskId,
          (minutesByTask.get(log.taskId) ?? 0) + log.durationMinutes,
        );
      }
      if (log.subjectId) {
        minutesBySubject.set(
          log.subjectId,
          (minutesBySubject.get(log.subjectId) ?? 0) + log.durationMinutes,
        );
      }
    }

    const tasksWithMinutes = (session?.tasks ?? []).map((task: { id: string }) =>
      withSubjectName({ ...task, loggedMinutes: minutesByTask.get(task.id) ?? 0 }),
    );

    return {
      schedule,
      phase: await this.phaseFor(schedule, day),
      // A visão diária do app lê `session.tasks`, então o tempo por tarefa
      // precisa vir nos dois lugares — `tasks` continua sendo o atalho.
      session: session ? { ...session, tasks: tasksWithMinutes } : null,
      tasks: tasksWithMinutes,
      loggedMinutesBySubject: Object.fromEntries(minutesBySubject),
    };
  }

  /**
   * Refaz o plano de um dia com o domínio de AGORA — usado depois do
   * diagnóstico inicial, quando o dia já tinha sido planejado sem saber o
   * nível do aluno. Só troca o que o gerador criou e o aluno não tocou.
   */
  async refreshDay(userId: string, date: Date) {
    const schedule = await this.repo.findScheduleByUserId(userId);
    if (!schedule) return null;
    const day = startOfDay(date);
    const session = await this.repo.findSessionByDate(schedule.id, day);
    if (session && day.getTime() >= addDays(startOfDay(new Date()), -1).getTime()) {
      await this.repo.prisma.$transaction(async (tx: Db) => {
        await this.planSession(tx, schedule, session, { replace: true });
        await this.updateProgress(tx, schedule.id);
      }, PLAN_TX_OPTIONS);
    }
    return this.getDailySession(userId, date);
  }

  /**
   * Resumo dos sete dias a partir de `start`: o que está planejado e o que já
   * foi feito em cada um. Não gera tarefa nenhuma — dia ainda não aberto vem
   * com `totalTasks: 0` e o tempo planejado da sessão.
   */
  async getWeek(userId: string, start: Date) {
    const schedule = await this.repo.findScheduleByUserId(userId);
    if (!schedule) return null;
    const from = startOfDay(start);
    const sessions = await this.repo.findSessionsWithTasks(schedule.id, from, addDays(from, 6));
    return sessions.map((session) => {
      const tasks = session.tasks.filter((t) => t.status !== StudyTaskStatus.SKIPPED);
      return {
        date: formatDate(session.date),
        scheduledMinutes: session.scheduledMinutes,
        totalTasks: tasks.length,
        doneTasks: tasks.filter((t) => t.status === StudyTaskStatus.DONE).length,
      };
    });
  }

  /**
   * Calendário do cronograma (semana ou mês): o que estudar em cada dia.
   *
   * - Dia que já tem tarefas (hoje, passados, ou futuros já planejados):
   *   mostra as tarefas reais.
   * - Dia futuro ainda sem tarefas: PREVISÃO, montada pelo mesmo gerador do
   *   dia (prioridades de agora), sem gravar nada. Os assuntos previstos num
   *   dia saem dos dias seguintes, como na progressão real. O cronograma é
   *   adaptativo: quando o dia chegar, ele é refeito com o desempenho daquele
   *   momento, então a previsão pode mudar.
   */
  async getCalendar(userId: string, from: Date, to: Date) {
    const schedule = await this.repo.findScheduleByUserId(userId);
    if (!schedule) return null;
    const start = startOfDay(from);
    const end = startOfDay(to);
    if (end < start) throw new BadRequestException("O fim do período deve ser depois do início.");
    if ((end.getTime() - start.getTime()) / 86_400_000 > CALENDAR_MAX_DAYS) {
      throw new BadRequestException(`O calendário mostra no máximo ${CALENDAR_MAX_DAYS} dias por vez.`);
    }
    const sessions = await this.repo.findSessionsWithTasks(schedule.id, start, end);
    const subjectName = new Map(schedule.scheduleSubjects.map((ss) => [ss.subjectId, ss.subject.name]));
    const today = brazilToday();
    const used = new Set<string>(schedule.excludedTopicIds);
    const durations = await this.activityDurations(this.repo.prisma, schedule.id, today);
    const weights = await this.priorityCalibration?.weights();
    // Leituras que não mudam entre os dias ficam em cache durante a consulta.
    const db = withReadCache(this.repo.prisma);
    const vestibular = await this.repo.findUserVestibular(userId);
    const examDate = vestibular?.targetDate ?? schedule.endDate;

    const days = [];
    for (const session of sessions) {
      const real = session.tasks.filter((t) => t.status !== StudyTaskStatus.SKIPPED);
      if (real.length > 0 || session.date < today) {
        for (const t of real) if (t.topicId) used.add(t.topicId);
        days.push({
          date: formatDate(session.date),
          scheduledMinutes: session.scheduledMinutes,
          projected: false,
          tasks: real.map((t) => ({
            id: t.id,
            subject: t.subject?.name ?? subjectName.get(t.subjectId ?? "") ?? "Estudo",
            title: t.title,
            activityType: t.activityType,
            minutes: t.scheduledMinutes,
            status: t.status,
          })),
        });
        continue;
      }
      const projected = await this.generator.buildTasksForSession(
        {
          id: session.id,
          scheduleId: schedule.id,
          date: session.date,
          scheduledMinutes: session.scheduledMinutes,
          phase: computeSchedulePhase(schedule.startDate, examDate, startOfDay(session.date)),
          priorityAreas: schedule.priorityAreas,
          essay: await this.essayFor(db, schedule, session),
          occupiedMinutes: 0,
          excludeTopicIds: [...used],
          occupiedBySubject: {},
          durations,
          priorityWeights: weights,
        },
        schedule.userId,
        schedule.scheduleSubjects.map((ss) => ({
          subjectId: ss.subjectId,
          targetHours: ss.targetHours,
          subject: { name: ss.subject.name, code: ss.subject.code },
        })),
        db,
      );
      for (const t of projected) if (t.topicId) used.add(t.topicId);
      days.push({
        date: formatDate(session.date),
        scheduledMinutes: session.scheduledMinutes,
        projected: true,
        tasks: projected.map((t) => ({
          id: null,
          subject: subjectName.get(t.subjectId ?? "") ?? "Estudo",
          title: t.title,
          activityType: t.activityType,
          minutes: t.scheduledMinutes ?? 0,
          status: StudyTaskStatus.PENDING,
        })),
      });
    }
    return {
      from: formatDate(start),
      to: formatDate(end),
      scheduleStart: formatDate(schedule.startDate),
      scheduleEnd: formatDate(schedule.endDate),
      examDate: vestibular?.targetDate ? formatDate(vestibular.targetDate) : null,
      days,
    };
  }

  /** Fase da reta num dia (fase 3, §7). A prova é a data-alvo do vestibular
   *  do aluno; sem ela, o fim do cronograma faz o papel de dia da prova. */
  async phaseFor(
    schedule: { userId: string; startDate: Date; endDate: Date },
    date: Date,
  ): Promise<SchedulePhase> {
    const vestibular = await this.repo.findUserVestibular(schedule.userId);
    const examDate = vestibular?.targetDate ?? schedule.endDate;
    return computeSchedulePhase(schedule.startDate, examDate, startOfDay(date));
  }

  /** Dia de cronograma antigo que ninguém tocou: só tarefas estáticas
   *  pendentes, e pelo menos uma de matéria que hoje teria tópico (ou de
   *  Redação, que hoje tem rotina própria). Um dia só com Inglês/Espanhol
   *  continua valendo — é assim que o gerador novo também o planeja. */
  private isUntouchedLegacySession(
    tasks: { topicId: string | null; title: string; status: StudyTaskStatus; subject: { code: string } | null }[],
  ): boolean {
    if (tasks.length === 0) return false;
    const allStatic = tasks.every(
      (t) => t.topicId === null && t.status === StudyTaskStatus.PENDING && t.title.endsWith(STATIC_TASK_SUFFIX),
    );
    return (
      allStatic &&
      tasks.some(
        (t) =>
          t.subject !== null &&
          (t.subject.code === ESSAY_SUBJECT_CODE || t.subject.code in STUDY_SUBJECT_CODE_TO_SUBJECT_NAME),
      )
    );
  }

  /**
   * Duração de cada tipo de atividade no ritmo do aluno (calibração C2, ver
   * activity-durations.ts), pelas tarefas concluídas que têm tempo medido: o
   * tempo ativo registrado na tarefa ou, no simulado, do início ao envio.
   */
  private async activityDurations(tx: Db, scheduleId: string, date: Date): Promise<ActivityDurations> {
    const since = new Date(date.getTime() - DURATION_WINDOW_DAYS * 86_400_000);
    const tasks = await this.repo.findMeasuredTasks(tx, scheduleId, since);
    return personalDurations(
      tasks.flatMap((task) => {
        const logged = task.timeLogs.reduce((sum, log) => sum + log.durationMinutes, 0);
        const submission = task.simulation?.submissions[0];
        const actualMinutes = logged > 0
          ? logged
          : submission?.startedAt
            ? Math.round((submission.submittedAt.getTime() - submission.startedAt.getTime()) / 60_000)
            : 0;
        return actualMinutes > 0
          ? [{ activityType: task.activityType, scheduledMinutes: task.scheduledMinutes, actualMinutes }]
          : [];
      }),
    );
  }

  /** Etapa de redação que cai nesta sessão, se a redação da semana for nela
   *  (fase 5, §9). O dia é escolhido entre os que ainda dá para planejar. */
  private async essayFor(
    tx: Db,
    schedule: ScheduleWithSubjects,
    session: { id: string; date: Date },
  ): Promise<EssayStep | null> {
    if (!schedule.scheduleSubjects.some((ss) => ss.subject.code === ESSAY_SUBJECT_CODE)) return null;
    const weekIndex = scheduleWeekIndex(schedule.startDate, session.date);
    const step = essayStepForWeek(weekIndex, schedule.essayFrequency);
    if (!step) return null;

    const weekStart = addDays(startOfDay(schedule.startDate), weekIndex * 7);
    const weekSessions = await tx.studySession.findMany({
      where: { scheduleId: schedule.id, date: { gte: weekStart, lte: addDays(weekStart, 6) } },
      include: {
        tasks: { where: { activityType: StudyActivityType.REDACAO }, select: { id: true } },
      },
    });
    // A semana já tem a sua redação (gerada antes, ou movida pelo aluno).
    if (weekSessions.some((s) => s.tasks.length > 0)) return null;

    const yesterday = addDays(startOfDay(new Date()), -1);
    const pick = pickEssaySession(weekSessions.filter((s) => s.date >= yesterday));
    return pick?.id === session.id ? step : null;
  }

  /**
   * Planeja um dia com o gerador adaptativo. Sem `replace`, só age em dia que
   * ainda não tem tarefa nenhuma. Com `replace`, apaga o que o gerador criou
   * e o aluno não tocou (menos `keepTaskIds`) e refaz o resto do dia em volta
   * do que ficou — é o que o replanejamento usa (fase 4, §12).
   */
  private async planSession(
    tx: Db,
    schedule: ScheduleWithSubjects,
    session: { id: string; date: Date; scheduledMinutes: number },
    options: { replace?: boolean; keepTaskIds?: string[] } = {},
  ): Promise<void> {
    if (options.replace) {
      await tx.studyTask.deleteMany({
        where: {
          sessionId: session.id,
          id: { notIn: options.keepTaskIds ?? [] },
          ...REPLACEABLE_TASK_WHERE,
        },
      });
    }
    const kept = await tx.studyTask.findMany({
      where: { sessionId: session.id, status: { not: StudyTaskStatus.SKIPPED } },
    });
    if (!options.replace && kept.length > 0) return;

    const tasks = await this.generator.buildTasksForSession(
      {
        id: session.id,
        scheduleId: schedule.id,
        date: session.date,
        scheduledMinutes: session.scheduledMinutes,
        phase: await this.phaseFor(schedule, session.date),
        priorityAreas: schedule.priorityAreas,
        essay: kept.some((t) => t.activityType === StudyActivityType.REDACAO)
          ? null
          : await this.essayFor(tx, schedule, session),
        occupiedMinutes: kept.reduce((sum, t) => sum + t.scheduledMinutes, 0),
        excludeTopicIds: [
          ...kept.flatMap((t) => (t.topicId ? [t.topicId] : [])),
          // Tópicos que o aluno tirou do cronograma nunca são agendados.
          ...schedule.excludedTopicIds,
        ],
        occupiedBySubject: kept.reduce<Record<string, number>>((minutes, t) => {
          if (t.subjectId) minutes[t.subjectId] = (minutes[t.subjectId] ?? 0) + t.scheduledMinutes;
          return minutes;
        }, {}),
        durations: await this.activityDurations(tx, schedule.id, session.date),
        priorityWeights: await this.priorityCalibration?.weights(),
      },
      schedule.userId,
      schedule.scheduleSubjects.map((ss) => ({
        subjectId: ss.subjectId,
        targetHours: ss.targetHours,
        subject: { name: ss.subject.name, code: ss.subject.code },
      })),
      tx,
    );
    if (tasks.length > 0) await this.repo.createTasks(tx, tasks);
  }

  /**
   * O aluno escolhe quais tópicos estudar. Tirar um tópico o guarda no
   * cronograma (o gerador não o agenda mais) e refaz os dias, de hoje em
   * diante, em que ele estava agendado e intocado. Devolver só o reinclui:
   * ele volta à fila nos próximos dias gerados.
   */
  async setTopicIncluded(userId: string, topicId: string, included: boolean) {
    const schedule = await this.repo.findScheduleByUserId(userId);
    if (!schedule) return null;
    const topic = await this.repo.prisma.topic.findUnique({ where: { id: topicId } });
    if (!topic) return null;

    const excluded = new Set(schedule.excludedTopicIds);
    if (included) excluded.delete(topicId);
    else excluded.add(topicId);
    const excludedTopicIds = [...excluded];

    await this.repo.prisma.$transaction(async (tx: Db) => {
      await tx.studySchedule.update({ where: { id: schedule.id }, data: { excludedTopicIds } });
      if (included) return;

      const yesterday = addDays(startOfDay(new Date()), -1);
      const scheduled = await tx.studyTask.findMany({
        where: {
          scheduleId: schedule.id,
          topicId,
          session: { date: { gte: yesterday } },
          ...REPLACEABLE_TASK_WHERE,
        },
        select: { sessionId: true },
      });
      const sessionIds = [...new Set(scheduled.map((task) => task.sessionId))];
      if (sessionIds.length === 0) return;
      const sessions = await tx.studySession.findMany({ where: { id: { in: sessionIds } } });
      for (const session of sessions) {
        await this.planSession(tx, { ...schedule, excludedTopicIds }, session, { replace: true });
      }
      await this.updateProgress(tx, schedule.id);
    }, PLAN_TX_OPTIONS);

    return { topicId, included };
  }

  async createTask(
    userId: string,
    data: {
      sessionId: string;
      subjectId?: string;
      title: string;
      description?: string;
      scheduledMinutes: number;
    },
  ) {
    const session = await this.repo.findSessionById(data.sessionId);
    if (!session || session.schedule.userId !== userId) return null;

    return this.repo.prisma.$transaction(async (tx: Db) => {
      const created = await this.repo.createTask({
        scheduleId: session.scheduleId,
        sessionId: data.sessionId,
        subjectId: data.subjectId ?? null,
        title: data.title,
        description: data.description ?? null,
        scheduledMinutes: data.scheduledMinutes,
      }, tx);
      await this.updateProgress(tx, session.scheduleId);
      const withSubject = await this.repo.findTaskById(created.id, tx);
      return withSubject ? withSubjectName(withSubject) : null;
    });
  }

  async updateTask(
    userId: string,
    taskId: string,
    data: Partial<Prisma.StudyTaskUncheckedUpdateInput>,
  ) {
    const task = await this.repo.findTaskById(taskId);
    if (!task || task.schedule.userId !== userId) return null;

    const update: Prisma.StudyTaskUncheckedUpdateInput = { ...data };
    if (
      data.status === StudyTaskStatus.DONE &&
      task.status !== StudyTaskStatus.DONE
    ) {
      update.completedAt = new Date();
    } else if (data.status && data.status !== StudyTaskStatus.DONE) {
      update.completedAt = null;
      // Reaberta: o resultado da prática era da conclusão que foi desfeita.
      update.practiceAnswered = null;
      update.practiceCorrect = null;
      // E o simulado dela já foi enviado (só aceita um envio): solta o
      // vínculo para a tarefa ganhar um simulado novo.
      if (task.status === StudyTaskStatus.DONE) update.simulationId = null;
    }

    const justCompleted =
      data.status === StudyTaskStatus.DONE && task.status !== StudyTaskStatus.DONE;

    return this.repo.prisma.$transaction(async (tx: Db) => {
      await this.repo.updateTask(taskId, update, tx);
      if (justCompleted && task.topicId) {
        await this.topicMastery.registerStudy(userId, task.topicId, tx);
      }
      await this.updateProgress(tx, task.scheduleId);
      // Pelo mesmo `tx`: fora dele a leitura não enxerga o update ainda não
      // commitado e a resposta voltava com o status antigo.
      const refreshed = await this.repo.findTaskById(taskId, tx);
      return refreshed ? withSubjectName(refreshed) : null;
    });
  }

  async deleteTask(userId: string, taskId: string) {
    const task = await this.repo.findTaskById(taskId);
    if (!task || task.schedule.userId !== userId) return null;
    await this.repo.prisma.$transaction(async (tx: Db) => {
      await this.repo.deleteTask(taskId, tx);
      await this.updateProgress(tx, task.scheduleId);
    });
  }

  async rescheduleTask(userId: string, taskId: string, sessionId: string) {
    const task = await this.repo.findTaskById(taskId);
    if (!task || task.schedule.userId !== userId) return null;

    const newSession = await this.repo.findSessionById(sessionId);
    if (!newSession || newSession.scheduleId !== task.scheduleId) return null;
    if (startOfDay(newSession.date) < brazilToday()) {
      throw new BadRequestException("Não dá para reagendar uma tarefa para um dia que já passou.");
    }

    return this.repo.updateTask(taskId, { sessionId: newSession.id });
  }

  /**
   * Replanejamento com escolha do aluno (fase 4, §12) para uma tarefa que
   * não foi feita:
   *  - TOMORROW: vai para o próximo dia de estudo, por cima do plano dele;
   *  - SATURDAY: vai para o próximo sábado (cria o dia se o aluno não estuda
   *    aos sábados);
   *  - AUTO: encaixa no próximo dia DENTRO do tempo planejado dele, refazendo
   *    o resto do dia em volta — as outras matérias cedem tempo. Sem
   *    `confirm`, devolve só a prévia (minutos por matéria antes/depois);
   *  - SKIP: o aluno decide não fazer.
   */
  async replanTask(userId: string, taskId: string, dto: ReplanTaskDto): Promise<ReplanResult | null> {
    const task = await this.repo.findTaskById(taskId);
    if (!task || task.schedule.userId !== userId) return null;
    if (task.status === StudyTaskStatus.DONE || task.status === StudyTaskStatus.SKIPPED) {
      throw new BadRequestException("Só é possível reagendar uma tarefa que ainda não foi feita.");
    }
    const schedule = await this.repo.findScheduleById(task.scheduleId);
    if (!schedule) return null;

    const today = startOfDay(dto.date ? new Date(dto.date) : new Date());
    const base = task.session.date > today ? task.session.date : today;

    if (dto.strategy === "SKIP") {
      await this.repo.prisma.$transaction(async (tx: Db) => {
        await this.repo.updateTask(taskId, { status: StudyTaskStatus.SKIPPED, completedAt: null }, tx);
        await this.updateProgress(tx, schedule.id);
      });
      return { strategy: "SKIP", applied: true, movedTo: null };
    }

    if (dto.strategy === "SATURDAY") {
      let saturday = addDays(base, 1);
      while (saturday.getUTCDay() !== 6) saturday = addDays(saturday, 1);
      if (saturday > schedule.endDate) {
        throw new BadRequestException("O próximo sábado já fica fora do período do cronograma.");
      }
      await this.repo.prisma.$transaction(async (tx: Db) => {
        const existing = await tx.studySession.findUnique({
          where: { scheduleId_date: { scheduleId: schedule.id, date: saturday } },
        });
        // Sábado fora dos dias de estudo vira um dia extra, sem tempo
        // planejado próprio — só com o que o aluno jogou para lá.
        const target =
          existing ??
          (await tx.studySession.create({
            data: { scheduleId: schedule.id, date: saturday, scheduledMinutes: 0 },
          }));
        if (existing) await this.planSession(tx, schedule, existing);
        await this.repo.updateTask(taskId, { sessionId: target.id }, tx);
        await this.updateProgress(tx, schedule.id);
      }, PLAN_TX_OPTIONS);
      return { strategy: "SATURDAY", applied: true, movedTo: formatDate(saturday) };
    }

    // AUTO redistribui o tempo das matérias em volta de um TÓPICO; tarefa sem
    // tópico (genérica, redação, manual) não tem o que redistribuir e segue
    // para o próximo dia como no TOMORROW.
    const redistribute = dto.strategy === "AUTO" && task.topicId !== null;

    try {
      return await this.repo.prisma.$transaction(async (tx: Db) => {
        const target = await tx.studySession.findFirst({
          where: {
            scheduleId: schedule.id,
            date: { gt: base },
            ...(redistribute ? { scheduledMinutes: { gt: 0 } } : {}),
          },
          orderBy: { date: "asc" },
        });
        if (!target) {
          throw new BadRequestException("Não há um próximo dia de estudo no cronograma.");
        }

        // O dia de destino precisa do próprio plano ANTES de receber a
        // tarefa: um dia que já tem tarefa não é mais gerado ao ser aberto.
        await this.planSession(tx, schedule, target);
        const movedTo = formatDate(target.date);

        if (!redistribute) {
          await this.repo.updateTask(taskId, { sessionId: target.id }, tx);
          await this.updateProgress(tx, schedule.id);
          return { strategy: dto.strategy, applied: true, movedTo } satisfies ReplanResult;
        }

        const before = await this.minutesBySubject(tx, target.id);
        await this.repo.updateTask(taskId, { sessionId: target.id }, tx);
        await this.planSession(tx, schedule, target, { replace: true, keepTaskIds: [taskId] });
        const after = await this.minutesBySubject(tx, target.id);

        const names = [...new Set([...before.keys(), ...after.keys()])].sort((a, b) => a.localeCompare(b, "pt-BR"));
        const subjects = names.map((subjectName) => ({
          subjectName,
          beforeMinutes: before.get(subjectName) ?? 0,
          afterMinutes: after.get(subjectName) ?? 0,
        }));
        const warnings = subjects
          .filter((s) => s.afterMinutes < s.beforeMinutes)
          .map((s) =>
            s.afterMinutes === 0
              ? `${s.subjectName} fica sem tempo nesse dia (tinha ${s.beforeMinutes}min).`
              : `${s.subjectName} cai de ${s.beforeMinutes}min para ${s.afterMinutes}min nesse dia.`,
          );
        const result: ReplanResult = {
          strategy: "AUTO",
          applied: Boolean(dto.confirm),
          movedTo,
          preview: { date: movedTo, subjects, warnings },
        };
        if (!dto.confirm) throw new ReplanPreviewRollback(result);

        await this.updateProgress(tx, schedule.id);
        return result;
      }, PLAN_TX_OPTIONS);
    } catch (error) {
      if (error instanceof ReplanPreviewRollback) return error.result;
      throw error;
    }
  }

  /** Minutos planejados por matéria num dia (sem as tarefas puladas). */
  private async minutesBySubject(tx: Db, sessionId: string): Promise<Map<string, number>> {
    const tasks = await tx.studyTask.findMany({
      where: { sessionId, status: { not: StudyTaskStatus.SKIPPED } },
      include: { subject: true },
    });
    const minutes = new Map<string, number>();
    for (const task of tasks) {
      const name = task.subject?.name ?? "Sem matéria";
      minutes.set(name, (minutes.get(name) ?? 0) + task.scheduledMinutes);
    }
    return minutes;
  }

  async completeTask(userId: string, taskId: string) {
    const task = await this.repo.findTaskById(taskId);
    if (!task || task.schedule.userId !== userId) return null;

    return this.repo.prisma.$transaction(async (tx: Db) => {
      await this.repo.updateTask(taskId, {
        status: StudyTaskStatus.DONE,
        completedAt: task.completedAt ?? new Date(),
      }, tx);
      if (task.status !== StudyTaskStatus.DONE && task.topicId) {
        await this.topicMastery.registerStudy(userId, task.topicId, tx);
      }
      await this.updateProgress(tx, task.scheduleId);
      const refreshed = await this.repo.findTaskById(taskId, tx);
      return refreshed ? withSubjectName(refreshed) : null;
    });
  }

  /**
   * Conclui a tarefa pelo bloco de questões que o aluno respondeu. O
   * resultado é contado aqui, pelas tentativas registradas — o cliente só
   * diz quais questões eram do bloco, não quantas acertou. O domínio do
   * tópico já foi atualizado a cada resposta.
   */
  async completeTaskWithPractice(userId: string, taskId: string, questionIds: string[]) {
    const task = await this.repo.findTaskById(taskId);
    if (!task || task.schedule.userId !== userId) return null;
    if (!task.topicId) {
      throw new BadRequestException("Esta tarefa não tem um tópico para praticar.");
    }

    const since = new Date(Date.now() - PRACTICE_WINDOW_HOURS * 3_600_000);
    const attempts = await this.repo.prisma.questionAttempt.findMany({
      where: {
        userId,
        questionId: { in: questionIds },
        createdAt: { gte: since },
        // Só conta questão do tópico da tarefa.
        question: { topicId: task.topicId },
      },
      select: { questionId: true, isCorrect: true, createdAt: true },
    });
    const result = summarizePractice(attempts);
    if (result.answered === 0) {
      throw new BadRequestException("Responda pelo menos uma questão para concluir a tarefa pela prática.");
    }

    return this.repo.prisma.$transaction(async (tx: Db) => {
      await this.repo.updateTask(taskId, {
        status: StudyTaskStatus.DONE,
        completedAt: task.completedAt ?? new Date(),
        practiceAnswered: result.answered,
        practiceCorrect: result.correct,
      }, tx);
      await this.updateProgress(tx, task.scheduleId);
      const refreshed = await this.repo.findTaskById(taskId, tx);
      return refreshed ? withSubjectName(refreshed) : null;
    });
  }

  /**
   * O aluno enviou um simulado: as tarefas do cronograma ligadas a ele (em
   * geral uma) se concluem com a nota. O domínio dos tópicos já foi
   * atualizado na correção do simulado.
   */
  async completeTasksFromSimulation(userId: string, simulationId: string, correct: number, total: number) {
    const tasks = await this.repo.prisma.studyTask.findMany({
      where: {
        simulationId,
        schedule: { userId },
        status: { in: [StudyTaskStatus.PENDING, StudyTaskStatus.IN_PROGRESS] },
      },
      select: { id: true, scheduleId: true },
    });
    if (tasks.length === 0) return 0;

    await this.repo.prisma.$transaction(async (tx: Db) => {
      for (const task of tasks) {
        await this.repo.updateTask(task.id, {
          status: StudyTaskStatus.DONE,
          completedAt: new Date(),
          practiceAnswered: total,
          practiceCorrect: correct,
        }, tx);
      }
      for (const scheduleId of new Set(tasks.map((task) => task.scheduleId))) {
        await this.updateProgress(tx, scheduleId);
      }
    }, PLAN_TX_OPTIONS);
    return tasks.length;
  }

  async startTimer(userId: string, taskId: string) {
    const task = await this.repo.findTaskById(taskId);
    if (!task || task.schedule.userId !== userId) return null;
    return { ok: true, taskId };
  }

  async stopTimer(userId: string, taskId: string, durationMinutes: number) {
    const task = await this.repo.findTaskById(taskId);
    if (!task || task.schedule.userId !== userId) return null;

    return this.repo.prisma.$transaction(async (tx: Db) => {
      await this.repo.createTimeLog(tx, {
        taskId,
        // A disciplina da tarefa vai junto: assim o registro entra no
        // histórico por matéria mesmo depois de a tarefa ser excluída.
        subjectId: task.subjectId,
        userId,
        startTime: new Date(Date.now() - durationMinutes * 60_000),
        endTime: new Date(),
        durationMinutes,
      });

      if (task.status === StudyTaskStatus.PENDING) {
        await this.repo.updateTask(taskId, {
          status: StudyTaskStatus.IN_PROGRESS,
        }, tx);
      }

      return this.updateProgress(tx, task.scheduleId);
    });
  }

  /**
   * Registra tempo de estudo por MATÉRIA. É o endpoint que o cronômetro usa:
   * o aluno escolhe a disciplina, não o subtópico, e o tempo entra no
   * progresso do cronograma. A tarefa daquela matéria no dia de hoje, se
   * existir e estiver pendente, também passa para "em andamento" — é o que o
   * aluno esperaria ver na visão diária depois de estudar.
   */
  async logSubjectTime(
    userId: string,
    subjectId: string,
    durationMinutes: number,
  ) {
    const schedule = await this.repo.findScheduleByUserId(userId);
    if (!schedule) return null;

    const plan = await this.repo.findScheduleSubjectById(schedule.id, subjectId);
    if (!plan) return null;

    const endTime = new Date();

    return this.repo.prisma.$transaction(async (tx: Db) => {
      await this.repo.createTimeLog(tx, {
        subjectId,
        userId,
        startTime: new Date(endTime.getTime() - durationMinutes * 60_000),
        endTime,
        durationMinutes,
      });

      const todayTasks = await tx.studyTask.findMany({
        where: {
          scheduleId: schedule.id,
          subjectId,
          status: StudyTaskStatus.PENDING,
          session: { date: startOfDay(endTime) },
        },
      });
      for (const task of todayTasks) {
        await tx.studyTask.update({
          where: { id: task.id },
          data: { status: StudyTaskStatus.IN_PROGRESS },
        });
      }

      return this.updateProgress(tx, schedule.id);
    });
  }

  /**
   * Tempo estudado numa sala (do Lumina Groups ou da turma). Vira um
   * StudyTimeLog comum do aluno (fonte única do tempo), com o vínculo da
   * sessão como contexto, e atualiza o progresso do cronograma quando ele existe. Não
   * exige cronograma nem que a matéria esteja nele: estudar no grupo conta
   * no histórico pessoal de qualquer jeito.
   */
  async logGroupSessionTime(input: {
    userId: string;
    subjectId: string | null;
    startTime: Date;
    endTime: Date;
    durationMinutes: number;
    groupSessionId?: string | null;
    classSessionId?: string | null;
  }) {
    const schedule = await this.repo.findScheduleByUserId(input.userId);
    return this.repo.prisma.$transaction(async (tx: Db) => {
      const log = await this.repo.createTimeLog(tx, input);
      if (schedule) await this.updateProgress(tx, schedule.id);
      return log;
    });
  }

  async rescheduleMissed(userId: string, date: Date) {
    const schedule = await this.repo.findScheduleByUserId(userId);
    if (!schedule) return null;

    return this.repo.prisma.$transaction(async (tx: Db) => {
      const missedTasks = await tx.studyTask.findMany({
        where: {
          scheduleId: schedule.id,
          status: { in: [StudyTaskStatus.PENDING, StudyTaskStatus.IN_PROGRESS] },
          session: { date: startOfDay(date) },
        },
      });

      if (missedTasks.length === 0) return { rescheduled: 0 };

      const futureSessions = await tx.studySession.findMany({
        where: {
          scheduleId: schedule.id,
          date: { gte: addDays(startOfDay(date), 1) },
        },
        orderBy: { date: "asc" },
      });
      if (futureSessions.length === 0) return { rescheduled: 0 };

      // Cada dia de destino ganha o próprio plano antes de receber tarefa
      // de fora — dia que já tem tarefa não é mais gerado ao ser aberto.
      const targets = futureSessions.slice(0, missedTasks.length);
      for (const target of targets) await this.planSession(tx, schedule, target);

      let idx = 0;
      for (const t of missedTasks) {
        const targetSession = futureSessions[idx % futureSessions.length];
        if (targetSession) {
          await tx.studyTask.update({
              where: { id: t.id },
              data: { sessionId: targetSession.id } as Prisma.StudyTaskUncheckedUpdateInput,
            });
        }
        idx++;
      }

      return { rescheduled: missedTasks.length };
    }, PLAN_TX_OPTIONS);
  }

  async getProgress(userId: string) {
    const schedule = await this.repo.findScheduleByUserId(userId);
    if (!schedule) return null;
    // A sequência depende da data atual, mesmo sem novas gravações de tarefas.
    return this.updateProgress(this.repo.prisma, schedule.id);
  }

  async getProgressEvolution(userId: string, days = 30) {
    const schedule = await this.repo.findScheduleByUserId(userId);
    if (!schedule) return null;

    const endDate = endOfDay(new Date());
    const startDate = addDays(startOfDay(new Date()), -(days - 1));

    const [logs, tasksByDate] = await Promise.all([
      this.repo.timeLogsForSchedule(schedule.id, { from: startDate, to: endDate }),
      this.repo.prisma.studyTask.findMany({
        where: { scheduleId: schedule.id, status: StudyTaskStatus.DONE, completedAt: { gte: startDate, lte: endDate } },
      }),
    ]);

    const dayKeys = eachDayOfInterval(startDate, endDate);

    const evolution = dayKeys.map((day) => {
      const dayKey = formatDate(day);
      const tasks = tasksByDate.filter(
        (t) => t.completedAt && formatDate(t.completedAt) === dayKey,
      );
      return {
        date: dayKey,
        studyMinutes: logs.filter((log) => formatDate(log.endTime) === dayKey)
          .reduce((sum, log) => sum + log.durationMinutes, 0),
        completedTasks: tasks.length,
      };
    });

    return evolution;
  }

  async recalculateProgress(userId: string) {
    const schedule = await this.repo.findScheduleByUserId(userId);
    if (!schedule) return null;
    return this.updateProgress(this.repo.prisma, schedule.id);
  }

  private async updateProgress(tx: Db, scheduleId: string) {
    const [allTasks, logs, sessions] = await Promise.all([
      tx.studyTask.findMany({ where: { scheduleId } }),
      // Pelo mesmo `tx`: a soma tem de enxergar o log que acabou de ser
      // gravado, senão o primeiro registro do dia não entra no progresso.
      this.repo.timeLogsForSchedule(scheduleId, undefined, tx),
      tx.studySession.findMany({ where: { scheduleId } }),
    ]);
    // Tarefa que o aluno decidiu não fazer sai da conta: não é pendência.
    const tasks = allTasks.filter(
      (t: { status: StudyTaskStatus }) => t.status !== StudyTaskStatus.SKIPPED,
    );

    const completedTasks = tasks.filter(
      (t: { status: StudyTaskStatus }) => t.status === StudyTaskStatus.DONE,
    ).length;
    const totalTasks = tasks.length;
    const completedMinutes = logs.reduce(
      (sum: number, l: { durationMinutes: number }) => sum + l.durationMinutes,
      0,
    );
    const totalScheduledMinutes = sessions.reduce(
      (sum: number, s: { scheduledMinutes: number }) => sum + s.scheduledMinutes,
      0,
    );

    const datesWithCompletedTasks = [
      ...new Set(
        tasks
          .filter(
            (t: { status: StudyTaskStatus; completedAt: Date | null }) =>
              t.status === StudyTaskStatus.DONE && t.completedAt,
          )
          .map((t) => formatDate(t.completedAt!)),
      ),
    ].sort();

    let streakDays = 0;
    const today = new Date();
    for (let i = datesWithCompletedTasks.length - 1; i >= 0; i--) {
      const d = new Date(datesWithCompletedTasks[i]);
      const todayStart = startOfDay(today);
      const diff = Math.round(
        (todayStart.getTime() - d.getTime()) / (1000 * 60 * 60 * 24),
      );
      if (diff !== streakDays) break;
      streakDays++;
    }

    const lastStudyDate =
      datesWithCompletedTasks.length > 0
        ? new Date(datesWithCompletedTasks[datesWithCompletedTasks.length - 1])
        : null;

    return this.repo.upsertProgress(tx, scheduleId, {
      completedMinutes,
      totalScheduledMinutes,
      streakDays,
      lastStudyDate,
      completedTasks,
      totalTasks,
    });
  }

  /** Minutos de estudo por dia da semana: o que o aluno informou para cada
   *  dia (onboarding, §11) ou `dailyMinutes` onde ele não informou. Dia com
   *  zero minuto não é dia de estudo. */
  private profileGoal(userId: string) {
    return this.repo.prisma.userProfile.findUnique({ where: { userId }, select: { desiredCourse: true, targetUniversity: true } });
  }

  /**
   * Limites de data do cronograma para os parâmetros informados (início,
   * matérias e tempo semanal). O app usa para travar o calendário e explicar
   * o prazo máximo antes de o aluno enviar.
   */
  async limits(input: {
    startDate?: string;
    studyDays: number[];
    dailyMinutes: number;
    dayMinutes?: { weekday: number; minutes: number }[];
    subjects: { subjectId: string; targetHours: number }[];
  }): Promise<ScheduleLimits> {
    const start = input.startDate ? startOfDay(new Date(input.startDate)) : brazilToday();
    const content = await this.subjectContent(input.subjects);
    return scheduleLimits(start, content, weeklyMinutes(this.minutesByWeekday(input.studyDays, input.dailyMinutes, input.dayMinutes)));
  }

  /** Assuntos do currículo de cada matéria escolhida (Redação e línguas usam as horas-alvo). */
  private async subjectContent(subjects: { subjectId: string; targetHours: number }[]): Promise<SubjectContent[]> {
    const studySubjects = await this.repo.prisma.studySubject.findMany({
      where: { id: { in: subjects.map((s) => s.subjectId) } },
      select: { id: true, code: true },
    });
    const nameById = new Map(studySubjects.map((s) => [s.id, STUDY_SUBJECT_CODE_TO_SUBJECT_NAME[s.code]]));
    const names = [...new Set([...nameById.values()].filter((n): n is string => Boolean(n)))];
    const counts = names.length
      ? await this.repo.prisma.topic.groupBy({
          by: ["subjectId"],
          where: { subject: { name: { in: names } }, NOT: { name: "Geral" } },
          _count: true,
        })
      : [];
    const subjectRows = names.length ? await this.repo.prisma.subject.findMany({ where: { name: { in: names } }, select: { id: true, name: true } }) : [];
    const topicsByName = new Map(subjectRows.map((s) => [s.name, counts.find((c) => c.subjectId === s.id)?._count ?? 0]));
    return subjects.map((s) => {
      const name = nameById.get(s.subjectId);
      const topics = name ? topicsByName.get(name) ?? 0 : 0;
      return { topics: topics > 0 ? topics : null, targetHours: Number(s.targetHours) };
    });
  }

  /** O fim não pode passar do prazo máximo que a gama de conteúdos justifica. */
  private async assertWithinContent(
    start: Date,
    end: Date,
    subjects: { subjectId: string; targetHours: number }[],
    minutesByWeekday: Map<number, number>,
  ) {
    const limits = scheduleLimits(start, await this.subjectContent(subjects), weeklyMinutes(minutesByWeekday));
    if (end > limits.maxEnd) {
      const hours = Math.round(limits.weeklyMinutes / 6) / 10;
      throw new BadRequestException(
        `Com ${hours} h de estudo por semana, o conteúdo das matérias escolhidas` +
          (limits.topics ? ` (${limits.topics} assuntos)` : "") +
          ` cabe até ${formatBr(limits.maxEnd)}. Escolha uma data final até lá, acrescente matérias ou diminua o tempo semanal.`,
      );
    }
  }

  private minutesByWeekday(
    studyDays: number[],
    dailyMinutes: number,
    dayMinutes?: { weekday: number; minutes: number }[],
  ): Map<number, number> {
    const overrides = new Map((dayMinutes ?? []).map((d) => [d.weekday, d.minutes]));
    const result = new Map<number, number>();
    for (const weekday of studyDays) {
      const minutes = overrides.get(weekday) ?? dailyMinutes;
      if (minutes > 0) result.set(weekday, minutes);
    }
    return result;
  }
}
