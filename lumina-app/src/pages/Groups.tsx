import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Archive, ArrowLeft, Check, Copy, Crown, Flame, Link2, LogOut, Plus, RefreshCw, Shield, Trash2, UserMinus, Users, X } from 'lucide-react';
import { getAccessToken } from '@/lib/auth';
import { GroupRooms } from '@/components/groups/GroupRooms';
import { GroupEngagement } from '@/components/groups/GroupEngagement';
import {
  ApiError,
  apiArchiveGroup,
  apiChangeGroupRole,
  apiCreateGroup,
  apiDecideGroupRequest,
  apiDeleteGroup,
  apiGroup,
  apiGroupInviteLink,
  apiGroupPreview,
  apiGroups,
  apiJoinGroup,
  apiLeaveGroup,
  apiRegenerateGroupCode,
  apiRemoveGroupMember,
  apiTransferGroup,
  apiUpdateGroup,
  apiUpdateGroupSharing,
} from '@/lib/api';
import {
  assignableRoles,
  canRemove,
  formatLastActivity,
  formatStudyMinutes,
  groupInviteUrl,
  groupPayloadFromForm,
  initials,
  ROLE_LABEL,
  sharesNothing,
  SHARING_OPTIONS,
  type GroupDetail,
  type GroupMember,
  type GroupPreview,
  type GroupSummary,
} from '@/lib/groups';

const token = () => getAccessToken() ?? '';
const field = 'mt-1 w-full rounded-xl border border-surface-line bg-white px-3 py-2.5 text-sm outline-none focus:border-primary-600 focus:ring-2 focus:ring-primary/30';
const errorText = (e: unknown, fallback: string) => (e instanceof ApiError || e instanceof Error ? e.message : fallback);

function Shell({ children, back }: { children: React.ReactNode; back?: { to: string; label: string } }) {
  return (
    <main className="min-h-screen bg-surface-card px-4 py-8 text-graphite sm:px-8">
      <div className="mx-auto max-w-5xl">
        <Link to={back?.to ?? '/app'} className="inline-flex items-center gap-1 text-sm font-semibold"><ArrowLeft size={15} />{back?.label ?? 'Voltar à visão geral'}</Link>
        {children}
      </div>
    </main>
  );
}

function Avatar({ name, url, size = 'h-10 w-10' }: { name: string; url: string | null; size?: string }) {
  return url
    ? <img src={url} alt="" className={`${size} shrink-0 rounded-full object-cover`} />
    : <span aria-hidden className={`${size} grid shrink-0 place-items-center rounded-full bg-primary-100 text-sm font-bold text-primary-700`}>{initials(name)}</span>;
}

function Alert({ text }: { text: string }) {
  return text ? <p role="alert" className="my-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{text}</p> : null;
}

/** Rotas: /app/grupos (lista), /app/grupos/entrar (convite) e /app/grupos/:id (detalhe). */
export function Groups() {
  const { id } = useParams();
  if (id === 'entrar') return <JoinGroup />;
  if (id) return <GroupView id={id} />;
  return <GroupList />;
}

// ------------------------------------------------------------------ lista

