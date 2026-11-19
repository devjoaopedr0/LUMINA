/** Fase 3: comparação de desempenho (item 43), sala da turma (item 47) e avisos (item 51). */

export interface Delta {
  current: number | null;
  previous: number | null;
  change: number | null;
  trend: 'up' | 'down' | 'same' | null;
}

export interface ClassComparisonRow {
  id: string;
  name: string;
  studentCount: number;
  activeStudentCount: number;
  answers: number;
  accuracy: Delta;
  participationRate: Delta;
  minutesPerActive: Delta;
  submissions: Delta;
  studentsAtRisk: Delta;
}

export interface ClassComparison {
  period: { days: number; from: string; to: string; previousFrom: string };
  classes: ClassComparisonRow[];
  subjects: Array<{ subject: string; byClass: Record<string, number | null> }>;
}

export interface VersusAverage {
  mine: number | null;
  average: number | null;
  difference: number | null;
}

export interface StudentComparison {
  student: { id: string; name: string };
  self: {
    questionAccuracy: Delta;
    questionsAnswered: Delta;
    simulationAccuracy: Delta;
    studyMinutes: Delta;
    essayAverage: Delta;
    subjects: Array<Delta & { subject: string; attempts: number }>;
  };
  classes: Array<{ id: string; name: string; activeStudentCount: number; accuracy: VersusAverage; studyMinutes: VersusAverage }>;
}

export interface ReportScope {
  teacherClasses: Array<{ id: string; name: string }>;
  institution: { workspaceId: string; name: string; role: string } | null;
  institutionClasses: Array<{ id: string; name: string }>;
}

export type Presence = 'STUDYING' | 'PAUSED' | 'OFFLINE';

export interface ClassRoomParticipant {
  participantId: string;
  userId: string;
  name: string;
  avatarUrl: string | null;
  presence: Presence;
  isMe: boolean;
  subject: string | null;
  studiedSeconds: number | null;
  ticking: boolean;
  activity: { correct: number; total: number } | null;
}

export interface ClassRoomState {
  serverTime: string;
  role: 'TEACHER' | 'STUDENT';
  class: { id: string; name: string; archived: boolean };
  subjects: Array<{ id: string; name: string }>;
  activities: Array<{ id: string; title: string; assessmentType: string; dueAt: string | null }>;
  mine: { participantId: string; sessionId: string; status: 'STUDYING' | 'PAUSED'; subjectId: string | null; subject: string | null; studiedSeconds: number; ticking: boolean } | null;
  elsewhere: { classId: string; className: string } | null;
  session: null | {
    id: string;
    title: string | null;
    openedBy: string;
    startedAt: string;
    durationSeconds: number;
    activity: null | { id: string; title: string; assessmentType: string; questionCount: number; submittedCount: number | null };
    classSize: number;
    presentCount: number;
    participants: ClassRoomParticipant[];
  };
  history: Array<{ id: string; title: string | null; startedAt: string; endedAt: string | null; durationSeconds: number; participantCount: number; averageMinutes: number | null; myMinutes: number | null }>;
  loggedMinutes?: number;
}

export interface BroadcastTargets {
  classes: Array<{ id: string; name: string }>;
  institution: { id: string; name: string } | null;
  dailyLimit: number;
}

/** "+7 p.p.", "−3 p.p.", "+25 min"; null vira "—". */
export function formatChange(change: number | null, unit: 'pp' | 'min' | 'count' | 'points'): string {
  if (change === null) return '—';
  const sign = change > 0 ? '+' : change < 0 ? '−' : '±';
  const abs = Math.abs(change);
  const value = Number.isInteger(abs) ? String(abs) : abs.toFixed(1).replace('.', ',');
  const suffix = unit === 'pp' ? ' p.p.' : unit === 'min' ? ' min' : unit === 'points' ? ' pts' : '';
  return `${sign}${value}${suffix}`;
}

/** Cor da variação. Em "alunos em risco", subir é ruim (`lowerIsBetter`). */
export function trendTone(trend: Delta['trend'], lowerIsBetter = false): 'good' | 'bad' | 'neutral' {
  if (!trend || trend === 'same') return 'neutral';
  const good = trend === 'up' ? !lowerIsBetter : lowerIsBetter;
  return good ? 'good' : 'bad';
}

/** "62%", "—". */
export function pct(value: number | null): string {
  return value === null ? '—' : `${Number.isInteger(value) ? value : value.toFixed(1).replace('.', ',')}%`;
}

/** Frase do aluno × média da turma, sem ranking. */
export function versusText(v: VersusAverage, unit: 'pp' | 'min'): string {
  if (v.difference === null) return 'Ainda sem dados suficientes para comparar.';
  if (Math.abs(v.difference) < (unit === 'pp' ? 1 : 5)) return 'Na média da turma.';
  const amount = unit === 'pp' ? `${formatChange(Math.abs(v.difference), 'pp').slice(1)}` : `${Math.abs(Math.round(v.difference))} min`;
  return v.difference > 0 ? `${amount} acima da média da turma.` : `${amount} abaixo da média da turma.`;
}
