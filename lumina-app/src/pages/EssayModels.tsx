import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getAccessToken } from '@/lib/auth';
import {
  apiGetEssayModel,
  apiListEssayModels,
  type EssayModel,
  type EssayModelFilters,
} from '@/lib/api';

const token = () => getAccessToken() ?? '';

const COMPETENCIES = ['C1', 'C2', 'C3', 'C4', 'C5'] as const;
type Competency = (typeof COMPETENCIES)[number];

const COMPETENCY_LABEL: Record<Competency, string> = {
  C1: 'C1 · Norma culta',
  C2: 'C2 · Compreensão do tema',
  C3: 'C3 · Argumentação',
  C4: 'C4 · Coesão e coerência',
  C5: 'C5 · Proposta de intervenção',
};

const COMPETENCY_STYLE: Record<Competency, string> = {
  C1: 'bg-blue-50 text-blue-800 border-blue-200',
  C2: 'bg-green-50 text-green-800 border-green-200',
  C3: 'bg-purple-50 text-purple-800 border-purple-200',
  C4: 'bg-amber-50 text-amber-800 border-amber-200',
  C5: 'bg-red-50 text-red-800 border-red-200',
};

const EXAMS = ['ENEM', 'FUVEST', 'UNICAMP', 'UECE', 'OUTRO'];

type View = 'list' | 'detail' | 'compare';

