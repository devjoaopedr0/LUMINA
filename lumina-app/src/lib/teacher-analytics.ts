import type {
  TeacherAnalyticsResult,
  TeacherAnalyticsSeverity,
  TeacherAnalyticsSignal,
  TeacherAnalyticsSignalKind,
  TeacherAnalyticsStudent,
} from './api';

const SEVERITY_ORDER: Record<TeacherAnalyticsSeverity, number> = {
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};

export function rotuloSeveridade(severity: TeacherAnalyticsSeverity): string {
  if (severity === 'HIGH') return 'Alta';
  if (severity === 'MEDIUM') return 'Média';
  return 'Baixa';
}

export function classesSeveridade(severity: TeacherAnalyticsSeverity): string {
  if (severity === 'HIGH') return 'border-red-200 bg-red-50 text-red-800';
  if (severity === 'MEDIUM') return 'border-amber-200 bg-amber-50 text-amber-800';
  return 'border-sky-200 bg-sky-50 text-sky-800';
}

export function rotuloSinal(kind: TeacherAnalyticsSignalKind): string {
  switch (kind) {
    case 'CLASS_LOW_ACCURACY':
      return 'Turma em atenção';
    case 'STUDENT_LOW_ACCURACY':
      return 'Desempenho baixo';
    case 'STUDENT_INACTIVITY':
      return 'Inatividade';
    case 'STUDENT_ERROR_STREAK':
      return 'Sequência de erros';
    case 'DIFFICULT_QUESTION':
      return 'Questão difícil';
  }
}

export function rotuloRisco(level: TeacherAnalyticsStudent['riskLevel']): string {
  if (level === 'HIGH') return 'Alto';
  if (level === 'MEDIUM') return 'Médio';
  if (level === 'LOW') return 'Baixo';
  return 'Sem sinal';
}

export function formatarPercentual(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : `${value}%`;
}

export function formatarMinutos(minutes: number): string {
  if (minutes <= 0) return '0 min';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}min` : `${hours}h`;
}

export function formatarDataHora(value: string | null | undefined): string {
  if (!value) return 'Sem atividade';
  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ordenarSinais(signals: TeacherAnalyticsSignal[]): TeacherAnalyticsSignal[] {
  return [...signals].sort((a, b) => {
    const bySeverity = SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity];
    if (bySeverity !== 0) return bySeverity;
    return (a.metric ?? 101) - (b.metric ?? 101);
  });
}

export function filtrarSinaisCriticos(signals: TeacherAnalyticsSignal[]): TeacherAnalyticsSignal[] {
  return ordenarSinais(signals).filter((signal) => signal.severity !== 'LOW');
}

export function resumoParticipacao(active: number, total: number): string {
  if (total <= 0) return 'Nenhum aluno na turma';
  return `${active} de ${total} alunos com atividade no período`;
}

function csvCell(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? '' : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export function gerarCsvAlunos(result: TeacherAnalyticsResult): string {
  const header = [
    'Turma',
    'Aluno',
    'E-mail',
    'Respostas',
    'Acertos',
    'Percentual',
    'Minutos de estudo',
    'Risco',
    'Motivos',
  ];
  const rows = result.classes.flatMap((classRoom) =>
    classRoom.students.map((student) => [
      classRoom.name,
      student.name,
      student.email,
      student.answerCount,
      student.correctCount,
      student.accuracy === null ? '' : `${student.accuracy}%`,
      student.studyMinutes,
      rotuloRisco(student.riskLevel),
      student.riskReasons.map((reason) => reason.label).join('; '),
    ]),
  );
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
}
