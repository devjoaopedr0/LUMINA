import { brasiliaDateKey } from '../questions/review-day';

/**
 * Analytics do professor (fase 3, item 40) e sinais pedagógicos derivados
 * (primeira camada do item 41).
 *
 * A construção é pura: o serviço busca as linhas do Prisma e este módulo
 * transforma em indicadores. Assim as regras de participação, risco, questão
 * difícil e evolução podem ser testadas sem banco e sem relógio real.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const INACTIVITY_DAYS = 7;
const LOW_ACCURACY = 60;
const CRITICAL_ACCURACY = 45;
const MIN_STUDENT_ANSWERS = 5;
const MIN_CLASS_ANSWERS = 10;
const MIN_QUESTION_ATTEMPTS = 3;
const ERROR_STREAK_LIMIT = 3;

export type AnalyticsRiskLevel = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';
export type PedagogicalSignalSeverity = 'LOW' | 'MEDIUM' | 'HIGH';
export type PedagogicalSignalKind =
  | 'CLASS_LOW_ACCURACY'
  | 'STUDENT_LOW_ACCURACY'
  | 'STUDENT_INACTIVITY'
  | 'STUDENT_ERROR_STREAK'
  | 'DIFFICULT_QUESTION'
  | 'STUDENT_PERFORMANCE_DROP'
  | 'STUDENT_OVERDUE_TASKS';

export interface TeacherAnalyticsStudentRef {
  id: string;
  name: string;
  email: string;
}

export interface TeacherAnalyticsMember {
  joinedAt: Date;
  user: TeacherAnalyticsStudentRef;
}

export interface TeacherAnalyticsItem {
  position: number;
  questionId: string | null;
  stem: string;
  subject: string;
  correctPosition: number;
}

export interface TeacherAnalyticsSubmission {
  userId: string;
  correct: number;
  total: number;
  submittedAt: Date;
  answers: unknown;
}

export interface TeacherAnalyticsSimulation {
  id: string;
  title: string;
  items: TeacherAnalyticsItem[];
  submissions: TeacherAnalyticsSubmission[];
}

export interface TeacherAnalyticsClassInput {
  id: string;
  name: string;
  joinCode: string;
  members: TeacherAnalyticsMember[];
  simulations: TeacherAnalyticsSimulation[];
}

export interface TeacherAnalyticsStudyLog {
  userId: string;
  durationMinutes: number;
  startTime: Date;
}

export interface TeacherAnalyticsInput {
  classes: TeacherAnalyticsClassInput[];
  studyLogs: TeacherAnalyticsStudyLog[];
  now: Date;
  days: number;
}

export interface TeacherAnalyticsRiskReason {
  kind: PedagogicalSignalKind;
  label: string;
  severity: PedagogicalSignalSeverity;
}

export interface TeacherAnalyticsStudent {
  id: string;
  name: string;
  email: string;
  joinedAt: string;
  submissions: number;
  answerCount: number;
  correctCount: number;
  accuracy: number | null;
  studyMinutes: number;
  lastActivityAt: string | null;
  errorStreak: number;
  riskLevel: AnalyticsRiskLevel;
  riskReasons: TeacherAnalyticsRiskReason[];
}

export interface TeacherAnalyticsQuestion {
  key: string;
  questionId: string | null;
  stem: string;
  subject: string;
  simulationCount: number;
  attempts: number;
  correctCount: number;
  blankCount: number;
  accuracy: number | null;
}

export interface TeacherAnalyticsClass {
  id: string;
  name: string;
  joinCode: string;
  studentCount: number;
  activeStudentCount: number;
  participationRate: number;
  submissionCount: number;
  answerCount: number;
  correctCount: number;
  accuracy: number | null;
  studyMinutes: number;
  studentsAtRisk: number;
  lastActivityAt: string | null;
  students: TeacherAnalyticsStudent[];
  difficultQuestions: TeacherAnalyticsQuestion[];
}

export interface TeacherAnalyticsSignal {
  id: string;
  kind: PedagogicalSignalKind;
  severity: PedagogicalSignalSeverity;
  classId: string | null;
  className: string | null;
  studentId: string | null;
  studentName: string | null;
  questionKey: string | null;
  subject: string | null;
  title: string;
  detail: string;
  recommendation: string;
  metric: number | null;
}

export interface TeacherAnalyticsEvolutionPoint {
  day: string;
  submissions: number;
  answers: number;
  correctCount: number;
  accuracy: number | null;
  studyMinutes: number;
}

export interface TeacherAnalyticsResult {
  generatedAt: string;
  period: { days: number; from: string; to: string };
  summary: {
    classCount: number;
    studentCount: number;
    activeStudentCount: number;
    participationRate: number;
    submissionCount: number;
    answerCount: number;
    correctCount: number;
    accuracy: number | null;
    studyMinutes: number;
    studentsAtRisk: number;
    questionCount: number;
  };
  classes: TeacherAnalyticsClass[];
  questions: TeacherAnalyticsQuestion[];
  subjects: Array<{ subject: string; attempts: number; correctCount: number; accuracy: number | null }>;
  evolution: TeacherAnalyticsEvolutionPoint[];
  signals: TeacherAnalyticsSignal[];
}

interface AggregatedQuestion {
  key: string;
  questionId: string | null;
  stem: string;
  subject: string;
  simulations: Set<string>;
  attempts: number;
  correctCount: number;
  blankCount: number;
}

function percentage(correct: number, total: number): number | null {
  if (total <= 0) return null;
  return Math.round((correct / total) * 100);
}

function maxDate(values: Array<Date | null | undefined>): Date | null {
  let result: Date | null = null;
  for (const value of values) {
    if (!value) continue;
    if (!result || value.getTime() > result.getTime()) result = value;
  }
  return result;
}

/**
 * Submissões de ex-alunos e de professores que enviaram a atividade não
 * pertencem ao recorte pedagógico da turma. O serviço traz as submissões do
 * período; aqui restringimos cada simulado aos membros atuais antes de
 * qualquer agregação.
 */
