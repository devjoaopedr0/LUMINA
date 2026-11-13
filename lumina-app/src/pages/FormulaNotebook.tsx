import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, BookmarkPlus, Brain, Copy, FolderPlus, Layers, Lightbulb, Loader2, Pencil, Plus, Search, Sparkles, Star, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/notebooks/Modal';
import { AiText } from '@/components/notebooks/AiText';
import { copyToClipboard, fieldClass } from '@/lib/notebook-ui';
import { useAuth } from '@/contexts/AuthContext';
import {
  ApiError,
  apiAddToCollection,
  apiCopyFormula,
  apiCreateCollection,
  apiCreateFormula,
  apiDeleteCollection,
  apiDeleteFormula,
  apiFormulaAi,
  apiFormulaSummary,
  apiListCollections,
  apiListFormulas,
  apiUpdateFormula,
} from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import {
  DISCIPLINE_LABEL,
  DISCIPLINES,
  FORMULA_AI_LABEL,
  SORT_LABEL,
  atItemLimit,
  usageLabel,
  type Discipline,
  type Formula,
  type FormulaAiAction,
  type FormulaPayload,
  type FormulaQuery,
  type FormulaSummary,
  type NotebookCollection,
  type NotebookScope,
  type NotebookSort,
} from '@/lib/notebooks';

const token = () => getAccessToken() ?? '';
const message = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);
const EMPTY: FormulaPayload = { name: '', discipline: 'MATEMATICA', latex: '' };

const DISCIPLINE_STYLE: Record<Discipline, string> = {
  MATEMATICA: 'bg-blue-50 text-blue-800',
  FISICA: 'bg-green-50 text-green-800',
  QUIMICA: 'bg-purple-50 text-purple-800',
  BIOLOGIA: 'bg-red-50 text-red-800',
  OUTRA: 'bg-graphite/5 text-graphite-700',
};

function toPayload(f: Formula): FormulaPayload {
  const { name, discipline, topic, latex, description, variables, whenToUse, example, isFavorite, isMemorized, isPlatform } = f;
  return { name, discipline, topic, latex, description, variables, whenToUse, example, isFavorite, isMemorized, isPlatform };
}

function FormulaForm({ title, initial, canPublish, onSubmit, onClose }: { title: string; initial: FormulaPayload; canPublish: boolean; onSubmit: (p: FormulaPayload) => Promise<void>; onClose: () => void }) {
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = <K extends keyof FormulaPayload>(key: K, value: FormulaPayload[K]) => setForm((f) => ({ ...f, [key]: value }));
  const area = (key: 'description' | 'variables' | 'whenToUse' | 'example', label: string) => (
    <label className="block text-sm font-semibold">
      {label}
      <textarea rows={3} className={fieldClass} value={form[key] ?? ''} onChange={(e) => set(key, e.target.value)} />
    </label>
  );

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!form.name.trim() || !form.latex.trim()) return setError('Informe o nome e a fórmula.');
    setBusy(true);
    setError('');
    try {
      await onSubmit(form);
    } catch (e) {
      setError(message(e, 'Não foi possível salvar.'));
      setBusy(false);
    }
  }

  return (
    <Modal title={title} onClose={onClose} wide>
      <form onSubmit={(e) => void submit(e)} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-semibold">Nome *<input className={fieldClass} value={form.name} maxLength={160} onChange={(e) => set('name', e.target.value)} placeholder="Ex.: Fórmula de Bhaskara" required /></label>
          <label className="block text-sm font-semibold">
            Disciplina
            <select className={fieldClass} value={form.discipline} onChange={(e) => set('discipline', e.target.value as Discipline)}>
              {DISCIPLINES.map((d) => <option key={d} value={d}>{DISCIPLINE_LABEL[d]}</option>)}
            </select>
          </label>
          <label className="block text-sm font-semibold sm:col-span-2">Assunto<input className={fieldClass} value={form.topic ?? ''} maxLength={160} onChange={(e) => set('topic', e.target.value)} placeholder="Ex.: Funções quadráticas" /></label>
        </div>
        <label className="block text-sm font-semibold">
          Fórmula *<span className="ml-1 font-normal text-graphite-400">(texto ou LaTeX)</span>
          <textarea rows={2} className={`${fieldClass} font-mono`} value={form.latex} onChange={(e) => set('latex', e.target.value)} placeholder="x = (-b ± √(b² - 4ac)) / 2a" required />
        </label>
        {area('variables', 'O que cada símbolo significa')}
        {area('whenToUse', 'Quando usar')}
        {area('example', 'Exemplo resolvido')}
        {area('description', 'Minhas anotações')}
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={!!form.isFavorite} onChange={(e) => set('isFavorite', e.target.checked)} />Favorita</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={!!form.isMemorized} onChange={(e) => set('isMemorized', e.target.checked)} />Já sei de cor</label>
          {canPublish ? <label className="flex items-center gap-2 font-semibold text-primary-700"><input type="checkbox" checked={!!form.isPlatform} onChange={(e) => set('isPlatform', e.target.checked)} />Publicar no acervo da Lumina</label> : null}
        </div>
        {error ? <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
        <div className="flex gap-3">
          <Button type="submit" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Salvar fórmula</Button>
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>Cancelar</Button>
        </div>
      </form>
    </Modal>
  );
}

