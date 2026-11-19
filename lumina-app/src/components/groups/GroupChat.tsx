import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Flag, Megaphone, MessageCircle, MicOff, Send, ShieldAlert, Trash2, X } from 'lucide-react';
import { getAccessToken } from '@/lib/auth';
import {
  ApiError,
  apiAnnounce,
  apiGroupChat,
  apiGroupReports,
  apiHideGroupMessage,
  apiMuteGroupMember,
  apiRemoveAnnouncement,
  apiReportInGroup,
  apiResolveGroupReport,
  apiSendGroupMessage,
} from '@/lib/api';
import { useGroupRoomsLive } from '@/lib/group-room-socket';
import {
  HIDDEN_LABEL,
  MESSAGE_MAX,
  MUTE_LABEL,
  REASON_LABEL,
  draftError,
  formatChatTime,
  type ChatMessage,
  type GroupChat as Chat,
  type GroupReportItem,
  type ReportPayload,
  type ReportReason,
} from '@/lib/group-chat';
import { ROLE_LABEL, initials } from '@/lib/groups';

type ReportTarget = { label: string; payload: Omit<ReportPayload, 'reason' | 'details'> };

const errorText = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);

/** Conversa do grupo: avisos fixados, chat moderado e denúncias (etapa 4). */
export function GroupChat({ groupId }: { groupId: string }) {
  const [chat, setChat] = useState<Chat | null>(null);
  const [older, setOlder] = useState<ChatMessage[]>([]);
  const [olderHasMore, setOlderHasMore] = useState(true);
  const [draft, setDraft] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [reporting, setReporting] = useState<ReportTarget | null>(null);
  const [showReports, setShowReports] = useState(false);
  const [reports, setReports] = useState<GroupReportItem[] | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) return;
    try {
      setChat(await apiGroupChat(token, groupId));
    } catch (err) {
      setError(errorText(err, 'Não foi possível carregar a conversa agora.'));
    }
  }, [groupId]);

  useEffect(() => { void load(); }, [load]);
  useGroupRoomsLive(groupId, () => { void load(); }, 'chat:changed');

  // Desce até a última mensagem quando chega uma nova, se a pessoa já estava no fim.
  useEffect(() => {
    const el = listRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [chat?.messages.length]);

  async function run<T>(action: (token: string) => Promise<T>, fallback: string): Promise<T | null> {
    const token = getAccessToken();
    if (!token) return null;
    setBusy(true);
    setError('');
    try {
      return await action(token);
    } catch (err) {
      setError(errorText(err, fallback));
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    const problem = draftError(draft);
    if (problem) return setError(problem);
    stickToBottom.current = true;
    const ok = await run((t) => apiSendGroupMessage(t, groupId, draft.trim()), 'Não foi possível enviar.');
    if (ok) {
      setDraft('');
      void load();
    }
  }

  async function loadOlder() {
    const first = older[0] ?? chat?.messages[0];
    if (!first) return;
    stickToBottom.current = false;
    const page = await run((t) => apiGroupChat(t, groupId, first.createdAt), 'Não foi possível carregar as anteriores.');
    if (page) {
      setOlder([...page.messages, ...older]);
      setOlderHasMore(page.hasMore);
    }
  }

  async function publish(event: FormEvent) {
    event.preventDefault();
    const next = await run((t) => apiAnnounce(t, groupId, announcement), 'Não foi possível publicar o aviso.');
    if (next) {
      setChat(next);
      setAnnouncement('');
      setNotice('Aviso publicado. Os membros foram notificados.');
    }
  }

  async function openReports() {
    setShowReports(true);
    const list = await run((t) => apiGroupReports(t, groupId), 'Não foi possível carregar as denúncias.');
    if (list) setReports(list);
  }

  if (!chat) {
    return (
      <section className="rounded-2xl border bg-white p-5">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><MessageCircle size={18} />Conversa do grupo</h2>
        {error ? <p role="alert" className="mt-3 text-sm text-red-700">{error}</p> : <p role="status" className="mt-3 text-sm text-graphite-500">Carregando conversa…</p>}
      </section>
    );
  }

  const messages = [...older, ...chat.messages];
  const muted = chat.me.mutedUntil ? new Date(chat.me.mutedUntil) : null;

  return (
    <section className="rounded-2xl border bg-white p-5" aria-labelledby="group-chat-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="group-chat-title" className="flex items-center gap-2 text-lg font-semibold"><MessageCircle size={18} />Conversa do grupo</h2>
        {chat.me.canModerate && (
          <button type="button" onClick={() => void openReports()} className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold">
            <ShieldAlert size={14} />Denúncias{chat.openReports > 0 && <span className="rounded-full bg-red-600 px-1.5 text-white">{chat.openReports}</span>}
          </button>
        )}
      </div>
      <p className="mt-1 text-xs text-graphite-500">
        Seja gentil. Por segurança, telefone, e-mail e contatos de outras redes não são aceitos. Denuncie o que não estiver certo.
      </p>

      {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {notice && <p role="status" className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}

      {chat.announcements.length > 0 && (
        <ul className="mt-3 space-y-2" aria-label="Avisos do grupo">
          {chat.announcements.map((a) => (
            <li key={a.id} className="flex items-start gap-2 rounded-xl bg-primary-50 p-3 text-sm">
              <Megaphone size={16} className="mt-0.5 shrink-0 text-primary-700" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="whitespace-pre-line">{a.body}</p>
                <p className="mt-1 text-xs text-graphite-500">{a.author} · {formatChatTime(a.createdAt)}</p>
              </div>
              {chat.me.canModerate && (
                <button type="button" aria-label="Remover aviso" disabled={busy} onClick={() => void run((t) => apiRemoveAnnouncement(t, groupId, a.id), 'Não foi possível remover.').then((c) => c && setChat(c))} className="rounded-full p-1 text-graphite-400 hover:text-red-700">
                  <X size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {chat.me.canModerate && !chat.archived && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer font-semibold">Publicar aviso</summary>
          <form onSubmit={publish} className="mt-2 space-y-2">
            <textarea value={announcement} onChange={(e) => setAnnouncement(e.target.value)} maxLength={MESSAGE_MAX} rows={2} placeholder="Ex.: Simulado coletivo no sábado às 9h" className="w-full rounded-xl border p-2.5" />
            <button type="submit" disabled={busy || !announcement.trim()} className="rounded-full bg-graphite px-4 py-2 text-xs font-semibold text-white disabled:opacity-60">Publicar e notificar</button>
          </form>
        </details>
      )}

      <div
        ref={listRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
        className="mt-3 max-h-96 space-y-3 overflow-y-auto rounded-xl bg-surface-card p-3"
        aria-live="polite"
      >
        {(older.length === 0 ? chat.hasMore : olderHasMore) && (
          <button type="button" onClick={() => void loadOlder()} className="mx-auto block text-xs font-semibold underline">Ver mensagens anteriores</button>
        )}
        {messages.length === 0 && <p className="py-6 text-center text-sm text-graphite-500">Nenhuma mensagem ainda. Comece a conversa!</p>}
        {messages.map((m) => (
          <MessageRow key={m.id} message={m} busy={busy} muteHours={chat.rules.muteHours}
            onHide={() => void run((t) => apiHideGroupMessage(t, groupId, m.id), 'Não foi possível ocultar.').then(() => load())}
            onReport={() => setReporting({ label: `a mensagem de ${m.author}`, payload: { targetType: 'MESSAGE', messageId: m.id } })}
            onReportMember={() => setReporting({ label: m.author, payload: { targetType: 'MEMBER', targetUserId: m.authorId } })}
            onMute={(hours) => void run((t) => apiMuteGroupMember(t, groupId, m.authorId, hours), 'Não foi possível silenciar.').then((r) => r && setNotice(hours ? `${m.author} ficou silenciado por ${MUTE_LABEL[hours]}.` : `${m.author} pode voltar a escrever.`))}
          />
        ))}
      </div>

      {chat.archived ? (
        <p className="mt-3 text-sm text-graphite-500">Grupo arquivado: a conversa fica só para leitura.</p>
      ) : muted && muted > new Date() ? (
        <p className="mt-3 flex items-center gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900"><MicOff size={16} />Um moderador silenciou você no chat até {muted.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}.</p>
      ) : (
        <form onSubmit={send} className="mt-3 flex items-end gap-2">
          <label htmlFor="chat-draft" className="sr-only">Mensagem</label>
          <textarea
            id="chat-draft"
            value={draft}
            maxLength={MESSAGE_MAX}
            rows={1}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send(e);
              }
            }}
            placeholder="Escreva para o grupo…"
            className="min-h-[44px] flex-1 resize-y rounded-xl border p-2.5 text-sm"
          />
          <button type="submit" aria-label="Enviar" disabled={busy || !draft.trim()} className="grid h-11 w-11 place-items-center rounded-full bg-graphite text-white disabled:opacity-50"><Send size={16} /></button>
        </form>
      )}

      {reporting && (
        <ReportDialog
          target={reporting}
          reasons={chat.rules.reasons}
          busy={busy}
          onCancel={() => setReporting(null)}
          onSubmit={async (reason, details) => {
            const res = await run((t) => apiReportInGroup(t, groupId, { ...reporting.payload, reason, details: details || undefined }), 'Não foi possível enviar a denúncia.');
            if (res) {
              setReporting(null);
              setNotice(res.duplicate ? 'Você já tinha denunciado isso; a moderação vai analisar.' : 'Denúncia enviada. Obrigado por cuidar do grupo; quem denunciou fica anônimo.');
              void load();
            }
          }}
        />
      )}

      {showReports && (
        <div className="mt-4 rounded-xl border p-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Denúncias para analisar</h3>
            <button type="button" aria-label="Fechar denúncias" onClick={() => setShowReports(false)}><X size={16} /></button>
          </div>
          {!reports ? <p className="mt-2 text-sm text-graphite-500">Carregando…</p> : reports.length === 0 ? (
            <p className="mt-2 text-sm text-graphite-500">Nenhuma denúncia aberta.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {reports.map((r) => (
                <li key={r.id} className="rounded-lg bg-surface-card p-3 text-sm">
                  <p className="font-semibold">{REASON_LABEL[r.reason]} · {r.targetType === 'MESSAGE' ? `mensagem de ${r.targetName ?? 'ex-membro'}` : r.targetName}</p>
                  {r.message && <p className="mt-1 whitespace-pre-line rounded bg-white p-2 text-xs">“{r.message.body}”</p>}
                  {r.details && <p className="mt-1 text-xs text-graphite-500">Detalhes: {r.details}</p>}
                  <div className="mt-2 flex gap-2">
                    <button type="button" disabled={busy} onClick={() => void run((t) => apiResolveGroupReport(t, groupId, r.id, 'resolve'), 'Não foi possível tratar.').then((l) => { if (l) { setReports(l); void load(); } })} className="rounded-full bg-graphite px-3 py-1 text-xs font-semibold text-white">Procede{r.targetType === 'MESSAGE' && ' (ocultar)'}</button>
                    <button type="button" disabled={busy} onClick={() => void run((t) => apiResolveGroupReport(t, groupId, r.id, 'dismiss'), 'Não foi possível tratar.').then((l) => { if (l) { setReports(l); void load(); } })} className="rounded-full border px-3 py-1 text-xs font-semibold">Não procede</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function MessageRow(props: {
  message: ChatMessage;
  busy: boolean;
  muteHours: number[];
  onHide: () => void;
  onReport: () => void;
  onReportMember: () => void;
  onMute: (hours: number) => void;
}) {
  const { message: m, busy } = props;
  return (
    <div className={`flex gap-2 ${m.isMine ? 'flex-row-reverse text-right' : ''}`}>
      {m.avatarUrl
        ? <img src={m.avatarUrl} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
        : <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary-100 text-[11px] font-bold text-primary-700">{initials(m.author)}</span>}
      <div className={`min-w-0 max-w-[80%] ${m.isMine ? 'items-end' : ''}`}>
        <p className="text-xs text-graphite-500">
          <span className="font-semibold text-graphite">{m.isMine ? 'Você' : m.author}</span>
          {m.authorRole && m.authorRole !== 'MEMBER' && <span> · {ROLE_LABEL[m.authorRole]}</span>}
          {' · '}{formatChatTime(m.createdAt)}
        </p>
        {m.body === null ? (
          <p className="mt-1 inline-block rounded-xl bg-white/60 px-3 py-2 text-sm italic text-graphite-400">{HIDDEN_LABEL[m.hidden ?? 'moderator']}</p>
        ) : (
          <p className={`mt-1 inline-block whitespace-pre-line break-words rounded-xl px-3 py-2 text-left text-sm ${m.isMine ? 'bg-graphite text-white' : 'bg-white'}`}>{m.body}</p>
        )}
        {(m.canHide || m.canReport || m.canMute) && (
          <div className={`mt-1 flex flex-wrap gap-2 text-[11px] text-graphite-500 ${m.isMine ? 'justify-end' : ''}`}>
            {m.canHide && <button type="button" disabled={busy} onClick={props.onHide} className="inline-flex items-center gap-1 hover:text-red-700"><Trash2 size={11} />{m.isMine ? 'Apagar' : 'Ocultar'}</button>}
            {m.canReport && <button type="button" disabled={busy} onClick={props.onReport} className="inline-flex items-center gap-1 hover:text-red-700"><Flag size={11} />Denunciar</button>}
            {m.canReport && <button type="button" disabled={busy} onClick={props.onReportMember} className="hover:text-red-700">Denunciar pessoa</button>}
            {m.canMute && (
              <label className="inline-flex items-center gap-1">
                <MicOff size={11} aria-hidden />
                <select aria-label={`Silenciar ${m.author}`} disabled={busy} defaultValue="" onChange={(e) => { if (e.target.value !== '') props.onMute(Number(e.target.value)); e.target.value = ''; }} className="bg-transparent">
                  <option value="" disabled>Silenciar…</option>
                  {props.muteHours.map((h) => <option key={h} value={h}>{MUTE_LABEL[h]}</option>)}
                  <option value={0}>Liberar</option>
                </select>
              </label>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ReportDialog(props: {
  target: ReportTarget;
  reasons: ReportReason[];
  busy: boolean;
  onCancel: () => void;
  onSubmit: (reason: ReportReason, details: string) => void;
}) {
  const [reason, setReason] = useState<ReportReason>(props.reasons[0] ?? 'ofensa');
  const [details, setDetails] = useState('');
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="report-title" className="fixed inset-0 z-50 grid place-items-center bg-graphite/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-5">
        <h3 id="report-title" className="font-semibold">Denunciar {props.target.label}</h3>
        <p className="mt-1 text-xs text-graphite-500">Sua identidade não é mostrada à moderação nem à pessoa denunciada.</p>
        <fieldset className="mt-3 space-y-1.5 text-sm">
          <legend className="sr-only">Motivo</legend>
          {props.reasons.map((r) => (
            <label key={r} className="flex items-center gap-2">
              <input type="radio" name="reason" value={r} checked={reason === r} onChange={() => setReason(r)} className="accent-graphite" />
              {REASON_LABEL[r]}
            </label>
          ))}
        </fieldset>
        <label className="mt-3 block text-sm">Detalhes <span className="text-graphite-500">(opcional)</span>
          <textarea value={details} onChange={(e) => setDetails(e.target.value)} maxLength={500} rows={2} className="mt-1 w-full rounded-xl border p-2" />
        </label>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={props.onCancel} className="rounded-full border px-4 py-2 text-sm font-semibold">Cancelar</button>
          <button type="button" disabled={props.busy} onClick={() => props.onSubmit(reason, details.trim())} className="rounded-full bg-red-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">Enviar denúncia</button>
        </div>
      </div>
    </div>
  );
}
