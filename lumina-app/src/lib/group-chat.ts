/** Comunicação do Lumina Groups (etapa 4): chat, avisos, denúncias e notificações. */
import type { GroupRole } from '@/lib/groups';

export interface ChatMessage {
  id: string;
  authorId: string;
  author: string;
  avatarUrl: string | null;
  authorRole: GroupRole | null;
  isMine: boolean;
  createdAt: string;
  /** null quando a mensagem foi ocultada. */
  body: string | null;
  hidden: 'author' | 'moderator' | 'reports' | null;
  canHide: boolean;
  canReport: boolean;
  canMute: boolean;
}

export interface Announcement {
  id: string;
  body: string;
  createdAt: string;
  author: string;
}

export type ReportReason = 'ofensa' | 'assedio' | 'spam' | 'conteudo_improprio' | 'dados_pessoais' | 'outro';

export interface GroupChat {
  serverTime: string;
  archived: boolean;
  me: { canModerate: boolean; mutedUntil: string | null };
  rules: { muteHours: number[]; reasons: ReportReason[] };
  openReports: number;
  announcements: Announcement[];
  hasMore: boolean;
  messages: ChatMessage[];
}

export interface GroupReportItem {
  id: string;
  targetType: 'MESSAGE' | 'MEMBER';
  reason: ReportReason;
  details: string | null;
  createdAt: string;
  targetUserId: string | null;
  targetName: string | null;
  message: { id: string; body: string; hidden: string | null; createdAt: string } | null;
}

export interface AdminGroupReport {
  id: string;
  groupId: string;
  groupName: string;
  targetType: 'MESSAGE' | 'MEMBER' | 'GROUP';
  reason: ReportReason;
  details: string | null;
  createdAt: string;
  targetName: string | null;
  messageBody: string | null;
}

export interface ReportPayload {
  targetType: 'MESSAGE' | 'MEMBER' | 'GROUP';
  messageId?: string;
  targetUserId?: string;
  reason: ReportReason;
  details?: string;
}

export interface AppNotification {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export const REASON_LABEL: Record<ReportReason, string> = {
  ofensa: 'Ofensa ou xingamento',
  assedio: 'Assédio ou intimidação',
  spam: 'Spam ou propaganda',
  conteudo_improprio: 'Conteúdo impróprio',
  dados_pessoais: 'Pedido ou exposição de dados pessoais',
  outro: 'Outro motivo',
};

export const HIDDEN_LABEL: Record<NonNullable<ChatMessage['hidden']>, string> = {
  author: 'Mensagem apagada pelo autor.',
  moderator: 'Mensagem ocultada pela moderação.',
  reports: 'Mensagem ocultada após denúncias, aguardando a moderação.',
};

export const MUTE_LABEL: Record<number, string> = { 1: '1 hora', 24: '24 horas', 168: '7 dias' };

export const MESSAGE_MAX = 1000;

/** "14:05" hoje, "ontem 14:05", "12/11 14:05" (fuso do aparelho). */
export function formatChatTime(iso: string, now = new Date()): string {
  const at = new Date(iso);
  const time = at.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(at, now)) return time;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(at, yesterday)) return `ontem ${time}`;
  return `${String(at.getDate()).padStart(2, '0')}/${String(at.getMonth() + 1).padStart(2, '0')} ${time}`;
}

/** "agora", "há 5 min", "há 3 h", "há 2 dias". */
export function timeAgo(iso: string, now = new Date()): string {
  const minutes = Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'há 1 dia' : `há ${days} dias`;
}

/** Contador do sino: "9+" a partir de 10. */
export function badgeCount(n: number): string | null {
  if (n <= 0) return null;
  return n > 9 ? '9+' : String(n);
}

/** Validação no aparelho só do que é óbvio; o filtro de verdade fica no servidor. */
export function draftError(text: string): string | null {
  const body = text.trim();
  if (!body) return 'Escreva uma mensagem.';
  if (body.length > MESSAGE_MAX) return `Até ${MESSAGE_MAX} caracteres.`;
  return null;
}