function GroupList() {
  const navigate = useNavigate();
  const [groups, setGroups] = useState<GroupSummary[] | null>(null);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    apiGroups(token()).then((rows) => { if (active) setGroups(rows); }).catch((e) => { if (active) { setGroups([]); setError(errorText(e, 'Não foi possível carregar seus grupos.')); } });
    return () => { active = false; };
  }, []);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      const group = await apiCreateGroup(token(), groupPayloadFromForm(new FormData(event.currentTarget)));
      navigate(`/app/grupos/${group.id}`);
    } catch (e) { setError(errorText(e, 'Não foi possível criar o grupo.')); }
    finally { setBusy(false); }
  }

  function joinByCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = String(new FormData(event.currentTarget).get('code') ?? '').trim();
    if (code) navigate(`/app/grupos/entrar?codigo=${encodeURIComponent(code)}`);
  }

  const active = groups?.filter((g) => g.myStatus === 'ACTIVE') ?? [];
  const pending = groups?.filter((g) => g.myStatus === 'PENDING') ?? [];

  return (
    <Shell>
      <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Grupos de estudo</h1>
          <p className="mt-2 max-w-2xl text-graphite-500">Estude com amigos e acompanhem a constância uns dos outros. Você decide, em cada grupo, o que os colegas veem; notas, redações e caderno de erros nunca são compartilhados.</p>
        </div>
        <button type="button" onClick={() => setCreating((v) => !v)} className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-graphite">
          {creating ? <X size={16} /> : <Plus size={16} />}{creating ? 'Fechar' : 'Criar grupo'}
        </button>
      </div>
      <Alert text={error} />

      {creating && (
        <form onSubmit={(e) => void create(e)} className="mt-6 grid gap-4 rounded-2xl border bg-white p-5 sm:grid-cols-2">
          <h2 className="font-semibold sm:col-span-2">Novo grupo</h2>
          <label className="text-sm">Nome<input name="name" required minLength={3} maxLength={80} placeholder="ENEM 2027 — foco total" className={field} /></label>
          <label className="text-sm">Propósito<input name="purpose" maxLength={60} placeholder="Medicina, redação, ENEM…" className={field} /></label>
          <label className="text-sm sm:col-span-2">Descrição<textarea name="description" maxLength={500} rows={2} className={field} /></label>
          <label className="text-sm">Limite de membros<input name="maxMembers" type="number" min={2} max={100} defaultValue={30} className={field} /></label>
          <label className="flex items-center gap-2 self-end pb-2.5 text-sm"><input name="requiresApproval" type="checkbox" className="h-4 w-4 accent-primary-600" />Aprovar cada pedido de entrada</label>
          <div className="sm:col-span-2"><button disabled={busy} className="h-11 rounded-full bg-graphite px-6 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Criando…' : 'Criar grupo'}</button></div>
        </form>
      )}

      <form onSubmit={joinByCode} className="mt-6 flex flex-wrap items-end gap-3 rounded-2xl border bg-white p-5">
        <label className="min-w-[200px] flex-1 text-sm">Entrar com código<input name="code" required minLength={4} maxLength={16} placeholder="Ex.: K7M2QX9P" autoCapitalize="characters" className={`${field} font-mono uppercase tracking-widest`} /></label>
        <button className="h-11 rounded-full border border-surface-line bg-white px-5 text-sm font-semibold">Continuar</button>
      </form>

      {groups === null ? <p role="status" className="mt-8">Carregando grupos…</p> : (
        <>
          {pending.length > 0 && (
            <section className="mt-8">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-graphite-500">Aguardando aprovação</h2>
              <ul className="mt-3 grid gap-3 sm:grid-cols-2">{pending.map((g) => (
                <li key={g.id} className="flex items-center justify-between gap-3 rounded-2xl border border-dashed bg-white p-4">
                  <span className="font-semibold">{g.name}</span>
                  <button type="button" onClick={() => void apiLeaveGroup(token(), g.id).then(() => setGroups((rows) => rows?.filter((r) => r.id !== g.id) ?? null)).catch((e) => setError(errorText(e, 'Não foi possível cancelar.')))} className="text-sm underline">Cancelar pedido</button>
                </li>
              ))}</ul>
            </section>
          )}
          <section className="mt-8">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-graphite-500">Meus grupos</h2>
            {!active.length ? (
              <div className="mt-3 rounded-2xl border bg-white p-8 text-center">
                <Users className="mx-auto text-primary-600" size={32} />
                <p className="mt-3 font-semibold">Você ainda não está em nenhum grupo.</p>
                <p className="mt-1 text-sm text-graphite-500">Crie um e chame seus amigos pelo código ou pelo link de convite.</p>
              </div>
            ) : (
              <ul className="mt-3 grid gap-3 sm:grid-cols-2">{active.map((g) => (
                <li key={g.id}>
                  <Link to={`/app/grupos/${g.id}`} className="flex items-center gap-4 rounded-2xl border bg-white p-4 transition hover:-translate-y-0.5 hover:border-primary-500">
                    <Avatar name={g.name} url={g.imageUrl} size="h-12 w-12" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{g.name}</span>
                      <span className="block text-sm text-graphite-500">{[g.purpose, `${g.memberCount}/${g.maxMembers} membros`, ROLE_LABEL[g.myRole]].filter(Boolean).join(' · ')}{g.archived ? ' · Arquivado' : ''}</span>
                    </span>
                  </Link>
                </li>
              ))}</ul>
            )}
          </section>
        </>
      )}
    </Shell>
  );
}

// ------------------------------------------------------------------ entrada por código ou link

