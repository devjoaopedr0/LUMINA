import { useState } from 'react';
import { ChevronDown, ClipboardList, History, Loader2, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import {
  apiEssayReviewAudit,
  apiEssayReviewValidate,
  type EssayReview,
  type EssayReviewWorkspace,
} from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { Badge, DecisionBadge, LearningLevelBadge, ReviewStatusBadge, ScoreDelta, formatDateTime } from './essay-review-ui';

const AUDIT_LABELS: Record<string, string> = {
  REVIEW_SUBMITTED: 'Revisão enviada',
  REVIEW_VALIDATED: 'Revisão validada',
  REVIEW_CONSOLIDATED: 'Revisão consolidada',
  REVIEW_RESET: 'Validação revertida por nova edição',
  LEARNING_CREATED: 'Aprendizado criado',
  LEARNING_ARCHIVED: 'Aprendizado arquivado',
  MESSAGE_CREATED: 'Mensagem no chat',
};

export function EssayReviewHistory({
  workspace,
  userId,
  onReload,
}: {
  workspace: EssayReviewWorkspace;
  userId: string;
  onReload: () => Promise<void>;
}) {
  return (
    <section aria-labelledby="review-history-title" className="space-y-4">
      <div>
        <h2 id="review-history-title" className="flex items-center gap-2 text-xl font-bold text-graphite"><History size={19} />Histórico de revisões</h2>
        <p className="mt-1 text-sm text-graphite-500">Cada avaliador mantém a própria versão. Validações são independentes e ficam auditadas.</p>
      </div>
      {!workspace.reviews.length ? <p className="rounded-2xl border border-dashed border-surface-line bg-white p-6 text-sm text-graphite-500">Ainda não há revisão humana enviada para esta redação.</p> : (
        workspace.reviews.map((review) => (
          <ReviewHistoryCard key={review.id} review={review} userId={userId} canValidate={workspace.canValidate} onReload={onReload} />
        ))
      )}
    </section>
  );
}

function ReviewHistoryCard({
  review,
  userId,
  canValidate,
  onReload,
}: {
  review: EssayReview;
  userId: string;
  canValidate: boolean;
  onReload: () => Promise<void>;
}) {
  const [notes, setNotes] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [audit, setAudit] = useState<Awaited<ReturnType<typeof apiEssayReviewAudit>> | null>(null);
  const [auditBusy, setAuditBusy] = useState(false);
  const own = review.evaluator.id === userId;
  const divergence = review.divergenceJson;

  async function validate(level: 'VALIDATED' | 'CONSOLIDATED') {
    if (busy) return;
    setBusy(true); setError('');
    try {
      await apiEssayReviewValidate(getAccessToken() ?? '', review.id, {
        level,
        notes: notes.trim() || undefined,
        consentConfirmed: level === 'CONSOLIDATED' ? consent : undefined,
      });
      await onReload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível validar esta revisão.');
    } finally {
      setBusy(false);
    }
  }

  async function loadAudit() {
    if (auditBusy) return;
    setAuditBusy(true); setError('');
    try {
      setAudit(await apiEssayReviewAudit(getAccessToken() ?? '', review.id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível carregar a auditoria.');
    } finally {
      setAuditBusy(false);
    }
  }

  return (
    <article className="rounded-2xl border border-surface-line bg-white p-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <ReviewStatusBadge status={review.status} />
            <LearningLevelBadge level={review.validationLevel} />
            {review.decision ? <DecisionBadge decision={review.decision} /> : null}
            {divergence?.discrepant ? <Badge tone="bad">Divergência relevante</Badge> : null}
          </div>
          <p className="mt-2 text-sm font-semibold text-graphite">{review.evaluator.name} · versão {review.essayVersion}</p>
          <p className="text-xs text-graphite-500">Enviada em {formatDateTime(review.submittedAt ?? review.validatedAt)} · atualizada em {formatDateTime(review.validatedAt)}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-graphite-500">Total IA → humana</p>
          <p className="mt-1"><ScoreDelta aiScore={review.aiTotalScore} humanScore={review.totalScore} total /></p>
          {divergence ? <p className="mt-1 text-[11px] text-graphite-400">Maior diferença por competência: {divergence.maxCompetency}</p> : null}
        </div>
      </header>

      {review.generalFeedback ? <p className="mt-3 whitespace-pre-wrap rounded-xl bg-surface-card p-3 text-sm text-graphite-700">{review.generalFeedback}</p> : null}

      <details className="group mt-3 rounded-xl border border-surface-line">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-sm font-semibold text-graphite">
          Comparação nas cinco competências
          <ChevronDown size={15} className="transition group-open:rotate-180" />
        </summary>
        <div className="overflow-x-auto border-t border-surface-line">
          <table className="w-full min-w-[680px] text-left text-xs">
            <thead className="bg-surface-card text-graphite-500">
              <tr>
                <th className="px-3 py-2 font-medium">Competência</th>
                <th className="px-3 py-2 font-medium">IA</th>
                <th className="px-3 py-2 font-medium">Humano</th>
                <th className="px-3 py-2 font-medium">Decisão</th>
                <th className="px-3 py-2 font-medium">Critério e justificativa</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-line">
              {review.details.map((detail) => (
                <tr key={detail.id}>
                  <td className="px-3 py-2 font-semibold text-graphite">{detail.competency}</td>
                  <td className="px-3 py-2">{detail.aiScore}</td>
                  <td className="px-3 py-2"><ScoreDelta aiScore={detail.aiScore} humanScore={detail.humanScore} /></td>
                  <td className="px-3 py-2"><DecisionBadge decision={detail.decision} /></td>
                  <td className="px-3 py-2 text-graphite-600">
                    {detail.criterion ? <p className="font-semibold">{detail.criterion}</p> : null}
                    {detail.justification ? <p className="mt-0.5 whitespace-pre-wrap">{detail.justification}</p> : null}
                    {detail.evidenceJson?.evidence?.length ? <p className="mt-1 italic text-graphite-400">“{detail.evidenceJson.evidence.join('” · “')}”</p> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      {review.validationNotes ? <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-800"><strong>Nota da validação:</strong> {review.validationNotes}</p> : null}
      {review.validatedBy ? <p className="mt-1 text-[11px] text-graphite-400">Validado por {review.validatedBy.name} em {formatDateTime(review.validatedAt)}</p> : null}

      {canValidate && !own && review.validationLevel !== 'CONSOLIDATED' ? (
        <div className="mt-3 rounded-xl border border-surface-line bg-surface-card/60 p-3">
          <p className="text-xs font-semibold text-graphite-700">Validação independente</p>
          <input value={notes} maxLength={4000} onChange={(event) => setNotes(event.target.value)} placeholder="Nota da validação (opcional)" className="mt-2 w-full rounded-lg border border-surface-line bg-white px-2.5 py-1.5 text-xs" />
          {review.validationLevel === 'VALIDATED' ? (
            <label className="mt-2 flex items-start gap-2 text-[11px] text-graphite-600">
              <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-0.5" />
              Confirmo consentimento e anonimização dos trechos para consolidar o aprendizado no conjunto de recuperação.
            </label>
          ) : null}
          {error ? <p role="alert" className="mt-2 text-xs text-red-700">{error}</p> : null}
          <div className="mt-2 flex flex-wrap gap-2">
            {review.validationLevel !== 'VALIDATED' ? <Button size="sm" variant="outline" disabled={busy} onClick={() => void validate('VALIDATED')}>{busy ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />}Validar revisão</Button> : null}
            {review.validationLevel === 'VALIDATED' ? <Button size="sm" disabled={busy || !consent} onClick={() => void validate('CONSOLIDATED')}>{busy ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />}Consolidar</Button> : null}
          </div>
        </div>
      ) : null}
      {own && canValidate && review.validationLevel !== 'CONSOLIDATED' ? <p className="mt-2 text-[11px] text-graphite-400">A validação precisa ser feita por outra pessoa: quem avaliou não valida a própria revisão.</p> : null}

      <div className="mt-3">
        <Button size="sm" variant="ghost" disabled={auditBusy} onClick={() => void loadAudit()}><ClipboardList size={14} />{audit ? 'Atualizar auditoria' : 'Ver auditoria'}{auditBusy ? <Loader2 size={13} className="animate-spin" /> : null}</Button>
        {audit ? (
          <ol className="mt-2 space-y-1.5 border-l-2 border-surface-line pl-3">
            {audit.events.length ? audit.events.map((event) => (
              <li key={event.id} className="text-[11px] text-graphite-500">
                <span className="font-semibold text-graphite-700">{AUDIT_LABELS[event.action] ?? event.action}</span>
                {' · '}{formatDateTime(event.createdAt)}
                {event.actor ? ` · ${[event.actor.profile?.firstName, event.actor.profile?.lastName].filter(Boolean).join(' ') || 'usuário'}` : ''}
              </li>
            )) : <li className="text-[11px] text-graphite-400">Nenhum evento registrado para esta revisão.</li>}
          </ol>
        ) : null}
        {error && audit ? <p role="alert" className="mt-2 text-xs text-red-700">{error}</p> : null}
      </div>
    </article>
  );
}
