import type { TeacherAnalyticsResult } from '../institutional-analytics/teacher-analytics';

/**
 * Relatórios (item 59), regras puras: janelas de período, linhas de matéria
 * por turma e resumo do aluno. Percentual de acerto, nunca nota TRI.
 */
export type ReportType = 'STUDENT' | 'CLASS' | 'SUBJECT' | 'INSTITUTION';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Brasília (UTC−3, sem horário de verão desde 2019). */
const BRT_OFFSET_MS = 3 * 60 * 60 * 1000;

export interface ReportWindow {
  /** Fim da janela (exclusivo), no formato do painel: "agora" e o tamanho em dias. */
  now: Date;
  days: number;
  from: Date;
  label: string;
}

/** Últimos N dias até agora. */
export function rollingWindow(days: number, now: Date): ReportWindow {
  return { now, days, from: new Date(now.getTime() - days * DAY_MS), label: `${days}d-${now.toISOString().slice(0, 10)}` };
}

/** Mês civil anterior (horário de Brasília), para o relatório mensal automático. */
export function previousMonthWindow(now: Date): ReportWindow {
  const local = new Date(now.getTime() - BRT_OFFSET_MS);
  const y = local.getUTCFullYear();
  const m = local.getUTCMonth();
  const prevYear = m === 0 ? y - 1 : y;
  const prevMonth = m === 0 ? 11 : m - 1;
  const start = new Date(Date.UTC(prevYear, prevMonth, 1) + BRT_OFFSET_MS);
  const end = new Date(Date.UTC(y, m, 1) + BRT_OFFSET_MS);
  const days = Math.round((end.getTime() - start.getTime()) / DAY_MS);
  return { now: end, days, from: start, label: `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}` };
}

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** "2026-10" → "outubro de 2026"; rótulos de janela móvel ficam como "últimos N dias". */
export function periodName(label: string): string {
  const month = /^(\d{4})-(\d{2})$/.exec(label);
  if (month) return `${MONTHS[Number(month[2]) - 1]} de ${month[1]}`;
  const rolling = /^(\d+)d-/.exec(label);
  return rolling ? `últimos ${rolling[1]} dias` : label;
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
export const pct = (correct: number, total: number) => (total > 0 ? Math.round((correct / total) * 100) : null);

export interface SubjectRow {
  classId: string;
  className: string;
  attempts: number;
  correctCount: number;
  accuracy: number | null;
}

/** Linha da matéria em cada turma (cada turma calculada à parte). */
export function subjectRows(perClass: TeacherAnalyticsResult[], subject: string): SubjectRow[] {
  const target = norm(subject);
  return perClass.flatMap((r) =>
    r.classes.map((c) => {
      const row = r.subjects.find((s) => norm(s.subject) === target);
      return { classId: c.id, className: c.name, attempts: row?.attempts ?? 0, correctCount: row?.correctCount ?? 0, accuracy: row?.accuracy ?? null };
    }),
  );
}

export interface StudentAttemptLite {
  subject: string;
  isCorrect: boolean;
}

/** Acerto por matéria, da pior para a melhor. */
export function bySubject(attempts: StudentAttemptLite[]) {
  const map = new Map<string, { subject: string; answered: number; correct: number }>();
  for (const a of attempts) {
    const cur = map.get(a.subject) ?? { subject: a.subject, answered: 0, correct: 0 };
    cur.answered += 1;
    if (a.isCorrect) cur.correct += 1;
    map.set(a.subject, cur);
  }
  return [...map.values()]
    .map((r) => ({ ...r, accuracy: pct(r.correct, r.answered) }))
    .sort((a, b) => (a.accuracy ?? 101) - (b.accuracy ?? 101) || b.answered - a.answered);
}

/** Matérias fortes (≥ 70%) e fracas (< 50%), só com 5+ respostas para não rotular com amostra pequena. */
export function strengths(rows: ReturnType<typeof bySubject>, min = 5) {
  const enough = rows.filter((r) => r.answered >= min && r.accuracy !== null);
  return {
    strong: enough.filter((r) => r.accuracy! >= 70).sort((a, b) => b.accuracy! - a.accuracy!).slice(0, 3).map((r) => r.subject),
    weak: enough.filter((r) => r.accuracy! < 50).slice(0, 3).map((r) => r.subject),
  };
}

export function average(values: number[]): number | null {
  return values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null;
}

/** Contagem por situação dos planos de recuperação. */
export function planCounts(plans: { status: string }[]) {
  return {
    active: plans.filter((p) => p.status === 'ACTIVE').length,
    completed: plans.filter((p) => p.status === 'COMPLETED').length,
    cancelled: plans.filter((p) => p.status === 'CANCELLED').length,
  };
}
