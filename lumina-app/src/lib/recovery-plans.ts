/** Plano de recuperação (item 42): tipos da API e regras de exibição. */
export type RecoveryStepKind = 'VIDEO' | 'EASY' | 'MEDIUM' | 'HARD' | 'REVIEW' | 'REASSESS';
export type RecoveryStepState = 'LOCKED' | 'AVAILABLE' | 'DONE' | 'SKIPPED' | 'WAITING';
export type RecoveryPlanStatus = 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

export interface RecoveryStep {
  kind: RecoveryStepKind;
  title: string;
  questionIds: string[];
  target: number;
  note?: string;
  state: RecoveryStepState;
  answered: number;
  correct: number;
  results: Record<string, boolean>;
}

export interface RecoveryPlan {
  id: string;
  studentId: string;
  studentName: string;
  createdById: string;
  createdBySelf: boolean;
  classId: string | null;
  subjectId: string;
  topicId: string;
  subjectName: string;
  topicName: string;
  status: RecoveryPlanStatus;
  poolInfo: { topic: number; skill: number; subject: number; skills: string[] };
  baselineMastery: number | null;
  currentMastery: number | null;
  reviewAt: string;
  videoWatchedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  steps: RecoveryStep[];
}

export const STEP_STATE_LABEL: Record<RecoveryStepState, string> = {
  LOCKED: 'Bloqueada',
  AVAILABLE: 'Agora',
  DONE: 'Concluída',
  SKIPPED: 'Pulada',
  WAITING: 'Agendada',
};

export const PLAN_STATUS_LABEL: Record<RecoveryPlanStatus, string> = {
  ACTIVE: 'Em andamento',
  COMPLETED: 'Concluído',
  CANCELLED: 'Cancelado',
};

const COUNTED: RecoveryStepKind[] = ['EASY', 'MEDIUM', 'HARD', 'REVIEW', 'REASSESS'];

/** % das etapas obrigatórias concluídas (vídeo e etapas puladas não contam). */
export function planProgress(plan: Pick<RecoveryPlan, 'steps'>): number {
  const steps = plan.steps.filter((s) => COUNTED.includes(s.kind) && s.state !== 'SKIPPED');
  if (!steps.length) return 0;
  return Math.round((steps.filter((s) => s.state === 'DONE').length / steps.length) * 100);
}

/** Primeira etapa de questões disponível (o que o aluno faz agora). */
export function currentStep(plan: Pick<RecoveryPlan, 'steps'>): RecoveryStep | null {
  return plan.steps.find((s) => s.state === 'AVAILABLE' && s.questionIds.length > 0) ?? null;
}

/** Variação do domínio do assunto no plano, em pontos; null sem dados. */
export function masteryDelta(plan: Pick<RecoveryPlan, 'baselineMastery' | 'currentMastery'>): number | null {
  if (plan.baselineMastery === null || plan.currentMastery === null) return null;
  return plan.currentMastery - plan.baselineMastery;
}

/** Explica de onde vieram as questões, quando o assunto sozinho não bastou. */
export function poolSummary(info: RecoveryPlan['poolInfo']): string | null {
  if (info.skill === 0 && info.subject === 0) return null;
  const parts = [`${info.topic} do assunto`];
  if (info.skill) parts.push(`${info.skill} da mesma habilidade do ENEM`);
  if (info.subject) parts.push(`${info.subject} da matéria`);
  return `O banco tem poucas questões deste assunto; o plano usa ${parts.join(', ')}.`;
}