export function FormulaNotebook() {
  const { user } = useAuth();
  const isAdmin = user?.accountType === 'ADMIN';
  const [summary, setSummary] = useState<FormulaSummary | null>(null);
  const [items, setItems] = useState<Formula[]>([]);
  const [collections, setCollections] = useState<NotebookCollection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [q, setQ] = useState('');
  const [discipline, setDiscipline] = useState<Discipline | ''>('');
  const [favorite, setFavorite] = useState(false);
  const [toMemorize, setToMemorize] = useState(false);
  const [scope, setScope] = useState<NotebookScope>('mine');
  const [collectionId, setCollectionId] = useState('');
  const [sort, setSort] = useState<NotebookSort>('recent');

  const [selected, setSelected] = useState<Formula | null>(null);
  const [form, setForm] = useState<{ title: string; initial: FormulaPayload; id?: string } | null>(null);
  const [newCollection, setNewCollection] = useState<string | null>(null);
  const [ai, setAi] = useState<{ action: FormulaAiAction; text: string; disclaimer: string } | null>(null);
  const [aiBusy, setAiBusy] = useState<FormulaAiAction | null>(null);

  const query: FormulaQuery = useMemo(
    () => ({ q: q.trim() || undefined, discipline: discipline || undefined, favorite, toMemorize, scope, collectionId: collectionId || undefined, sort }),
    [q, discipline, favorite, toMemorize, scope, collectionId, sort],
  );
  const filtersActive = !!(q.trim() || discipline || favorite || toMemorize || collectionId);

  const reload = useCallback(async () => {
    try {
      const [rows, sum, cols] = await Promise.all([apiListFormulas(token(), query), apiFormulaSummary(token()), apiListCollections(token(), 'formulas')]);
      setItems(rows);
      setSummary(sum);
      setCollections(cols);
      setError('');
    } catch (e) {
      setError(message(e, 'Não foi possível carregar o caderno de fórmulas.'));
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    const timer = window.setTimeout(() => void reload(), 250);
    return () => window.clearTimeout(timer);
  }, [reload]);

  const full = summary ? atItemLimit(summary.total, summary.plan) : false;

  async function act(action: () => Promise<unknown>, done: string) {
    try {
      await action();
      setNotice(done);
      await reload();
    } catch (e) {
      setError(message(e, 'Não foi possível concluir.'));
    }
  }

  async function save(payload: FormulaPayload) {
    if (form?.id) {
      await apiUpdateFormula(token(), form.id, payload);
      setNotice('Fórmula atualizada.');
    } else {
      await apiCreateFormula(token(), payload);
      setNotice('Fórmula salva no caderno.');
    }
    setForm(null);
    await reload();
  }

  async function toggle(f: Formula, patch: Partial<FormulaPayload>) {
    try {
      const updated = await apiUpdateFormula(token(), f.id, patch);
      setSelected((s) => (s?.id === f.id ? { ...s, ...updated } : s));
      await reload();
    } catch (e) {
      setError(message(e, 'Não foi possível atualizar.'));
    }
  }

  async function askAi(f: Formula, action: FormulaAiAction) {
    setAiBusy(action);
    setAi(null);
    try {
      const result = await apiFormulaAi(token(), { action, id: f.id });
      setAi({ action, ...result });
    } catch (e) {
      setError(message(e, 'A LuminIA não respondeu.'));
    } finally {
      setAiBusy(null);
    }
  }

  return (
    <main className="min-h-screen bg-surface-card px-5 py-8 text-graphite sm:px-8">
      <div className="mx-auto max-w-6xl">
        <Link to="/app" className="inline-flex items-center gap-2 text-sm font-semibold"><ArrowLeft size={16} />Voltar à visão geral</Link>
        <header className="my-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="inline-flex items-center gap-2 text-sm font-semibold text-primary-700"><Lightbulb size={20} />Exatas e Natureza</span>
            <h1 className="mt-3 text-3xl font-bold">Caderno de Fórmulas</h1>
            <p className="mt-3 max-w-3xl text-graphite-500">Guarde as fórmulas com o significado de cada símbolo, quando usar e um exemplo resolvido. Marque as que já sabe de cor e treine as que faltam com a LuminIA.</p>
          </div>
          <Button onClick={() => (full ? setError(`O plano Gratuito guarda até ${summary?.plan.itemLimit} fórmulas. Veja o Premium em "Meu plano".`) : setForm({ title: 'Nova fórmula', initial: EMPTY }))}>
            <Plus className="h-4 w-4" />Adicionar fórmula
          </Button>
        </header>

        {summary ? (
          <div className="mb-6 grid gap-3 sm:grid-cols-4">
            {[
              { icon: Layers, label: 'Fórmulas salvas', value: usageLabel(summary.total, summary.plan) },
              { icon: Brain, label: 'Já sei de cor', value: summary.memorized },
              { icon: Star, label: 'Favoritas', value: summary.favorites },
              { icon: BookmarkPlus, label: 'No acervo Lumina', value: summary.platformAvailable },
            ].map(({ icon: Icon, label, value }) => (
              <Card key={label} className="bg-white p-4">
                <p className="flex items-center gap-2 text-xs text-graphite-400"><Icon className="h-4 w-4" />{label}</p>
                <p className="mt-1 text-2xl font-bold">{value}</p>
              </Card>
            ))}
          </div>
        ) : null}
        {full ? <p className="mb-5 rounded-xl bg-primary/10 p-4 text-sm">Você chegou ao limite do plano Gratuito. <Link to="/app/plano" className="font-semibold underline">Com o Premium o caderno é ilimitado.</Link></p> : null}
        {error ? (
          <p role="alert" className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
            <span>{error} {error.includes('Premium') ? <Link to="/app/plano" className="font-semibold underline">Ver planos</Link> : null}</span>
            <button type="button" aria-label="Fechar aviso" onClick={() => setError('')}><X className="h-4 w-4" /></button>
          </p>
        ) : null}
        {notice ? <p role="status" className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">{notice}</p> : null}

        <Card className="mb-5 bg-white p-4">
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Origem">
            {(['mine', 'platform', 'all'] as const).map((s) => (
              <button key={s} type="button" role="tab" aria-selected={scope === s} onClick={() => { setScope(s); setCollectionId(''); }}
                className={`rounded-full px-4 py-2 text-sm font-semibold ${scope === s ? 'bg-graphite text-white' : 'bg-surface-card text-graphite-600'}`}>
                {{ mine: 'Meu caderno', platform: 'Acervo Lumina', all: 'Tudo' }[s]}
              </button>
            ))}
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-[2fr_1fr_1fr]">
            <label className="relative block">
              <span className="sr-only">Buscar</span>
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-graphite-400" />
              <input className={`${fieldClass} mt-0 pl-9`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome, assunto, fórmula ou anotação" />
            </label>
            <select aria-label="Disciplina" className={`${fieldClass} mt-0`} value={discipline} onChange={(e) => setDiscipline(e.target.value as Discipline | '')}>
              <option value="">Todas as disciplinas</option>
              {DISCIPLINES.map((d) => <option key={d} value={d}>{DISCIPLINE_LABEL[d]}</option>)}
            </select>
            <select aria-label="Ordenar" className={`${fieldClass} mt-0`} value={sort} onChange={(e) => setSort(e.target.value as NotebookSort)}>
              {(Object.keys(SORT_LABEL) as NotebookSort[]).map((s) => <option key={s} value={s}>{SORT_LABEL[s]}</option>)}
            </select>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <label className="mr-2 flex items-center gap-2"><input type="checkbox" checked={favorite} onChange={(e) => setFavorite(e.target.checked)} />Só favoritas</label>
            <label className="mr-2 flex items-center gap-2"><input type="checkbox" checked={toMemorize} onChange={(e) => setToMemorize(e.target.checked)} />Só as que faltam decorar</label>
            {scope === 'mine' ? (
              <>
                {collections.map((c) => (
                  <span key={c.id} className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold ${collectionId === c.id ? 'border-primary bg-primary/15' : 'border-surface-line'}`}>
                    <button type="button" onClick={() => setCollectionId(collectionId === c.id ? '' : c.id)}>{c.name} ({c.itemCount})</button>
                    <button type="button" aria-label={`Apagar a coleção ${c.name}`} onClick={() => void act(() => apiDeleteCollection(token(), 'formulas', c.id).then(() => collectionId === c.id && setCollectionId('')), 'Coleção apagada (as fórmulas continuam no caderno).')}><X className="h-3 w-3" /></button>
                  </span>
                ))}
                <button type="button" onClick={() => setNewCollection('')} className="inline-flex items-center gap-1 rounded-full border border-dashed border-surface-line px-3 py-1 text-xs font-semibold"><FolderPlus className="h-3 w-3" />Nova coleção</button>
              </>
            ) : null}
            {filtersActive ? <button type="button" className="text-xs font-semibold underline" onClick={() => { setQ(''); setDiscipline(''); setFavorite(false); setToMemorize(false); setCollectionId(''); }}>Limpar filtros</button> : null}
          </div>
        </Card>

        {loading ? <p role="status" className="rounded-xl bg-white p-6 text-sm text-graphite-500">Carregando o caderno…</p> : null}
        {!loading && !items.length ? (
          <Card className="bg-white p-8 text-center">
            <p className="font-semibold">{filtersActive ? 'Nada encontrado com esses filtros.' : scope === 'platform' ? 'O acervo da Lumina ainda está vazio.' : 'Seu caderno ainda está vazio.'}</p>
          </Card>
        ) : null}

        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((f) => (
            <li key={f.id}>
              <Card className="flex h-full flex-col bg-white p-5">
                <div className="flex items-start justify-between gap-2">
                  <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${DISCIPLINE_STYLE[f.discipline]}`}>{DISCIPLINE_LABEL[f.discipline]}</span>
                  <span className="flex gap-1">
                    {f.isMemorized ? <Brain className="h-4 w-4 text-emerald-600" aria-label="Já sei de cor" /> : null}
                    {f.isFavorite ? <Star className="h-4 w-4 fill-primary text-primary" aria-label="Favorita" /> : null}
                  </span>
                </div>
                <h2 className="mt-3 font-bold">{f.name}</h2>
                {f.topic ? <p className="text-xs text-graphite-500">{f.topic}</p> : null}
                <code className="mt-3 block overflow-x-auto whitespace-pre-wrap rounded-xl bg-surface-card p-3 font-mono text-sm">{f.latex}</code>
                {f.isPlatform ? <p className="mt-2 text-[11px] text-graphite-400">Acervo Lumina</p> : null}
                <Button size="sm" variant="outline" className="mt-auto pt-0" onClick={() => { setSelected(f); setAi(null); }}>Ver fórmula</Button>
              </Card>
            </li>
          ))}
        </ul>
      </div>

      {selected ? (
        <Modal title={selected.name} onClose={() => setSelected(null)} wide>
          <code className="block overflow-x-auto whitespace-pre-wrap rounded-xl bg-surface-card p-4 font-mono">{selected.latex}</code>
          <div className="mt-4 space-y-3 text-sm">
            {[
              ['Disciplina', `${DISCIPLINE_LABEL[selected.discipline]}${selected.topic ? ` · ${selected.topic}` : ''}`],
              ['O que cada símbolo significa', selected.variables],
              ['Quando usar', selected.whenToUse],
              ['Exemplo resolvido', selected.example],
              ['Minhas anotações', selected.description],
            ]
              .filter(([, body]) => body)
              .map(([title, body]) => (
                <section key={title}>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-graphite-400">{title}</h3>
                  <p className="mt-1 whitespace-pre-wrap">{body}</p>
                </section>
              ))}
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => void copyToClipboard(selected.latex).then((ok) => setNotice(ok ? 'Fórmula copiada.' : 'Não foi possível copiar.'))}><Copy className="h-4 w-4" />Copiar</Button>
            {selected.isPlatform && !isAdmin ? (
              <Button size="sm" onClick={() => void act(() => apiCopyFormula(token(), selected.id), 'Fórmula salva no seu caderno.').then(() => setSelected(null))}><BookmarkPlus className="h-4 w-4" />Salvar no meu caderno</Button>
            ) : null}
            {!selected.isPlatform ? (
              <>
                <Button size="sm" variant="outline" onClick={() => void toggle(selected, { isFavorite: !selected.isFavorite })}><Star className={`h-4 w-4 ${selected.isFavorite ? 'fill-primary text-primary' : ''}`} />{selected.isFavorite ? 'Tirar dos favoritos' : 'Favoritar'}</Button>
                <Button size="sm" variant="outline" onClick={() => void toggle(selected, { isMemorized: !selected.isMemorized })}><Brain className="h-4 w-4" />{selected.isMemorized ? 'Ainda não sei de cor' : 'Já sei de cor'}</Button>
              </>
            ) : null}
            {!selected.isPlatform || isAdmin ? (
              <>
                <Button size="sm" variant="outline" onClick={() => { setForm({ title: 'Editar fórmula', initial: toPayload(selected), id: selected.id }); setSelected(null); }}><Pencil className="h-4 w-4" />Editar</Button>
                <Button size="sm" variant="ghost" onClick={() => void act(() => apiDeleteFormula(token(), selected.id), 'Fórmula excluída.').then(() => setSelected(null))}><Trash2 className="h-4 w-4" />Excluir</Button>
              </>
            ) : null}
          </div>
          {!selected.isPlatform && collections.length ? (
            <label className="mt-4 block text-sm font-semibold">
              Adicionar a uma coleção
              <select className={fieldClass} value="" onChange={(e) => {
                const id = e.target.value;
                if (id) void act(() => apiAddToCollection(token(), 'formulas', id, [selected.id]).then(() => setSelected({ ...selected, collectionIds: [...(selected.collectionIds ?? []), id] })), 'Adicionada à coleção.');
              }}>
                <option value="">Escolha a coleção</option>
                {collections.map((c) => <option key={c.id} value={c.id} disabled={selected.collectionIds?.includes(c.id)}>{c.name}{selected.collectionIds?.includes(c.id) ? ' (já está)' : ''}</option>)}
              </select>
            </label>
          ) : null}
          <section className="mt-6 rounded-2xl border border-surface-line p-4">
            <h3 className="flex items-center gap-2 font-bold"><Sparkles className="h-4 w-4 text-primary-700" />LuminIA</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {(Object.keys(FORMULA_AI_LABEL) as FormulaAiAction[]).map((action) => (
                <Button key={action} size="sm" variant="outline" disabled={!!aiBusy} onClick={() => void askAi(selected, action)}>
                  {aiBusy === action ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{FORMULA_AI_LABEL[action]}
                </Button>
              ))}
            </div>
            {ai ? (
              <>
                <div className="mt-3"><AiText text={ai.text} /></div>
                <p className="mt-2 text-xs text-graphite-400">{ai.disclaimer}</p>
              </>
            ) : null}
          </section>
        </Modal>
      ) : null}

      {form ? <FormulaForm title={form.title} initial={form.initial} canPublish={isAdmin} onSubmit={save} onClose={() => setForm(null)} /> : null}

      {newCollection !== null ? (
        <Modal title="Nova coleção de fórmulas" onClose={() => setNewCollection(null)}>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void act(() => apiCreateCollection(token(), 'formulas', { name: newCollection.trim() }), 'Coleção criada.').then(() => setNewCollection(null)); }}>
            <label className="block text-sm font-semibold">Nome<input className={fieldClass} value={newCollection} maxLength={120} minLength={2} required onChange={(e) => setNewCollection(e.target.value)} placeholder="Ex.: Física — cinemática" /></label>
            <Button type="submit">Criar coleção</Button>
          </form>
        </Modal>
      ) : null}
    </main>
  );
}
