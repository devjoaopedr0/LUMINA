import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { io, type Socket } from 'socket.io-client';
import { ArrowLeft, DoorClosed, DoorOpen, LogOut, Pause, Play, Timer } from 'lucide-react';
import { API_URL } from '@/lib/config';
import { getAccessToken } from '@/lib/auth';
import {
  ApiError,
  apiClassRoom,
  apiClassRoomAction,
  apiJoinClassRoom,
  apiOpenClassRoom,
  apiSetClassRoomActivity,
} from '@/lib/api';
import { formatClock, formatRoomDuration, leftMessage, liveSeconds, notifyRoomChanged } from '@/lib/group-rooms';
import type { ClassRoomState } from '@/lib/institution';

const PRESENCE = { STUDYING: ['Estudando', 'bg-emerald-500'], PAUSED: ['Em pausa', 'bg-amber-400'], OFFLINE: ['Sem sinal', 'bg-graphite-300'] } as const;
const errorText = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

/** Tempo real da turma: o servidor só avisa "mudou"; sem socket, consulta a cada 15 s. */
function useClassLive(classId: string | undefined, onChanged: () => void) {
  const cb = useRef(onChanged);
  cb.current = onChanged;
  useEffect(() => {
    if (!classId) return;
    let connected = false;
    let socket: Socket | null = null;
    const poll = setInterval(() => { if (!connected) cb.current(); }, 15_000);
    if (getAccessToken()) {
      socket = io(`${API_URL}/classes`, { auth: (send) => send({ token: getAccessToken() }), transports: ['websocket', 'polling'] });
      socket.on('connect', () => { connected = true; socket?.emit('class:watch', { classId }); cb.current(); });
      socket.on('disconnect', () => { connected = false; });
      socket.on('class-session:changed', (p: { classId?: string }) => { if (p?.classId === classId) cb.current(); });
    }
    return () => { clearInterval(poll); socket?.disconnect(); };
  }, [classId]);
}

