import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, CircleHelp, GitCompareArrows } from 'lucide-react';
import type { EssayLearningLevel, EssayReviewDecision, EssayReviewStatus } from '@/lib/api';

export const REVIEW_STATUS_LABELS: Record<EssayReviewStatus, string> = {
  DRAFT: 'Rascunho',
  SUBMITTED: 'Enviada',
  ACCEPTED: 'Aceita',
  DISPUTED: 'Em divergência',
  SUPERSEDED: 'Substituída',
};

export const LEARNING_LEVEL_LABELS: Record<EssayLearningLevel, string> = {
  RECEIVED: '1 · Recebido',
  STRUCTURED: '2 · Estruturado',
  VALIDATED: '3 · Validado',
  CONSOLIDATED: '4 · Consolidado',
};

export const DECISION_LABELS: Record<EssayReviewDecision, string> = {
  AGREE: 'Concordo com a IA',
  DISAGREE: 'Discordo da IA',
  ADJUST: 'Ajustar nota',
};

export function reviewStatusTone(status: EssayReviewStatus): 'good' | 'warn' | 'bad' | 'neutral' {
  if (status === 'ACCEPTED') return 'good';
  if (status === 'DISPUTED') return 'bad';
  if (status === 'SUBMITTED') return 'warn';
  return 'neutral';
}

export function learningLevelTone(level: EssayLearningLevel): 'good' | 'warn' | 'bad' | 'neutral' {
  if (level === 'CONSOLIDATED') return 'good';
  if (level === 'VALIDATED') return 'warn';
  return 'neutral';
}

export function decisionTone(decision: EssayReviewDecision): 'good' | 'warn' | 'bad' | 'neutral' {
  if (decision === 'AGREE') return 'good';
  if (decision === 'DISAGREE') return 'bad';
  return 'warn';
}

const TONES = {
  good: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  warn: 'bg-amber-50 text-amber-800 ring-amber-200',
  bad: 'bg-red-50 text-red-700 ring-red-200',
  neutral: 'bg-slate-100 text-slate-700 ring-slate-200',
};

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: keyof typeof TONES }) {
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${TONES[tone]}`}>{children}</span>;
}

export function ReviewStatusBadge({ status }: { status: EssayReviewStatus }) {
  return <Badge tone={reviewStatusTone(status)}>{REVIEW_STATUS_LABELS[status] ?? status}</Badge>;
}

export function LearningLevelBadge({ level }: { level: EssayLearningLevel }) {
  return <Badge tone={learningLevelTone(level)}>{LEARNING_LEVEL_LABELS[level] ?? level}</Badge>;
}

export function DecisionBadge({ decision }: { decision: EssayReviewDecision }) {
  return <Badge tone={decisionTone(decision)}>{DECISION_LABELS[decision] ?? decision}</Badge>;
}

export function ScoreDelta({ aiScore, humanScore, total = false }: { aiScore: number; humanScore: number; total?: boolean }) {
  const difference = humanScore - aiScore;
  const Icon = difference === 0 ? CheckCircle2 : difference > 0 ? GitCompareArrows : AlertTriangle;
  const tone = difference === 0 ? 'text-emerald-700' : 'text-amber-800';
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold ${tone}`}>
      <Icon size={13} />
      {total ? `${aiScore} → ${humanScore}` : `${humanScore}`}
      {difference !== 0 ? ` (${difference > 0 ? '+' : ''}${difference})` : ' · igual'}
    </span>
  );
}

export function EmptyHint({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-surface-line bg-white/60 p-6 text-sm text-graphite-500">
      <CircleHelp className="mb-2 h-5 w-5 text-graphite-400" />
      {children}
    </div>
  );
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return '—';
  return new Date(value).toLocaleString('pt-BR');
}
