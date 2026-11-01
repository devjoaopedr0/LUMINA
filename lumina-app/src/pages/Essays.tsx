import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, FilePenLine, Plus, ScanLine } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EssayEditor } from '@/components/essays/EssayEditor';
import { EssayThemeCatalog } from '@/components/essays/EssayThemeCatalog';
import { useAuth } from '@/contexts/AuthContext';
import { getAccessToken } from '@/lib/auth';
import { apiEssay, apiEssayCreate, apiEssays, type Essay, type EssayPage, type EssaySummary } from '@/lib/api';

export function Essays() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [list, setList] = useState<EssayPage<EssaySummary> | null>(null);
  const [essay, setEssay] = useState<Essay | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const creating = useRef(false);

  useEffect(() => {
    let active = true;
    setLoading(true); setError(''); setEssay(null); setList(null);
    const load = async () => {
      try {
        if (id) { const data = await apiEssay(getAccessToken() ?? '', id); if (active) setEssay(data); }
        else { const data = await apiEssays(getAccessToken() ?? '', page); if (active) setList(data); }
      } catch { if (active) setError('Não foi possível carregar suas redações. Tente novamente.'); }
      finally { if (active) setLoading(false); }
    };
    void load();
    return () => { active = false; };
  }, [id, page, reload]);

  async function create() {
    if (creating.current) return;
    creating.current = true; setLoading(true); setError('');
    try { const draft = await apiEssayCreate(getAccessToken() ?? ''); navigate(`/app/redacoes/${draft.id}`); }
    catch { setError('Não foi possível criar a redação. Tente novamente.'); setLoading(false); }
    finally { creating.current = false; }
  }

  if (essay && user) return <EssayEditor key={`${essay.id}:${user.id}`} initial={essay} userId={user.id} />;
  return <main className="min-h-screen bg-surface-card px-5 py-8 text-graphite sm:px-8"><div className="mx-auto max-w-5xl">
    <Link to="/app" className="inline-flex items-center gap-2 text-sm font-semibold"><ArrowLeft size={16} />Voltar à visão geral</Link>
    <header className="my-8 flex flex-wrap items-end justify-between gap-4"><div><p className="flex items-center gap-2 text-primary-700"><FilePenLine size={20} />Prática de escrita</p><h1 className="mt-3 text-3xl font-bold">Minhas redações</h1><p className="mt-3 text-graphite-500">Escreva no seu ritmo, escolha um tema e acompanhe suas versões.</p></div>{!id ? <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => navigate('/app/redacoes/scanner')}><ScanLine size={18} />Corrigir por foto</Button><Button onClick={() => void create()} disabled={loading}><Plus size={18} />Nova redação</Button></div> : null}</header>
    {error ? <div role="alert" className="mb-5 rounded-xl bg-red-50 p-4 text-red-700"><p>{error}</p><Button variant="outline" className="mt-3" onClick={() => setReload(value => value + 1)}>Tentar novamente</Button></div> : null}
    {loading ? <p role="status">Carregando redações…</p> : null}
    {list ? <>
      {!list.items.length ? <Card className="bg-white p-8"><h2 className="text-lg font-semibold">{page === 1 ? 'Sua próxima ideia começa aqui' : 'Não há redações nesta página'}</h2><p className="mt-2 text-graphite-500">Crie uma redação para começar. O editor salva seu texto automaticamente.</p></Card> : <div className="grid gap-4 sm:grid-cols-2">{list.items.map(item => <Link to={`/app/redacoes/${item.id}`} key={item.id} className="rounded-2xl focus-visible:outline-primary"><Card className="h-full bg-white p-6 transition hover:border-primary"><h2 className="break-words text-lg font-semibold">{item.title || 'Redação sem título'}</h2><p className="mt-2 break-words text-sm text-graphite-500">{item.theme || 'Tema livre'}</p><p className="mt-5 text-xs text-graphite-400">{item.wordCount} palavras · Versão {item.version} · {new Date(item.updatedAt).toLocaleString('pt-BR')}</p></Card></Link>)}</div>}
      <div className="mt-6 flex items-center justify-between"><Button variant="outline" disabled={page === 1 || loading} onClick={() => setPage(value => value - 1)}>Anterior</Button><span className="text-sm">Página {page}</span><Button variant="outline" disabled={!list.hasMore || loading} onClick={() => setPage(value => value + 1)}>Próxima</Button></div>
    </> : null}
    {!id ? <EssayThemeCatalog teacherSubject={user?.teacherSubject ?? null} /> : null}
  </div></main>;
}
