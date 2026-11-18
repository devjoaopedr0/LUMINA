import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { DoorOpen, History, LogOut, Pause, Play, Timer } from 'lucide-react';
import { getAccessToken } from '@/lib/auth';
import {
  ApiError,
  apiGroupRooms,
  apiJoinGroupRoom,
  apiOpenGroupRoom,
  apiRoomAction,
  apiUpdateRoomParticipation,
} from '@/lib/api';
import { useGroupRoomsLive } from '@/lib/group-room-socket';
import {
  PRESENCE_LABEL,
  formatClock,
  formatRoomDuration,
  leftMessage,
  liveSeconds,
  notifyRoomChanged,
  type GroupRoomsState,
  type OpenRoom,
  type RoomParticipant,
} from '@/lib/group-rooms';
import { initials } from '@/lib/groups';

const DOT: Record<RoomParticipant['presence'], string> = {
  STUDYING: 'bg-emerald-500',
  PAUSED: 'bg-amber-400',
  OFFLINE: 'bg-graphite-300',
};

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

function Avatar({ name, url }: { name: string; url: string | null }) {
  return url
    ? <img src={url} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
    : <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary-100 text-xs font-bold text-primary-700">{initials(name)}</span>;
}

/** Escolha da matéria e do que mostrar; usada ao abrir e ao entrar. */
function JoinFields({ subjects, idPrefix }: { subjects: GroupRoomsState['subjects']; idPrefix: string }) {
  return (
    <>
      <label className="block text-sm font-medium" htmlFor={`${idPrefix}-subject`}>Matéria que você vai estudar</label>
      <select id={`${idPrefix}-subject`} name="subjectId" className="mt-1 w-full rounded-xl border bg-white p-2.5 text-sm" defaultValue="">
        <option value="">Sem matéria definida</option>
        {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      <label className="mt-3 flex items-start gap-2 text-sm">
        <input type="checkbox" name="showDetails" className="mt-0.5 h-4 w-4 accent-graphite" />
        <span>Mostrar minha matéria e meu tempo para a sala <span className="text-graphite-500">(sem isso, os colegas veem só seu nome e se você está estudando)</span></span>
      </label>
    </>
  );
}

function readJoin(form: HTMLFormElement) {
  const data = new FormData(form);
  return {
    subjectId: (data.get('subjectId') as string) || null,
    showDetails: data.get('showDetails') === 'on',
  };
}

/** Sala de estudo do grupo: salas abertas, presença em tempo real e histórico. */
export function GroupRooms({ groupId, archived }: { groupId: string; archived: boolean }) {
  const [state, setState] = useState<GroupRoomsState | null>(null);
  const [receivedAt, setReceivedAt] = useState(() => Date.now());
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [opening, setOpening] = useState(false);
  const [joiningId, setJoiningId] = useState<string | null>(null);

  const apply = useCallback((next: GroupRoomsState) => {
    setState(next);
    setReceivedAt(Date.now());
  }, []);

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) return;
    try {
      apply(await apiGroupRooms(token, groupId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível carregar as salas agora.');
    }
  }, [apply, groupId]);

  useEffect(() => { void load(); }, [load]);
  useGroupRoomsLive(groupId, () => { void load(); });

  const ticking = Boolean(state?.rooms.length);
  const now = useNow(ticking);

  async function run(action: (token: string) => Promise<GroupRoomsState>, message?: (s: GroupRoomsState) => string) {
    const token = getAccessToken();
    if (!token) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const next = await action(token);
      apply(next);
      if (message) setNotice(message(next));
      notifyRoomChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível concluir agora. Tente de novo.');
      void load();
    } finally {
      setBusy(false);
    }
  }

  function openRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const title = (new FormData(form).get('title') as string)?.trim() || null;
    void run((token) => apiOpenGroupRoom(token, groupId, { title, ...readJoin(form) })).then(() => setOpening(false));
  }

  function joinRoom(event: FormEvent<HTMLFormElement>, roomId: string) {
    event.preventDefault();
    const payload = readJoin(event.currentTarget);
    void run((token) => apiJoinGroupRoom(token, roomId, payload)).then(() => setJoiningId(null));
  }

  if (!state) {
    return (
      <section className="rounded-2xl border bg-white p-5">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><Timer size={18} />Sala de estudo</h2>
        {error ? <p role="alert" className="mt-3 text-sm text-red-700">{error}</p> : <p role="status" className="mt-3 text-sm text-graphite-500">Carregando salas…</p>}
      </section>
    );
  }

  const mine = state.mine;
  const elsewhere = mine && mine.groupId !== groupId ? mine : null;
  const canOpen = !archived && !mine && state.rooms.length < state.rules.maxOpenRooms;

  return (
    <section className="rounded-2xl border bg-white p-5" aria-labelledby="group-rooms-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="group-rooms-title" className="flex items-center gap-2 text-lg font-semibold"><Timer size={18} />Sala de estudo</h2>
        {canOpen && !opening && (
          <button type="button" onClick={() => setOpening(true)} className="inline-flex items-center gap-1.5 rounded-full bg-graphite px-4 py-2 text-sm font-semibold text-white">
            <DoorOpen size={15} />Abrir sala
          </button>
        )}
      </div>
      <p className="mt-1 text-sm text-graphite-500">
        Estudem juntos, cada um na sua matéria. Ao sair, o seu tempo (sem as pausas) vai para o seu histórico de estudo.
      </p>

      {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {notice && <p role="status" className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
      {elsewhere && (
        <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          Você está numa sala do grupo <strong>{elsewhere.groupName}</strong>. Para entrar aqui, saia dela antes.{' '}
          {elsewhere.groupId && <Link className="font-semibold underline" to={`/app/grupos/${elsewhere.groupId}`}>Ir para a sala</Link>}
        </p>
      )}
      {archived && <p className="mt-3 text-sm text-graphite-500">Grupo arquivado: as salas ficam fechadas.</p>}

      {opening && (
        <form onSubmit={openRoom} className="mt-4 space-y-3 rounded-xl border bg-surface-card p-4">
          <label className="block text-sm font-medium" htmlFor="room-title">Nome da sala <span className="font-normal text-graphite-500">(opcional)</span></label>
          <input id="room-title" name="title" maxLength={80} placeholder="Ex.: Revisão de exatas" className="w-full rounded-xl border bg-white p-2.5 text-sm" />
          <JoinFields subjects={state.subjects} idPrefix="open" />
          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={busy} className="rounded-full bg-graphite px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">Abrir e entrar</button>
            <button type="button" onClick={() => setOpening(false)} className="rounded-full border px-4 py-2 text-sm font-semibold">Cancelar</button>
          </div>
        </form>
      )}

      {state.rooms.length === 0 && !opening && (
        <p className="mt-4 rounded-xl bg-surface-card p-4 text-sm text-graphite-500">Nenhuma sala aberta agora.{canOpen ? ' Abra uma e chame o grupo.' : ''}</p>
      )}

      <ul className="mt-4 space-y-4">
        {state.rooms.map((room) => (
          <RoomCard
            key={room.id}
            room={room}
            state={state}
            receivedAt={receivedAt}
            now={now}
            busy={busy}
            archived={archived}
            joining={joiningId === room.id}
            onStartJoin={() => setJoiningId(room.id)}
            onCancelJoin={() => setJoiningId(null)}
            onJoin={(e) => joinRoom(e, room.id)}
            run={run}
          />
        ))}
      </ul>

      {state.history.length > 0 && (
        <details className="mt-5">
          <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold"><History size={15} />Salas anteriores</summary>
          <ul className="mt-2 divide-y text-sm">
            {state.history.map((h) => (
              <li key={h.id} className="flex flex-wrap justify-between gap-2 py-2">
                <span>{h.title || 'Sala sem nome'} · {new Date(h.startedAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</span>
                <span className="text-graphite-500">
                  {formatRoomDuration(h.durationSeconds)} · {h.participantCount} {h.participantCount === 1 ? 'pessoa' : 'pessoas'}
                  {h.myStudiedMinutes !== null && <> · você: {h.myStudiedMinutes} min</>}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function RoomCard(props: {
  room: OpenRoom;
  state: GroupRoomsState;
  receivedAt: number;
  now: number;
  busy: boolean;
  archived: boolean;
  joining: boolean;
  onStartJoin: () => void;
  onCancelJoin: () => void;
  onJoin: (event: FormEvent<HTMLFormElement>) => void;
  run: (action: (token: string) => Promise<GroupRoomsState>, message?: (s: GroupRoomsState) => string) => Promise<void>;
}) {
  const { room, state, receivedAt, now, busy, archived, joining, run } = props;
  const mine = state.mine && state.mine.sessionId === room.id ? state.mine : null;
  const roomSeconds = liveSeconds(room.durationSeconds, room.participants.length > 0, receivedAt, now) ?? 0;
  const canJoin = !archived && !state.mine;

  return (
    <li className="rounded-xl border p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="font-semibold">{room.title || `Sala de ${room.openedBy}`}</p>
          <p className="text-xs text-graphite-500">
            Sala aberta há {formatRoomDuration(roomSeconds)} · {room.participants.length} {room.participants.length === 1 ? 'pessoa' : 'pessoas'}
          </p>
        </div>
        <p className="font-mono text-lg tabular-nums" aria-label="Duração da sala">{formatClock(roomSeconds)}</p>
      </div>

      {room.participants.length === 0 && room.closesAt && (
        <p className="mt-2 text-xs text-graphite-500">
          Sala vazia: fecha sozinha às {new Date(room.closesAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} se ninguém entrar.
        </p>
      )}

      <ul className="mt-3 space-y-2">
        {room.participants.map((p) => {
          const seconds = liveSeconds(p.studiedSeconds, p.ticking, receivedAt, now);
          return (
            <li key={p.participantId} className="flex items-center gap-3">
              <Avatar name={p.name} url={p.avatarUrl} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{p.name}{p.isMe && <span className="font-normal text-graphite-500"> (você)</span>}</p>
                <p className="flex items-center gap-1.5 text-xs text-graphite-500">
                  <span aria-hidden className={`h-2 w-2 rounded-full ${DOT[p.presence]}`} />
                  {PRESENCE_LABEL[p.presence]}{p.subject && <> · {p.subject}</>}
                </p>
              </div>
              {seconds !== null && <span className="font-mono text-sm tabular-nums">{formatClock(seconds)}</span>}
            </li>
          );
        })}
      </ul>

      {mine && (
        <div className="mt-4 space-y-3 rounded-xl bg-surface-card p-3">
          <div className="flex flex-wrap gap-2">
            {mine.status === 'STUDYING' ? (
              <button type="button" disabled={busy} onClick={() => run((t) => apiRoomAction(t, room.id, 'pause'))} className="inline-flex items-center gap-1.5 rounded-full border bg-white px-4 py-2 text-sm font-semibold disabled:opacity-60">
                <Pause size={14} />Pausar
              </button>
            ) : (
              <button type="button" disabled={busy} onClick={() => run((t) => apiRoomAction(t, room.id, 'resume'))} className="inline-flex items-center gap-1.5 rounded-full bg-graphite px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
                <Play size={14} />Retomar
              </button>
            )}
            <button type="button" disabled={busy} onClick={() => run((t) => apiRoomAction(t, room.id, 'leave'), (s) => leftMessage(s.loggedMinutes))} className="inline-flex items-center gap-1.5 rounded-full border bg-white px-4 py-2 text-sm font-semibold text-red-700 disabled:opacity-60">
              <LogOut size={14} />Sair da sala
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label className="flex items-center gap-2">
              Matéria:
              <select
                value={mine.subjectId ?? ''}
                disabled={busy}
                onChange={(e) => run((t) => apiUpdateRoomParticipation(t, room.id, { subjectId: e.target.value || null }), () => 'Matéria trocada. O tempo de antes foi para a matéria anterior.')}
                className="rounded-lg border bg-white p-1.5"
              >
                <option value="">Sem matéria definida</option>
                {state.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={mine.showDetails}
                disabled={busy}
                onChange={(e) => run((t) => apiUpdateRoomParticipation(t, room.id, { showDetails: e.target.checked }))}
                className="h-4 w-4 accent-graphite"
              />
              Mostrar minha matéria e meu tempo
            </label>
          </div>
        </div>
      )}

      {!mine && canJoin && !joining && (
        <button type="button" onClick={props.onStartJoin} className="mt-4 rounded-full bg-graphite px-4 py-2 text-sm font-semibold text-white">Entrar na sala</button>
      )}
      {!mine && joining && (
        <form onSubmit={props.onJoin} className="mt-4 space-y-3 rounded-xl bg-surface-card p-3">
          <JoinFields subjects={state.subjects} idPrefix={`join-${room.id}`} />
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="rounded-full bg-graphite px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">Entrar</button>
            <button type="button" onClick={props.onCancelJoin} className="rounded-full border px-4 py-2 text-sm font-semibold">Cancelar</button>
          </div>
        </form>
      )}
    </li>
  );
}