function filterSimulationsByMembers(
  simulations: TeacherAnalyticsSimulation[],
  memberIds: Set<string>,
): TeacherAnalyticsSimulation[] {
  return simulations
    .map((simulation) => ({
      ...simulation,
      submissions: simulation.submissions.filter((submission) => memberIds.has(submission.userId)),
    }))
    .filter((simulation) => simulation.submissions.length > 0);
}

function daysSince(from: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - from.getTime()) / DAY_MS));
}

function truncate(value: string, length: number): string {
  const text = value.trim();
  if (text.length <= length) return text;
  return `${text.slice(0, length - 1).trimEnd()}…`;
}

function dateKeyToBr(key: string): string {
  const [year, month, day] = key.split('-');
  return `${day}/${month}/${year}`;
}

function answerMap(answers: unknown): Map<number, number> {
  const map = new Map<number, number>();
  if (!Array.isArray(answers)) return map;
  for (const answer of answers) {
    if (!answer || typeof answer !== 'object') continue;
    const position = Number((answer as { position?: unknown }).position);
    const selected = Number((answer as { selectedPosition?: unknown }).selectedPosition);
    if (Number.isInteger(position) && Number.isInteger(selected)) map.set(position, selected);
  }
  return map;
}

function severityWeight(severity: PedagogicalSignalSeverity): number {
  if (severity === 'HIGH') return 3;
  if (severity === 'MEDIUM') return 2;
  return 1;
}

function riskWeight(level: AnalyticsRiskLevel): number {
  if (level === 'HIGH') return 3;
  if (level === 'MEDIUM') return 2;
  if (level === 'LOW') return 1;
  return 0;
}

