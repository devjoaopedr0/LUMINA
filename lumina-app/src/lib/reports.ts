/** Relatórios (item 59): tipos da API e exportação. */
export type ReportType = 'STUDENT' | 'CLASS' | 'SUBJECT' | 'INSTITUTION';

export interface ReportPeriod { from: string; to: string; days: number; label: string; name: string }

export interface ReportScope {
  teacherClasses: { id: string; name: string }[];
  institution: { workspaceId: string; name: string; role: 'COORDINATOR' | 'DIRECTOR' } | null;
  institutionClasses: { id: string; name: string }[];
}

export interface StudentReport {
  type: 'STUDENT';
  title: string;
  period: ReportPeriod;
  student: { id: string; name: string; email: string };
  questions: { answered: number; correct: number; accuracy: number | null; bySubject: { subject: string; answered: number; correct: number; accuracy: number | null }[]; strong: string[]; weak: string[] };
  simulations: { count: number; answers: number; accuracy: number | null };
  studyMinutes: number;
  mastery: { weakest: MasteryRow[]; strongest: MasteryRow[] };
  skills: { weakest: { code: string; text: string; attempts: number; accuracy: number | null }[] };
  essays: { count: number; average: number | null; latest: { title: string; score: number; date: string }[] };
  recoveryPlans: { topic: string; status: string; baselineMastery: number | null; finalMastery: number | null; createdAt: string }[];
}
interface MasteryRow { topic: string; subject: string; masteryScore: number; attempts: number }

export interface ClassReportStudent { id: string; name: string; email: string; answerCount: number; accuracy: number | null; studyMinutes: number; lastActivityAt: string | null; riskLevel: string }
export interface ClassReport {
  type: 'CLASS';
  title: string;
  period: ReportPeriod;
  summary: { studentCount: number; activeStudentCount: number; participationRate: number; answerCount: number; accuracy: number | null; studyMinutes: number; studentsAtRisk: number };
  class: { id: string; name: string; students: ClassReportStudent[] } | null;
  subjects: { subject: string; attempts: number; correctCount: number; accuracy: number | null }[];
  difficultQuestions: { key: string; stem: string; subject: string; attempts: number; accuracy: number | null }[];
  signals: { id: string; severity: string; title: string; recommendation: string }[];
  recoveryPlans: { active: number; completed: number; cancelled: number };
  openAlerts: number;
}

export interface SubjectReport {
  type: 'SUBJECT';
  title: string;
  period: ReportPeriod;
  subject: string;
  attempts: number;
  accuracy: number | null;
  classes: { classId: string; className: string; attempts: number; correctCount: number; accuracy: number | null }[];
  hardestQuestions: { key: string; stem: string; attempts: number; accuracy: number | null }[];
  truncated: boolean;
}

export interface InstitutionReport {
  type: 'INSTITUTION';
  title: string;
  period: ReportPeriod;
  summary: { classCount: number; studentCount: number; activeStudentCount: number; participationRate: number; accuracy: number | null; studyMinutes: number; studentsAtRisk: number };
  classes: { id: string; name: string; studentCount: number; activeStudentCount: number; participationRate: number; accuracy: number | null; studyMinutes: number; studentsAtRisk: number }[];
  subjects: { subject: string; attempts: number; accuracy: number | null }[];
  signalsBySeverity: Record<string, number>;
  recoveryPlans: { active: number; completed: number; cancelled: number };
}

export type AnyReport = StudentReport | ClassReport | SubjectReport | InstitutionReport;

export interface SnapshotSummary { id: string; type: ReportType; title: string; periodLabel: string; periodName: string; automatic: boolean; createdAt: string }

export const TYPE_LABEL: Record<ReportType, string> = {
  STUDENT: 'Individual',
  CLASS: 'Turma',
  SUBJECT: 'Matéria',
  INSTITUTION: 'Institucional',
};

export const percent = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${v}%`);
export function minutes(total: number): string {
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** Célula de CSV: aspas escapadas e sem fórmula (evita injeção ao abrir na planilha). */
export function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const toCsv = (rows: unknown[][]) => `﻿${rows.map((r) => r.map(csvCell).join(';')).join('\n')}\n`;

/** Tabela principal de cada relatório, para planilha. */
export function reportCsv(report: AnyReport): string {
  switch (report.type) {
    case 'CLASS':
      return toCsv([
        ['Aluno', 'E-mail', 'Respostas', 'Acerto (%)', 'Estudo (min)', 'Última atividade', 'Risco'],
        ...(report.class?.students ?? []).map((s) => [s.name, s.email, s.answerCount, s.accuracy ?? '', s.studyMinutes, s.lastActivityAt ?? '', s.riskLevel]),
      ]);
    case 'SUBJECT':
      return toCsv([['Turma', 'Respostas', 'Acertos', 'Acerto (%)'], ...report.classes.map((c) => [c.className, c.attempts, c.correctCount, c.accuracy ?? ''])]);
    case 'INSTITUTION':
      return toCsv([
        ['Turma', 'Alunos', 'Ativos', 'Participação (%)', 'Acerto (%)', 'Estudo (min)', 'Em atenção'],
        ...report.classes.map((c) => [c.name, c.studentCount, c.activeStudentCount, c.participationRate, c.accuracy ?? '', c.studyMinutes, c.studentsAtRisk]),
      ]);
    case 'STUDENT':
      return toCsv([['Matéria', 'Respondidas', 'Acertos', 'Acerto (%)'], ...report.questions.bySubject.map((s) => [s.subject, s.answered, s.correct, s.accuracy ?? ''])]);
  }
}

export function reportFileName(report: AnyReport, ext: string): string {
  const slug = `${TYPE_LABEL[report.type]}-${report.title}-${report.period.label}`
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9-]+/g, '-').replace(/-+/g, '-').toLowerCase();
  return `relatorio-${slug}.${ext}`;
}

export function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
