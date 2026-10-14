import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { getAccessToken } from '@/lib/auth';
import { apiEssayCreate, apiEssaySave, apiEssayThemeCreate, apiEssayThemes, type EssayTheme } from '@/lib/api';

export function EssayThemeCatalog({ teacherSubject }: { teacherSubject: string | null }) {
  const navigate = useNavigate();
  const [themes, setThemes] = useState<EssayTheme[]>([]);
  const [year, setYear] = useState('');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [practiceBusy, setPracticeBusy] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    apiEssayThemes(getAccessToken() ?? '', year ? Number(year) : undefined)
      .then(data => { if (active) setThemes(data); })
      .catch(() => { if (active) setError('Não foi possível carregar os temas.'); });
    return () => { active = false; };
  }, [year, reload]);

  async function create(event: FormEvent) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError('');
    try { await apiEssayThemeCreate(getAccessToken() ?? '', title.trim()); setTitle(''); setReload(value => value + 1); }
    catch { setError('Não foi possível criar o tema. Confira o título e tente novamente.'); }
    finally { setBusy(false); }
  }

  async function practice(theme: EssayTheme) {
    if (practiceBusy) return;
    setPracticeBusy(true); setError('');
    try {
      const token = getAccessToken() ?? '';
      const draft = await apiEssayCreate(token);
      await apiEssaySave(token, draft.id, { version: draft.version, title: '', theme: theme.title, content: '' });
      navigate(`/app/redacoes/${draft.id}`);
    } catch { setError('Não foi possível começar a redação. Tente novamente.'); setPracticeBusy(false); }
  }

  return <Card className="mt-8 bg-white p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-semibold">Banco de temas de redação</h2><p className="mt-1 text-sm text-graphite-500">Propostas do ENEM desde 2011, com acesso à fonte oficial.</p></div><label className="text-sm">Ano <select value={year} onChange={event => setYear(event.target.value)} className="ml-2 rounded-lg border border-surface-line bg-white p-2"><option value="">Todos</option>{Array.from({ length: 15 }, (_, index) => 2025 - index).map(value => <option key={value} value={value}>{value}</option>)}</select></label></div>
    {error ? <p role="alert" className="mt-4 text-sm text-red-700">{error}</p> : null}
    <ul className="mt-5 grid gap-3 md:grid-cols-2">{themes.map(theme => <li key={theme.id} className="rounded-xl border border-surface-line p-4"><p className="text-xs font-semibold text-primary-700">{theme.exam === 'ENEM' ? `ENEM ${theme.year}` : 'Tema autoral'}</p><h3 className="mt-1 break-words font-semibold">{theme.title}</h3><div className="mt-3 flex gap-4 text-sm"><button type="button" disabled={practiceBusy} onClick={() => void practice(theme)} className="underline disabled:opacity-40">Praticar no editor</button>{theme.sourceUrl ? <a href={theme.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline">Proposta do Inep</a> : null}</div></li>)}</ul>
    {teacherSubject && ['Língua Portuguesa', 'Literatura', 'Redação'].includes(teacherSubject) ? <form onSubmit={event => void create(event)} className="mt-6 border-t border-surface-line pt-5"><label htmlFor="new-essay-theme" className="block text-sm font-semibold">Criar tema da sua matéria</label><p className="my-2 text-xs text-graphite-500">O tema autoral aparece na sua conta. A publicação para alunos depende da revisão editorial.</p><div className="flex flex-wrap gap-2"><input id="new-essay-theme" minLength={10} maxLength={300} required value={title} onChange={event => setTitle(event.target.value)} className="min-w-64 flex-1 rounded-xl border border-surface-line p-3" placeholder="Escreva o tema de redação" /><Button disabled={busy} type="submit">{busy ? 'Salvando…' : 'Criar tema'}</Button></div></form> : null}
  </Card>;
}