function JoinGroup() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const input = params.get('convite') ? { token: params.get('convite')! } : { code: params.get('codigo') ?? '' };
  const key = input.token ?? input.code ?? '';
  const [preview, setPreview] = useState<GroupPreview | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let active = true;
    setPreview(null); setError('');
    apiGroupPreview(token(), input).then((row) => { if (active) setPreview(row); }).catch((e) => { if (active) setError(errorText(e, 'Convite inválido.')); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  async function join() {
    setBusy(true); setError('');
    try {
      const result = await apiJoinGroup(token(), input);
      if (result.status === 'ACTIVE') navigate(`/app/grupos/${result.groupId}`, { replace: true });
      else setPending(true);
    } catch (e) { setError(errorText(e, 'Não foi possível entrar no grupo.')); }
    finally { setBusy(false); }
  }

  return (
    <Shell back={{ to: '/app/grupos', label: 'Meus grupos' }}>
      <div className="mx-auto mt-8 max-w-lg rounded-2xl border bg-white p-6">
        <h1 className="text-2xl font-bold">Convite para grupo</h1>
        <Alert text={error} />
        {!preview && !error && <p role="status" className="mt-4">Buscando o grupo…</p>}
        {preview && (
          <>
            <div className="mt-5 flex items-center gap-4">
              <Avatar name={preview.name} url={preview.imageUrl} size="h-14 w-14" />
              <div>
                <p className="text-lg font-semibold">{preview.name}</p>
                <p className="text-sm text-graphite-500">{[preview.purpose, `${preview.memberCount}/${preview.maxMembers} membros`].filter(Boolean).join(' · ')}</p>
              </div>
            </div>
            {preview.description && <p className="mt-4 text-sm">{preview.description}</p>}
            <p className="mt-4 rounded-xl bg-primary-50 p-3 text-sm">Ao entrar, os colegas veem só seu nome e sua foto. O resto (tempo, matérias, sequência) você liga depois, se quiser.</p>
            {pending ? (
              <p role="status" className="mt-5 rounded-xl bg-surface-card p-3 text-sm font-semibold">Pedido enviado. Você entra assim que um moderador aprovar.</p>
            ) : (
              <button type="button" disabled={busy || preview.full} onClick={() => void join()} className="mt-5 h-11 w-full rounded-full bg-primary text-sm font-semibold disabled:opacity-50">
                {preview.full ? 'Grupo cheio' : busy ? 'Entrando…' : preview.requiresApproval ? 'Pedir para entrar' : 'Entrar no grupo'}
              </button>
            )}
          </>
        )}
      </div>
    </Shell>
  );
}

// ------------------------------------------------------------------ detalhe

function GroupView({ id }: { id: string }) {
  const navigate = useNavigate();
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [error, setError] = useState('');
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [invite, setInvite] = useState<{ url: string; expiresAt: string; copied: boolean } | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    setError('');
    apiGroup(token(), id)
      .then((row) => { if (active) setGroup(row); })
      .catch((e) => { if (!active) return; if (e instanceof ApiError && e.status === 404) setNotFound(true); else setError(errorText(e, 'Não foi possível carregar o grupo.')); });
    return () => { active = false; };
  }, [id, version]);

  /** Executa a ação e recarrega o grupo; ao sair ou excluir, só navega (o grupo deixou de existir para o aluno). */
  const run = useCallback(async (action: () => Promise<unknown>, after?: () => void, reload = true) => {
    setBusy(true); setError('');
    try { await action(); after?.(); if (reload) setVersion((v) => v + 1); }
    catch (e) { setError(errorText(e, 'Não foi possível concluir a ação.')); }
    finally { setBusy(false); }
  }, []);

  async function createInvite() {
    setError('');
    try {
      const link = await apiGroupInviteLink(token(), id);
      const url = groupInviteUrl(window.location.origin, link.token);
      let copied = false;
      try { await navigator.clipboard.writeText(url); copied = true; } catch { /* sem permissão: o link fica visível */ }
      setInvite({ url, expiresAt: link.expiresAt, copied });
    } catch (e) { setError(errorText(e, 'Não foi possível gerar o link.')); }
  }

  async function copyCode(code: string) {
    try { await navigator.clipboard.writeText(code); } catch { /* o código já está visível */ }
  }

  if (notFound) {
    return <Shell back={{ to: '/app/grupos', label: 'Meus grupos' }}><p className="mt-8 rounded-2xl border bg-white p-6">Grupo não encontrado. Ele pode ter sido excluído, ou você não participa dele.</p></Shell>;
  }
  if (!group) return <Shell back={{ to: '/app/grupos', label: 'Meus grupos' }}><Alert text={error} />{!error && <p role="status" className="mt-8">Carregando grupo…</p>}</Shell>;

  const me = group.members.find((m) => m.isMe)!;
  const others = group.members.filter((m) => !m.isMe);

  return (
    <Shell back={{ to: '/app/grupos', label: 'Meus grupos' }}>
      <header className="mt-6 flex flex-wrap items-start gap-4">
        <Avatar name={group.name} url={group.imageUrl} size="h-16 w-16" />
        <div className="min-w-0 flex-1">
          <h1 className="text-3xl font-bold">{group.name}</h1>
          <p className="mt-1 text-graphite-500">{[group.purpose, `${group.members.length}/${group.maxMembers} membros`, `Você é ${ROLE_LABEL[group.myRole].toLowerCase()}`].filter(Boolean).join(' · ')}</p>
          {group.description && <p className="mt-2 max-w-2xl">{group.description}</p>}
        </div>
      </header>
      {group.archived && <p className="mt-4 rounded-xl bg-surface-line/60 p-3 text-sm font-semibold">Grupo arquivado: ninguém entra e nada muda até o dono reativar.</p>}
      <Alert text={error} />

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-6">
          <GroupRooms groupId={group.id} archived={group.archived} />
          <GroupEngagement groupId={group.id} archived={group.archived} optIn={group.mySharing.rankingOptIn} onSharingSaved={(sharing) => setGroup({ ...group, mySharing: sharing })} />
          <section className="rounded-2xl border bg-white p-5">
            <h2 className="flex items-center gap-2 text-lg font-semibold"><Users size={18} />Membros</h2>
            <ul className="mt-3 divide-y">
              <MemberRow member={me} group={group} busy={busy} run={run} />
              {others.map((m) => <MemberRow key={m.userId} member={m} group={group} busy={busy} run={run} />)}
            </ul>
          </section>

          {group.canModerate && group.pendingRequests.length > 0 && (
            <section className="rounded-2xl border bg-white p-5">
              <h2 className="text-lg font-semibold">Pedidos de entrada ({group.pendingRequests.length})</h2>
              <ul className="mt-3 divide-y">{group.pendingRequests.map((r) => (
                <li key={r.userId} className="flex items-center gap-3 py-3">
                  <Avatar name={r.name} url={r.avatarUrl} />
                  <span className="flex-1 font-medium">{r.name}</span>
                  <button type="button" disabled={busy} onClick={() => void run(() => apiDecideGroupRequest(token(), id, r.userId, 'approve'))} className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-sm font-semibold"><Check size={14} />Aprovar</button>
                  <button type="button" disabled={busy} onClick={() => void run(() => apiDecideGroupRequest(token(), id, r.userId, 'reject'))} className="rounded-full border px-3 py-1.5 text-sm">Recusar</button>
                </li>
              ))}</ul>
            </section>
          )}

          {group.rules && (
            <section className="rounded-2xl border bg-white p-5">
              <h2 className="text-lg font-semibold">Regras do grupo</h2>
              <p className="mt-2 whitespace-pre-line text-sm">{group.rules}</p>
            </section>
          )}
        </div>

        <aside className="space-y-6">
          {!group.archived && group.joinCode && (
            <section className="rounded-2xl border bg-white p-5">
              <h2 className="text-lg font-semibold">Convidar</h2>
              <p className="mt-1 text-sm text-graphite-500">{group.requiresApproval ? 'Quem entrar pelo código ou pelo link fica aguardando aprovação.' : 'Quem tiver o código ou o link entra direto.'}</p>
              <div className="mt-3 flex items-center gap-2">
                <code className="flex-1 rounded-xl bg-surface-card px-3 py-2 text-center font-mono text-lg font-bold tracking-[0.3em]">{group.joinCode}</code>
                <button type="button" aria-label="Copiar código" onClick={() => void copyCode(group.joinCode!)} className="rounded-xl border p-2.5"><Copy size={16} /></button>
                {group.canManage && <button type="button" aria-label="Trocar código" title="Trocar código (links antigos param de valer)" disabled={busy} onClick={() => void run(() => apiRegenerateGroupCode(token(), id), () => setInvite(null))} className="rounded-xl border p-2.5"><RefreshCw size={16} /></button>}
              </div>
              <button type="button" onClick={() => void createInvite()} className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-full border text-sm font-semibold"><Link2 size={15} />Gerar link de convite</button>
              {invite && <p className="mt-2 break-all text-xs">{invite.copied ? 'Link copiado: ' : 'Link: '}<code>{invite.url}</code> · vale até {new Date(invite.expiresAt).toLocaleDateString('pt-BR')}</p>}
            </section>
          )}

          <SharingPanel group={group} onSaved={(sharing) => setGroup({ ...group, mySharing: sharing })} onError={setError} />

          {group.canManage && !group.archived && (
            <section className="rounded-2xl border bg-white p-5">
              <button type="button" onClick={() => setEditing((v) => !v)} className="text-lg font-semibold">{editing ? 'Fechar edição' : 'Editar grupo'}</button>
              {editing && (
                <form key={version} className="mt-3 space-y-3" onSubmit={(e) => { e.preventDefault(); const data = groupPayloadFromForm(new FormData(e.currentTarget)); void run(() => apiUpdateGroup(token(), id, data), () => setEditing(false)); }}>
                  <label className="block text-sm">Nome<input name="name" required minLength={3} maxLength={80} defaultValue={group.name} className={field} /></label>
                  <label className="block text-sm">Propósito<input name="purpose" maxLength={60} defaultValue={group.purpose ?? ''} className={field} /></label>
                  <label className="block text-sm">Descrição<textarea name="description" maxLength={500} rows={2} defaultValue={group.description ?? ''} className={field} /></label>
                  <label className="block text-sm">Regras<textarea name="rules" maxLength={2000} rows={3} defaultValue={group.rules ?? ''} className={field} /></label>
                  <label className="block text-sm">Limite de membros<input name="maxMembers" type="number" min={Math.max(2, group.members.length)} max={100} defaultValue={group.maxMembers} className={field} /></label>
                  <label className="flex items-center gap-2 text-sm"><input name="requiresApproval" type="checkbox" defaultChecked={group.requiresApproval} className="h-4 w-4 accent-primary-600" />Aprovar cada pedido de entrada</label>
                  <button disabled={busy} className="h-10 rounded-full bg-graphite px-5 text-sm font-semibold text-white">Salvar</button>
                </form>
              )}
            </section>
          )}

          <section className="space-y-2 rounded-2xl border bg-white p-5 text-sm">
            {group.myRole !== 'OWNER' && (
              <button type="button" disabled={busy} onClick={() => { if (window.confirm('Sair do grupo? Seu tempo de estudo continua no seu histórico.')) void run(() => apiLeaveGroup(token(), id), () => navigate('/app/grupos'), false); }} className="inline-flex items-center gap-2 font-semibold text-red-700"><LogOut size={15} />Sair do grupo</button>
            )}
            {group.myRole === 'OWNER' && (
              <>
                <p className="text-graphite-500">Para sair, transfira a posse a outro membro (no menu de cada membro) ou arquive o grupo.</p>
                <button type="button" disabled={busy} onClick={() => void run(() => apiArchiveGroup(token(), id, !group.archived))} className="inline-flex items-center gap-2 font-semibold"><Archive size={15} />{group.archived ? 'Reativar grupo' : 'Arquivar grupo'}</button>
                {group.archived && (
                  <button type="button" disabled={busy} onClick={() => { if (window.confirm(`Excluir "${group.name}" de vez? Não dá para desfazer.`)) void run(() => apiDeleteGroup(token(), id), () => navigate('/app/grupos'), false); }} className="flex items-center gap-2 font-semibold text-red-700"><Trash2 size={15} />Excluir de vez</button>
                )}
              </>
            )}
          </section>
        </aside>
      </div>
    </Shell>
  );
}

