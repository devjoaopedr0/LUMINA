import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Award, Flag, Trophy, X } from 'lucide-react';
import { getAccessToken } from '@/lib/auth';
import { ApiError, apiCancelGroupGoal, apiCreateGroupGoal, apiGroupEngagement, apiUpdateGroupSharing } from '@/lib/api';
import {
  GOAL_STATUS_LABEL,
  GOAL_SUGGESTIONS,
  METRIC_HINT,
  METRIC_LABEL,
  formatRankingValue,
  goalPayloadFromForm,
  goalPeriod,
  goalProgressText,
  type GoalMetric,
  type GroupEngagement as Engagement,
  type RankingMetric,
  type RankingPeriod,
} from '@/lib/group-engagement';
import type { GroupSharing } from '@/lib/groups';
import { initials } from '@/lib/groups';

type Tab = 'ranking' | 'goals' | 'achievements';

/**
 * Placar opcional, metas coletivas e conquistas do grupo (etapa 3).
 * Saúde antes de horas: o placar padrão é a constância e cada dia conta no
 * máximo 10 h. Ninguém entra no placar sem ligar.
 */
export function GroupEngagement(props: {
  groupId: string;
  archived: boolean;
  optIn: boolean;
  onSharingSaved: (sharing: GroupSharing) => void;
}) {
  const { groupId, archived, optIn, onSharingSaved } = props;
  const [tab, setTab] = useState<Tab>('ranking');
  const [metric, setMetric] = useState<RankingMetric>('consistency');
  const [period, setPeriod] = useState<RankingPeriod>(7);
  const [data, setData] = useState<Engagement | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<{ title: string; metric: GoalMetric; amount: number; days: number }>({ ...GOAL_SUGGESTIONS[0] });

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) return;
    try {
      setData(await apiGroupEngagement(token, groupId, metric, period));
      setError('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível carregar o placar agora.');
    }
  }, [groupId, metric, period]);

  // Recarrega também quando a pessoa entra ou sai do placar pelo painel ao lado.
  useEffect(() => { void load(); }, [load, optIn]);

  async function act(action: (token: string) => Promise<Engagement>) {
    const token = getAccessToken();
    if (!token) return;
    setBusy(true);
    setError('');
    try {
      setData(await action(token));
      return true;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível concluir agora.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function toggleOptIn() {
    const token = getAccessToken();
    if (!token) return;
    setBusy(true);
    try {
      onSharingSaved(await apiUpdateGroupSharing(token, groupId, { rankingOptIn: !optIn }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível salvar.');
    } finally {
      setBusy(false);
    }
  }

  async function createGoal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = goalPayloadFromForm(new FormData(event.currentTarget));
    if ('error' in payload) {
      setError(payload.error);
      return;
    }
    if (await act((token) => apiCreateGroupGoal(token, groupId, payload))) setCreating(false);
  }

  const tabs: Array<{ key: Tab; label: string; icon: typeof Trophy }> = [
    { key: 'ranking', label: 'Placar', icon: Trophy },
    { key: 'goals', label: 'Metas', icon: Flag },
    { key: 'achievements', label: 'Conquistas', icon: Award },
  ];

  return (
    <section className="rounded-2xl border bg-white p-5" aria-labelledby="engagement-title">
      <h2 id="engagement-title" className="flex items-center gap-2 text-lg font-semibold"><Trophy size={18} />Placar e metas</h2>
      <div role="tablist" className="mt-3 flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium ${tab === t.key ? 'bg-graphite text-white' : 'bg-graphite/5 text-graphite-500 hover:text-graphite'}`}
          >
            <t.icon size={14} />{t.label}
          </button>
        ))}
      </div>

      {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {!data && !error && <p role="status" className="mt-3 text-sm text-graphite-500">Carregando…</p>}

      {data && (
        <div className="mt-4">
          {!optIn && tab !== 'achievements' && (
            <div className="mb-4 rounded-xl bg-surface-card p-3 text-sm">
              <p>
                Você está fora do placar e das metas. Seu tempo não aparece para o grupo nem conta nas metas.
                {data.me.iAmMinor && ' Como você tem menos de 18 anos, isso fica desligado até você mesmo ligar.'}
              </p>
              {!archived && (
                <button type="button" disabled={busy} onClick={() => void toggleOptIn()} className="mt-2 rounded-full bg-graphite px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60">
                  Participar do placar e das metas
                </button>
              )}
            </div>
          )}

          {tab === 'ranking' && (
            <div role="tabpanel" aria-label="Placar">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <label className="sr-only" htmlFor="ranking-metric">Placar</label>
                <select id="ranking-metric" value={metric} onChange={(e) => setMetric(e.target.value as RankingMetric)} className="rounded-lg border bg-white p-1.5">
                  {(Object.keys(METRIC_LABEL) as RankingMetric[]).map((m) => <option key={m} value={m}>{METRIC_LABEL[m]}</option>)}
                </select>
                {metric !== 'streak' && (
                  <>
                    <label className="sr-only" htmlFor="ranking-period">Período</label>
                    <select id="ranking-period" value={period} onChange={(e) => setPeriod(Number(e.target.value) as RankingPeriod)} className="rounded-lg border bg-white p-1.5">
                      <option value={7}>Últimos 7 dias</option>
                      <option value={30}>Últimos 30 dias</option>
                    </select>
                  </>
                )}
              </div>
              <p className="mt-2 text-xs text-graphite-500">{METRIC_HINT[metric]} Dia com estudo = pelo menos {data.rules.minMinutesPerDay} min.</p>

              {data.ranking.entries.length === 0 ? (
                <p className="mt-3 rounded-xl bg-surface-card p-3 text-sm text-graphite-500">Ninguém entrou no placar ainda. Ele é opcional: cada um decide se participa.</p>
              ) : (
                <ol className="mt-3 divide-y">
                  {data.ranking.entries.map((e) => (
                    <li key={e.userId} className={`flex items-center gap-3 py-2 ${e.isMe ? 'font-semibold' : ''}`}>
                      <span className="w-6 text-center text-sm tabular-nums text-graphite-500">{e.position}º</span>
                      {e.avatarUrl
                        ? <img src={e.avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
                        : <span aria-hidden className="grid h-8 w-8 place-items-center rounded-full bg-primary-100 text-xs font-bold text-primary-700">{initials(e.name)}</span>}
                      <span className="min-w-0 flex-1 truncate text-sm">{e.name}{e.isMe && ' (você)'}</span>
                      <span className="text-sm tabular-nums">{formatRankingValue(metric, e.value)}</span>
                    </li>
                  ))}
                </ol>
              )}
              {optIn && !archived && (
                <button type="button" disabled={busy} onClick={() => void toggleOptIn()} className="mt-3 text-xs font-semibold text-graphite-500 underline disabled:opacity-60">
                  Sair do placar e das metas
                </button>
              )}
            </div>
          )}

          {tab === 'goals' && (
            <div role="tabpanel" aria-label="Metas">
              <p className="text-xs text-graphite-500">Metas coletivas somam quem participa do placar, com no máximo {data.rules.dailyCapHours} h por pessoa por dia.</p>
              {data.goals.length === 0 && <p className="mt-3 rounded-xl bg-surface-card p-3 text-sm text-graphite-500">Nenhuma meta no momento.</p>}
              <ul className="mt-3 space-y-3">
                {data.goals.map((g) => (
                  <li key={g.id} className="rounded-xl border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold">{g.title}</p>
                        <p className="text-xs text-graphite-500">{goalPeriod(g.startDate, g.endDate)} · {GOAL_STATUS_LABEL[g.status]} · {g.contributors} {g.contributors === 1 ? 'pessoa contribuiu' : 'pessoas contribuíram'}</p>
                      </div>
                      {data.canManageGoals && g.status !== 'ENDED' && (
                        <button type="button" aria-label={`Cancelar a meta ${g.title}`} disabled={busy} onClick={() => void act((t) => apiCancelGroupGoal(t, groupId, g.id))} className="rounded-full p-1 text-graphite-400 hover:text-red-700 disabled:opacity-60">
                          <X size={16} />
                        </button>
                      )}
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-line" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={g.percent} aria-label={`Progresso de ${g.title}`}>
                      <div className={`h-full rounded-full ${g.reached ? 'bg-emerald-500' : 'bg-primary'}`} style={{ width: `${g.percent}%` }} />
                    </div>
                    <p className="mt-1 text-xs">
                      {goalProgressText(g)} ({g.percent}%)
                      {g.myContribution !== null && g.myContribution > 0 && <span className="text-graphite-500"> · sua parte: {goalProgressText({ metric: g.metric, value: g.myContribution, target: g.target }).split(' de ')[0]}</span>}
                    </p>
                  </li>
                ))}
              </ul>

              {data.canManageGoals && !creating && (
                <button type="button" onClick={() => setCreating(true)} className="mt-3 rounded-full bg-graphite px-4 py-2 text-sm font-semibold text-white">Nova meta</button>
              )}
              {creating && (
                <form onSubmit={createGoal} className="mt-3 space-y-3 rounded-xl bg-surface-card p-3 text-sm">
                  <div className="flex flex-wrap gap-2">
                    {GOAL_SUGGESTIONS.map((s) => (
                      <button key={s.title} type="button" onClick={() => setDraft({ ...s })} className="rounded-full border bg-white px-3 py-1 text-xs">{s.title}</button>
                    ))}
                  </div>
                  <label className="block">Nome
                    <input name="title" key={`t-${draft.title}`} defaultValue={draft.title} maxLength={80} className="mt-1 w-full rounded-lg border bg-white p-2" />
                  </label>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <label className="block">Tipo
                      <select name="metric" value={draft.metric} onChange={(e) => setDraft({ ...draft, metric: e.target.value as GoalMetric })} className="mt-1 w-full rounded-lg border bg-white p-2">
                        <option value="GROUP_MINUTES">Horas juntos</option>
                        <option value="GROUP_STUDY_DAYS">Dias de estudo somados</option>
                      </select>
                    </label>
                    <label className="block">{draft.metric === 'GROUP_MINUTES' ? 'Horas' : 'Dias'}
                      <input name="target" type="number" min={1} step={draft.metric === 'GROUP_MINUTES' ? 0.5 : 1} key={`a-${draft.title}-${draft.metric}`} defaultValue={draft.amount} className="mt-1 w-full rounded-lg border bg-white p-2" />
                    </label>
                    <label className="block">Duração (dias)
                      <input name="days" type="number" min={1} max={data.rules.goalMaxDays} key={`d-${draft.title}`} defaultValue={draft.days} className="mt-1 w-full rounded-lg border bg-white p-2" />
                    </label>
                  </div>
                  <p className="text-xs text-graphite-500">Começa hoje. Até {data.rules.maxActiveGoals} metas ativas por grupo.</p>
                  <div className="flex gap-2">
                    <button type="submit" disabled={busy} className="rounded-full bg-graphite px-4 py-2 font-semibold text-white disabled:opacity-60">Criar meta</button>
                    <button type="button" onClick={() => setCreating(false)} className="rounded-full border px-4 py-2 font-semibold">Cancelar</button>
                  </div>
                </form>
              )}
            </div>
          )}

          {tab === 'achievements' && (
            <div role="tabpanel" aria-label="Conquistas">
              <p className="text-xs text-graphite-500">Suas conquistas neste grupo. Só você vê.</p>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {data.achievements.map((a) => (
                  <li key={a.code} className={`flex items-start gap-2 rounded-xl border p-3 ${a.earned ? '' : 'opacity-50'}`}>
                    <Award size={18} className={a.earned ? 'text-primary-600' : 'text-graphite-300'} aria-hidden />
                    <span>
                      <span className="block text-sm font-semibold">{a.title}{!a.earned && <span className="sr-only"> (ainda não conquistada)</span>}</span>
                      <span className="block text-xs text-graphite-500">{a.description}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