function maxRiskLevel(reasons: TeacherAnalyticsRiskReason[]): AnalyticsRiskLevel {
  if (!reasons.length) return 'NONE';
  return reasons.reduce<AnalyticsRiskLevel>((current, reason) => {
    return riskWeight(reason.severity) > riskWeight(current) ? reason.severity : current;
  }, 'NONE');
}

export function riskReasonLabel(kind: PedagogicalSignalKind): string {
  switch (kind) {
    case 'CLASS_LOW_ACCURACY':
      return 'Média da turma abaixo de 60%';
    case 'STUDENT_LOW_ACCURACY':
      return 'Desempenho abaixo de 60%';
    case 'STUDENT_INACTIVITY':
      return 'Sem atividade nesta turma no período';
    case 'STUDENT_ERROR_STREAK':
      return 'Três ou mais erros seguidos';
    case 'DIFFICULT_QUESTION':
      return 'Questão com baixo índice de acerto';
    case 'STUDENT_PERFORMANCE_DROP':
      return 'Queda de desempenho em relação ao período anterior';
    case 'STUDENT_OVERDUE_TASKS':
      return 'Tarefas do cronograma atrasadas';
  }
}

export function riskRecommendation(kind: PedagogicalSignalKind): string {
  switch (kind) {
    case 'CLASS_LOW_ACCURACY':
      return 'Priorize os conteúdos com menor desempenho e proponha uma atividade curta de reforço.';
    case 'STUDENT_LOW_ACCURACY':
      return 'Recomende revisão do conteúdo e acompanhe uma nova tentativa.';
    case 'STUDENT_INACTIVITY':
      return 'Envie um lembrete e verifique se existe alguma barreira de acesso ou rotina.';
    case 'STUDENT_ERROR_STREAK':
      return 'Retome o tópico com uma questão guiada antes de avançar para outra dificuldade.';
    case 'DIFFICULT_QUESTION':
      return 'Reveja a questão em aula e apresente uma versão com apoio antes de reaplicar.';
    case 'STUDENT_PERFORMANCE_DROP':
      return 'Converse com o aluno sobre o que mudou e retome o conteúdo do período com uma atividade curta antes de avançar.';
    case 'STUDENT_OVERDUE_TASKS':
      return 'Ajude o aluno a replanejar o cronograma: menos tarefas por dia costuma funcionar melhor do que acumular atrasos.';
  }
}

