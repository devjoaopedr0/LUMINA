import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ListChecks, RefreshCw, Trash2 } from 'lucide-react';
import { getAccessToken } from '@/lib/auth';
import {
  ApiError,
  apiCreateSimulation,
  apiGenerateList,
  apiGetSubjectTopics,
  apiListSubjects,
  apiSimulationClasses,
  type GeneratedList,
  type GenerateListPayload,
  type Subject,
} from '@/lib/api';

const DIFFICULTY = { FACIL: 'Fácil', MEDIA: 'Média', DIFICIL: 'Difícil' } as const;
const errorText = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

/** Gerador de listas (item 37): critérios → prévia → criar a lista (aluno ou turma). */
export function ListGeneratorPage() {
  const navigate = useNavigate();
  const token = () => getAccessToken() ?? '';
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [topics, setTopics] = useState<Array<{ id: string; name: string }>>([]);
  const [classes, setClasses] = useState<Array<{ id: string; name: string }>>([]);
  const [criteria, setCriteria] = useState<GenerateListPayload>({ count: 15, basis: 'filters', skipMastered: true });
  const [preview, setPreview] = useState<GeneratedList | null>(null);
  const [title, setTitle] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiListSubjects(token()).then(setSubjects).catch(() => setSubjects([]));
    apiSimulationClasses(token()).then((rows) => setClasses(rows.filter((c) => c.isTeacher).map((c) => ({ id: c.id, name: c.name })))).catch(() => setClasses([]));
  }, []);

  useEffect(() => {
    if (!criteria.subjectId) { setTopics([]); return; }
    apiGetSubjectTopics(token(), criteria.subjectId).then((s) => setTopics(s.topics ?? [])).catch(() => setTopics([]));
  }, [criteria.subjectId]);

  const set = (patch: Partial<GenerateListPayload>) => setCriteria((c) => ({ ...c, ...patch }));

  async function generate(event?: FormEvent) {
    event?.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await apiGenerateList(token(), criteria);
      setPreview(res);
      setTitle(res.title);
    } catch (e) {
      setError(errorText(e, 'Não foi possível gerar a lista.'));
    } finally {
      setBusy(false);
    }
  }

  async function create() {
    if (!preview?.questions.length) return;
    setBusy(true);
    setError('');
    try {
      const sim = await apiCreateSimulation(
        token(),
        title.trim() || preview.title,
        preview.questions.map((q) => q.id),
        criteria.classId || undefined,
        'LIST',
        criteria.classId && dueAt ? new Date(dueAt).toISOString() : undefined,
      );
      navigate(`/app/simulados?id=${sim.id}`);
    } catch (e) {
      setError(errorText(e, 'Não foi possível criar a lista.'));
      setBusy(false);
    }
  }

  const forClass = Boolean(criteria.classId);
  return (
    <main className="min-h-screen bg-surface-card px-4 py-8 text-graphite sm:px-8">
      <div className="mx-auto max-w-4xl">
        <Link to="/app/simulados" className="inline-flex items-center gap-1 text-sm font-semibold"><ArrowLeft size={15} />Simulados</Link>
        <h1 className="mt-6 flex items-center gap-2 text-3xl font-bold"><ListChecks size={26} />Gerador de listas</h1>
        <p className="mt-1 text-sm text-graphite-500">Escolha os critérios, confira a prévia e crie a lista. {classes.length ? 'Professores podem gerar para a turma, com base nas dificuldades dela.' : 'A lista pode se basear nos assuntos em que você mais erra.'}</p>

        <form onSubmit={generate} className="mt-6 grid gap-4 rounded-2xl border bg-white p-5 text-sm sm:grid-cols-2">
          {classes.length > 0 && (
            <label className="block sm:col-span-2">Para quem
              <select value={criteria.classId ?? ''} onChange={(e) => set({ classId: e.target.value || undefined })} className="mt-1 w-full rounded-lg border bg-white p-2">
                <option value="">Para mim</option>
                {classes.map((c) => <option key={c.id} value={c.id}>Turma {c.name}</option>)}
              </select>
            </label>
          )}
          <fieldset className="sm:col-span-2">
            <legend className="font-medium">Base da lista</legend>
            <div className="mt-1 flex flex-wrap gap-4">
              <label className="flex items-center gap-2"><input type="radio" name="basis" checked={criteria.basis === 'filters'} onChange={() => set({ basis: 'filters' })} className="accent-graphite" />Pelos filtros</label>
              <label className="flex items-center gap-2"><input type="radio" name="basis" checked={criteria.basis === 'weaknesses'} onChange={() => set({ basis: 'weaknesses' })} className="accent-graphite" />{forClass ? 'Nas dificuldades da turma' : 'Nas minhas dificuldades'}</label>
            </div>
          </fieldset>
          <label className="block">Quantidade
            <input type="number" min={5} max={60} value={criteria.count} onChange={(e) => set({ count: Number(e.target.value) })} className="mt-1 w-full rounded-lg border p-2" />
          </label>
          <label className="block">Dificuldade
            <select value={criteria.difficulty ?? ''} onChange={(e) => set({ difficulty: (e.target.value || undefined) as GenerateListPayload['difficulty'] })} className="mt-1 w-full rounded-lg border bg-white p-2">
              <option value="">Qualquer</option>
              {Object.entries(DIFFICULTY).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          {criteria.basis === 'filters' && (
            <>
              <label className="block">Matéria
                <select value={criteria.subjectId ?? ''} onChange={(e) => set({ subjectId: e.target.value || undefined, topicId: undefined })} className="mt-1 w-full rounded-lg border bg-white p-2">
                  <option value="">Todas</option>
                  {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
              <label className="block">Assunto
                <select value={criteria.topicId ?? ''} disabled={!topics.length} onChange={(e) => set({ topicId: e.target.value || undefined })} className="mt-1 w-full rounded-lg border bg-white p-2 disabled:opacity-60">
                  <option value="">Todos</option>
                  {topics.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </label>
            </>
          )}
          <label className="block">Prova <span className="text-graphite-500">(opcional)</span>
            <input value={criteria.exam ?? ''} onChange={(e) => set({ exam: e.target.value || undefined })} placeholder="Ex.: ENEM" maxLength={60} className="mt-1 w-full rounded-lg border p-2" />
          </label>
          <label className="block">Ano <span className="text-graphite-500">(opcional)</span>
            <input type="number" min={1990} max={2100} value={criteria.year ?? ''} onChange={(e) => set({ year: e.target.value ? Number(e.target.value) : undefined })} className="mt-1 w-full rounded-lg border p-2" />
          </label>
          {!forClass && (
            <label className="flex items-center gap-2 sm:col-span-2">
              <input type="checkbox" checked={criteria.skipMastered ?? false} onChange={(e) => set({ skipMastered: e.target.checked })} className="h-4 w-4 accent-graphite" />
              Não repetir questões que acertei nos últimos 90 dias
            </label>
          )}
          <div className="sm:col-span-2">
            <button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-full bg-graphite px-5 py-2.5 font-semibold text-white disabled:opacity-60"><RefreshCw size={15} />{preview ? 'Gerar de novo' : 'Gerar prévia'}</button>
          </div>
        </form>

        {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}

        {preview && (
          <section className="mt-6 rounded-2xl border bg-white p-5 text-sm" aria-labelledby="preview-title">
            <h2 id="preview-title" className="text-lg font-semibold">Prévia: {preview.questions.length} de {preview.requested} questões</h2>
            {preview.weakTopics.length > 0 && (
              <p className="mt-1 text-graphite-500">Baseada {preview.forClass ? 'nas dificuldades da turma' : 'nas suas dificuldades'}: {preview.weakTopics.map((t) => `${t.name} (${t.mastery}%)`).join(', ')}.</p>
            )}
            {preview.warnings.map((w) => <p key={w} className="mt-2 rounded-xl bg-amber-50 p-3 text-amber-900">{w}</p>)}

            <ol className="mt-3 divide-y">
              {preview.questions.map((q, i) => (
                <li key={q.id} className="flex items-start gap-3 py-2">
                  <span className="w-6 shrink-0 text-right tabular-nums text-graphite-500">{i + 1}.</span>
                  <span className="min-w-0 flex-1">
                    <span className="block">{q.stem}</span>
                    <span className="block text-xs text-graphite-500">{q.subject} · {q.topic} · {DIFFICULTY[q.difficulty]} · {q.exam}{q.year ? ` ${q.year}` : ''}</span>
                  </span>
                  <button type="button" aria-label={`Tirar a questão ${i + 1}`} onClick={() => setPreview({ ...preview, questions: preview.questions.filter((x) => x.id !== q.id) })} className="rounded-full p-1 text-graphite-400 hover:text-red-700"><Trash2 size={14} /></button>
                </li>
              ))}
            </ol>

            {preview.questions.length > 0 && (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="block">Nome da lista
                  <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} className="mt-1 w-full rounded-lg border p-2" />
                </label>
                {forClass && (
                  <label className="block">Prazo para a turma <span className="text-graphite-500">(opcional)</span>
                    <input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} className="mt-1 w-full rounded-lg border p-2" />
                  </label>
                )}
                <div className="sm:col-span-2">
                  <button type="button" disabled={busy || !title.trim()} onClick={() => void create()} className="rounded-full bg-primary px-5 py-2.5 font-semibold text-graphite disabled:opacity-60">
                    {forClass ? 'Criar lista e avisar a turma' : 'Criar minha lista'}
                  </button>
                </div>
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
