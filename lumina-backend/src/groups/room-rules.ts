/**
 * Regras das salas coletivas do Lumina Groups (etapa 2, docs/LUMINA_GROUPS.md
 * §2.3, §2.4 e §4.3). Funções puras, sem banco, para os testes cobrirem cada
 * caso de tempo e presença.
 *
 * Três tempos diferentes:
 *  1. duração da sala: do primeiro que entrou ao último que saiu;
 *  2. tempo individual na sala: o que cada um estudou, sem as pausas;
 *  3. tempo no histórico pessoal: a soma dos StudyTimeLog do aluno — a sala
 *     só gera um log com o tempo (2) quando o aluno sai.
 */

export const ROOM_RULES = {
  /** O app manda sinal de vida a cada 30 s. */
  heartbeatSeconds: 30,
  /** Sem sinal por 90 s, o aluno aparece offline e a passagem dele fecha. */
  offlineAfterSeconds: 90,
  /** Sala vazia por 30 min fecha sozinha. */
  closeEmptyAfterMinutes: 30,
  /** Salas abertas ao mesmo tempo num grupo. */
  maxOpenRoomsPerGroup: 5,
  /** Passagem mais longa que isso é cortada (proteção contra aba esquecida). */
  maxParticipationHours: 8,
  /** Menos que 1 minuto não vira StudyTimeLog. */
  minLoggedMinutes: 1,
} as const;

export type ParticipantStatus = 'STUDYING' | 'PAUSED' | 'LEFT';

export interface ParticipantClock {
  status: ParticipantStatus;
  joinedAt: Date;
  lastHeartbeatAt: Date;
  activeSince: Date | null;
  accumulatedSeconds: number;
}

const seconds = (ms: number) => Math.max(0, Math.floor(ms / 1000));

/** Sem sinal há mais de 90 s. */
export function isStale(p: Pick<ParticipantClock, 'lastHeartbeatAt'>, now: Date): boolean {
  return now.getTime() - p.lastHeartbeatAt.getTime() > ROOM_RULES.offlineAfterSeconds * 1000;
}

/** Até onde o tempo do aluno pode contar: agora, ou o último sinal se ele
 * sumiu, nunca além do limite de horas da passagem. */
export function creditableUntil(p: ParticipantClock, now: Date): Date {
  const cap = p.joinedAt.getTime() + ROOM_RULES.maxParticipationHours * 3600_000;
  const end = isStale(p, now) ? p.lastHeartbeatAt.getTime() : now.getTime();
  return new Date(Math.min(end, cap));
}

/** Tempo individual estudado na passagem (sem pausas), em segundos. */
export function studiedSeconds(p: ParticipantClock, now: Date): number {
  if (p.status !== 'STUDYING' || !p.activeSince) return p.accumulatedSeconds;
  const until = creditableUntil(p, now).getTime();
  return p.accumulatedSeconds + seconds(until - p.activeSince.getTime());
}

/** Pausar: fecha o trecho atual e soma ao acumulado. */
export function pause(p: ParticipantClock, now: Date): Pick<ParticipantClock, 'status' | 'activeSince' | 'accumulatedSeconds' | 'lastHeartbeatAt'> {
  return { status: 'PAUSED', activeSince: null, accumulatedSeconds: studiedSeconds(p, now), lastHeartbeatAt: now };
}

/** Retomar: abre um trecho novo a partir de agora. */
export function resume(now: Date): Pick<ParticipantClock, 'status' | 'activeSince' | 'lastHeartbeatAt'> {
  return { status: 'STUDYING', activeSince: now, lastHeartbeatAt: now };
}

/** Sair (ou fechar por falta de sinal): tempo final, quando saiu e quanto vai
 * para o histórico pessoal. Quem sumiu sai no último sinal, não agora. */
export function leave(p: ParticipantClock, now: Date): {
  accumulatedSeconds: number;
  leftAt: Date;
  loggedMinutes: number;
} {
  const total = studiedSeconds(p, now);
  const leftAt = creditableUntil(p, now);
  const minutes = Math.floor(total / 60);
  return { accumulatedSeconds: total, leftAt, loggedMinutes: minutes >= ROOM_RULES.minLoggedMinutes ? minutes : 0 };
}

/** Presença para a tela. */
export type Presence = 'STUDYING' | 'PAUSED' | 'OFFLINE';
export function presence(p: ParticipantClock, now: Date): Presence {
  if (isStale(p, now)) return 'OFFLINE';
  return p.status === 'PAUSED' ? 'PAUSED' : 'STUDYING';
}

/** Sala vazia há tempo suficiente para fechar. */
export function shouldCloseRoom(room: { lastActivityAt: Date }, activeParticipants: number, now: Date): boolean {
  if (activeParticipants > 0) return false;
  return now.getTime() - room.lastActivityAt.getTime() >= ROOM_RULES.closeEmptyAfterMinutes * 60_000;
}

/** Duração da sala (tempo 1): do início até o fim, ou até agora se aberta. */
export function roomDurationSeconds(room: { startedAt: Date; endedAt: Date | null }, now: Date): number {
  return seconds((room.endedAt ?? now).getTime() - room.startedAt.getTime());
}

/** O que um colega vê de outro na sala. Sem `showDetails` (padrão), só nome,
 * foto e status — regra de §5 para menores, aplicada a todos. */
export function visibleParticipant<T extends { subject: string | null; studiedSeconds: number }>(
  data: T,
  showDetails: boolean,
  isSelf: boolean,
): Omit<T, 'subject' | 'studiedSeconds'> & { subject: string | null; studiedSeconds: number | null } {
  if (isSelf || showDetails) return data;
  return { ...data, subject: null, studiedSeconds: null };
}
