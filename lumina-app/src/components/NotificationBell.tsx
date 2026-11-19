import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Bell } from 'lucide-react';
import { getAccessToken } from '@/lib/auth';
import { apiMarkNotificationsRead, apiNotifications, apiUnreadNotifications } from '@/lib/api';
import { badgeCount, timeAgo, type AppNotification } from '@/lib/group-chat';

const POLL_MS = 60_000;

/** Sino de notificações in-app (avisos de grupo, pedidos de entrada, denúncias…). */
export function NotificationBell({ className = '', floating = false }: { className?: string; floating?: boolean }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const box = useRef<HTMLDivElement>(null);

  const refreshCount = useCallback(async () => {
    const token = getAccessToken();
    if (!token) return;
    try {
      setUnread((await apiUnreadNotifications(token)).unread);
    } catch {
      /* sem rede: tenta na próxima volta */
    }
  }, []);

  useEffect(() => {
    void refreshCount();
    const id = setInterval(() => void refreshCount(), POLL_MS);
    return () => clearInterval(id);
  }, [refreshCount]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (!next) return;
    const token = getAccessToken();
    if (!token) return;
    try {
      const data = await apiNotifications(token);
      setItems(data.items);
      setUnread(data.unread);
    } catch {
      setItems([]);
    }
  }

  async function openItem(item: AppNotification) {
    const token = getAccessToken();
    if (token && !item.readAt) {
      try {
        setUnread((await apiMarkNotificationsRead(token, [item.id])).unread);
      } catch { /* segue para o link mesmo assim */ }
    }
    setOpen(false);
    if (item.link?.startsWith('/')) navigate(item.link);
  }

  async function readAll() {
    const token = getAccessToken();
    if (!token) return;
    try {
      setUnread((await apiMarkNotificationsRead(token)).unread);
      setItems((list) => list?.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })) ?? null);
    } catch { /* tenta de novo depois */ }
  }

  const badge = badgeCount(unread);
  return (
    <div ref={box} className={`${floating ? 'fixed right-4 top-4 z-40 rounded-full shadow-sm' : 'relative'} ${className}`}>
      <button
        type="button"
        onClick={() => void toggle()}
        aria-label={badge ? `Notificações: ${unread} não lidas` : 'Notificações'}
        aria-expanded={open}
        className="relative flex h-10 w-10 items-center justify-center rounded-full border border-surface-line bg-white text-graphite-500 transition hover:border-primary hover:text-graphite"
      >
        <Bell className="h-[18px] w-[18px]" />
        {badge && <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-red-600 px-1 text-center text-[10px] font-bold leading-[18px] text-white">{badge}</span>}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border bg-white p-2 shadow-xl">
          <div className="flex items-center justify-between px-2 py-1">
            <p className="text-sm font-semibold">Notificações</p>
            {unread > 0 && <button type="button" onClick={() => void readAll()} className="text-xs font-semibold underline">Marcar todas como lidas</button>}
          </div>
          {!items ? <p className="p-3 text-sm text-graphite-500">Carregando…</p> : items.length === 0 ? (
            <p className="p-3 text-sm text-graphite-500">Nada por aqui ainda.</p>
          ) : (
            <ul className="max-h-96 overflow-y-auto">
              {items.map((n) => (
                <li key={n.id}>
                  <button type="button" onClick={() => void openItem(n)} className={`w-full rounded-xl px-3 py-2 text-left hover:bg-surface-card ${n.readAt ? '' : 'bg-primary-50/60'}`}>
                    <span className="flex items-start gap-2">
                      {!n.readAt && <span aria-label="não lida" className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary-600" />}
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold">{n.title}</span>
                        {n.body && <span className="block truncate text-xs text-graphite-500">{n.body}</span>}
                        <span className="block text-[11px] text-graphite-400">{timeAgo(n.createdAt)}</span>
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Sino nas telas que não têm cabeçalho próprio com ele (o painel e as
 * páginas de grupo já mostram o sino no topo). Fica fixo no canto superior
 * direito, só dentro do app e depois do aceite dos Termos.
 */
export function GlobalNotificationBell() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  if (!user?.termsCurrent || !pathname.startsWith('/app')) return null;
  if (pathname === '/app' || pathname.startsWith('/app/grupos')) return null;
  return <NotificationBell floating />;
}