export function EssayModels() {
  const [models, setModels] = useState<EssayModel[]>([]);
  const [selected, setSelected] = useState<EssayModel | null>(null);
  const [filters, setFilters] = useState<EssayModelFilters>({ page: 1, limit: 10 });
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [view, setView] = useState<View>('list');
  const [mine, setMine] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setBusy(true);
    apiListEssayModels(token(), filters)
      .then((data) => {
        if (!active) return;
        setModels(data.items);
        setTotal(data.total);
        setTotalPages(data.totalPages);
        setError('');
      })
      .catch(() => { if (active) setError('Não foi possível carregar os modelos de redação.'); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [filters]);

  async function openModel(model: EssayModel) {
    setError('');
    try {
      setSelected(await apiGetEssayModel(token(), model.id));
      setView('detail');
    } catch {
      setError('Não foi possível abrir este modelo.');
    }
  }

  const wordCount = useMemo(() => (mine.match(/\S+/g) ?? []).length, [mine]);

  return (
    <main className="min-h-screen bg-surface-card px-5 py-8 text-graphite sm:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="print:hidden">
          <Link to="/app" className="text-sm font-semibold">← Voltar à visão geral</Link>
        </div>
        <h1 className="mt-6 text-3xl font-bold">Modelos de Redação Nota Mil</h1>
        <p className="mt-2 text-sm text-graphite-500">
          Redações oficiais com nota alta, anotadas por competência (C1 a C5) para você comparar
          com a sua e entender o que diferencia cada uma.
        </p>

        {error && <p role="alert" className="my-4 rounded-lg bg-red-50 p-3 text-red-700">{error}</p>}

        {view === 'list' && (
          <>
            <section className="mt-6 rounded-xl border bg-white p-5">
              <h2 className="font-bold">Filtros</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-4">
                <input
                  aria-label="Filtrar por tema"
                  value={filters.theme ?? ''}
                  onChange={(event) =>
                    setFilters({ ...filters, theme: event.target.value || undefined, page: 1 })
                  }
                  placeholder="Buscar por tema..."
                  className="rounded-lg border p-2 sm:col-span-2"
                />
                <input
                  aria-label="Filtrar por ano"
                  type="number"
                  min={2009}
                  max={new Date().getFullYear()}
                  value={filters.year ?? ''}
                  onChange={(event) =>
                    setFilters({ ...filters, year: event.target.value ? Number(event.target.value) : undefined, page: 1 })
                  }
                  placeholder="Ano"
                  className="rounded-lg border p-2"
                />
                <select
                  aria-label="Filtrar por vestibular"
                  value={filters.exam ?? ''}
                  onChange={(event) => setFilters({ ...filters, exam: event.target.value || undefined, page: 1 })}
                  className="rounded-lg border p-2"
                >
                  <option value="">Todos os vestibulares</option>
                  {EXAMS.map((exam) => <option key={exam} value={exam}>{exam}</option>)}
                </select>
              </div>
            </section>

            <section className="mt-6 rounded-xl border bg-white p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-bold">Modelos disponíveis ({total})</h2>
                {busy && <span className="text-sm text-graphite-400">Carregando...</span>}
              </div>

              {models.length === 0 ? (
                <p className="py-8 text-center text-sm text-graphite-400">
                  Nenhum modelo encontrado com esses filtros.
                </p>
              ) : (
                <ul className="space-y-3">
                  {models.map((model) => (
                    <li key={model.id}>
                      <button
                        type="button"
                        onClick={() => openModel(model)}
                        className="block w-full border-b pb-3 text-left last:border-0 hover:underline"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="font-medium">{model.theme}</p>
                            <p className="text-sm text-graphite-400">{model.exam} · {model.year}</p>
                          </div>
                          <span className="rounded bg-success-100 px-2 py-0.5 text-xs font-medium text-success-700">
                            {model.totalScore}/1000
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {COMPETENCIES.map((competency) => (
                            <span
                              key={competency}
                              className={`rounded border px-2 py-0.5 text-xs font-medium ${COMPETENCY_STYLE[competency]}`}
                            >
                              {competency}: {model.competencies?.[competency] ?? 0}
                            </span>
                          ))}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {totalPages > 1 && (
                <div className="mt-4 flex items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => setFilters({ ...filters, page: (filters.page ?? 1) - 1 })}
                    disabled={busy || (filters.page ?? 1) <= 1}
                    className="rounded-lg border px-3 py-1 disabled:opacity-50"
                  >
                    Anterior
                  </button>
                  <span className="text-sm text-graphite-500">
                    Página {filters.page ?? 1} de {totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setFilters({ ...filters, page: (filters.page ?? 1) + 1 })}
                    disabled={busy || (filters.page ?? 1) >= totalPages}
                    className="rounded-lg border px-3 py-1 disabled:opacity-50"
                  >
                    Próxima
                  </button>
                </div>
              )}
            </section>
          </>
        )}

        {view !== 'list' && selected && (
          <>
            <div className="mt-4 flex flex-wrap items-center gap-3 print:hidden">
              <button
                type="button"
                onClick={() => { setView('list'); setSelected(null); setMine(''); }}
                className="text-sm font-semibold underline"
              >
                ← Voltar à lista
              </button>
              {view === 'detail' && (
                <button
                  type="button"
                  onClick={() => setView('compare')}
                  className="rounded-lg border px-4 py-2 text-sm font-semibold"
                >
                  Comparar com a minha redação
                </button>
              )}
              {view === 'compare' && (
                <button type="button" onClick={() => setView('detail')} className="text-sm font-semibold underline">
                  ← Ver só o modelo
                </button>
              )}
              {selected.pdfUrl && (
                <a
                  href={selected.pdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg bg-primary-50 px-4 py-2 text-sm text-primary-700"
                >
                  Abrir PDF original
                </a>
              )}
            </div>

            <article className="mt-6 rounded-xl border bg-white p-5">
              <header>
                <h2 className="text-2xl font-bold">{selected.theme}</h2>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-graphite-500">
                  <span>{selected.exam} · {selected.year}</span>
                  <span className="rounded bg-success-100 px-2 py-0.5 text-xs font-medium text-success-700">
                    Nota {selected.totalScore}/1000
                  </span>
                </div>
              </header>

              <section className="mt-6 rounded-lg bg-success-50 p-4">
                <h3 className="font-semibold">Desempenho por competência</h3>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  {COMPETENCIES.map((competency) => (
                    <div key={competency} className={`rounded-lg border p-3 ${COMPETENCY_STYLE[competency]}`}>
                      <p className="text-xs font-semibold">{COMPETENCY_LABEL[competency]}</p>
                      <p className="mt-1 text-2xl font-bold">{selected.competencies?.[competency] ?? 0}/200</p>
                    </div>
                  ))}
                </div>
              </section>

              {view === 'compare' ? (
                <section className="mt-6 grid gap-4 md:grid-cols-2">
                  <div>
                    <h3 className="mb-2 font-semibold">Minha redação ({wordCount} palavras)</h3>
                    <textarea
                      aria-label="Cole aqui a sua redação"
                      value={mine}
                      onChange={(event) => setMine(event.target.value)}
                      placeholder="Cole aqui a sua redação para comparar com o modelo..."
                      spellCheck={false}
                      className="min-h-[320px] w-full rounded-lg border p-3 font-mono text-sm"
                    />
                  </div>
                  <div>
                    <h3 className="mb-2 font-semibold">Modelo: {selected.theme}</h3>
                    <pre className="min-h-[320px] whitespace-pre-wrap rounded-lg bg-surface-card p-3 font-mono text-sm text-graphite-700">
                      {selected.text}
                    </pre>
                  </div>
                </section>
              ) : (
                <section className="mt-6">
                  <h3 className="mb-2 font-semibold">Texto da redação</h3>
                  <pre className="whitespace-pre-wrap rounded-lg bg-surface-card p-4 text-graphite-700">
                    {selected.text}
                  </pre>
                </section>
              )}

              {selected.highlights && (
                <section className="mt-6">
                  <h3 className="mb-2 font-semibold">Destaques anotados</h3>
                  <div className="space-y-3">
                    {COMPETENCIES.filter((competency) => selected.highlights?.[competency]).map((competency) => (
                      <div key={competency} className={`rounded-lg border p-3 ${COMPETENCY_STYLE[competency]}`}>
                        <p className="text-xs font-semibold">{COMPETENCY_LABEL[competency]}</p>
                        <p className="mt-1 text-sm">{selected.highlights?.[competency]}</p>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </article>
          </>
        )}
      </div>
    </main>
  );
}
