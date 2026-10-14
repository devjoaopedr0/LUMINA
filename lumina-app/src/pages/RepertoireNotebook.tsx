import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getAccessToken } from '@/lib/auth';
import {
  apiCreateRepertoire,
  apiDeleteRepertoire,
  apiListRepertoires,
  apiUpdateRepertoire,
  type CreateRepertoirePayload,
  type Repertoire,
  type UpdateRepertoirePayload,
} from '@/lib/api';

const token = () => getAccessToken() ?? '';

const THEMES = [
  'TECNOLOGIA',
  'MEIO_AMBIENTE',
  'SAUDE',
  'POLITICA',
  'EDUCACAO',
  'ECONOMIA',
  'CULTURA',
  'CIENCIA',
  'DIREITOS_HUMANOS',
  'OUTRO',
] as const;
type Theme = (typeof THEMES)[number];

const THEME_LABEL: Record<Theme, string> = {
  TECNOLOGIA: 'Tecnologia',
  MEIO_AMBIENTE: 'Meio ambiente',
  SAUDE: 'Saúde',
  POLITICA: 'Política',
  EDUCACAO: 'Educação',
  ECONOMIA: 'Economia',
  CULTURA: 'Cultura',
  CIENCIA: 'Ciência',
  DIREITOS_HUMANOS: 'Direitos humanos',
  OUTRO: 'Outro',
};

const EMPTY_FORM: CreateRepertoirePayload = {
  title: '',
  summary: '',
  source: '',
  year: null,
  theme: 'TECNOLOGIA',
  keywords: [],
  isStudied: false,
};