function buildStudent(
  member: TeacherAnalyticsMember,
  submissions: TeacherAnalyticsSubmission[],
  simulations: TeacherAnalyticsSimulation[],
  logs: TeacherAnalyticsStudyLog[],
  now: Date,
): TeacherAnalyticsStudent {
  const ownSubmissions = submissions
    .filter((submission) => submission.userId === member.user.id)
    .sort((a, b) => a.submittedAt.getTime() - b.submittedAt.getTime());
  const answerCount = ownSubmissions.reduce((sum, submission) => sum + submission.total, 0);
  const correctCount = ownSubmissions.reduce((sum, submission) => sum + submission.correct, 0);
  const accuracy = percentage(correctCount, answerCount);
  const ownLogs = logs.filter(
    (log) =>
      log.userId === member.user.id && log.startTime.getTime() >= member.joinedAt.getTime(),
  );
  const studyMinutes = ownLogs.reduce((sum, log) => sum + log.durationMinutes, 0);
  const lastSubmissionAt = maxDate(ownSubmissions.map((submission) => submission.submittedAt));
  const lastStudyAt = maxDate(ownLogs.map((log) => log.startTime));
  const lastActivityAt = maxDate([lastSubmissionAt, lastStudyAt]);
  const reasons: TeacherAnalyticsRiskReason[] = [];

  if (accuracy !== null && answerCount >= MIN_STUDENT_ANSWERS && accuracy < LOW_ACCURACY) {
    reasons.push({
      kind: 'STUDENT_LOW_ACCURACY',
      label: riskReasonLabel('STUDENT_LOW_ACCURACY'),
      severity: accuracy < CRITICAL_ACCURACY ? 'HIGH' : 'MEDIUM',
    });
  }

  const joinedDaysAgo = daysSince(member.joinedAt, now);
  if (joinedDaysAgo >= INACTIVITY_DAYS) {
    const inactiveDays = lastActivityAt ? daysSince(lastActivityAt, now) : joinedDaysAgo;
    if (inactiveDays >= INACTIVITY_DAYS) {
      reasons.push({
        kind: 'STUDENT_INACTIVITY',
        label: riskReasonLabel('STUDENT_INACTIVITY'),
        // A ausência vale para esta turma e para o período consultado. O aluno
        // pode estar ativo em outra turma, então não elevamos para HIGH sem
        // consultar a atividade fora desta janela.
        severity: 'MEDIUM',
      });
    }
  }

  let errorStreak = 0;
  let currentStreak = 0;
  const ownWithSimulation = simulations
    .flatMap((simulation) =>
      simulation.submissions
        .filter((submission) => submission.userId === member.user.id)
        .map((submission) => ({ submission, simulation })),
    )
    .sort((a, b) => a.submission.submittedAt.getTime() - b.submission.submittedAt.getTime());
  for (const { submission, simulation } of ownWithSimulation) {
    const selected = answerMap(submission.answers);
    for (const item of [...simulation.items].sort((a, b) => a.position - b.position)) {
      if (!selected.has(item.position)) continue;
      const isCorrect = selected.get(item.position) === item.correctPosition;
      currentStreak = isCorrect ? 0 : currentStreak + 1;
      errorStreak = Math.max(errorStreak, currentStreak);
    }
  }
  if (errorStreak >= ERROR_STREAK_LIMIT) {
    reasons.push({
      kind: 'STUDENT_ERROR_STREAK',
      label: riskReasonLabel('STUDENT_ERROR_STREAK'),
      severity: 'MEDIUM',
    });
  }

  return {
    id: member.user.id,
    name: member.user.name,
    email: member.user.email,
    joinedAt: member.joinedAt.toISOString(),
    submissions: ownSubmissions.length,
    answerCount,
    correctCount,
    accuracy,
    studyMinutes,
    lastActivityAt: lastActivityAt?.toISOString() ?? null,
    errorStreak,
    riskLevel: maxRiskLevel(reasons),
    riskReasons: reasons,
  };
}

function aggregateQuestions(simulations: TeacherAnalyticsSimulation[]): TeacherAnalyticsQuestion[] {
  const byKey = new Map<string, AggregatedQuestion>();

  for (const simulation of simulations) {
    const itemsByPosition = new Map(simulation.items.map((item) => [item.position, item]));
    for (const submission of simulation.submissions) {
      const selected = answerMap(submission.answers);
      for (const [position, answer] of selected) {
        const item = itemsByPosition.get(position);
        if (!item) continue;
        const key = item.questionId ?? `${simulation.id}:${item.position}`;
        const current = byKey.get(key) ?? {
          key,
          questionId: item.questionId,
          stem: item.stem,
          subject: item.subject,
          simulations: new Set<string>(),
          attempts: 0,
          correctCount: 0,
          blankCount: 0,
        };
        current.simulations.add(simulation.id);
        current.attempts += 1;
        if (answer === item.correctPosition) current.correctCount += 1;
        if (answer === 0) current.blankCount += 1;
        byKey.set(key, current);
      }
    }
  }

  return [...byKey.values()]
    .map((item) => ({
      key: item.key,
      questionId: item.questionId,
      stem: truncate(item.stem, 180),
      subject: item.subject,
      simulationCount: item.simulations.size,
      attempts: item.attempts,
      correctCount: item.correctCount,
      blankCount: item.blankCount,
      accuracy: percentage(item.correctCount, item.attempts),
    }))
    .sort((a, b) => {
      if ((a.accuracy ?? 101) !== (b.accuracy ?? 101)) return (a.accuracy ?? 101) - (b.accuracy ?? 101);
      return b.attempts - a.attempts;
    });
}

