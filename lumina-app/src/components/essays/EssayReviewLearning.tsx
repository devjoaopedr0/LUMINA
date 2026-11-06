import { useMemo, useState, type FormEvent } from 'react';
import { Archive, BookMarked, CheckCircle2, Loader2, LockKeyhole, Plus, Quote, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import {
  ESSAY_COMPETENCY_LABELS,
  apiEssayLearningArchive,
  apiEssayLearningValidate,
  apiEssayReviewLearning,
  type EssayCompetencyId,
  type EssayLearningRecord,
  type EssayReviewWorkspace,
} from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { Badge, LearningLevelBadge, LEARNING_LEVEL_LABELS, formatDateTime } from './essay-review-ui';

const COMPETENCIES: EssayCompetencyId[] = ['C1', 'C2', 'C3', 'C4', 'C5'];

export function EssayReviewLearning({
  workspace,
  userId,
  selectedText,
  onReload,
}: {
  workspace: EssayReviewWorkspace;
  userId: string;
  selectedText: string | null;
  onReload: () => Promise<void>;
}) {
  const [form, setForm] = useState({
    competency: 'C3' as EssayCompetencyId,
    learning: '',
    criterion: '',
    evidence: '',
    applicability: '',
    confidence: 0.6,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const grouped = useMemo(() => COMPETENCIES.map((competency) => ({
    competency,
    records: workspace.learning.filter((record) => record.competency === competency),
  })), [workspace.learning]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || form.learning.trim().length < 3) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await apiEssayReviewLearning(getAccessToken() ?? '', workspace.essay.id, {
        competency: form.competency,
        learning: form.learning.trim(),
        criterion: form.criterion.trim() || undefined,
        evidence: form.evidence.trim() || undefined,
        applicability: form.applicability.trim() || undefined,
        confidence: form.confidence,
      });
      setForm({ competency: form.competency, learning: '', criterion: '', evidence: '', applicability: '', confidence: 0.6 });
      setNotice('Aprendizado recebido. Ele ainda precisa de validação independente antes de influenciar a IA.');
      await onReload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível registrar o aprendizado.');
    } finally {
      setBusy(false);
    }
  }

  const counts = {
    received: workspace.learning.filter((record) => record.level === 'RECEIVED').length,
    structured: workspace.learning.filter((record) => record.level === 'STRUCTURED').length,
    validated: workspace.learning.filter((record) => record.level === 'VALIDATED').length,
    consolidated: workspace.learning.filter((record) => record.level === 'CONSOLIDATED').length,
  };

  return (
    <section aria-labelledby="learning-title" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="learning-title" className="text-xl font-bold text-graphite">Aprendizagem estruturada</h2>
          <p className="mt-1 text-sm text-graphite-500">Cada competência mantém exemplos, justificativas e casos de divergência. O chat bruto não vira treino.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge>Recebidos {counts.received}</Badge>
          <Badge tone="warn">Estruturados {counts.structured}</Badge>
          <Badge tone="warn">Validados {counts.validated}</Badge>
          <Badge tone="good">Consolidados {counts.consolidated}</Badge>
        </div>
      </div>

      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
        <p className="flex items-center gap-2 font-semibold"><LockKeyhole size={14} />Regra de ouro</p>
        <p className="mt-1">Uma correção isolada não ensina a IA. Só registros <strong>validados por outra pessoa</strong> e <strong>consolidados com consentimento e anonimização</strong> entram na recuperação de exemplos. O histórico fica versionado e pode ser arquivado.</p>
      </div>

      {workspace.canReview ? (
        <form onSubmit={(event) => void submit(event)} className="rounded-2xl border border-surface-line bg-white p-4">
          <h3 className="flex items-center gap-2 font-semibold text-graphite"><Plus size={16} />Registrar uma lição do chat</h3>
          <p className="mt-1 text-xs text-graphite-500">Destile o que foi aprendido. Evite copiar a conversa inteira.</p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label className="text-xs font-semibold text-graphite-700">Competência
              <select value={form.competency} onChange={(event) => setForm((current) => ({ ...current, competency: event.target.value as EssayCompetencyId }))} className="mt-1 w-full rounded-xl border border-surface-line px-3 py-2 text-sm">
                {COMPETENCIES.map((competency) => <option key={competency} value={competency}>{competency} · {ESSAY_COMPETENCY_LABELS[competency]}</option>)}
              </select>
            </label>
            <label className="text-xs font-semibold text-graphite-700">Critério discutido
              <input value={form.criterion} maxLength={240} onChange={(event) => setForm((current) => ({ ...current, criterion: event.target.value }))} placeholder="Ex.: repertório sociocultural produtivo" className="mt-1 w-full rounded-xl border border-surface-line px-3 py-2 text-sm" />
            </label>
            <label className="text-xs font-semibold text-graphite-700 md:col-span-2">Lição estruturada
              <textarea value={form.learning} required minLength={3} maxLength={2000} onChange={(event) => setForm((current) => ({ ...current, learning: event.target.value }))} placeholder="O que a IA deve considerar na próxima avaliação? Em que condição?" className="mt-1 min-h-24 w-full rounded-xl border border-surface-line px-3 py-2 text-sm" />
            </label>
            <label className="text-xs font-semibold text-graphite-700">Evidência / trecho
              <textarea value={form.evidence} maxLength={4000} onChange={(event) => setForm((current) => ({ ...current, evidence: event.target.value }))} placeholder="Trecho literal, já anonimizado se necessário." className="mt-1 min-h-20 w-full rounded-xl border border-surface-line px-3 py-2 text-sm" />
              {selectedText ? <button type="button" onClick={() => setForm((current) => ({ ...current, evidence: selectedText }))} className="mt-1 text-[11px] font-semibold text-primary-700 underline">Usar o trecho selecionado na redação</button> : null}
            </label>
            <label className="text-xs font-semibold text-graphite-700">Aplicabilidade
              <input value={form.applicability} maxLength={2000} onChange={(event) => setForm((current) => ({ ...current, applicability: event.target.value }))} placeholder="Ex.: redações com repertório histórico sem nexo argumentativo" className="mt-1 w-full rounded-xl border border-surface-line px-3 py-2 text-sm" />
            </label>
            <label className="text-xs font-semibold text-graphite-700 md:col-span-2">Confiança do avaliador · {Math.round(form.confidence * 100)}%
              <input type="range" min={0} max={1} step={0.05} value={form.confidence} onChange={(event) => setForm((current) => ({ ...current, confidence: Number(event.target.value) }))} className="mt-2 w-full accent-primary" />
            </label>
          </div>
          {error ? <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
          {notice ? <p role="status" className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p> : null}
          <Button type="submit" className="mt-3" disabled={busy || form.learning.trim().length < 3}>{busy ? <Loader2 size={16} className="animate-spin" /> : <BookMarked size={16} />}Registrar aprendizado</Button>
        </form>
      ) : null}

      <div className="space-y-4">
        {grouped.map(({ competency, records }) => (
          <section key={competency} className="rounded-2xl border border-surface-line bg-white p-4">
            <header className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-semibold text-graphite">{competency} · {ESSAY_COMPETENCY_LABELS[competency]}</h3>
                <p className="text-xs text-graphite-500">{records.length} registro(s) ativo(s)</p>
              </div>
              <Badge tone={records.some((record) => record.level === 'CONSOLIDATED') ? 'good' : 'neutral'}>
                {records.some((record) => record.level === 'CONSOLIDATED') ? 'Há exemplo consolidado' : 'Sem exemplo consolidado'}
              </Badge>
            </header>
            {!records.length ? <p className="mt-3 text-sm text-graphite-400">Nenhum aprendizado registrado nesta competência.</p> : (
              <div className="mt-3 space-y-3">
                {records.map((record) => (
                  <LearningRecordCard
                    key={record.id}
                    record={record}
                    userId={userId}
                    canValidate={workspace.canValidate}
                    onReload={onReload}
                  />
                ))}
              </div>
            )}
          </section>
        ))}
      </div>
    </section>
  );
}

function LearningRecordCard({
  record,
  userId,
  canValidate,
  onReload,
}: {
  record: EssayLearningRecord;
  userId: string;
  canValidate: boolean;
  onReload: () => Promise<void>;
}) {
  const [notes, setNotes] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const own = record.createdByUser?.id === userId;
  const canArchive = own || canValidate;

  async function validate(level: 'VALIDATED' | 'CONSOLIDATED') {
    if (busy) return;
    setBusy(true); setError('');
    try {
      await apiEssayLearningValidate(getAccessToken() ?? '', record.id, { level, notes: notes.trim() || undefined, consentConfirmed: consent || undefined });
      await onReload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível validar o aprendizado.');
    } finally {
      setBusy(false);
    }
  }

  async function archive() {
    if (busy || !window.confirm('Arquivar este aprendizado? Ele deixa de ser usado como exemplo, mas o histórico permanece na auditoria.')) return;
    setBusy(true); setError('');
    try {
      await apiEssayLearningArchive(getAccessToken() ?? '', record.id);
      await onReload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível arquivar o aprendizado.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="rounded-xl border border-surface-line bg-surface-card/50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <LearningLevelBadge level={record.level} />
          <Badge>{record.origin === 'HUMAN_REVIEW' ? 'Revisão humana' : record.origin === 'HUMAN_CHAT' ? 'Chat humano' : record.origin}</Badge>
          <span className="text-[11px] text-graphite-400">v{record.version} · {formatDateTime(record.createdAt)}</span>
        </div>
        {canArchive ? <Button size="sm" variant="ghost" disabled={busy} onClick={() => void archive()}><Archive size={14} />Arquivar</Button> : null}
      </div>
      <p className="mt-2 whitespace-pre-wrap text-sm text-graphite-700">{record.learning}</p>
      {record.evidence ? <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-white px-2 py-1.5 text-xs italic text-graphite-500"><Quote size={12} className="mt-0.5 shrink-0" />{record.evidence}</p> : null}
      <dl className="mt-2 grid gap-2 text-[11px] text-graphite-500 sm:grid-cols-2">
        {record.criterion ? <div><dt className="font-semibold text-graphite-700">Critério</dt><dd>{record.criterion}</dd></div> : null}
        {record.aiScore !== null || record.humanScore !== null ? <div><dt className="font-semibold text-graphite-700">Notas</dt><dd>IA {record.aiScore ?? '—'} · humana {record.humanScore ?? '—'}</dd></div> : null}
        {record.divergenceReason ? <div><dt className="font-semibold text-graphite-700">Motivo da divergência</dt><dd>{record.divergenceReason}</dd></div> : null}
        {record.applicability ? <div><dt className="font-semibold text-graphite-700">Aplicabilidade</dt><dd>{record.applicability}</dd></div> : null}
        {record.humanJustification ? <div className="sm:col-span-2"><dt className="font-semibold text-graphite-700">Justificativa humana</dt><dd className="whitespace-pre-wrap">{record.humanJustification}</dd></div> : null}
      </dl>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-graphite-400">
        {record.createdByUser ? <span>Registrado por {[record.createdByUser.profile?.firstName, record.createdByUser.profile?.lastName].filter(Boolean).join(' ') || 'avaliador'}</span> : null}
        {record.validatedByUser ? <span>· Validado por {[record.validatedByUser.profile?.firstName, record.validatedByUser.profile?.lastName].filter(Boolean).join(' ') || 'avaliador'} em {formatDateTime(record.validatedAt)}</span> : null}
        {record.anonymized && record.consentAt ? <span className="flex items-center gap-1 text-emerald-700"><ShieldCheck size={12} />Anonimizado e consentido</span> : null}
      </div>

      {canValidate && !own && record.level !== 'CONSOLIDATED' ? (
        <div className="mt-3 rounded-xl border border-surface-line bg-white p-3">
          <p className="text-xs font-semibold text-graphite-700">Validação independente · {LEARNING_LEVEL_LABELS[record.level]}</p>
          <input value={notes} maxLength={4000} onChange={(event) => setNotes(event.target.value)} placeholder="Nota da validação (opcional)" className="mt-2 w-full rounded-lg border border-surface-line px-2.5 py-1.5 text-xs" />
          {record.level === 'VALIDATED' ? (
            <label className="mt-2 flex items-start gap-2 text-[11px] text-graphite-600">
              <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-0.5" />
              Confirmo consentimento e anonimização para consolidar este exemplo no conjunto de recuperação.
            </label>
          ) : null}
          {error ? <p role="alert" className="mt-2 text-xs text-red-700">{error}</p> : null}
          <div className="mt-2 flex flex-wrap gap-2">
            {record.level !== 'VALIDATED' ? <Button size="sm" variant="outline" disabled={busy} onClick={() => void validate('VALIDATED')}>{busy ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}Validar</Button> : null}
            {record.level === 'VALIDATED' ? <Button size="sm" disabled={busy || !consent} onClick={() => void validate('CONSOLIDATED')}>{busy ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />}Consolidar</Button> : null}
          </div>
        </div>
      ) : null}
      {own && record.level !== 'CONSOLIDATED' ? <p className="mt-2 text-[11px] text-graphite-400">Quem registrou não pode validar sozinho. Outro avaliador precisa revisar.</p> : null}
    </article>
  );
}
