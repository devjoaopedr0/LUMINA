import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getAccessToken } from '@/lib/auth';
import { apiArchiveClass, apiClassDetail, apiClassInviteLink, apiLinkClassUser, apiManagedClasses, apiUnlinkClassUser, apiUpdateClass, type ClassDetail } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

const token = () => getAccessToken() ?? '';
const field = 'w-full rounded-lg border p-2';

export function Classes() {
  const [params, setParams] = useSearchParams();
  const id = params.get('id');
  const [classes, setClasses] = useState<Awaited<ReturnType<typeof apiManagedClasses>>>([]);
  const [detail, setDetail] = useState<ClassDetail | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  const [invite, setInvite] = useState<{ url: string; expiresAt: string; copied: boolean } | null>(null);
  const { user } = useAuth();
  useEffect(() => { setInvite(null); }, [id]);
  async function createInvite(classId: string) {
    setError('');
    try {
      const link = await apiClassInviteLink(token(), classId);
      const url = `${window.location.origin}/app/turmas/convite/${link.token}`;
      let copied = false;
      try { await navigator.clipboard.writeText(url); copied = true; } catch { /* sem permissão: o link fica visível para copiar */ }
      setInvite({ url, expiresAt: link.expiresAt, copied });
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível gerar o link.'); }
  }
  useEffect(() => {
    let active = true;
    setLoading(true); setError(''); setDetail(null);
    Promise.all([apiManagedClasses(token()), id ? apiClassDetail(token(), id) : Promise.resolve(null)])
      .then(([rows, selected]) => { if (active) { setClasses(rows); setDetail(selected); } })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : 'Não foi possível carregar as turmas.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id, version]);
  const run = useCallback(async (action: () => Promise<unknown>) => {
    setBusy(true); setError('');
    try { await action(); setVersion(value => value + 1); }
    catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível concluir a ação.'); }
    finally { setBusy(false); }
  }, []);

  return <main className="min-h-screen bg-surface-card px-5 py-8 text-graphite"><div className="mx-auto max-w-5xl">
    <Link to="/app">← Visão geral</Link><h1 className="my-6 text-3xl font-bold">Gestão de turmas</h1>
    {user?.accountType !== 'STUDENT_INDEPENDENT' && <Link to="/app/simulados" className="underline">Criar turma ou entrar com código</Link>}
    {error && <p role="alert" className="my-4 rounded-lg bg-red-50 p-3 text-red-700">{error}</p>}
    {loading ? <p role="status" className="my-6">Carregando turmas…</p> : <>
      <nav aria-label="Turmas" className="my-6 flex flex-wrap gap-3">{classes.map(row => <button key={row.id} onClick={() => setParams({ id: row.id })} aria-pressed={id === row.id} className={`rounded-lg border px-4 py-2 ${id === row.id ? 'bg-graphite text-white' : 'bg-white'}`}>{row.name}{row.archived ? ' · Arquivada' : ''}</button>)}</nav>
      {!classes.length && <p className="my-6">Você ainda não está vinculado a uma turma.</p>}
      {detail && <>
        <section className="rounded-xl border bg-white p-5"><h2 className="text-2xl font-bold">{detail.name}</h2><p>{detail.archived ? 'Arquivada' : 'Ativa'} · {detail.subject?.name ?? 'Sem disciplina'} · {detail.academicPeriod?.name ?? 'Sem período'}{detail.gradeYear ? ` · Ano/série ${detail.gradeYear}` : ''}</p>
          {detail.canManage && <p className="my-3">Código de ingresso: <strong>{detail.joinCode}</strong></p>}
          {detail.canManage && !detail.archived && <div className="my-3 rounded-lg bg-surface-card p-3 text-sm">
            <button type="button" onClick={() => void createInvite(detail.id)} className="rounded-lg border bg-white px-3 py-1.5 font-semibold">Gerar link de convite</button>
            <span className="ml-2 text-graphite-500">Aluno independente só entra pelo link; o código vale para alunos da instituição.</span>
            {invite && <p className="mt-2 break-all">{invite.copied ? 'Link copiado: ' : 'Link: '}<code>{invite.url}</code> · vale até {new Date(invite.expiresAt).toLocaleDateString('pt-BR')}</p>}
          </div>}
          {detail.canManage ? <>
            <form key={detail.id + version} className="my-4 grid gap-4 sm:grid-cols-2" onSubmit={event => {
              event.preventDefault(); const data = new FormData(event.currentTarget);
              void run(() => apiUpdateClass(token(), detail.id, { name: String(data.get('name')), description: String(data.get('description')), maxStudents: data.get('maxStudents') ? Number(data.get('maxStudents')) : null, gradeYear: data.get('gradeYear') ? Number(data.get('gradeYear')) : null, subjectId: String(data.get('subjectId') || '') || null, academicPeriodId: String(data.get('academicPeriodId') || '') || null }));
            }}>
              <label>Nome<input name="name" required maxLength={120} defaultValue={detail.name} className={field} /></label>
              <label>Descrição<input name="description" maxLength={500} defaultValue={detail.description ?? ''} className={field} /></label>
              <label>Limite de alunos<input name="maxStudents" type="number" min={1} max={500} defaultValue={detail.maxStudents ?? ''} className={field} /></label>
              <label>Ano/série<input name="gradeYear" type="number" min={1} max={12} defaultValue={detail.gradeYear ?? ''} className={field} /></label>
              <label>Disciplina<select name="subjectId" defaultValue={detail.subject?.id ?? ''} className={field}><option value="">Selecione</option>{detail.availableSubjects.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
              <label>Período letivo<select name="academicPeriodId" defaultValue={detail.academicPeriod?.id ?? ''} className={field}><option value="">Selecione</option>{detail.availablePeriods.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
              <button disabled={busy} className="rounded-lg bg-graphite px-4 py-2 text-white">Salvar turma</button>
            </form>
            <button disabled={busy} onClick={() => void run(() => apiArchiveClass(token(), detail.id, !detail.archived))} className="rounded-lg border px-4 py-2">{detail.archived ? 'Desarquivar turma' : 'Arquivar turma'}</button>
          </> : <p className="my-3">{detail.description}</p>}
        </section>
        {(['teachers', 'members'] as const).map(kind => <section key={kind} className="mt-5 rounded-xl border bg-white p-5"><h2 className="text-xl font-bold">{kind === 'teachers' ? 'Professores' : 'Alunos'} ({detail[kind].length})</h2>
          {detail.canManage && !detail.archived && <form className="my-4 flex gap-3" onSubmit={event => { event.preventDefault(); const email = String(new FormData(event.currentTarget).get('email')); void run(() => apiLinkClassUser(token(), detail.id, kind, email)); }}><input aria-label={`E-mail do ${kind === 'teachers' ? 'professor' : 'aluno'}`} name="email" type="email" required placeholder="E-mail da conta cadastrada" className={field} /><button disabled={busy} className="rounded-lg border px-4">Vincular</button></form>}
          {detail[kind].map(person => <div key={person.id} className="flex items-center justify-between gap-3 border-b py-3"><div><strong>{person.name}</strong><p className="text-sm">{person.email}</p></div>{detail.canManage && <button disabled={busy} onClick={() => void run(() => apiUnlinkClassUser(token(), detail.id, kind, person.id))} className="text-sm underline">Remover vínculo</button>}</div>)}
        </section>)}
        <section className="mt-5 rounded-xl border bg-white p-5"><h2 className="text-xl font-bold">Histórico da turma</h2>{!detail.timeline.length && <p className="mt-3">Nenhuma atividade criada nesta turma.</p>}{detail.timeline.map(item => <div key={item.id} className="border-b py-3"><Link className="font-semibold underline" to={`/app/simulados?id=${item.id}`}>{item.title}</Link><p className="text-sm">{new Date(item.createdAt).toLocaleDateString('pt-BR')} · {item.questionCount} questões · {item.submissionCount} entregas</p></div>)}</section>
      </>}
    </>}
  </div></main>;
}
