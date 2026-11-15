import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ApiError, apiCreateRecoveryPlan, apiPedagogicalAlerts, apiUpdatePedagogicalAlert, type PedagogicalAlert, type PedagogicalAlertStatus } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import {
  ROTULO_STATUS_ALERTA,
  acoesDoAlerta,
  alertasDaAba,
  classesSeveridade,
  formatarDataHora,
  rotuloSeveridade,
  rotuloSinal,
  type AlertTab,
} from '@/lib/teacher-analytics';

/** Alertas de dificuldade do aluno, em que um plano de recuperação faz sentido. */
const PLAN_KINDS = new Set(['STUDENT_LOW_ACCURACY', 'STUDENT_PERFORMANCE_DROP', 'STUDENT_ERROR_STREAK']);

const ABAS: { id: AlertTab; label: string }[] = [
  { id: 'abertos', label: 'Abertos' },
  { id: 'acompanhamento', label: 'Em acompanhamento' },
  { id: 'encerrados', label: 'Encerrados (60 dias)' },
];

/**
 * Alertas pedagógicos persistidos (item 41): o professor acompanha, resolve
 * ou dispensa, com anotação. O sistema reabre o que voltou a aparecer e
 * resolve sozinho o que deixou de aparecer.
 */
export function PedagogicalAlerts() {
  const [items, setItems] = useState<PedagogicalAlert[] | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<AlertTab>('abertos');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [planMsg, setPlanMsg] = useState<Record<string, string>>({});

  async function createPlan(alert: PedagogicalAlert) {
    setSaving(true);
    try {
      const plan = await apiCreateRecoveryPlan(getAccessToken() ?? '', { studentId: alert.studentId!, classId: alert.classId ?? undefined, alertId: alert.id });
      setPlanMsg((m) => ({ ...m, [alert.id]: `Plano criado: ${plan.topicName} (${plan.subjectName}), o assunto mais fraco do aluno. Ele aparece para o aluno em "Planos de recuperação".` }));
    } catch (e) {
      setPlanMsg((m) => ({ ...m, [alert.id]: e instanceof ApiError ? e.message : 'Não foi possível criar o plano.' }));
    } finally {
      setSaving(false);
    }
  }

  const load = useCallback(() => {
    setError('');
    apiPedagogicalAlerts(getAccessToken() ?? '')
      .then((r) => setItems(r.items))
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Não foi possível carregar os alertas.'));
  }, []);
  useEffect(load, [load]);

  async function change(alert: PedagogicalAlert, to: PedagogicalAlertStatus) {
    setSaving(true);
    try {
      await apiUpdatePedagogicalAlert(getAccessToken() ?? '', alert.id, { status: to, note: note.trim() || undefined });
      setNote('');
      setExpanded(null);
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Não foi possível atualizar o alerta.');
    } finally {
      setSaving(false);
    }
  }

  const list = items ? alertasDaAba(items, tab) : [];
  return (
    <section className="mt-8" aria-labelledby="alertas-titulo">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="alertas-titulo" className="text-xl font-bold">Alertas pedagógicos</h2>
          <p className="text-sm text-graphite-500">
            Calculados sobre os últimos 30 dias de todas as suas turmas e guardados com o histórico do que foi feito.
          </p>
        </div>
        <div className="flex rounded-xl border border-surface-line bg-white p-1 text-sm" role="tablist" aria-label="Situação dos alertas">
          {ABAS.map((a) => {
            const count = items ? alertasDaAba(items, a.id).length : 0;
            return (
              <button key={a.id} type="button" role="tab" aria-selected={tab === a.id} onClick={() => setTab(a.id)}
                className={`rounded-lg px-3 py-1.5 font-semibold ${tab === a.id ? 'bg-graphite text-white' : ''}`}>
                {a.label} <span className="font-normal opacity-70">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {error ? <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {!items && !error ? <p role="status" className="mt-4 text-sm text-graphite-500">Carregando alertas…</p> : null}
      {items && list.length === 0 ? (
        <Card className="mt-4 bg-white">
          <p className="text-sm text-graphite-500">
            {tab === 'abertos' ? 'Nenhum alerta aberto. Os novos aparecem aqui assim que os dados das turmas indicarem algo.' : 'Nada nesta aba.'}
          </p>
        </Card>
      ) : null}

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {list.map((alert) => (
          <article key={alert.id} className="rounded-xl border border-surface-line bg-white p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${classesSeveridade(alert.severity)}`}>{rotuloSeveridade(alert.severity)}</span>
              <span className="rounded-full bg-graphite/5 px-2.5 py-1 text-xs font-semibold text-graphite-500">{rotuloSinal(alert.kind)}</span>
              {alert.className ? <span className="text-xs font-medium text-graphite-400">{alert.className}</span> : null}
              {alert.reopenCount > 0 ? <span className="text-xs text-amber-700">Reaberto {alert.reopenCount}×</span> : null}
            </div>
            <h3 className="mt-3 font-semibold text-graphite">{alert.title}</h3>
            <p className="mt-1 text-sm text-graphite-500">{alert.detail}</p>
            <p className="mt-3 rounded-lg bg-surface-card p-3 text-sm text-graphite-500"><strong className="text-graphite">Sugestão:</strong> {alert.recommendation}</p>
            <p className="mt-2 text-xs text-graphite-400">
              {ROTULO_STATUS_ALERTA[alert.status]}
              {alert.autoResolved ? ' automaticamente (o sinal deixou de aparecer)' : ''} · desde {formatarDataHora(alert.firstSeenAt)}
              {alert.note ? ` · Anotação: ${alert.note}` : ''}
            </p>

            {expanded === alert.id ? (
              <div className="mt-3 space-y-2">
                <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000}
                  placeholder="O que foi feito? (opcional)" aria-label="Anotação"
                  className="w-full rounded-xl border border-surface-line p-2 text-sm" />
                <div className="flex flex-wrap gap-2">
                  {acoesDoAlerta(alert.status).map((a) => (
                    <Button key={a.to} size="sm" variant={a.to === 'DISMISSED' ? 'outline' : undefined} disabled={saving} onClick={() => void change(alert, a.to)}>{a.label}</Button>
                  ))}
                  <Button size="sm" variant="ghost" onClick={() => { setExpanded(null); setNote(''); }}>Cancelar</Button>
                </div>
                {alert.history.length > 1 ? (
                  <ol className="mt-2 space-y-1 border-l-2 border-surface-line pl-3 text-xs text-graphite-500" aria-label="Histórico">
                    {alert.history.map((h, i) => (
                      <li key={i}>{formatarDataHora(h.at)}: {h.from ? `${ROTULO_STATUS_ALERTA[h.from]} → ` : ''}{ROTULO_STATUS_ALERTA[h.to]}{h.by ? '' : ' (sistema)'}{h.note ? ` — ${h.note}` : ''}</li>
                    ))}
                  </ol>
                ) : null}
              </div>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => { setExpanded(alert.id); setNote(alert.note ?? ''); }}>Registrar acompanhamento</Button>
                {alert.studentId && PLAN_KINDS.has(alert.kind) && alert.status !== 'RESOLVED' && alert.status !== 'DISMISSED' ? (
                  <Button size="sm" variant="ghost" disabled={saving} onClick={() => void createPlan(alert)}>Criar plano de recuperação</Button>
                ) : null}
              </div>
            )}
            {planMsg[alert.id] ? <p role="status" className="mt-2 text-xs text-graphite-500">{planMsg[alert.id]}</p> : null}
          </article>
        ))}
      </div>
    </section>
  );
}
