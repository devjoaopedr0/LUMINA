import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getAccessToken } from '@/lib/auth';
import {
  apiCompareExamPapers,
  apiExamPaper,
  apiExamPaperPages,
  apiExamPaperQuestions,
  apiExamPapers,
  type ExamPaper,
  type ExamPaperComparison,
  type ExamPaperPage,
  type ExamPaperQuestion,
} from '@/lib/api';
import {
  adjacentPage,
  pageByNumber,
  pagePosition,
  questionsOnPage,
} from '@/lib/exam-paper-navigation';

const token = () => getAccessToken() ?? '';

const STATUS_STYLE: Record<string, string> = {
  DRAFT: 'bg-graphite-100 text-graphite-700',
  PUBLISHED: 'bg-success-100 text-success-700',
  ARCHIVED: 'bg-amber-100 text-amber-700',
};

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Rascunho',
  PUBLISHED: 'Publicado',
  ARCHIVED: 'Arquivado',
};

type View = 'list' | 'paper' | 'page';

export function PastExams() {
  const [papers, setPapers] = useState<ExamPaper[]>([]);
  const [paper, setPaper] = useState<ExamPaper | null>(null);
  const [pages, setPages] = useState<ExamPaperPage[]>([]);
  const [questions, setQuestions] = useState<ExamPaperQuestion[]>([]);
  const [currentPage, setCurrentPage] = useState<ExamPaperPage | null>(null);
  const [view, setView] = useState<View>('list');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [baseId, setBaseId] = useState('');
  const [compareId, setCompareId] = useState('');
  const [comparison, setComparison] = useState<ExamPaperComparison | null>(null);
  const [compareError, setCompareError] = useState('');

  useEffect(() => {
    apiExamPapers(token())
      .then((rows) => { setPapers(rows); setError(''); })
      .catch(() => setError('Não foi possível carregar as provas.'));
  }, []);

  /** Só edições do mesmo vestibular fazem sentido: o backend recusa o resto
   * e o filtro aqui evita o aluno montar uma combinação que daria erro. */
  const editionsOfSelected = paper
    ? papers.filter((item) => item.examId === paper.examId && item.id !== paper.id)
    : [];

  const pagePositionInfo = currentPage ? pagePosition(pages, currentPage.pageNumber) : null;
  const previousPage = currentPage ? adjacentPage(pages, currentPage.pageNumber, -1) : null;
  const nextPage = currentPage ? adjacentPage(pages, currentPage.pageNumber, 1) : null;
  const currentPageQuestions = currentPage ? questionsOnPage(questions, currentPage.pageNumber) : [];

  async function handleCompare() {
    if (!baseId || !compareId) { setCompareError('Escolha as duas edições.'); return; }
    setCompareError('');
    setComparison(null);
    try {
      setComparison(await apiCompareExamPapers(token(), baseId, compareId));
    } catch (err) {
      setCompareError(err instanceof Error ? err.message : 'Não foi possível comparar as edições.');
    }
  }

  async function openPaper(selected: ExamPaper) {
    setBusy(true);
    setError('');
    try {
      const [detail, pageRows, questionRows] = await Promise.all([
        apiExamPaper(token(), selected.id),
        apiExamPaperPages(token(), selected.id),
        apiExamPaperQuestions(token(), selected.id),
      ]);
      setPaper(detail);
      setPages(pageRows);
      setQuestions(questionRows);
      setCurrentPage(null);
      setView('paper');
    } catch {
      setError('Não foi possível abrir esta prova.');
    } finally {
      setBusy(false);
    }
  }

  function openPage(page: ExamPaperPage) {
    setCurrentPage(page);
    setView('page');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function openPageNumber(pageNumber: number) {
    const page = pageByNumber(pages, pageNumber);
    if (page) openPage(page);
  }

  function backToList() {
    setView('list');
    setPaper(null);
    setPages([]);
    setQuestions([]);
    setCurrentPage(null);
    setBaseId('');
    setCompareId('');
    setComparison(null);
    setCompareError('');
  }

  return (
    <main className="min-h-screen bg-surface-card px-5 py-8 text-graphite sm:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="print:hidden">
          <Link to="/app" className="text-sm font-semibold">← Voltar à visão geral</Link>
        </div>
        <h1 className="mt-6 text-3xl font-bold">Provas Anteriores</h1>
        <p className="mt-2 text-sm text-graphite-500">
          Acervo de provas por ano e vestibular, com navegação por página e a lista de questões
          mapeadas.
        </p>

        {error && <p role="alert" className="my-4 rounded-lg bg-red-50 p-3 text-red-700">{error}</p>}

        {view === 'list' && (
          <section className="mt-6 rounded-xl border bg-white p-5">
            <h2 className="font-bold">Provas disponíveis</h2>
            {papers.length === 0 ? (
              <p className="mt-3 text-sm text-graphite-400">Nenhuma prova publicada no acervo ainda.</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {papers.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => openPaper(item)}
                      disabled={busy}
                      className="block w-full border-b pb-3 text-left last:border-0 hover:underline disabled:opacity-50"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="font-medium">{item.exam?.name ?? 'Prova'} · {item.year}</p>
                          <p className="text-sm text-graphite-400">
                            {[
                              item.pdfUrl ? 'PDF disponível' : null,
                              item.gabaritoJson ? 'gabarito oficial' : null,
                              item.cadernoJson ? 'caderno de questões' : null,
                            ].filter(Boolean).join(' · ') || 'Sem anexos'}
                          </p>                        </div>
                        <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[item.status] ?? STATUS_STYLE.DRAFT}`}>
                          {STATUS_LABEL[item.status] ?? item.status}
                        </span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {view !== 'list' && paper && (
          <>
            <div className="mt-4 flex flex-wrap items-center gap-3 print:hidden">
              <button type="button" onClick={backToList} className="text-sm font-semibold underline">
                ← Voltar à lista
              </button>
              {view === 'page' && (
                <button
                  type="button"
                  onClick={() => { setView('paper'); setCurrentPage(null); }}
                  className="text-sm font-semibold underline"
                >
                  ← Voltar à prova
                </button>
              )}
              {paper.pdfUrl && (
                <a
                  href={paper.pdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg border px-4 py-2 text-sm font-semibold"
                >
                  Abrir PDF
                </a>
              )}
            </div>

            <h2 className="mt-6 text-2xl font-bold">{paper.exam?.name ?? 'Prova'} · {paper.year}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[paper.status] ?? STATUS_STYLE.DRAFT}`}>
                {STATUS_LABEL[paper.status] ?? paper.status}
              </span>
              {paper.gabaritoJson && (
                <span className="rounded bg-success-100 px-2 py-0.5 text-xs font-medium text-success-700">
                  Gabarito oficial
                </span>
              )}
              {paper.cadernoJson && (
                <span className="rounded bg-primary-100 px-2 py-0.5 text-xs font-medium text-primary-700">
                  Caderno de questões
                </span>
              )}
            </div>

            {view === 'paper' && (
              <>
                <section className="mt-6 rounded-xl border bg-white p-5">
                  <h3 className="font-bold">Páginas ({pages.length})</h3>
                  {pages.length === 0 ? (
                    <p className="mt-3 text-sm text-graphite-400">Nenhuma página mapeada para esta prova.</p>
                  ) : (
                    <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
                      {pages.map((page) => (
                        <button
                          key={page.id}
                          type="button"
                          onClick={() => openPage(page)}
                          className="rounded-lg border border-surface-line p-3 text-left hover:border-primary hover:bg-primary/5"
                        >
                          <img
                            src={page.imageUrl}
                            alt={`Miniatura da página ${page.pageNumber}`}
                            loading="lazy"
                            className="mb-2 aspect-[3/4] w-full rounded border border-surface-line bg-surface-card object-contain"
                          />
                          <p className="font-medium">Página {page.pageNumber}</p>
                          {page.textContent && (
                            <p className="text-xs text-graphite-400">com texto extraído</p>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </section>

                <section className="mt-6 rounded-xl border bg-white p-5">
                  <h3 className="font-bold">Questões mapeadas ({questions.length})</h3>
                  {questions.length === 0 ? (
                    <p className="mt-3 text-sm text-graphite-400">
                      As questões desta prova ainda não foram vinculadas ao banco de questões.
                    </p>
                  ) : (
                    <ul className="mt-4 space-y-2">
                      {questions.map((question) => (
                        <li key={question.id} className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 last:border-0">
                          <div>
                            <p className="font-medium">Questão {question.number}</p>
                            <p className="text-sm text-graphite-400">{question.subject}</p>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-graphite-400">
                            {question.area && (
                              <span className="rounded bg-surface-card px-2 py-0.5">{question.area}</span>
                            )}
                            {pageByNumber(pages, question.pageNumber) ? (
                              <button
                                type="button"
                                onClick={() => openPageNumber(question.pageNumber)}
                                title={`Abrir a página ${question.pageNumber}`}
                                className="rounded bg-surface-card px-2 py-0.5 font-medium hover:underline"
                              >
                                pág. {question.pageNumber}
                              </button>
                            ) : (
                              <span>pág. {question.pageNumber}</span>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section className="mt-6 rounded-xl border bg-white p-5">
                  <h3 className="font-bold">Comparar com outra edição</h3>
                  <p className="mt-1 text-sm text-graphite-400">
                    Quantas questões o {paper.exam?.name ?? 'vestibular'} de {paper.year} repetiu em
                    relação à edição mais antiga escolhida.
                  </p>
                  {editionsOfSelected.length === 0 ? (
                    <p className="mt-3 text-sm text-graphite-400">
                      Ainda não há outra edição deste vestibular no acervo para comparar.
                    </p>
                  ) : (
                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      <select
                        aria-label="Edição mais antiga"
                        value={baseId}
                        onChange={(event) => setBaseId(event.target.value)}
                        className="rounded-lg border p-2"
                      >
                        <option value="">Edição base...</option>
                        {editionsOfSelected.map((item) => (
                          <option key={item.id} value={item.id}>{item.year}</option>
                        ))}
                      </select>
                      <select
                        aria-label="Edição comparada"
                        value={compareId}
                        onChange={(event) => setCompareId(event.target.value)}
                        className="rounded-lg border p-2"
                      >
                        <option value="">Edição comparada...</option>
                        {editionsOfSelected.map((item) => (
                          <option key={item.id} value={item.id}>{item.year}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={handleCompare}
                        disabled={!baseId || !compareId}
                        className="rounded-lg bg-graphite px-5 py-2 font-semibold text-white disabled:opacity-50"
                      >
                        Comparar
                      </button>
                    </div>
                  )}

                  {compareError && <p role="alert" className="mt-3 text-sm text-red-600">{compareError}</p>}

                  {comparison && (
                    <div className="mt-4 rounded-lg bg-surface-card p-4">
                      <p className="font-medium">
                        {comparison.base.year} x {comparison.compare.year}: {comparison.similarityScore}% de similaridade
                      </p>
                      <div className="mt-2 grid gap-3 sm:grid-cols-2">
                        <p className="text-sm text-graphite-600">
                          {comparison.repeatedCount} questão(ões) repetida(s) da edição base.
                        </p>
                        <p className="text-sm text-graphite-600">
                          {comparison.newCount} questão(ões) inédita(s) em {comparison.compare.year}.
                        </p>
                      </div>
                    </div>
                  )}
                </section>
              </>
            )}

            {view === 'page' && currentPage && (
              <section className="mt-6 rounded-xl border bg-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div aria-live="polite">
                    <h3 className="font-bold">Página {currentPage.pageNumber}</h3>
                    {pagePositionInfo && (
                      <p className="text-sm text-graphite-400">
                        {pagePositionInfo.index} de {pagePositionInfo.total} páginas
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2 print:hidden">
                    <button
                      type="button"
                      onClick={() => previousPage && openPage(previousPage)}
                      disabled={!previousPage}
                      className="rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-40"
                    >
                      ← Anterior
                    </button>
                    <button
                      type="button"
                      onClick={() => nextPage && openPage(nextPage)}
                      disabled={!nextPage}
                      className="rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-40"
                    >
                      Próxima →
                    </button>
                  </div>
                </div>

                <img
                  src={currentPage.imageUrl}
                  alt={`Página ${currentPage.pageNumber} da prova`}
                  className="mt-4 max-h-[70vh] w-full rounded-lg border object-contain"
                />

                {currentPageQuestions.length > 0 && (
                  <div className="mt-4 rounded-lg bg-surface-card p-4">
                    <p className="font-medium">Questões nesta página</p>
                    <ul className="mt-2 flex flex-wrap gap-2">
                      {currentPageQuestions.map((question) => (
                        <li key={question.id} className="rounded-full bg-white px-3 py-1 text-sm">
                          Questão {question.number}
                          {question.area ? ` · ${question.area}` : ''}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {currentPageQuestions.length === 0 && questions.length > 0 && (
                  <p className="mt-4 text-sm text-graphite-400">
                    Nenhuma questão do banco está mapeada nesta página.
                  </p>
                )}

                {currentPage.textContent && (
                  <details className="mt-4">
                    <summary className="cursor-pointer font-medium text-primary-700">
                      Ver texto extraído da página
                    </summary>
                    <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-surface-card p-3 text-sm text-graphite-600">
                      {currentPage.textContent}
                    </pre>
                  </details>
                )}
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}