export function RepertoireNotebook() {
  const [repertoires, setRepertoires] = useState<Repertoire[]>([]);
  const [search, setSearch] = useState('');
  const [theme, setTheme] = useState<'' | Theme>('');
  const [onlyStudied, setOnlyStudied] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CreateRepertoirePayload>(EMPTY_FORM);
  const [keywordDraft, setKeywordDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    apiListRepertoires(token())
      .then((rows) => { setRepertoires(rows); setError(''); })
      .catch(() => setError('Não foi possível carregar o caderno de repertórios.'));
  }, []);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return repertoires.filter((repertoire) => {
      if (theme && repertoire.theme !== theme) return false;
      if (onlyStudied && !repertoire.isStudied) return false;
      if (!needle) return true;
      return (
        repertoire.title.toLowerCase().includes(needle) ||
        repertoire.summary.toLowerCase().includes(needle) ||
        repertoire.keywords.some((keyword) => keyword.toLowerCase().includes(needle))
      );
    });
  }, [repertoires, search, theme, onlyStudied]);

  function addKeyword() {
    const keyword = keywordDraft.trim();
    if (!keyword) return;
    const keywords = form.keywords ?? [];
    if (keywords.some((existing) => existing.toLowerCase() === keyword.toLowerCase())) {
      setKeywordDraft('');
      return;
    }
    if (keywords.length >= 20) {
      setError('O limite é de 20 palavras-chave por repertório.');
      setKeywordDraft('');
      return;
    }
    setForm({ ...form, keywords: [...keywords, keyword] });
    setKeywordDraft('');
  }

  function removeKeyword(keyword: string) {
    setForm({ ...form, keywords: (form.keywords ?? []).filter((item) => item !== keyword) });
  }

  function startEdit(repertoire: Repertoire) {
    setEditingId(repertoire.id);
    setForm({
      title: repertoire.title,
      summary: repertoire.summary,
      source: repertoire.source ?? '',
      year: repertoire.year,
      theme: repertoire.theme as Theme,
      keywords: repertoire.keywords,
      isStudied: repertoire.isStudied,
    });
    setError('');
    setSuccess('');
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setKeywordDraft('');
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!form.title.trim() || form.summary.trim().length < 10) {
      setError('Informe o título e um resumo com pelo menos 10 caracteres.');
      return;
    }
    if ((form.keywords ?? []).length === 0) {
      setError('Adicione ao menos uma palavra-chave para achar o repertório na hora da redação.');
      return;
    }
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      if (editingId) {
        await apiUpdateRepertoire(token(), editingId, form as UpdateRepertoirePayload);
        setSuccess('Repertório atualizado.');
      } else {
        await apiCreateRepertoire(token(), form);
        setSuccess('Repertório salvo no caderno.');
      }
      cancelEdit();
      setRepertoires(await apiListRepertoires(token()));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar o repertório.');
    } finally {
      setBusy(false);
    }
  }

  async function toggleStudied(repertoire: Repertoire) {
    try {
      await apiUpdateRepertoire(token(), repertoire.id, { isStudied: !repertoire.isStudied });
      setRepertoires(await apiListRepertoires(token()));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao atualizar o repertório.');
    }
  }

  async function handleDelete(repertoire: Repertoire) {
    if (!window.confirm(`Excluir o repertório "${repertoire.title}"?`)) return;
    try {
      await apiDeleteRepertoire(token(), repertoire.id);
      if (editingId === repertoire.id) cancelEdit();
      setRepertoires(await apiListRepertoires(token()));
      setSuccess('Repertório excluído.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao excluir o repertório.');
    }
  }

  return (
    <main className="min-h-screen bg-surface-card px-5 py-8 text-graphite sm:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="print:hidden">
          <Link to="/app" className="text-sm font-semibold">← Voltar à visão geral</Link>
        </div>
        <h1 className="mt-6 text-3xl font-bold">Caderno de Repertórios</h1>
        <p className="mt-2 text-sm text-graphite-500">
          Repertórios socioculturais organizados por tema, com fonte e ano para você citar com
          precisão na redação.
        </p>

        {error && <p role="alert" className="my-4 rounded-lg bg-red-50 p-3 text-red-700">{error}</p>}
        {success && <p role="status" className="my-4 rounded-lg bg-success-50 p-3 text-success-700">{success}</p>}

        <section className="mt-6 rounded-xl border bg-white p-5">
          <h2 className="font-bold">{editingId ? 'Editar repertório' : 'Novo repertório'}</h2>
          <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={handleSubmit}>
            <label className="block sm:col-span-2">
              <span className="text-sm font-medium">Título</span>
              <input
                value={form.title}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
                placeholder="Ex.: George Orwell — 1984"
                className="mt-1 w-full rounded-lg border p-2"
                required
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium">Fonte</span>
              <input
                value={form.source ?? ''}
                onChange={(event) => setForm({ ...form, source: event.target.value })}
                placeholder="Livro, artigo, filme, lei..."
                className="mt-1 w-full rounded-lg border p-2"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium">Ano</span>
              <input
                type="number"
                min={1900}
                max={2100}
                value={form.year ?? ''}
                onChange={(event) =>
                  setForm({ ...form, year: event.target.value ? Number(event.target.value) : null })
                }
                placeholder="Opcional"
                className="mt-1 w-full rounded-lg border p-2"
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="text-sm font-medium">Tema</span>
              <select
                value={form.theme}
                onChange={(event) => setForm({ ...form, theme: event.target.value as Theme })}
                className="mt-1 w-full rounded-lg border p-2"
              >
                {THEMES.map((option) => (
                  <option key={option} value={option}>{THEME_LABEL[option]}</option>
                ))}
              </select>
            </label>
            <label className="block sm:col-span-2">
              <span className="text-sm font-medium">Resumo</span>
              <textarea
                value={form.summary}
                onChange={(event) => setForm({ ...form, summary: event.target.value })}
                placeholder="Ideias principais, dados e argumentos que você quer lembrar na hora de escrever."
                className="mt-1 min-h-[100px] w-full rounded-lg border p-2"
                required
              />
            </label>
            <div className="sm:col-span-2">
              <span className="text-sm font-medium">Palavras-chave</span>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                {(form.keywords ?? []).map((keyword) => (
                  <span key={keyword} className="inline-flex items-center gap-1 rounded bg-primary-100 px-2 py-1 text-sm text-primary-700">
                    {keyword}
                    <button
                      type="button"
                      onClick={() => removeKeyword(keyword)}
                      aria-label={`Remover ${keyword}`}
                      className="hover:text-primary-900"
                    >
                      ×
                    </button>
                  </span>
                ))}
                <input
                  value={keywordDraft}
                  onChange={(event) => setKeywordDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter') return;
                    event.preventDefault();
                    addKeyword();
                  }}
                  onBlur={addKeyword}
                  placeholder="Adicionar e pressionar Enter"
                  className="min-w-[200px] flex-1 rounded-lg border p-2"
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-graphite-500">
              <input
                type="checkbox"
                checked={form.isStudied ?? false}
                onChange={(event) => setForm({ ...form, isStudied: event.target.checked })}
                className="rounded border"
              />
              Já domino este repertório
            </label>
            <div className="flex gap-3 sm:justify-end">
              <button
                type="submit"
                disabled={busy}
                className="rounded-lg bg-graphite px-5 py-2 text-white disabled:opacity-50"
              >
                {busy ? 'Salvando...' : editingId ? 'Atualizar' : 'Salvar'}
              </button>
              {editingId && (
                <button type="button" onClick={cancelEdit} className="rounded-lg border px-5 py-2 text-graphite">
                  Cancelar
                </button>
              )}
            </div>
          </form>
        </section>

        <section className="mt-6 rounded-xl border bg-white p-5">
          <h2 className="font-bold">Meus repertórios ({filtered.length})</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-4">
            <input
              aria-label="Buscar repertórios"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por título, resumo ou palavra-chave..."
              className="rounded-lg border p-2 sm:col-span-2"
            />
            <select
              aria-label="Filtrar por tema"
              value={theme}
              onChange={(event) => setTheme(event.target.value as '' | Theme)}
              className="rounded-lg border p-2"
            >
              <option value="">Todos os temas</option>
              {THEMES.map((option) => (
                <option key={option} value={option}>{THEME_LABEL[option]}</option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-sm text-graphite-500">
              <input
                type="checkbox"
                checked={onlyStudied}
                onChange={(event) => setOnlyStudied(event.target.checked)}
                className="rounded border"
              />
              Só os dominados
            </label>
          </div>

          {filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-graphite-400">
              {repertoires.length === 0
                ? 'Seu caderno está vazio. Salve o primeiro repertório acima.'
                : 'Nenhum repertório encontrado com esses filtros.'}
            </p>
          ) : (
            <ul className="mt-4 space-y-3">
              {filtered.map((repertoire) => (
                <li key={repertoire.id} className="rounded-xl border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{repertoire.title}</span>
                        <span className="rounded bg-primary-100 px-2 py-0.5 text-xs font-medium text-primary-700">
                          {THEME_LABEL[repertoire.theme as Theme] ?? repertoire.theme}
                        </span>
                        {repertoire.isStudied && (
                          <span className="text-xs font-medium text-success-700">✓ dominado</span>
                        )}
                      </div>
                      <p className="mt-2 text-sm text-graphite-600">{repertoire.summary}</p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {repertoire.keywords.map((keyword) => (
                          <span key={keyword} className="rounded bg-surface-card px-2 py-0.5 text-xs text-graphite-500">
                            {keyword}
                          </span>
                        ))}
                      </div>
                      {(repertoire.source || repertoire.year) && (
                        <p className="mt-2 text-xs text-graphite-400">
                          {[repertoire.source, repertoire.year].filter(Boolean).join(' · ')}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <button
                        type="button"
                        onClick={() => toggleStudied(repertoire)}
                        aria-label={repertoire.isStudied ? 'Marcar como não dominado' : 'Marcar como dominado'}
                      >
                        {repertoire.isStudied ? '✓' : '○'}
                      </button>
                      <button
                        type="button"
                        onClick={() => startEdit(repertoire)}
                        className="text-sm text-primary-700 hover:underline"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(repertoire)}
                        className="text-sm text-red-600 hover:underline"
                      >
                        Excluir
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