function buildSignals(
  classes: TeacherAnalyticsClass[],
  difficultQuestions: TeacherAnalyticsQuestion[],
  now: Date,
): TeacherAnalyticsSignal[] {
  const signals: TeacherAnalyticsSignal[] = [];

  for (const classRoom of classes) {
    if (classRoom.answerCount >= MIN_CLASS_ANSWERS && classRoom.accuracy !== null && classRoom.accuracy < LOW_ACCURACY) {
      signals.push({
        id: `class:${classRoom.id}:low-accuracy`,
        kind: 'CLASS_LOW_ACCURACY',
        severity: classRoom.accuracy < CRITICAL_ACCURACY ? 'HIGH' : 'MEDIUM',
        classId: classRoom.id,
        className: classRoom.name,
        studentId: null,
        studentName: null,
        questionKey: null,
        subject: null,
        title: `${classRoom.name} está com ${classRoom.accuracy}% de acerto`,
        detail: `${classRoom.answerCount} respostas analisadas no período.`,
        recommendation: riskRecommendation('CLASS_LOW_ACCURACY'),
        metric: classRoom.accuracy,
      });
    }

    for (const student of classRoom.students) {
      for (const reason of student.riskReasons) {
        signals.push({
          id: `student:${classRoom.id}:${student.id}:${reason.kind}`,
          kind: reason.kind,
          severity: reason.severity,
          classId: classRoom.id,
          className: classRoom.name,
          studentId: student.id,
          studentName: student.name,
          questionKey: null,
          subject: null,
          title:
            reason.kind === 'STUDENT_INACTIVITY'
              ? `${student.name} não registrou atividade nesta turma`
              : `${student.name}: ${reason.label.toLowerCase()}`,
          detail:
            reason.kind === 'STUDENT_LOW_ACCURACY'
              ? `${student.accuracy}% de acerto em ${student.answerCount} respostas.`
              : reason.kind === 'STUDENT_ERROR_STREAK'
                ? `A maior sequência de erros foi ${student.errorStreak}.`
                : student.lastActivityAt
                  ? `Última atividade nesta turma em ${dateKeyToBr(brasiliaDateKey(new Date(student.lastActivityAt)))}.`
                  : 'Nenhuma entrega ou tempo de estudo nesta turma no período analisado.',
          recommendation: riskRecommendation(reason.kind),
          // O `metric` é sempre "menor = mais grave" para a ordenação. Em
          // inatividade usamos dias negativos; em sequência, erros negativos.
          metric:
            reason.kind === 'STUDENT_LOW_ACCURACY'
              ? student.accuracy
              : reason.kind === 'STUDENT_ERROR_STREAK'
                ? -student.errorStreak
                : -daysSince(
                    student.lastActivityAt
                      ? new Date(student.lastActivityAt)
                      : new Date(student.joinedAt),
                    now,
                  ),
        });
      }
    }
  }

  for (const question of difficultQuestions.slice(0, 8)) {
    signals.push({
      id: `question:${question.key}:difficulty`,
      kind: 'DIFFICULT_QUESTION',
      severity: (question.accuracy ?? 0) < 35 ? 'HIGH' : 'MEDIUM',
      classId: null,
      className: null,
      studentId: null,
      studentName: null,
      questionKey: question.key,
      subject: question.subject,
      title: `Questão com ${question.accuracy}% de acerto`,
      detail: `${question.attempts} respostas em ${question.simulationCount} atividade(s).`,
      recommendation: riskRecommendation('DIFFICULT_QUESTION'),
      metric: question.accuracy,
    });
  }

  return signals
    .sort((a, b) => {
      if (severityWeight(a.severity) !== severityWeight(b.severity)) {
        return severityWeight(b.severity) - severityWeight(a.severity);
      }
      return (a.metric ?? 101) - (b.metric ?? 101);
    })
    .slice(0, 30);
}

