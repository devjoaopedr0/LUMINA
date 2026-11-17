/** Calendário do cronograma: período visível, grade (segunda a domingo) e rótulos. */
export type CalendarMode = 'week' | 'month';

export interface CalendarTask {
  id: string | null;
  subject: string;
  title: string;
  activityType: 'TEORIA' | 'QUESTOES' | 'REVISAO' | 'SIMULADO' | 'REDACAO';
  minutes: number;
  status: 'PENDING' | 'IN_PROGRESS' | 'DONE' | 'SKIPPED';
}

export interface CalendarDay {
  date: string;
  scheduledMinutes: number;
  /** Previsão (dia futuro ainda não planejado): pode mudar quando o dia chegar. */
  projected: boolean;
  tasks: CalendarTask[];
}

export interface ScheduleCalendar {
  from: string;
  to: string;
  scheduleStart: string;
  scheduleEnd: string;
  examDate: string | null;
  days: CalendarDay[];
}

const pad = (n: number) => String(n).padStart(2, '0');
export const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
/** Segunda-feira da semana (o calendário começa na segunda, como no ENEM e nas agendas). */
export const mondayOf = (d: Date) => addDays(d, -((d.getDay() + 6) % 7));

/** Dias da grade: a semana (7) ou o mês com as semanas das bordas (35 ou 42). */
export function calendarGrid(mode: CalendarMode, reference: Date): Date[] {
  if (mode === 'week') {
    const start = mondayOf(reference);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }
  const first = new Date(reference.getFullYear(), reference.getMonth(), 1);
  const last = new Date(reference.getFullYear(), reference.getMonth() + 1, 0);
  const start = mondayOf(first);
  const end = addDays(mondayOf(last), 6);
  const days: Date[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
  return days;
}

export const WEEKDAYS_MON_FIRST = ['SEG.', 'TER.', 'QUA.', 'QUI.', 'SEX.', 'SÁB.', 'DOM.'];

export const ACTIVITY_SHORT: Record<CalendarTask['activityType'], string> = {
  TEORIA: 'Teoria',
  QUESTOES: 'Questões',
  REVISAO: 'Revisão',
  SIMULADO: 'Simulado',
  REDACAO: 'Redação',
};

/** "Matemática: Teoria — Frações" → "Frações" (o assunto, sem repetir matéria e atividade). */
export function topicOf(task: Pick<CalendarTask, 'title' | 'subject'>): string {
  const afterDash = task.title.split(' — ').slice(1).join(' — ').trim();
  if (afterDash) return afterDash;
  return task.title.replace(new RegExp(`^${task.subject}:\\s*`), '').trim() || task.title;
}

/** Junta as tarefas do dia por matéria: "Matemática · 30 min · Frações, Conjuntos". */
export function bySubject(tasks: CalendarTask[]): { subject: string; minutes: number; topics: string[]; done: boolean }[] {
  const map = new Map<string, { subject: string; minutes: number; topics: string[]; done: boolean }>();
  for (const t of tasks) {
    const cur = map.get(t.subject) ?? { subject: t.subject, minutes: 0, topics: [], done: true };
    cur.minutes += t.minutes;
    const topic = topicOf(t);
    if (!cur.topics.includes(topic)) cur.topics.push(topic);
    cur.done = cur.done && t.status === 'DONE';
    map.set(t.subject, cur);
  }
  return [...map.values()];
}

const PALETTE = [
  'bg-sky-100 text-sky-900 border-sky-200',
  'bg-amber-100 text-amber-900 border-amber-200',
  'bg-emerald-100 text-emerald-900 border-emerald-200',
  'bg-rose-100 text-rose-900 border-rose-200',
  'bg-violet-100 text-violet-900 border-violet-200',
  'bg-lime-100 text-lime-900 border-lime-200',
  'bg-orange-100 text-orange-900 border-orange-200',
  'bg-teal-100 text-teal-900 border-teal-200',
  'bg-fuchsia-100 text-fuchsia-900 border-fuchsia-200',
  'bg-indigo-100 text-indigo-900 border-indigo-200',
];

/** Cor fixa por matéria (a mesma matéria tem sempre a mesma cor). */
export function subjectColor(subject: string): string {
  let h = 0;
  for (const ch of subject) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
