/**
 * Regras do Lumina Groups que não dependem do banco: papéis, convite
 * assinado, privacidade e estatísticas de estudo lidas do StudyTimeLog.
 * Spec: docs/LUMINA_GROUPS.md (§2 funcionalidades, §4 técnica, §5 menores).
 */
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

export type GroupRole = 'OWNER' | 'ADMIN' | 'MODERATOR' | 'MEMBER';

/** Hierarquia: quem está acima pode agir sobre quem está abaixo. */
export const ROLE_RANK: Record<GroupRole, number> = { OWNER: 3, ADMIN: 2, MODERATOR: 1, MEMBER: 0 };

/** Limites iniciais (§2.1 e §4.4): participação, criação e tamanho. */
export const GROUP_LIMITS = {
  /** Grupos ativos (não arquivados) de que um aluno participa. */
  maxGroupsPerUser: 10,
  /** Grupos criados por um aluno em 24 h (anti-abuso). */
  maxCreatedPerDay: 3,
  defaultMaxMembers: 30,
  minMaxMembers: 2,
  maxMaxMembers: 100,
};

/** Editar o grupo, trocar o código e gerar link: dono e administradores. */
export function canManageGroup(role: GroupRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK.ADMIN;
}

/** Aprovar ou recusar pedidos de entrada: a partir de moderador. */
export function canModerate(role: GroupRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK.MODERATOR;
}

/** Remover alguém: a partir de moderador, e só quem está abaixo do autor. */
export function canRemoveMember(actor: GroupRole, target: GroupRole): boolean {
  return canModerate(actor) && ROLE_RANK[actor] > ROLE_RANK[target];
}

/**
 * Promover ou rebaixar. Ninguém vira dono por aqui (isso é transferência).
 * O dono define administrador, moderador e membro; o administrador, só
 * moderador e membro, e só em quem está abaixo dele.
 */
export function canChangeRole(actor: GroupRole, target: GroupRole, next: GroupRole): boolean {
  if (next === 'OWNER' || target === 'OWNER') return false;
  if (!canManageGroup(actor)) return false;
  return ROLE_RANK[actor] > ROLE_RANK[target] && ROLE_RANK[actor] > ROLE_RANK[next];
}