function buildEvolution(
  submissions: TeacherAnalyticsSubmission[],
  logs: TeacherAnalyticsStudyLog[],
): TeacherAnalyticsEvolutionPoint[] {
  const byDay = new Map<string, { submissions: number; answers: number; correctCount: number; studyMinutes: number }>();

  for (const submission of submissions) {
    const day = brasiliaDateKey(submission.submittedAt);
    const current = byDay.get(day) ?? { submissions: 0, answers: 0, correctCount: 0, studyMinutes: 0 };
    current.submissions += 1;
    current.answers += submission.total;
    current.correctCount += submission.correct;
    byDay.set(day, current);
  }

  for (const log of logs) {
    const day = brasiliaDateKey(log.startTime);
    const current = byDay.get(day) ?? { submissions: 0, answers: 0, correctCount: 0, studyMinutes: 0 };
    current.studyMinutes += log.durationMinutes;
    byDay.set(day, current);
  }

  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, value]) => ({
      day,
      submissions: value.submissions,
      answers: value.answers,
      correctCount: value.correctCount,
      accuracy: percentage(value.correctCount, value.answers),
      studyMinutes: value.studyMinutes,
    }));
}

export function buildTeacherAnalytics(input: TeacherAnalyticsInput): TeacherAnalyticsResult {
  const { classes, studyLogs, now, days } = input;
  const logsByUser = new Map<string, TeacherAnalyticsStudyLog[]>();
  for (const log of studyLogs) {
    const list = logsByUser.get(log.userId) ?? [];
    list.push(log);
    logsByUser.set(log.userId, list);
  }

  const simulationsByClass = new Map<string, TeacherAnalyticsSimulation[]>();
  for (const classRoom of classes) {
    const memberIds = new Set(classRoom.members.map((member) => member.user.id));
    simulationsByClass.set(
      classRoom.id,
      filterSimulationsByMembers(classRoom.simulations, memberIds),
    );
  }

  const allSimulations = classes.flatMap(
    (classRoom) => simulationsByClass.get(classRoom.id) ?? [],
  );
  const allSubmissions = allSimulations.flatMap((simulation) => simulation.submissions);
  const allQuestions = aggregateQuestions(allSimulations);
  const difficultQuestions = allQuestions.filter(
    (question) => question.attempts >= MIN_QUESTION_ATTEMPTS && question.accuracy !== null && question.accuracy < LOW_ACCURACY,
  );

  const classResults: TeacherAnalyticsClass[] = classes.map((classRoom) => {
    const classSimulations = simulationsByClass.get(classRoom.id) ?? [];
    const submissions = classSimulations.flatMap((simulation) => simulation.submissions);
    const students = classRoom.members.map((member) =>
      buildStudent(
        member,
        submissions,
        classSimulations,
        logsByUser.get(member.user.id) ?? [],
        now,
      ),
    );
    const answerCount = submissions.reduce((sum, submission) => sum + submission.total, 0);
    const correctCount = submissions.reduce((sum, submission) => sum + submission.correct, 0);
    const memberById = new Map(classRoom.members.map((member) => [member.user.id, member]));
    const classLogs = studyLogs.filter((log) => {
      const member = memberById.get(log.userId);
      return member !== undefined && log.startTime.getTime() >= member.joinedAt.getTime();
    });
    const activeStudentCount = students.filter(
      (student) => student.submissions > 0 || student.studyMinutes > 0,
    ).length;
    const lastActivityAt = maxDate([
      ...submissions.map((submission) => submission.submittedAt),
      ...classLogs.map((log) => log.startTime),
    ]);
    const classQuestions = aggregateQuestions(classSimulations);

    return {
      id: classRoom.id,
      name: classRoom.name,
      joinCode: classRoom.joinCode,
      studentCount: students.length,
      activeStudentCount,
      participationRate: students.length ? Math.round((activeStudentCount / students.length) * 100) : 0,
      submissionCount: submissions.length,
      answerCount,
      correctCount,
      accuracy: percentage(correctCount, answerCount),
      studyMinutes: classLogs.reduce((sum, log) => sum + log.durationMinutes, 0),
      studentsAtRisk: students.filter((student) => student.riskLevel !== 'NONE').length,
      lastActivityAt: lastActivityAt?.toISOString() ?? null,
      students,
      difficultQuestions: classQuestions
        .filter(
          (question) =>
            question.attempts >= MIN_QUESTION_ATTEMPTS &&
            question.accuracy !== null &&
            question.accuracy < LOW_ACCURACY,
        )
        .slice(0, 5),
    };
  });

  const allMembers = new Map<string, TeacherAnalyticsStudentRef>();
  const earliestJoinByStudent = new Map<string, Date>();
  for (const classRoom of classes) {
    for (const member of classRoom.members) {
      allMembers.set(member.user.id, member.user);
      const current = earliestJoinByStudent.get(member.user.id);
      if (!current || member.joinedAt.getTime() < current.getTime()) {
        earliestJoinByStudent.set(member.user.id, member.joinedAt);
      }
    }
  }
  const activeStudentIds = new Set(
    classResults.flatMap((classRoom) =>
      classRoom.students
        .filter((student) => student.submissions > 0 || student.studyMinutes > 0)
        .map((student) => student.id),
    ),
  );
  const atRiskIds = new Set(
    classResults.flatMap((classRoom) =>
      classRoom.students.filter((student) => student.riskLevel !== 'NONE').map((student) => student.id),
    ),
  );
  const uniqueLogs = studyLogs.filter((log) => {
    const joinedAt = earliestJoinByStudent.get(log.userId);
    return joinedAt !== undefined && log.startTime.getTime() >= joinedAt.getTime();
  });

  const subjects = [...allQuestions.reduce((map, question) => {
    const current = map.get(question.subject) ?? { attempts: 0, correctCount: 0 };
    current.attempts += question.attempts;
    current.correctCount += question.correctCount;
    map.set(question.subject, current);
    return map;
  }, new Map<string, { attempts: number; correctCount: number }>())]
    .map(([subject, value]) => ({
      subject,
      attempts: value.attempts,
      correctCount: value.correctCount,
      accuracy: percentage(value.correctCount, value.attempts),
    }))
    .sort((a, b) => (a.accuracy ?? 101) - (b.accuracy ?? 101) || b.attempts - a.attempts);

  const answerCount = allSubmissions.reduce((sum, submission) => sum + submission.total, 0);
  const correctCount = allSubmissions.reduce((sum, submission) => sum + submission.correct, 0);
  const from = new Date(now.getTime() - days * DAY_MS);

  return {
    generatedAt: now.toISOString(),
    period: { days, from: from.toISOString(), to: now.toISOString() },
    summary: {
      classCount: classes.length,
      studentCount: allMembers.size,
      activeStudentCount: activeStudentIds.size,
      participationRate: allMembers.size ? Math.round((activeStudentIds.size / allMembers.size) * 100) : 0,
      submissionCount: allSubmissions.length,
      answerCount,
      correctCount,
      accuracy: percentage(correctCount, answerCount),
      studyMinutes: uniqueLogs.reduce((sum, log) => sum + log.durationMinutes, 0),
      studentsAtRisk: atRiskIds.size,
      questionCount: allQuestions.filter((question) => question.attempts > 0).length,
    },
    classes: classResults,
    questions: allQuestions,
    subjects,
    evolution: buildEvolution(allSubmissions, uniqueLogs),
    signals: buildSignals(classResults, difficultQuestions, now),
  };
}