function MemberRow({ member, group, busy, run }: { member: GroupMember; group: GroupDetail; busy: boolean; run: (action: () => Promise<unknown>) => Promise<void> }) {
  const roles = assignableRoles(group.myRole, member.role).filter((r) => r !== member.role);
  const removable = !member.isMe && canRemove(group.myRole, member.role);
  const transferable = !member.isMe && group.myRole === 'OWNER';
  const actions = !group.archived && !member.isMe && (roles.length > 0 || removable || transferable);
  const s = member.stats;
  return (
    <li className="py-3">
      <div className="flex items-center gap-3">
        <Avatar name={member.name} url={member.avatarUrl} />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 font-semibold">
            <span className="truncate">{member.name}{member.isMe ? ' (você)' : ''}</span>
            {member.role !== 'MEMBER' && <span className="inline-flex items-center gap-1 rounded-full bg-primary-50 px-2 py-0.5 text-xs font-semibold text-primary-700">{member.role === 'OWNER' ? <Crown size={11} /> : <Shield size={11} />}{ROLE_LABEL[member.role]}</span>}
          </p>
          {sharesNothing(s) ? (
            <p className="text-xs text-graphite-500">Não compartilha o estudo com o grupo.</p>
          ) : (
            <p className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-graphite-500">
              {s.todayMinutes !== null && <span>Hoje <strong className="text-graphite">{formatStudyMinutes(s.todayMinutes)}</strong></span>}
              {s.weekMinutes !== null && <span>7 dias <strong className="text-graphite">{formatStudyMinutes(s.weekMinutes)}</strong></span>}
              {s.totalMinutes !== null && <span>Total <strong className="text-graphite">{formatStudyMinutes(s.totalMinutes)}</strong></span>}
              {s.streakDays !== null && <span className="inline-flex items-center gap-0.5"><Flame size={12} className="text-primary-600" /><strong className="text-graphite">{s.streakDays}</strong> {s.streakDays === 1 ? 'dia' : 'dias'}</span>}
              {s.lastActivityAt !== null && <span>Estudou {formatLastActivity(s.lastActivityAt)}</span>}
            </p>
          )}
          {s.subjects && s.subjects.length > 0 && <p className="mt-1 flex flex-wrap gap-1">{s.subjects.slice(0, 5).map((name) => <span key={name} className="rounded-full bg-surface-card px-2 py-0.5 text-xs">{name}</span>)}</p>}
        </div>
      </div>
      {actions && (
        <details className="ml-[52px] mt-2 text-sm">
          <summary className="cursor-pointer text-graphite-500">Gerenciar</summary>
          <div className="mt-2 flex flex-wrap gap-2">
            {roles.map((role) => (
              <button key={role} type="button" disabled={busy} onClick={() => void run(() => apiChangeGroupRole(token(), group.id, member.userId, role))} className="rounded-full border px-3 py-1">Tornar {ROLE_LABEL[role].toLowerCase()}</button>
            ))}
            {transferable && (
              <button type="button" disabled={busy} onClick={() => { if (window.confirm(`Transferir a posse para ${member.name}? Você passa a administrador.`)) void run(() => apiTransferGroup(token(), group.id, member.userId)); }} className="inline-flex items-center gap-1 rounded-full border px-3 py-1"><Crown size={13} />Transferir posse</button>
            )}
            {removable && (
              <button type="button" disabled={busy} onClick={() => { if (window.confirm(`Remover ${member.name} do grupo?`)) void run(() => apiRemoveGroupMember(token(), group.id, member.userId)); }} className="inline-flex items-center gap-1 rounded-full border border-red-200 px-3 py-1 text-red-700"><UserMinus size={13} />Remover</button>
            )}
          </div>
        </details>
      )}
    </li>
  );
}