/** Código de entrada sem caracteres ambíguos (0/O, 1/I/L). */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function generateJoinCode(length = 8): string {
  let code = '';
  for (let i = 0; i < length; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

export function normalizeJoinCode(code: string): string {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Validade do link de convite do grupo. */
export const GROUP_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Link de convite sem tabela, como o da turma: grupo + validade + código
 * atual (trocar o código invalida os links antigos).
 */
function signature(groupId: string, expiresAt: number, joinCode: string, secret: string): string {
  return createHmac('sha256', secret).update(`group-invite:${groupId}:${expiresAt}:${joinCode}`).digest('base64url');
}

export function signGroupInvite(groupId: string, joinCode: string, secret: string, now = Date.now()): { token: string; expiresAt: Date } {
  const expiresAt = now + GROUP_INVITE_TTL_MS;
  const payload = Buffer.from(`${groupId}.${expiresAt}`).toString('base64url');
  return { token: `${payload}.${signature(groupId, expiresAt, joinCode, secret)}`, expiresAt: new Date(expiresAt) };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Lê o grupo do token sem conferir a assinatura (que precisa do código atual). */
export function readGroupInvite(token: string, now = Date.now()): { groupId: string; expiresAt: number; signature: string } | null {
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const [groupId, expiresRaw] = Buffer.from(payload, 'base64url').toString().split('.');
  const expiresAt = Number(expiresRaw);
  if (!groupId || !UUID.test(groupId) || !Number.isFinite(expiresAt) || expiresAt < now) return null;
  return { groupId, expiresAt, signature: sig };
}

export function verifyGroupInvite(token: string, joinCode: string, secret: string, now = Date.now()): string | null {
  const read = readGroupInvite(token, now);
  if (!read) return null;
  const expected = Buffer.from(signature(read.groupId, read.expiresAt, joinCode, secret));
  const given = Buffer.from(read.signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return read.groupId;
}

/** Menor de 18 anos pela data de nascimento (§5). Sem data: tratado como adulto não declarado. */
export function isMinor(birthDate: Date | null | undefined, now = new Date()): boolean {
  if (!birthDate) return false;
  const b = new Date(birthDate);
  let age = now.getUTCFullYear() - b.getUTCFullYear();
  const beforeBirthday = now.getUTCMonth() < b.getUTCMonth() || (now.getUTCMonth() === b.getUTCMonth() && now.getUTCDate() < b.getUTCDate());
  if (beforeBirthday) age--;
  return age < 18;
}

const TIME_ZONE = 'America/Sao_Paulo';
const dayKeyFormat = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
/** Dia (AAAA-MM-DD) no fuso de Brasília, como o resto da plataforma. */
export function dayKey(at: Date): string {
  return dayKeyFormat.format(at);
}

function previousDay(key: string): string {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export interface StudyLogLike {
  endTime: Date;
  durationMinutes: number;
  subjectName?: string | null;
}

export interface MemberStudyStats {
  todayMinutes: number;
  weekMinutes: number;
  totalMinutes: number;
  /** Matérias estudadas nos últimos 7 dias, da mais estudada para a menos. */
  subjects: string[];
  /** Dias seguidos com estudo, terminando hoje ou ontem. */
  streakDays: number;
  lastActivityAt: Date | null;
}

/**
 * Estatísticas de estudo a partir do StudyTimeLog (fonte única do tempo; o
 * grupo só lê). "Semana" = últimos 7 dias, incluindo hoje.
 */
export function studyStats(logs: StudyLogLike[], now = new Date()): MemberStudyStats {
  const today = dayKey(now);
  const weekKeys = new Set<string>();
  let k = today;
  for (let i = 0; i < 7; i++) {
    weekKeys.add(k);
    k = previousDay(k);
  }
  const days = new Set<string>();
  const bySubject = new Map<string, number>();
  let todayMinutes = 0;
  let weekMinutes = 0;
  let totalMinutes = 0;
  let lastActivityAt: Date | null = null;
  for (const log of logs) {
    const minutes = Math.max(0, log.durationMinutes);
    if (minutes === 0) continue;
    const key = dayKey(log.endTime);
    days.add(key);
    totalMinutes += minutes;
    if (key === today) todayMinutes += minutes;
    if (weekKeys.has(key)) {
      weekMinutes += minutes;
      if (log.subjectName) bySubject.set(log.subjectName, (bySubject.get(log.subjectName) ?? 0) + minutes);
    }
    if (!lastActivityAt || log.endTime > lastActivityAt) lastActivityAt = log.endTime;
  }
  let streakDays = 0;
  let cursor = days.has(today) ? today : previousDay(today);
  while (days.has(cursor)) {
    streakDays++;
    cursor = previousDay(cursor);
  }
  const subjects = [...bySubject.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
  return { todayMinutes, weekMinutes, totalMinutes, subjects, streakDays, lastActivityAt };
}

export interface SharePreferences {
  shareStudyTime: boolean;
  shareSubjects: boolean;
  shareStreak: boolean;
  shareLastActivity: boolean;
}

/**
 * O que um colega vê: só o que o próprio aluno ligou neste grupo. Quem olha
 * o próprio perfil vê tudo. Notas, redações e caderno de erros não entram
 * aqui em nenhum caso (§2.2).
 */
export function visibleStats(stats: MemberStudyStats, prefs: SharePreferences, isSelf: boolean) {
  const show = (flag: boolean) => isSelf || flag;
  return {
    todayMinutes: show(prefs.shareStudyTime) ? stats.todayMinutes : null,
    weekMinutes: show(prefs.shareStudyTime) ? stats.weekMinutes : null,
    totalMinutes: show(prefs.shareStudyTime) ? stats.totalMinutes : null,
    subjects: show(prefs.shareSubjects) ? stats.subjects : null,
    streakDays: show(prefs.shareStreak) ? stats.streakDays : null,
    lastActivityAt: show(prefs.shareLastActivity) ? stats.lastActivityAt : null,
  };
}
