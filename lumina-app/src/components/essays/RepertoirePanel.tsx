import { useEffect, useState } from 'react';
import { BookMarked, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { RepertoireDetail } from '@/components/notebooks/RepertoireDetail';
import { RepertoireForm } from '@/components/notebooks/RepertoireForm';
import { RepertoireSuggestions } from '@/components/notebooks/RepertoireSuggestions';
import { ApiError, apiCreateRepertoire, apiListRepertoires } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { fieldClass } from '@/lib/notebook-ui';
import { categoryLabel, suggestionToPayload, type Repertoire, type RepertoirePayload } from '@/lib/notebooks';

/**
 * Caderno de Repertórios dentro do editor de redação: abre ao lado do texto
 * (o editor continua montado, nada do que foi escrito se perde), busca no
 * caderno e no acervo, mostra o repertório, copia ou insere no texto e pede
 * sugestões da LuminIA para o tema da redação.
 */
export function RepertoirePanel({ theme, onInsert, onClose }: { theme: string; onInsert: (text: string) => void; onClose: () => void }) {
  const [tab, setTab] = useState<'notebook' | 'ai'>('notebook');
  const [q, setQ] = useState('');
  const [items, setItems] = useState<Repertoire[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Repertoire | null>(null);
  const [review, setReview] = useState<RepertoirePayload | null>(null);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      apiListRepertoires(getAccessToken() ?? '', { q: q.trim() || undefined, scope: 'all', sort: 'favorites' })
        .then((rows) => { if (active) { setItems(rows); setError(''); } })
        .catch((e) => { if (active) setError(e instanceof ApiError ? e.message : 'Não foi possível carregar o caderno.'); })
        .finally(() => { if (active) setLoading(false); });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [q]);

  return (
    <aside aria-label="Caderno de Repertórios" className="fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col border-l border-surface-line bg-white shadow-2xl">
      <div className="flex items-center justify-between border-b border-surface-line p-4">
        <h2 className="flex items-center gap-2 font-bold"><BookMarked className="h-5 w-5 text-primary-700" />Repertórios</h2>
        <button type="button" aria-label="Fechar repertórios" onClick={onClose} className="rounded-lg p-2 hover:bg-graphite/5"><X className="h-5 w-5" /></button>
      </div>
      <div className="flex gap-2 border-b border-surface-line px-4 py-3" role="tablist">
        {(['notebook', 'ai'] as const).map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold ${tab === t ? 'bg-graphite text-white' : 'bg-surface-card'}`}>
            {t === 'notebook' ? 'Meu caderno' : 'Sugestões para o tema'}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {notice ? <p role="status" className="mb-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p> : null}
        {tab === 'notebook' ? (
          <>
            <label className="relative block">
              <span className="sr-only">Buscar repertório</span>
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-graphite-400" />
              <input className={`${fieldClass} mt-0 pl-9`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por título, autor, tema…" />
            </label>
            {theme.trim().length >= 3 ? (
              <button type="button" className="mt-2 text-xs font-semibold underline" onClick={() => setQ(theme.trim().split(/\s+/).find((w) => w.length > 5) ?? theme.trim())}>
                Buscar por uma palavra do tema
              </button>
            ) : null}
            {error ? <p role="alert" className="mt-3 text-sm text-red-700">{error}</p> : null}
            {loading ? <p role="status" className="mt-3 text-sm text-graphite-500">Carregando…</p> : null}
            {!loading && !items.length ? <p className="mt-4 text-sm text-graphite-500">Nenhum repertório encontrado. Veja as sugestões para o tema.</p> : null}
            <ul className="mt-3 space-y-2">
              {items.map((r) => (
                <li key={r.id}>
                  <button type="button" onClick={() => setSelected(r)} className="w-full rounded-xl border border-surface-line p-3 text-left hover:border-primary">
                    <p className="text-sm font-semibold">{r.title}</p>
                    <p className="text-xs text-graphite-500">{[r.author, categoryLabel(r.category), r.isPlatform ? 'Acervo Lumina' : null].filter(Boolean).join(' · ')}</p>
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <RepertoireSuggestions initialTheme={theme} onReview={(s, t) => setReview(suggestionToPayload(s, t))} />
        )}
      </div>

      {selected ? (
        <RepertoireDetail
          repertoire={selected}
          defaultTheme={theme}
          onClose={() => setSelected(null)}
          onInsert={(text) => { onInsert(text); setSelected(null); setNotice('Trecho inserido na redação. Ajuste ao seu texto.'); }}
        />
      ) : null}
      {review ? (
        <RepertoireForm
          title="Revisar e salvar no caderno"
          initial={review}
          customCategories={[]}
          onClose={() => setReview(null)}
          onSubmit={async (payload) => {
            await apiCreateRepertoire(getAccessToken() ?? '', payload);
            setReview(null);
            setNotice('Repertório salvo no caderno.');
            setTab('notebook');
            setQ(payload.title);
          }}
        />
      ) : null}
      <div className="border-t border-surface-line p-4">
        <Button variant="ghost" size="sm" onClick={onClose}>Voltar ao texto</Button>
      </div>
    </aside>
  );
}