function SharingPanel({ group, onSaved, onError }: { group: GroupDetail; onSaved: (s: GroupDetail['mySharing']) => void; onError: (text: string) => void }) {
  const [saving, setSaving] = useState<string | null>(null);
  async function toggle(key: keyof GroupDetail['mySharing']) {
    setSaving(key);
    try { onSaved(await apiUpdateGroupSharing(token(), group.id, { [key]: !group.mySharing[key] })); }
    catch (e) { onError(errorText(e, 'Não foi possível salvar.')); }
    finally { setSaving(null); }
  }
  return (
    <section className="rounded-2xl border bg-white p-5">
      <h2 className="text-lg font-semibold">O que eu compartilho</h2>
      <p className="mt-1 text-sm text-graphite-500">Vale só para este grupo. Seu nome e sua foto aparecem sempre.</p>
      {group.iAmMinor && <p className="mt-3 rounded-xl bg-primary-50 p-3 text-xs">Você tem menos de 18 anos: mostre só o que quiser. O placar fica desligado para você até você mesmo ligar.</p>}
      <ul className="mt-3 space-y-2">{SHARING_OPTIONS.map((opt) => {
        const on = group.mySharing[opt.key];
        return (
          <li key={opt.key}>
            <button type="button" role="switch" aria-checked={on} disabled={saving !== null || group.archived} onClick={() => void toggle(opt.key)} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-surface-card disabled:opacity-60">
              <span className="flex-1"><span className="block text-sm font-semibold">{opt.label}</span><span className="block text-xs text-graphite-500">{opt.hint}</span></span>
              <span aria-hidden className={`relative h-6 w-11 shrink-0 rounded-full transition ${on ? 'bg-primary' : 'bg-surface-line'}`}><span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${on ? 'left-[22px]' : 'left-0.5'}`} /></span>
            </button>
          </li>
        );
      })}</ul>
    </section>
  );
}
