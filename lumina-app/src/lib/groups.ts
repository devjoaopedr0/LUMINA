/** Lumina Groups: tipos e regras da tela, sem React (os checks carregam direto).
 *  Espelha o backend em lumina-backend/src/groups (docs/LUMINA_GROUPS.md). */

export type GroupRole = 'OWNER' | 'ADMIN' | 'MODERATOR' | 'MEMBER';
export type GroupMemberStatus = 'ACTIVE' | 'PENDING';

export interface GroupSummary {
  id: string;
  name: string;
  purpose: string | null;
  imageUrl: string | null;
  archived: boolean;
  memberCount: number;
  maxMembers: number;
  myRole: GroupRole;
  myStatus: GroupMemberStatus;
}

export interface GroupSharing {
  shareStudyTime: boolean;
  shareSubjects: boolean;
  shareStreak: boolean;
  shareLastActivity: boolean;
  /** Participar do placar e das metas do grupo (desligado por padrão). */
  rankingOptIn: boolean;
}

export interface GroupMemberStats {
  todayMinutes: number | null;
  weekMinutes: number | null;
  totalMinutes: number | null;
  subjects: string[] | null;
  streakDays: number | null;
  lastActivityAt: string | null;
}

export interface GroupMember {
  userId: string;
  name: string;
  avatarUrl: string | null;
  role: GroupRole;
  joinedAt: string;
  isMe: boolean;
  stats: GroupMemberStats;
}

export interface GroupDetail {
  id: string;
  name: string;
  description: string | null;
  purpose: string | null;
  imageUrl: string | null;
  rules: string | null;
  archived: boolean;
  requiresApproval: boolean;
  maxMembers: number;
  createdAt: string;
  joinCode: string | null;
  myRole: GroupRole;
  canManage: boolean;
  canModerate: boolean;
  mySharing: GroupSharing;
  iAmMinor: boolean;
  members: GroupMember[];
  pendingRequests: { userId: string; name: string; avatarUrl: string | null; requestedAt: string }[];
}

export interface GroupPreview {
  id: string;
  name: string;
  purpose: string | null;
  description: string | null;
  imageUrl: string | null;
  memberCount: number;
  maxMembers: number;
  requiresApproval: boolean;
  full: boolean;
}

export interface GroupPayload {
  name: string;
  description?: string | null;
  purpose?: string | null;
  imageUrl?: string | null;
  rules?: string | null;
  requiresApproval?: boolean;
  maxMembers?: number;
}

export const ROLE_LABEL: Record<GroupRole, string> = {
  OWNER: 'Dono',
  ADMIN: 'Administrador',
  MODERATOR: 'Moderador',
  MEMBER: 'Membro',
};

const ROLE_RANK: Record<GroupRole, number> = { OWNER: 3, ADMIN: 2, MODERATOR: 1, MEMBER: 0 };

/** Papéis que quem está logado pode dar a um membro (mesma regra do backend). */
export function assignableRoles(actor: GroupRole, target: GroupRole): Exclude<GroupRole, 'OWNER'>[] {
  if (target === 'OWNER' || ROLE_RANK[actor] < ROLE_RANK.ADMIN || ROLE_RANK[actor] <= ROLE_RANK[target]) return [];
  return (['ADMIN', 'MODERATOR', 'MEMBER'] as const).filter((role) => ROLE_RANK[role] < ROLE_RANK[actor]);
}

export function canRemove(actor: GroupRole, target: GroupRole): boolean {
  return ROLE_RANK[actor] >= ROLE_RANK.MODERATOR && ROLE_RANK[actor] > ROLE_RANK[target];
}

/** O que o aluno pode ligar em cada grupo, na ordem da tela. */
export const SHARING_OPTIONS: Array<{ key: keyof GroupSharing; label: string; hint: string }> = [
  { key: 'shareStudyTime', label: 'Tempo de estudo', hint: 'Hoje, nos últimos 7 dias e no total.' },
  { key: 'shareSubjects', label: 'Matérias', hint: 'O que você estudou nos últimos 7 dias.' },
  { key: 'shareStreak', label: 'Sequência de dias', hint: 'Quantos dias seguidos você estudou.' },
  { key: 'shareLastActivity', label: 'Última atividade', hint: 'Quando você estudou pela última vez.' },
  { key: 'rankingOptIn', label: 'Placar e metas do grupo', hint: 'Seu ritmo aparece no placar e conta nas metas coletivas. Dá para sair quando quiser.' },
];

export function formatStudyMinutes(minutes: number | null): string {
  if (minutes === null) return '—';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}min` : `${hours}h`;
}

/** "hoje", "ontem" ou a data, no fuso do aparelho. */
export function formatLastActivity(iso: string | null, now = new Date()): string {
  if (!iso) return '—';
  const date = new Date(iso);
  const key = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  if (key(date) === key(now)) return 'hoje';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (key(date) === key(yesterday)) return 'ontem';
  return date.toLocaleDateString('pt-BR');
}

/** Membro que não compartilha nada: a tela mostra só nome e foto. */
export function sharesNothing(stats: GroupMemberStats): boolean {
  return Object.values(stats).every((value) => value === null);
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
}

/** Link de convite que abre a tela de entrada do app. */
export function groupInviteUrl(origin: string, token: string): string {
  return `${origin}/app/grupos/entrar?convite=${encodeURIComponent(token)}`;
}

/** Monta o corpo do formulário: campos vazios viram null; limite só se for número válido. */
export function groupPayloadFromForm(data: { get(name: string): FormDataEntryValue | null }): GroupPayload {
  const text = (name: string) => {
    const value = String(data.get(name) ?? '').trim();
    return value.length ? value : null;
  };
  const max = Number(data.get('maxMembers'));
  return {
    name: String(data.get('name') ?? '').trim(),
    description: text('description'),
    purpose: text('purpose'),
    rules: text('rules'),
    requiresApproval: data.get('requiresApproval') === 'on',
    ...(Number.isInteger(max) && max >= 2 ? { maxMembers: max } : {}),
  };
}
