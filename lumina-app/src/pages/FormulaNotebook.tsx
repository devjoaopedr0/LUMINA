import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getAccessToken } from '@/lib/auth';
import {
  apiCreateFormula,
  apiDeleteFormula,
  apiListFormulas,
  apiUpdateFormula,
  type CreateFormulaPayload,
  type Formula,
  type UpdateFormulaPayload,
} from '@/lib/api';

const token = () => getAccessToken() ?? '';

const DISCIPLINES = ['MATEMATICA', 'FISICA', 'QUIMICA', 'BIOLOGIA', 'OUTRA'] as const;
type Discipline = (typeof DISCIPLINES)[number];

const DISCIPLINE_LABEL: Record<Discipline, string> = {
  MATEMATICA: 'Matemática',
  FISICA: 'Física',
  QUIMICA: 'Química',
  BIOLOGIA: 'Biologia',
  OUTRA: 'Outra',
};

const DISCIPLINE_STYLE: Record<Discipline, string> = {
  MATEMATICA: 'bg-blue-50 text-blue-800',
  FISICA: 'bg-green-50 text-green-800',
  QUIMICA: 'bg-purple-50 text-purple-800',
  BIOLOGIA: 'bg-red-50 text-red-800',
  OUTRA: 'bg-graphite-100 text-graphite-700',
};

const EMPTY_FORM: CreateFormulaPayload = {
  name: '',
  discipline: 'MATEMATICA',
  topic: '',
  latex: '',
  description: '',
  isFavorite: false,
};