/** Sala de estudo da turma (Fase 3, item 47). */
export function ClassRoomPage() {
  const { id: classId } = useParams();
  const [state, setState] = useState<ClassRoomState | null>(null);
  const [receivedAt, setReceivedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const token = () => getAccessToken() ?? '';

  const apply = (next: ClassRoomState) => { setState(next); setReceivedAt(Date.now()); };
  const load = useCallback(async () => {
    if (!classId) return;
    try { apply(await apiClassRoom(token(), classId)); }
    catch (e) { setError(errorText(e, 'Não foi possível carregar a sala.')); }
  }, [classId]);

  useEffect(() => { void load(); }, [load]);
  useClassLive(classId, () => { void load(); });
  useEffect(() => {
    if (!state?.session) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [state?.session]);

  async function run(action: () => Promise<ClassRoomState>, message?: (s: ClassRoomState) => string) {
    setBusy(true); setError(''); setNotice('');
    try {
      const next = await action();
      apply(next);
      if (message) setNotice(message(next));
      notifyRoomChanged();
    } catch (e) { setError(errorText(e, 'Não foi possível concluir agora.')); void load(); }
    finally { setBusy(false); }
  }

  function open(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void run(() => apiOpenClassRoom(token(), classId!, { title: (data.get('title') as string) || null, simulationId: (data.get('activity') as string) || null }));
  }

  function join(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const subjectId = (new FormData(event.currentTarget).get('subjectId') as string) || null;
    void run(() => apiJoinClassRoom(token(), state!.session!.id, subjectId));
  }

  if (!state) {
    return <main className="min-h-screen bg-surface-card px-4 py-8 sm:px-8"><div className="mx-auto max-w-4xl">{error ? <p role="alert">{error}</p> : <p role="status">Carregando sala…</p>}</div></main>;
  }

  const teacher = state.role === 'TEACHER';
  const s = state.session;
  const roomSeconds = s ? liveSeconds(s.durationSeconds, s.presentCount > 0, receivedAt, now) ?? 0 : 0;

  return (
    <main className="min-h-screen bg-surface-card px-4 py-8 text-graphite sm:px-8">
      <div className="mx-auto max-w-4xl">
        <Link to={teacher ? `/app/turmas?id=${state.class.id}` : '/app'} className="inline-flex items-center gap-1 text-sm font-semibold"><ArrowLeft size={15} />{teacher ? 'Turma' : 'Visão geral'}</Link>
        <h1 className="mt-6 flex items-center gap-2 text-3xl font-bold"><Timer size={26} />Sala de estudo · {state.class.name}</h1>
        <p className="mt-1 text-sm text-graphite-500">
          {teacher ? 'Você acompanha em tempo real quem está estudando, há quanto tempo e quem já entregou a atividade.' : 'Estude junto com a turma. Ao sair, seu tempo (sem as pausas) vai para o seu histórico.'}
        </p>
        {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {notice && <p role="status" className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
        {state.elsewhere && <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm">Você está na sala da turma {state.elsewhere.className}. Saia dela para entrar aqui.</p>}

        {!s && (
          <section className="mt-6 rounded-2xl border bg-white p-5">
            <p className="text-sm text-graphite-500">Nenhuma sala aberta agora.</p>
            {teacher && !state.class.archived && (
              <form onSubmit={open} className="mt-4 space-y-3 text-sm">
                <label className="block">Nome da aula <span className="text-graphite-500">(opcional)</span>
                  <input name="title" maxLength={80} placeholder="Ex.: Revisão de funções" className="mt-1 w-full rounded-xl border p-2.5" />
                </label>
                <label className="block">Atividade da sessão <span className="text-graphite-500">(lista ou simulado coletivo, opcional)</span>
                  <select name="activity" defaultValue="" className="mt-1 w-full rounded-xl border bg-white p-2.5">
                    <option value="">Sem atividade</option>
                    {state.activities.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
                  </select>
                </label>
                <button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-full bg-graphite px-4 py-2 font-semibold text-white disabled:opacity-60"><DoorOpen size={15} />Abrir sala e avisar a turma</button>
              </form>
            )}
          </section>
        )}

        {s && (
          <section className="mt-6 rounded-2xl border bg-white p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <p className="text-lg font-semibold">{s.title || `Aula de ${s.openedBy}`}</p>
                <p className="text-xs text-graphite-500">{s.presentCount} de {s.classSize} alunos na sala</p>
              </div>
              <p className="font-mono text-2xl tabular-nums" aria-label="Duração da sala">{formatClock(roomSeconds)}</p>
            </div>

            {s.activity && (
              <div className="mt-3 rounded-xl bg-primary-50 p-3 text-sm">
                Atividade: <Link className="font-semibold underline" to={`/app/simulados?id=${s.activity.id}`}>{s.activity.title}</Link> · {s.activity.questionCount} questões
                {s.activity.submittedCount !== null && <> · {s.activity.submittedCount} de {s.classSize} entregaram</>}
              </div>
            )}
            {teacher && (
              <label className="mt-3 flex items-center gap-2 text-sm">Trocar atividade
                <select value={s.activity?.id ?? ''} disabled={busy} onChange={(e) => void run(() => apiSetClassRoomActivity(token(), s.id, e.target.value || null))} className="rounded-lg border bg-white p-1.5">
                  <option value="">Sem atividade</option>
                  {state.activities.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
                </select>
              </label>
            )}

            <ul className="mt-4 divide-y">
              {s.participants.length === 0 && <li className="py-3 text-sm text-graphite-500">Ninguém entrou ainda.</li>}
              {s.participants.map((p) => {
                const secs = liveSeconds(p.studiedSeconds, p.ticking, receivedAt, now);
                const [label, dot] = PRESENCE[p.presence];
                return (
                  <li key={p.participantId} className="flex items-center gap-3 py-2 text-sm">
                    <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${dot}`} />
                    <span className="min-w-0 flex-1"><span className="font-semibold">{p.name}{p.isMe && ' (você)'}</span><span className="block text-xs text-graphite-500">{label}{p.subject && ` · ${p.subject}`}</span></span>
                    {teacher && s.activity && <span className="text-xs">{p.activity ? `entregou · ${p.activity.correct}/${p.activity.total}` : 'não entregou'}</span>}
                    {secs !== null && <span className="font-mono tabular-nums">{formatClock(secs)}</span>}
                  </li>
                );
              })}
            </ul>

            {teacher && (
              <button type="button" disabled={busy} onClick={() => { if (window.confirm('Encerrar a sala? O tempo de cada aluno vai para o histórico dele.')) void run(() => apiClassRoomAction(token(), s.id, 'close'), () => 'Sala encerrada.'); }} className="mt-4 inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold text-red-700"><DoorClosed size={15} />Encerrar sala</button>
            )}

            {!teacher && !state.mine && !state.elsewhere && (
              <form onSubmit={join} className="mt-4 flex flex-wrap items-end gap-2 text-sm">
                <label className="block">Matéria que vou estudar
                  <select name="subjectId" defaultValue="" className="mt-1 block rounded-xl border bg-white p-2">
                    <option value="">Sem matéria definida</option>
                    {state.subjects.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>
                </label>
                <button type="submit" disabled={busy} className="rounded-full bg-graphite px-4 py-2 font-semibold text-white disabled:opacity-60">Entrar na sala</button>
              </form>
            )}
            {!teacher && state.mine && (
              <div className="mt-4 flex flex-wrap gap-2">
                {state.mine.status === 'STUDYING'
                  ? <button type="button" disabled={busy} onClick={() => void run(() => apiClassRoomAction(token(), s.id, 'pause'))} className="inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-semibold"><Pause size={14} />Pausar</button>
                  : <button type="button" disabled={busy} onClick={() => void run(() => apiClassRoomAction(token(), s.id, 'resume'))} className="inline-flex items-center gap-1.5 rounded-full bg-graphite px-4 py-2 text-sm font-semibold text-white"><Play size={14} />Retomar</button>}
                <button type="button" disabled={busy} onClick={() => void run(() => apiClassRoomAction(token(), s.id, 'leave'), (st) => leftMessage(st.loggedMinutes))} className="inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-semibold text-red-700"><LogOut size={14} />Sair da sala</button>
              </div>
            )}
          </section>
        )}

        {state.history.length > 0 && (
          <section className="mt-6 rounded-2xl border bg-white p-5 text-sm">
            <h2 className="font-semibold">Sessões anteriores</h2>
            <ul className="mt-2 divide-y">
              {state.history.map((h) => (
                <li key={h.id} className="flex flex-wrap justify-between gap-2 py-2">
                  <span>{h.title || 'Sessão'} · {new Date(h.startedAt).toLocaleDateString('pt-BR')}</span>
                  <span className="text-graphite-500">{formatRoomDuration(h.durationSeconds)} · {h.participantCount} alunos{h.averageMinutes !== null && ` · média ${h.averageMinutes} min`}{h.myMinutes !== null && ` · você: ${h.myMinutes} min`}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}
