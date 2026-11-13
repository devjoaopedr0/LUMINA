import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, BookMarked, FolderPlus, Layers, Library, Plus, Search, Sparkles, Star, Tags, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/notebooks/Modal';
import { fieldClass } from '@/lib/notebook-ui';
import { RepertoireDetail } from '@/components/notebooks/RepertoireDetail';
import { RepertoireForm } from '@/components/notebooks/RepertoireForm';
import { RepertoireSuggestions } from '@/components/notebooks/RepertoireSuggestions';
import { useAuth } from '@/contexts/AuthContext';
import {
  ApiError,
  apiAddToCollection,
  apiCopyRepertoire,
  apiCreateCollection,
  apiCreateRepertoire,
  apiDeleteCollection,
  apiDeleteRepertoire,
  apiListCollections,
  apiListRepertoires,
  apiRepertoireAi,
  apiRepertoireSummary,
  apiUpdateRepertoire,
} from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import {
  CATEGORY_LABEL,
  REPERTOIRE_CATEGORIES,
  REPERTOIRE_THEMES,
  SORT_LABEL,
  THEME_LABEL,
  atItemLimit,
  categoryLabel,
  isCustomCategory,
  missingRepertoireFields,
  suggestionToPayload,
  usageLabel,
  type NotebookCollection,
  type NotebookScope,
  type NotebookSort,
  type Repertoire,
  type RepertoirePayload,
  type RepertoireQuery,
  type RepertoireSummary,
  type RepertoireTheme,
} from '@/lib/notebooks';

const token = () => getAccessToken() ?? '';
const EMPTY: RepertoirePayload = { title: '', summary: '', category: 'OUTRA', referenceType: 'OUTRO', theme: 'OUTRO' };
const message = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

type FormState = { mode: 'create' | 'edit'; initial: RepertoirePayload; id?: string; title: string } | null;

function toPayload(r: Repertoire): RepertoirePayload {
  const { title, summary, category, author, referenceType, source, year, theme, keywords, relatedThemes, context, importance, essayUse, example, notes, isStudied, isFavorite, isPlatform } = r;
  return { title, summary, category, author, referenceType, source, year, theme, keywords, relatedThemes, context, importance, essayUse, example, notes, isStudied, isFavorite, isPlatform };
}

