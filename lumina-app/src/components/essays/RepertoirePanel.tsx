import { useEffect, useState } from 'react';
import { BookMarked, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { RepertoireDetail } from '@/components/notebooks/RepertoireDetail';
import { RepertoireForm } from '@/components/notebooks/RepertoireForm';
import { RepertoireSuggestions } from '@/components/notebooks/RepertoireSuggestions';
import { ApiError, apiCreateRepertoire, apiListRepertoires, apiRepertoireAi } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { fieldClass } from '@/lib/notebook-ui';
import { USE_VERDICT_LABEL, categoryLabel, suggestionToPayload, type Repertoire, type RepertoirePayload, type UseAnalysis } from '@/lib/notebooks';

/**
 * Caderno de Repertórios dentro do editor de redação: abre ao lado do texto
 * (o editor continua montado, nada do que foi escrito se perde), busca no
 * caderno e no acervo, mostra o repertório, copia ou insere no texto e pede
 * sugestões da LuminIA para o tema da redação.
 */
export function RepertoirePanel({ theme, onInsert, onClose, currentParagraph }: { theme: string; onInsert: (text: string) => void; onClose: () => void; currentParagraph?: () => string }) {
  const [tab, setTab] = useState<'notebook' | 'ai' | 'analyze'>('notebook');
  const [paragraph, setParagraph] = useState('');
  const [analysis, setAnalysis] = useState<UseAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState('');

  async function analyze() {
    setAnalyzing(true);
    setAnalyzeError('');
    setAnalysis(null);
    try {
      const result = await apiRepertoireAi(getAccessToken() ?? '', { action: 'analyzeUse', paragraph: paragraph.trim(), theme: theme.trim() || undefined });
      setAnalysis(result.analysis ?? null);
    } catch (e) {
      setAnalyzeError(e instanceof ApiError ? e.message : 'A LuminIA não respondeu. Tente de novo.');
    } finally {
      setAnalyzing(false);
    }
  }
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
        {(['notebook', 'ai', 'analyze'] as const).map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t}
            onClick={() => { setTab(t); if (t === 'analyze' && !paragraph && currentParagraph) setParagraph(currentParagraph()); }}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold ${tab === t ? 'bg-graphite text-white' : 'bg-surface-card'}`}>
            {{ notebook: 'Meu caderno', ai: 'Sugestões para o tema', analyze: 'Analisar meu parágrafo' }[t]}
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
        ) : tab === 'ai' ? (
          <RepertoireSuggestions initialTheme={theme} onReview={(s, t) => setReview(suggestionToPayload(s, t))} />
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-graphite-500">A LuminIA verifica se o repertório do parágrafo é produtivo (explicado, ligado ao tema e sustentando o argumento) ou só decorativo.</p>
            <textarea rows={7} className={fieldClass} value={paragraph} onChange={(e) => setParagraph(e.target.value)} placeholder="Cole aqui o parágrafo (ou posicione o cursor nele antes de abrir)" aria-label="Parágrafo para analisar" />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={analyzing || paragraph.trim().length < 40} onClick={() => void analyze()}>{analyzing ? 'Analisando…' : 'Analisar uso do repertório'}</Button>
              {currentParagraph ? <Button size="sm" variant="ghost" onClick={() => setParagraph(currentParagraph())}>Usar o parágrafo do cursor</Button> : null}
            </div>
            {paragraph.trim().length > 0 && paragraph.trim().length < 40 ? <p className="text-xs text-graphite-400">Escreva ao menos 40 caracteres.</p> : null}
            {analyzeError ? <p role="alert" className="text-sm text-red-700">{analyzeError}</p> : null}
            {analysis ? (
              <div className="space-y-2 rounded-2xl border border-surface-line p-3 text-sm">
                <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${analysis.verdict === 'PRODUTIVO' ? 'bg-emerald-50 text-emerald-800' : analysis.verdict === 'SUPERFICIAL' ? 'bg-amber-50 text-amber-800' : 'bg-red-50 text-red-700'}`}>
                  {USE_VERDICT_LABEL[analysis.verdict]}
                </span>
                {analysis.repertoire ? <p><span className="font-semibold">Repertório:</span> {analysis.repertoire}</p> : null}
                {analysis.excerpt ? <blockquote className="border-l-4 border-surface-line pl-3 italic">{analysis.excerpt}</blockquote> : null}
                <p>{analysis.explanation}</p>
                {analysis.tips.length ? <ul className="list-disc pl-5">{analysis.tips.map((tip) => <li key={tip}>{tip}</li>)}</ul> : null}
              </div>
            ) : null}
          </div>
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