export function FormulaNotebook() {
  const [formulas, setFormulas] = useState<Formula[]>([]);
  const [search, setSearch] = useState('');
  const [discipline, setDiscipline] = useState<'' | Discipline>('');
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CreateFormulaPayload>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    apiListFormulas(token())
      .then((rows) => { setFormulas(rows); setError(''); })
      .catch(() => setError('Não foi possível carregar o caderno de fórmulas.'));
  }, []);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return formulas.filter((formula) => {
      if (discipline && formula.discipline !== discipline) return false;
      if (onlyFavorites && !formula.isFavorite) return false;
      if (!needle) return true;
      return (
        formula.name.toLowerCase().includes(needle) ||
        formula.latex.toLowerCase().includes(needle) ||
        (formula.topic ?? '').toLowerCase().includes(needle)
      );
    });
  }, [formulas, search, discipline, onlyFavorites]);

  function startEdit(formula: Formula) {
    setEditingId(formula.id);
    setForm({
      name: formula.name,
      discipline: formula.discipline,
      topic: formula.topic ?? '',
      latex: formula.latex,
      description: formula.description ?? '',
      isFavorite: formula.isFavorite,
    });
    setError('');
    setSuccess('');
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!form.name.trim() || !form.latex.trim()) {
      setError('Nome e LaTeX são obrigatórios.');
      return;
    }
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      if (editingId) {
        await apiUpdateFormula(token(), editingId, form as UpdateFormulaPayload);
        setSuccess('Fórmula atualizada.');
      } else {
        await apiCreateFormula(token(), form);
        setSuccess('Fórmula salva no caderno.');
      }
      cancelEdit();
      setFormulas(await apiListFormulas(token()));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar a fórmula.');
    } finally {
      setBusy(false);
    }
  }

  async function toggleFavorite(formula: Formula) {
    setFormulas(await apiListFormulas(token()));
    try {
      await apiUpdateFormula(token(), formula.id, { isFavorite: !formula.isFavorite });
      setFormulas(await apiListFormulas(token()));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao atualizar o favorito.');
    }
  }

  async function handleDelete(formula: Formula) {
    if (!window.confirm(`Excluir a fórmula "${formula.name}"?`)) return;
    try {
      await apiDeleteFormula(token(), formula.id);
      if (editingId === formula.id) cancelEdit();
      setFormulas(await apiListFormulas(token()));
      setSuccess('Fórmula excluída.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao excluir a fórmula.');
    }
  }

  return (
    <main className="min-h-screen bg-surface-card px-5 py-8 text-graphite sm:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="print:hidden">
          <Link to="/app" className="text-sm font-semibold">← Voltar à visão geral</Link>
        </div>
        <h1 className="mt-6 text-3xl font-bold">Caderno de Fórmulas</h1>
        <p className="mt-2 text-sm text-graphite-500">
          Guarde as fórmulas por disciplina e assunto, com a expressão em LaTeX e as suas
          anotações de quando usar.
        </p>

        {error && <p role="alert" className="my-4 rounded-lg bg-red-50 p-3 text-red-700">{error}</p>}
        {success && <p role="status" className="my-4 rounded-lg bg-success-50 p-3 text-success-700">{success}</p>}

        <section className="mt-6 rounded-xl border bg-white p-5">
          <h2 className="font-bold">{editingId ? 'Editar fórmula' : 'Nova fórmula'}</h2>
          <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={handleSubmit}>
            <label className="block sm:col-span-2">
              <span className="text-sm font-medium">Nome</span>
              <input
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                placeholder="Ex.: Fórmula de Bhaskara"
                className="mt-1 w-full rounded-lg border p-2"
                required
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium">Disciplina</span>
              <select
                value={form.discipline}
                onChange={(event) => setForm({ ...form, discipline: event.target.value as Discipline })}
                className="mt-1 w-full rounded-lg border p-2"
              >
                {DISCIPLINES.map((option) => (
                  <option key={option} value={option}>{DISCIPLINE_LABEL[option]}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium">Assunto</span>
              <input
                value={form.topic ?? ''}
                onChange={(event) => setForm({ ...form, topic: event.target.value })}
                placeholder="Ex.: Funções quadráticas"
                className="mt-1 w-full rounded-lg border p-2"
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="text-sm font-medium">LaTeX</span>
              <textarea
                value={form.latex}
                onChange={(event) => setForm({ ...form, latex: event.target.value })}
                placeholder={'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}'}
                spellCheck={false}
                className="mt-1 min-h-[90px] w-full rounded-lg border p-2 font-mono text-sm"
                required
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="text-sm font-medium">Anotações (quando usar, variações, macetes)</span>
              <textarea
                value={form.description ?? ''}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
                placeholder="Opcional"
                className="mt-1 min-h-[70px] w-full rounded-lg border p-2"
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-graphite-500">
              <input
                type="checkbox"
                checked={form.isFavorite ?? false}
                onChange={(event) => setForm({ ...form, isFavorite: event.target.checked })}
                className="rounded border"
              />
              Marcar como favorita
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
          <h2 className="font-bold">Minhas fórmulas ({filtered.length})</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-4">
            <input
              aria-label="Buscar fórmulas"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por nome, LaTeX ou assunto..."
              className="rounded-lg border p-2 sm:col-span-2"
            />
            <select
              aria-label="Filtrar por disciplina"
              value={discipline}
              onChange={(event) => setDiscipline(event.target.value as '' | Discipline)}
              className="rounded-lg border p-2"
            >
              <option value="">Todas as disciplinas</option>
              {DISCIPLINES.map((option) => (
                <option key={option} value={option}>{DISCIPLINE_LABEL[option]}</option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-sm text-graphite-500">
              <input
                type="checkbox"
                checked={onlyFavorites}
                onChange={(event) => setOnlyFavorites(event.target.checked)}
                className="rounded border"
              />
              Só favoritas
            </label>
          </div>

          {filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-graphite-400">
              {formulas.length === 0
                ? 'Seu caderno está vazio. Salve a primeira fórmula acima.'
                : 'Nenhuma fórmula encontrada com esses filtros.'}
            </p>
          ) : (
            <ul className="mt-4 space-y-3">
              {filtered.map((formula) => (
                <li key={formula.id} className="rounded-xl border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{formula.name}</span>
                        <span className={`rounded px-2 py-0.5 text-xs font-medium ${DISCIPLINE_STYLE[formula.discipline] ?? DISCIPLINE_STYLE.OUTRA}`}>
                          {DISCIPLINE_LABEL[formula.discipline] ?? formula.discipline}
                        </span>
                        {formula.topic && (
                          <span className="rounded bg-surface-card px-2 py-0.5 text-xs text-graphite-500">
                            {formula.topic}
                          </span>
                        )}
                      </div>
                      <pre className="mt-2 overflow-x-auto rounded bg-surface-card p-2 font-mono text-sm">
                        {formula.latex}
                      </pre>
                      {formula.description && (
                        <p className="mt-2 text-sm text-graphite-500">{formula.description}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <button
                        type="button"
                        onClick={() => toggleFavorite(formula)}
                        aria-label={formula.isFavorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
                        className="text-lg"
                      >
                        {formula.isFavorite ? '★' : '☆'}
                      </button>
                      <button
                        type="button"
                        onClick={() => startEdit(formula)}
                        className="text-sm text-primary-700 hover:underline"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(formula)}
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