export function RepertoireNotebook() {
  const { user } = useAuth();
  const isAdmin = user?.accountType === 'ADMIN';
  const [summary, setSummary] = useState<RepertoireSummary | null>(null);
  const [items, setItems] = useState<Repertoire[]>([]);
  const [collections, setCollections] = useState<NotebookCollection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [theme, setTheme] = useState<RepertoireTheme | ''>('');
  const [favorite, setFavorite] = useState(false);
  const [scope, setScope] = useState<NotebookScope>('mine');
  const [collectionId, setCollectionId] = useState('');
  const [sort, setSort] = useState<NotebookSort>('recent');

  const [selected, setSelected] = useState<Repertoire | null>(null);
  const [form, setForm] = useState<FormState>(null);
  const [showAi, setShowAi] = useState(false);
  const [newCollection, setNewCollection] = useState<{ name: string; description: string } | null>(null);
  const [connecting, setConnecting] = useState<string[] | null>(null);
  const [connections, setConnections] = useState<{ text: string; disclaimer: string } | null>(null);

  const query: RepertoireQuery = useMemo(
    () => ({ q: q.trim() || undefined, category: category || undefined, theme: theme || undefined, favorite, scope, collectionId: collectionId || undefined, sort }),
    [q, category, theme, favorite, scope, collectionId, sort],
  );
  const filtersActive = !!(q.trim() || category || theme || favorite || collectionId);

  const reload = useCallback(async () => {
    try {
      const [rows, sum, cols] = await Promise.all([apiListRepertoires(token(), query), apiRepertoireSummary(token()), apiListCollections(token(), 'repertoires')]);
      setItems(rows);
      setSummary(sum);
      setCollections(cols);
      setError('');
    } catch (e) {
      setError(message(e, 'Não foi possível carregar o caderno de repertórios.'));
    } finally {
      setLoading(false);
    }
  }, [query]);

  // A busca espera o aluno parar de digitar.
  useEffect(() => {
    const timer = window.setTimeout(() => void reload(), 250);
    return () => window.clearTimeout(timer);
  }, [reload]);

  const customCategories = useMemo(
    () => [...new Set((summary?.byCategory ?? []).map((c) => c.category).filter(isCustomCategory))].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [summary],
  );
  const full = summary ? atItemLimit(summary.total, summary.plan) : false;

  async function save(payload: RepertoirePayload) {
    if (form?.mode === 'edit' && form.id) {
      const updated = await apiUpdateRepertoire(token(), form.id, payload);
      setSelected((s) => (s && s.id === updated.id ? { ...s, ...updated } : s));
      setNotice('Repertório atualizado.');
    } else {
      await apiCreateRepertoire(token(), payload);
      setNotice(payload.origin === 'AI' ? 'Sugestão revisada e salva no caderno.' : 'Repertório salvo no caderno.');
    }
    setForm(null);
    await reload();
  }

  async function act(action: () => Promise<unknown>, done: string) {
    try {
      await action();
      setNotice(done);
      await reload();
    } catch (e) {
      setError(message(e, 'Não foi possível concluir.'));
    }
  }

  async function connect() {
    if (!connecting || connecting.length < 2) return;
    try {
      const result = await apiRepertoireAi(token(), { action: 'connections', ids: connecting });
      setConnections({ text: result.text ?? '', disclaimer: result.disclaimer });
      setConnecting(null);
    } catch (e) {
      setError(message(e, 'A LuminIA não respondeu.'));
    }
  }

  return (
    <main className="min-h-screen bg-surface-card px-5 py-8 text-graphite sm:px-8">
      <div className="mx-auto max-w-6xl">
        <Link to="/app" className="inline-flex items-center gap-2 text-sm font-semibold"><ArrowLeft size={16} />Voltar à visão geral</Link>

        <header className="my-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="inline-flex items-center gap-2 text-sm font-semibold text-primary-700"><BookMarked size={20} />Redação</span>
            <h1 className="mt-3 text-3xl font-bold">Caderno de Repertórios</h1>
            <p className="mt-3 max-w-3xl text-graphite-500">
              Sua biblioteca de repertórios socioculturais: registre o que estudar, organize por categoria e coleção, consulte o acervo da Lumina e peça ajuda à LuminIA para usar cada referência com pertinência.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setShowAi(true)}><Sparkles className="h-4 w-4" />Sugestões da LuminIA</Button>
            <Button onClick={() => (full ? setError(`O plano Gratuito guarda até ${summary?.plan.itemLimit} repertórios. Veja o Premium em "Meu plano".`) : setForm({ mode: 'create', initial: EMPTY, title: 'Novo repertório' }))}>
              <Plus className="h-4 w-4" />Adicionar repertório
            </Button>
          </div>
        </header>

        {summary ? (
          <div className="mb-6 grid gap-3 sm:grid-cols-4">
            {[
              { icon: Library, label: 'Repertórios salvos', value: usageLabel(summary.total, summary.plan) },
              { icon: Tags, label: 'Categorias usadas', value: summary.categoriesUsed },
              { icon: Star, label: 'Favoritos', value: summary.favorites },
              { icon: Layers, label: 'No acervo Lumina', value: summary.platformAvailable },
            ].map(({ icon: Icon, label, value }) => (
              <Card key={label} className="bg-white p-4">
                <p className="flex items-center gap-2 text-xs text-graphite-400"><Icon className="h-4 w-4" />{label}</p>
                <p className="mt-1 text-2xl font-bold">{value}</p>
              </Card>
            ))}
          </div>
        ) : null}
        {full ? (
          <p className="mb-5 rounded-xl bg-primary/10 p-4 text-sm">
            Você chegou ao limite do plano Gratuito. <Link to="/app/plano" className="font-semibold underline">Com o Premium o caderno é ilimitado.</Link>
          </p>
        ) : null}

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
          <div className="mt-4 grid gap-3 md:grid-cols-[2fr_1fr_1fr_1fr]">
            <label className="relative block">
              <span className="sr-only">Buscar</span>
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-graphite-400" />
              <input className={`${fieldClass} mt-0 pl-9`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Título, autor, conceito, tema ou palavra-chave" />
            </label>
            <select aria-label="Categoria" className={`${fieldClass} mt-0`} value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">Todas as categorias</option>
              {REPERTOIRE_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
              {customCategories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select aria-label="Tema" className={`${fieldClass} mt-0`} value={theme} onChange={(e) => setTheme(e.target.value as RepertoireTheme | '')}>
              <option value="">Todos os temas</option>
              {REPERTOIRE_THEMES.map((t) => <option key={t} value={t}>{THEME_LABEL[t]}</option>)}
            </select>
            <select aria-label="Ordenar" className={`${fieldClass} mt-0`} value={sort} onChange={(e) => setSort(e.target.value as NotebookSort)}>
              {(Object.keys(SORT_LABEL) as NotebookSort[]).map((s) => <option key={s} value={s}>{SORT_LABEL[s]}</option>)}
            </select>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <label className="mr-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={favorite} onChange={(e) => setFavorite(e.target.checked)} />Só favoritos</label>
            {scope === 'mine' ? (
              <>
                {collections.map((c) => (
                  <span key={c.id} className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold ${collectionId === c.id ? 'border-primary bg-primary/15' : 'border-surface-line'}`}>
                    <button type="button" onClick={() => setCollectionId(collectionId === c.id ? '' : c.id)} title={c.description ?? undefined}>{c.name} ({c.itemCount})</button>
                    <button type="button" aria-label={`Apagar a coleção ${c.name}`} onClick={() => void act(() => apiDeleteCollection(token(), 'repertoires', c.id).then(() => collectionId === c.id && setCollectionId('')), 'Coleção apagada (os repertórios continuam no caderno).')}><X className="h-3 w-3" /></button>
                  </span>
                ))}
                <button type="button" onClick={() => setNewCollection({ name: '', description: '' })} className="inline-flex items-center gap-1 rounded-full border border-dashed border-surface-line px-3 py-1 text-xs font-semibold">
                  <FolderPlus className="h-3 w-3" />Nova coleção
                </button>
                {items.length >= 2 ? (
                  <button type="button" onClick={() => setConnecting([])} className="inline-flex items-center gap-1 rounded-full border border-dashed border-surface-line px-3 py-1 text-xs font-semibold">
                    <Sparkles className="h-3 w-3" />Conectar repertórios
                  </button>
                ) : null}
              </>
            ) : null}
            {filtersActive ? <button type="button" className="text-xs font-semibold underline" onClick={() => { setQ(''); setCategory(''); setTheme(''); setFavorite(false); setCollectionId(''); }}>Limpar filtros</button> : null}
          </div>
        </Card>

        {!filtersActive && scope === 'mine' && summary?.recent.length ? (
          <p className="mb-3 text-sm text-graphite-500">Adicionados recentemente: {summary.recent.map((r) => r.title).join(' · ')}</p>
        ) : null}

        {loading ? <p role="status" className="rounded-xl bg-white p-6 text-sm text-graphite-500">Carregando o caderno…</p> : null}
        {!loading && !items.length ? (
          <Card className="bg-white p-8 text-center">
            <p className="font-semibold">{filtersActive ? 'Nada encontrado com esses filtros.' : scope === 'platform' ? 'O acervo da Lumina ainda está vazio.' : 'Seu caderno ainda está vazio.'}</p>
            <p className="mt-2 text-sm text-graphite-500">{scope === 'mine' && !filtersActive ? 'Adicione um repertório ou peça sugestões à LuminIA para um tema.' : ''}</p>
          </Card>
        ) : null}

        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((r) => {
            const missing = r.isPlatform ? 0 : missingRepertoireFields(r).length;
            const checked = connecting?.includes(r.id) ?? false;
            return (
              <li key={r.id}>
                <Card className={`flex h-full flex-col bg-white p-5 transition ${checked ? 'ring-2 ring-primary' : ''}`}>
                  <div className="flex items-start justify-between gap-2">
                    <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-[11px] font-semibold text-primary-700">{categoryLabel(r.category)}</span>
                    {r.isFavorite ? <Star className="h-4 w-4 fill-primary text-primary" aria-label="Favorito" /> : null}
                  </div>
                  <h2 className="mt-3 font-bold leading-snug">{r.title}</h2>
                  {r.author ? <p className="text-xs text-graphite-500">{r.author}</p> : null}
                  <p className="mt-2 line-clamp-3 text-sm text-graphite-600">{r.summary}</p>
                  <div className="mt-auto flex flex-wrap items-center gap-2 pt-4 text-[11px] text-graphite-400">
                    {r.isPlatform ? <span>Acervo Lumina</span> : null}
                    {r.origin === 'AI' ? <span>Sugerido pela LuminIA</span> : null}
                    {missing ? <span className="text-amber-700">Incompleto ({missing})</span> : null}
                  </div>
                  {connecting ? (
                    <label className="mt-3 flex items-center gap-2 text-sm font-semibold">
                      <input type="checkbox" checked={checked} disabled={!checked && connecting.length >= 4}
                        onChange={(e) => setConnecting((ids) => (e.target.checked ? [...(ids ?? []), r.id] : (ids ?? []).filter((id) => id !== r.id)))} />
                      Incluir na conexão
                    </label>
                  ) : (
                    <Button size="sm" variant="outline" className="mt-3" onClick={() => setSelected(r)}>Ver repertório</Button>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>

        {connecting ? (
          <div className="fixed inset-x-0 bottom-0 z-40 border-t border-surface-line bg-white p-4 shadow-2xl">
            <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
              <p className="text-sm">Escolha de 2 a 4 repertórios para a LuminIA mostrar as conexões ({connecting.length} escolhidos).</p>
              <div className="flex gap-2">
                <Button size="sm" disabled={connecting.length < 2} onClick={() => void connect()}><Sparkles className="h-4 w-4" />Ver conexões</Button>
                <Button size="sm" variant="ghost" onClick={() => setConnecting(null)}>Cancelar</Button>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {selected ? (
        <RepertoireDetail
          repertoire={selected}
          collections={collections}
          onClose={() => setSelected(null)}
          onEdit={!selected.isPlatform || isAdmin ? () => { setForm({ mode: 'edit', id: selected.id, initial: toPayload(selected), title: 'Editar repertório' }); setSelected(null); } : undefined}
          onDelete={!selected.isPlatform || isAdmin ? async () => { await act(() => apiDeleteRepertoire(token(), selected.id), 'Repertório excluído.'); setSelected(null); } : undefined}
          onToggleFavorite={!selected.isPlatform ? async () => {
            const updated = await apiUpdateRepertoire(token(), selected.id, { isFavorite: !selected.isFavorite });
            setSelected({ ...selected, ...updated });
            await reload();
          } : undefined}
          onSaveToNotebook={selected.isPlatform && !isAdmin ? async () => {
            try {
              await apiCopyRepertoire(token(), selected.id);
              setNotice('Repertório salvo no seu caderno.');
              setSelected(null);
              await reload();
            } catch (e) {
              setError(message(e, 'Não foi possível salvar.'));
            }
          } : undefined}
          onAddToCollection={!selected.isPlatform ? async (id) => {
            await apiAddToCollection(token(), 'repertoires', id, [selected.id]);
            setSelected({ ...selected, collectionIds: [...(selected.collectionIds ?? []), id] });
            await reload();
          } : undefined}
        />
      ) : null}

      {form ? (
        <RepertoireForm title={form.title} initial={form.initial} customCategories={customCategories} canPublish={isAdmin} onSubmit={save} onClose={() => setForm(null)} />
      ) : null}

      {showAi ? (
        <Modal title="Sugestões da LuminIA" onClose={() => setShowAi(false)} wide>
          <p className="mb-4 text-sm text-graphite-500">
            Informe o tema e a LuminIA sugere repertórios pertinentes. Cada sugestão passa pela sua revisão antes de entrar no caderno.
          </p>
          <RepertoireSuggestions
            onReview={(s, t) => {
              setShowAi(false);
              setForm({ mode: 'create', initial: suggestionToPayload(s, t), title: 'Revisar sugestão da LuminIA' });
            }}
          />
        </Modal>
      ) : null}

      {newCollection ? (
        <Modal title="Nova coleção" onClose={() => setNewCollection(null)}>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void act(() => apiCreateCollection(token(), 'repertoires', { name: newCollection.name.trim(), description: newCollection.description.trim() || null }), 'Coleção criada.').then(() => setNewCollection(null));
            }}
          >
            <label className="block text-sm font-semibold">Nome<input className={fieldClass} value={newCollection.name} maxLength={120} required minLength={2} onChange={(e) => setNewCollection({ ...newCollection, name: e.target.value })} placeholder="Ex.: Repertórios para educação" /></label>
            <label className="block text-sm font-semibold">Descrição<textarea rows={2} className={fieldClass} value={newCollection.description} onChange={(e) => setNewCollection({ ...newCollection, description: e.target.value })} /></label>
            <Button type="submit">Criar coleção</Button>
          </form>
        </Modal>
      ) : null}

      {connections ? (
        <Modal title="Conexões entre repertórios" onClose={() => setConnections(null)} wide>
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{connections.text}</p>
          <p className="mt-3 text-xs text-graphite-400">{connections.disclaimer}</p>
        </Modal>
      ) : null}
    </main>
  );
}
