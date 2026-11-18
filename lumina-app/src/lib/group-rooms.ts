/** Salas coletivas do Lumina Groups (etapa 2): tipos da API e regras de tela. */

export type RoomPresence = 'STUDYING' | 'PAUSED' | 'OFFLINE';

export interface RoomParticipant {
  participantId: string;
  userId: string;
  name: string;
  avatarUrl: string | null;
  presence: RoomPresence;
  isMe: boolean;
  /** null = a pessoa não mostra a matéria para a sala. */
  subject: string | null;
  /** null = a pessoa não mostra o tempo para a sala. */
  studiedSeconds: number | null;
  ticking: boolean;
}

export interface OpenRoom {
  id: string;
  title: string | null;
  openedBy: string;
  startedAt: string;
  durationSeconds: number;
  closesAt: string | null;
  iAmHere: boolean;
  participants: RoomParticipant[];
}

export interface RoomHistoryItem {
  id: string;
  title: string | null;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number;
  participantCount: number;
  myStudiedMinutes: number | null;
}

export interface MyRoomParticipation {
  participantId: string;
  sessionId: string;
  roomTitle: string | null;
  groupId: string | null;
  groupName: string | null;
  status: 'STUDYING' | 'PAUSED';
  subjectId: string | null;
  subject: string | null;
  showDetails: boolean;
  studiedSeconds: number;
  ticking: boolean;
}

export interface GroupRoomsState {
  serverTime: string;
  rules: { heartbeatSeconds: number; offlineAfterSeconds: number; closeEmptyAfterMinutes: number; maxOpenRooms: number };
  subjects: { id: string; name: string }[];
  mine: MyRoomParticipation | null;
  rooms: OpenRoom[];
  history: RoomHistoryItem[];
  /** Só na resposta de "sair": minutos que foram para o histórico pessoal. */
  loggedMinutes?: number;
}

export interface JoinRoomPayload {
  subjectId?: string | null;
  showDetails?: boolean;
}

/** Segundos "agora", andando a partir do instante em que o servidor mediu.
 * Usa o relógio do aparelho só para o intervalo decorrido, não para a hora. */
export function liveSeconds(base: number | null, ticking: boolean, receivedAtMs: number, nowMs: number): number | null {
  if (base === null) return null;
  if (!ticking) return base;
  return base + Math.max(0, Math.floor((nowMs - receivedAtMs) / 1000));
}

/** 0:42, 12:05, 1:03:09. */
export function formatClock(totalSeconds: number | null): string {
  if (totalSeconds === null) return '—';
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

/** "45 min", "1 h 20 min". */
export function formatRoomDuration(totalSeconds: number): string {
  const minutes = Math.floor(Math.max(0, totalSeconds) / 60);
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export const PRESENCE_LABEL: Record<RoomPresence, string> = {
  STUDYING: 'Estudando',
  PAUSED: 'Em pausa',
  OFFLINE: 'Sem sinal',
};

/** Mensagem depois de sair da sala. */
export function leftMessage(loggedMinutes: number | undefined): string {
  if (!loggedMinutes) return 'Você saiu da sala. Menos de 1 minuto não entra no histórico.';
  return `Você saiu da sala. ${loggedMinutes} min foram para o seu histórico de estudo.`;
}

/** Evento que avisa a barra global de que a minha passagem mudou. */
export const ROOM_CHANGED_EVENT = 'lumina:room-changed';
export function notifyRoomChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(ROOM_CHANGED_EVENT));
}
