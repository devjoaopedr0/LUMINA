import type {
  PedagogicalSignalSeverity,
  TeacherAnalyticsResult,
  TeacherAnalyticsSignal,
} from './teacher-analytics';

/**
 * Sinais pedagógicos que dependem de dados fora da janela da turma
 * (item 41, segundo incremento):
 *
 * - queda de desempenho: acerto do aluno na turma no período atual comparado
 *   com o período anterior de mesmo tamanho;
 * - tarefas do cronograma atrasadas ("meta atrasada");
 * - inatividade conferida na plataforma inteira: quem está sem atividade em
 *   lugar nenhum há 14+ dias sobe para gravidade alta; quem está ativo fora da
 *   turma ganha essa informação no detalhe.
 */
export const DROP_MIN_ANSWERS = 5;
export const DROP_POINTS = 15;
export const DROP_HIGH_POINTS = 25;
export const OVERDUE_MIN_TASKS = 3;
export const OVERDUE_HIGH_TASKS = 8;
export const GLOBAL_INACTIVITY_HIGH_DAYS = 14;
export const MAX_SIGNALS = 40;

export interface PeriodStats {
  answers: number;
  correct: number;
}

export interface ExtraSignalsContext {
  now: Date;
  /** Acerto no período anterior por turma e aluno. */
  previous: Map<string, Map<string, PeriodStats>>;
  /** Última atividade do aluno em qualquer lugar da Lumina. */
  lastActivity: Map<string, Date>;
  /** Tarefas do cronograma vencidas e não feitas, por aluno. */
  overdueTasks: Map<string, number>;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const pct = (correct: number, total: number) => (total > 0 ? Math.round((correct / total) * 100) : null);
const weight = (s: PedagogicalSignalSeverity) => (s === 'HIGH' ? 3 : s === 'MEDIUM' ? 2 : 1);
const fmtDate = (d: Date) => d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });

export const EXTRA_RECOMMENDATION = {
  STUDENT_PERFORMANCE_DROP:
    'Converse com o aluno sobre o que mudou e retome o conteúdo do período com uma atividade curta antes de avançar.',
  STUDENT_OVERDUE_TASKS:
    'Ajude o aluno a replanejar o cronograma: menos tarefas por dia costuma funcionar melhor do que acumular atrasos.',
} as const;

export function enrichSignals(result: TeacherAnalyticsResult, ctx: ExtraSignalsContext): TeacherAnalyticsSignal[] {
  const signals: TeacherAnalyticsSignal[] = result.signals.map((signal) => {
    if (signal.kind !== 'STUDENT_INACTIVITY' || !signal.studentId) return signal;
    const last = ctx.lastActivity.get(signal.studentId);
    const days = last ? Math.floor((ctx.now.getTime() - last.getTime()) / DAY_MS) : null;
    if (days === null || days >= GLOBAL_INACTIVITY_HIGH_DAYS) {
      return {
        ...signal,
        severity: 'HIGH',
        title: `${signal.studentName} está sem atividade na Lumina${days === null ? '' : ` há ${days} dias`}`,
        detail: last ? `Última atividade em qualquer recurso: ${fmtDate(last)}.` : 'Nenhuma atividade registrada na Lumina.',
        metric: days === null ? -999 : -days,
      };
    }
    return { ...signal, detail: `${signal.detail} Ativo em outros recursos da Lumina em ${fmtDate(last!)}.` };
  });

  for (const classRoom of result.classes) {
    const before = ctx.previous.get(classRoom.id);
    for (const student of classRoom.students) {
      const prev = before?.get(student.id);
      const prevAcc = prev ? pct(prev.correct, prev.answers) : null;
      if (
        prev &&
        prevAcc !== null &&
        student.accuracy !== null &&
        prev.answers >= DROP_MIN_ANSWERS &&
        student.answerCount >= DROP_MIN_ANSWERS &&
        prevAcc - student.accuracy >= DROP_POINTS
      ) {
        const drop = prevAcc - student.accuracy;
        signals.push({
          id: `student:${classRoom.id}:${student.id}:STUDENT_PERFORMANCE_DROP`,
          kind: 'STUDENT_PERFORMANCE_DROP',
          severity: drop >= DROP_HIGH_POINTS ? 'HIGH' : 'MEDIUM',
          classId: classRoom.id,
          className: classRoom.name,
          studentId: student.id,
          studentName: student.name,
          questionKey: null,
          subject: null,
          title: `${student.name}: acerto caiu ${drop} pontos`,
          detail: `De ${prevAcc}% (${prev.answers} respostas) no período anterior para ${student.accuracy}% (${student.answerCount} respostas) agora.`,
          recommendation: EXTRA_RECOMMENDATION.STUDENT_PERFORMANCE_DROP,
          metric: -drop,
        });
      }

      const overdue = ctx.overdueTasks.get(student.id) ?? 0;
      if (overdue >= OVERDUE_MIN_TASKS) {
        signals.push({
          id: `student:${classRoom.id}:${student.id}:STUDENT_OVERDUE_TASKS`,
          kind: 'STUDENT_OVERDUE_TASKS',
          severity: overdue >= OVERDUE_HIGH_TASKS ? 'HIGH' : 'MEDIUM',
          classId: classRoom.id,
          className: classRoom.name,
          studentId: student.id,
          studentName: student.name,
          questionKey: null,
          subject: null,
          title: `${student.name} tem ${overdue} tarefas do cronograma atrasadas`,
          detail: 'Tarefas dos últimos 14 dias que não foram feitas nem puladas.',
          recommendation: EXTRA_RECOMMENDATION.STUDENT_OVERDUE_TASKS,
          metric: -overdue,
        });
      }
    }
  }

  return signals
    .sort((a, b) => weight(b.severity) - weight(a.severity) || (a.metric ?? 101) - (b.metric ?? 101))
    .slice(0, MAX_SIGNALS);
}
