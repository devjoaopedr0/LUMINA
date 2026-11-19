import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Pause, Play, Users } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { getAccessToken } from '@/lib/auth';
import { ApiError, apiClassRoomHeartbeat, apiMyClassRoom, apiMyRoom, apiRoomAction, apiRoomHeartbeat } from '@/lib/api';
import { ROOM_CHANGED_EVENT, formatClock, liveSeconds, notifyRoomChanged, type MyRoomParticipation } from '@/lib/group-rooms';

const HEARTBEAT_MS = 30_000;
const RECHECK_MS = 60_000;

/**
 * Presença na sala do grupo enquanto o aluno usa o resto do app: manda o
 * sinal de vida a cada 30 s (único lugar que faz isso) e mostra o cronômetro
 * com atalho para a sala. Sem sinal por 90 s — aba fechada, sem internet —
 * o servidor encerra a passagem no último sinal, sem inflar horas.
 */
export function RoomPresenceBar() {
  const { user } = useAuth();
  const location = useLocation();
  const [mine, setMine] = useState<MyRoomParticipation | null>(null);
  const [receivedAt, setReceivedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [message, setMessage] = useState('');
  const enabled = Boolean(user?.termsCurrent);

  const refresh = useCallback(async () => {
    const token = getAccessToken();
    if (!token || !enabled) return;
    try {
      const { mine: next } = await apiMyRoom(token);
      setMine(next);
      setReceivedAt(Date.now());
    } catch {
      // Sem rede: tenta de novo na próxima volta.
    }
  }, [enabled]);

  useEffect(() => {
    void refresh();
    const onChange = () => void refresh();
    window.addEventListener(ROOM_CHANGED_EVENT, onChange);
    const id = setInterval(onChange, RECHECK_MS);
    return () => {
      window.removeEventListener(ROOM_CHANGED_EVENT, onChange);
      clearInterval(id);
    };
  }, [refresh]);

  const sessionId = mine?.sessionId;
  useEffect(() => {
    if (!sessionId) return;
    const beat = async () => {
      const token = getAccessToken();
      if (!token) return;
      try {
        await apiRoomHeartbeat(token, sessionId);
      } catch (err) {
        if (err instanceof ApiError && (err.status === 409 || err.status === 404)) {
          setMessage(err.message);
          setMine(null);
          notifyRoomChanged();
        }
      }
    };
    void beat();
    const id = setInterval(beat, HEARTBEAT_MS);
    return () => clearInterval(id);
  }, [sessionId]);

  useEffect(() => {
    if (!mine?.ticking) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [mine?.ticking]);

  async function toggle() {
    const token = getAccessToken();
    if (!token || !mine) return;
    try {
      await apiRoomAction(token, mine.sessionId, mine.status === 'STUDYING' ? 'pause' : 'resume');
      notifyRoomChanged();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : 'Não foi possível agora.');
    }
  }

  if (!enabled || !location.pathname.startsWith('/app')) return null;

  if (!mine) {
    return message ? (
      <div role="status" className="fixed bottom-4 left-4 z-40 max-w-sm rounded-2xl border bg-white p-3 text-sm shadow-lg">
        {message}
        <button type="button" onClick={() => setMessage('')} className="ml-2 font-semibold underline">OK</button>
      </div>
    ) : null;
  }

  // Na própria página do grupo a sala já aparece inteira.
  if (mine.groupId && location.pathname === `/app/grupos/${mine.groupId}`) return null;

  const seconds = liveSeconds(mine.studiedSeconds, mine.ticking, receivedAt, now);
  return (
    <div className="fixed bottom-4 left-4 z-40 flex items-center gap-3 rounded-full border bg-white py-2 pl-3 pr-2 text-sm shadow-lg">
      <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${mine.status === 'STUDYING' ? 'bg-emerald-500' : 'bg-amber-400'}`} />
      <Link to={mine.groupId ? `/app/grupos/${mine.groupId}` : '/app/grupos'} className="flex items-center gap-2 font-semibold">
        <Users size={14} />
        <span className="max-w-[10rem] truncate">{mine.roomTitle || mine.groupName || 'Sala do grupo'}</span>
        {mine.subject && <span className="hidden font-normal text-graphite-500 sm:inline">· {mine.subject}</span>}
      </Link>
      <span className="font-mono tabular-nums" aria-label="Seu tempo na sala">{formatClock(seconds)}</span>
      <button
        type="button"
        onClick={() => void toggle()}
        aria-label={mine.status === 'STUDYING' ? 'Pausar' : 'Retomar'}
        className="grid h-8 w-8 place-items-center rounded-full bg-graphite text-white"
      >
        {mine.status === 'STUDYING' ? <Pause size={14} /> : <Play size={14} />}
      </button>
    </div>
  );
}

/**
 * Mesma presença para a sala da turma (item 47): sinal a cada 30 s em qualquer
 * tela, para o aluno abrir a atividade sem perder a presença. Um aluno só fica
 * numa sala por vez (turma ou grupo), então as duas barras nunca aparecem juntas.
 */
export function ClassPresenceBar() {
  const { user } = useAuth();
  const location = useLocation();
  const [mine, setMine] = useState<Awaited<ReturnType<typeof apiMyClassRoom>>['mine']>(null);
  const [receivedAt, setReceivedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const enabled = Boolean(user?.termsCurrent);

  const refresh = useCallback(async () => {
    const token = getAccessToken();
    if (!token || !enabled) return;
    try {
      setMine((await apiMyClassRoom(token)).mine);
      setReceivedAt(Date.now());
    } catch { /* sem rede: tenta de novo depois */ }
  }, [enabled]);

  useEffect(() => {
    void refresh();
    const onChange = () => void refresh();
    window.addEventListener(ROOM_CHANGED_EVENT, onChange);
    const id = setInterval(onChange, RECHECK_MS);
    return () => { window.removeEventListener(ROOM_CHANGED_EVENT, onChange); clearInterval(id); };
  }, [refresh]);

  const sessionId = mine?.sessionId;
  useEffect(() => {
    if (!sessionId) return;
    const beat = async () => {
      const token = getAccessToken();
      if (!token) return;
      try { await apiClassRoomHeartbeat(token, sessionId); }
      catch (err) { if (err instanceof ApiError && (err.status === 409 || err.status === 404)) { setMine(null); notifyRoomChanged(); } }
    };
    void beat();
    const id = setInterval(beat, HEARTBEAT_MS);
    return () => clearInterval(id);
  }, [sessionId]);

  useEffect(() => {
    if (!mine?.ticking) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [mine?.ticking]);

  if (!enabled || !mine || !location.pathname.startsWith('/app')) return null;
  if (location.pathname === `/app/turmas/${mine.classId}/sala`) return null;
  const seconds = liveSeconds(mine.studiedSeconds, mine.ticking, receivedAt, now);
  return (
    <div className="fixed bottom-4 left-4 z-40 flex items-center gap-3 rounded-full border bg-white py-2 pl-3 pr-4 text-sm shadow-lg">
      <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${mine.status === 'STUDYING' ? 'bg-emerald-500' : 'bg-amber-400'}`} />
      <Link to={`/app/turmas/${mine.classId}/sala`} className="flex items-center gap-2 font-semibold">
        <Users size={14} />
        <span className="max-w-[10rem] truncate">{mine.roomTitle || `Sala da turma ${mine.className}`}</span>
      </Link>
      <span className="font-mono tabular-nums" aria-label="Seu tempo na sala da turma">{formatClock(seconds)}</span>
    </div>
  );
}
