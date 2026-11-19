import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, FileText, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { getAccessToken } from '@/lib/auth';
import { useAuth } from '@/contexts/AuthContext';
import {
  ApiError,
  apiCreateExamVersions,
  apiGenerateExam,
  apiGetSubjectTopics,
  apiListSubjects,
  apiSimulationClasses,
  type CreatedExam,
  type ExamDifficulty,
  type GeneratedExam,
  type Subject,
} from '@/lib/api';

const DIFF_LABEL: Record<ExamDifficulty, string> = { FACIL: 'Fácil', MEDIA: 'Média', DIFICIL: 'Difícil' };
const STAFF = ['TEACHER', 'COORDINATOR', 'DIRECTOR'];
const errorText = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

interface SectionDraft { subjectId: string; count: number; topicId: string; topics: Array<{ id: string; name: string }> }

/** Gerador de provas (item 38): seções → prévia → versões com gabarito. */
export function ExamGeneratorPage() {
  const { user } = useAuth();
  const token = () => getAccessToken() ?? '';
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [classes, setClasses] = useState<Array<{ id: string; name: string }>>([]);
  const [sections, setSections] = useState<SectionDraft[]>([{ subjectId: '', count: 10, topicId: '', topics: [] }]);
  const [useMix, setUseMix] = useState(true);
  const [mix, setMix] = useState<Record<ExamDifficulty, number>>({ FACIL: 30, MEDIA: 50, DIFICIL: 20 });
  const [skills, setSkills] = useState('');
  const [exam, setExam] = useState('');
  const [classId, setClassId] = useState('');
  const [preview, setPreview] = useState<GeneratedExam | null>(null);
  const [title, setTitle] = useState('');
  const [versions, setVersions] = useState(2);
  const [shuffleAlternatives, setShuffleAlternatives] = useState(true);
  const [duration, setDuration] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [sheet, setSheet] = useState(true);
  const [created, setCreated] = useState<CreatedExam | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const isStaff = Boolean(user && STAFF.includes(user.accountType));

  useEffect(() => {
    apiListSubjects(token()).then(setSubjects).catch(() => setSubjects([]));
    apiSimulationClasses(token()).then((rows) => setClasses(rows.filter((c) => c.isTeacher).map((c) => ({ id: c.id, name: c.name })))).catch(() => setClasses([]));
  }, []);

  async function setSection(i: number, patch: Partial<SectionDraft>) {
    setSections((list) => list.map((s, j) => (j === i ? { ...s, ...patch } : s)));
    if (patch.subjectId !== undefined) {
      const topics = patch.subjectId ? (await apiGetSubjectTopics(token(), patch.subjectId).catch(() => ({ topics: [] }))).topics ?? [] : [];
      setSections((list) => list.map((s, j) => (j === i ? { ...s, topics, topicId: '' } : s)));
    }
  }

  const total = sections.reduce((s, x) => s + (x.subjectId ? x.count : 0), 0);
  const mixTotal = mix.FACIL + mix.MEDIA + mix.DIFICIL;

  async function generate(event?: FormEvent) {
    event?.preventDefault();
    const valid = sections.filter((s) => s.subjectId && s.count > 0);
    if (!valid.length) return setError('Escolha ao menos uma disciplina.');
    if (useMix && mixTotal !== 100) return setError('As porcentagens de dificuldade precisam somar 100%.');
    setBusy(true);
    setError('');
    setCreated(null);
    try {
      const res = await apiGenerateExam(token(), {
        sections: valid.map((s) => ({ subjectId: s.subjectId, count: s.count, ...(s.topicId ? { topicId: s.topicId } : {}) })),
        ...(useMix ? { difficultyMix: mix } : {}),
        ...(skills.trim() ? { skills: skills.split(/[,\s]+/).filter(Boolean) } : {}),
        ...(exam.trim() ? { exam: exam.trim() } : {}),
        ...(classId ? { classId } : {}),
      });
      setPreview(res);
      setTitle(res.title);
    } catch (e) {
      setError(errorText(e, 'Não foi possível gerar a prova.'));
    } finally {
      setBusy(false);
    }
  }

  async function create() {
    if (!preview?.questions.length) return;
    setBusy(true);
    setError('');
    try {
      const res = await apiCreateExamVersions(token(), {
        title: title.trim() || preview.title,
        questionIds: preview.questions.map((q) => q.id),
        versions,
        shuffleAlternatives,
        ...(classId ? { classId } : {}),
        ...(classId && dueAt ? { dueAt: new Date(dueAt).toISOString() } : {}),
        ...(duration ? { durationMinutes: Number(duration) } : {}),
        generateAnswerSheet: isStaff && sheet,
      });
      setCreated(res);
    } catch (e) {
      setError(errorText(e, 'Não foi possível criar a prova.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-surface-card px-4 py-8 text-graphite sm:px-8">
      <div className="mx-auto max-w-4xl">
        <Link to="/app/simulados" className="inline-flex items-center gap-1 text-sm font-semibold"><ArrowLeft size={15} />Simulados</Link>
        <h1 className="mt-6 flex items-center gap-2 text-3xl font-bold"><FileText size={26} />Gerador de provas</h1>
        <p className="mt-1 text-sm text-graphite-500">Monte a prova por disciplina, com a mistura de dificuldade que quiser, e gere até 4 versões com gabaritos próprios.</p>

        <form onSubmit={generate} className="mt-6 space-y-5 rounded-2xl border bg-white p-5 text-sm">
          {classes.length > 0 && (
            <label className="block">Para quem
              <select value={classId} onChange={(e) => setClassId(e.target.value)} className="mt-1 w-full rounded-lg border bg-white p-2">
                <option value="">Para mim</option>
                {classes.map((c) => <option key={c.id} value={c.id}>Turma {c.name}</option>)}
              </select>
            </label>
          )}

          <fieldset>
            <legend className="font-medium">Disciplinas ({total} questões)</legend>
            <div className="mt-2 space-y-2">
              {sections.map((s, i) => (
                <div key={i} className="grid gap-2 sm:grid-cols-[2fr_2fr_1fr_auto]">
                  <select aria-label={`Disciplina ${i + 1}`} value={s.subjectId} onChange={(e) => void setSection(i, { subjectId: e.target.value })} className="rounded-lg border bg-white p-2">
                    <option value="">Escolha a disciplina</option>
                    {subjects.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>
                  <select aria-label={`Assunto ${i + 1}`} value={s.topicId} disabled={!s.topics.length} onChange={(e) => void setSection(i, { topicId: e.target.value })} className="rounded-lg border bg-white p-2 disabled:opacity-60">
                    <option value="">Todos os assuntos</option>
                    {s.topics.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  <input aria-label={`Quantidade ${i + 1}`} type="number" min={1} max={45} value={s.count} onChange={(e) => void setSection(i, { count: Number(e.target.value) })} className="rounded-lg border p-2" />
                  <button type="button" aria-label="Tirar disciplina" disabled={sections.length === 1} onClick={() => setSections((l) => l.filter((_, j) => j !== i))} className="rounded-lg border px-2 text-graphite-500 disabled:opacity-40"><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
            {sections.length < 8 && (
              <button type="button" onClick={() => setSections((l) => [...l, { subjectId: '', count: 10, topicId: '', topics: [] }])} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold underline"><Plus size={12} />Adicionar disciplina</button>
            )}
          </fieldset>

          <fieldset>
            <legend className="font-medium">Dificuldade</legend>
            <label className="mt-1 flex items-center gap-2"><input type="checkbox" checked={useMix} onChange={(e) => setUseMix(e.target.checked)} className="h-4 w-4 accent-graphite" />Definir a mistura</label>
            {useMix && (
              <div className="mt-2 grid grid-cols-3 gap-2">
                {(Object.keys(DIFF_LABEL) as ExamDifficulty[]).map((d) => (
                  <label key={d} className="block">{DIFF_LABEL[d]} (%)
                    <input type="number" min={0} max={100} value={mix[d]} onChange={(e) => setMix({ ...mix, [d]: Number(e.target.value) })} className="mt-1 w-full rounded-lg border p-2" />
                  </label>
                ))}
                <p className={`col-span-3 text-xs ${mixTotal === 100 ? 'text-graphite-500' : 'text-red-700'}`}>Soma: {mixTotal}%</p>
              </div>
            )}
          </fieldset>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">Habilidades do ENEM <span className="text-graphite-500">(opcional)</span>
              <input value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="Ex.: MT-H17, MT-H21" className="mt-1 w-full rounded-lg border p-2" />
            </label>
            <label className="block">Prova de origem <span className="text-graphite-500">(opcional)</span>
              <input value={exam} onChange={(e) => setExam(e.target.value)} placeholder="Ex.: ENEM" maxLength={60} className="mt-1 w-full rounded-lg border p-2" />
            </label>
          </div>

          <button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-full bg-graphite px-5 py-2.5 font-semibold text-white disabled:opacity-60"><RefreshCw size={15} />{preview ? 'Gerar de novo' : 'Gerar prévia'}</button>
        </form>

        {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}

        {preview && !created && (
          <section className="mt-6 rounded-2xl border bg-white p-5 text-sm" aria-labelledby="exam-preview">
            <h2 id="exam-preview" className="text-lg font-semibold">Prévia: {preview.questions.length} de {preview.requested} questões</h2>
            <p className="mt-1 text-graphite-500">
              {preview.sections.map((s) => `${s.subject}: ${s.found}/${s.requested}`).join(' · ')} · {(Object.keys(DIFF_LABEL) as ExamDifficulty[]).map((d) => `${DIFF_LABEL[d]}: ${preview.difficultyActual[d]}`).join(', ')}
            </p>
            {preview.warnings.map((w) => <p key={w} className="mt-2 rounded-xl bg-amber-50 p-3 text-amber-900">{w}</p>)}
            <ol className="mt-3 divide-y">
              {preview.questions.map((q, i) => (
                <li key={q.id} className="flex items-start gap-3 py-2">
                  <span className="w-6 shrink-0 text-right tabular-nums text-graphite-500">{i + 1}.</span>
                  <span className="min-w-0 flex-1">
                    <span className="block">{q.stem}</span>
                    <span className="block text-xs text-graphite-500">{q.subject} · {q.topic} · {DIFF_LABEL[q.difficulty]}{q.enemSkill ? ` · ${q.enemSkill}` : ''} · {q.exam}{q.year ? ` ${q.year}` : ''}</span>
                  </span>
                  <button type="button" aria-label={`Tirar a questão ${i + 1}`} onClick={() => setPreview({ ...preview, questions: preview.questions.filter((x) => x.id !== q.id) })} className="rounded-full p-1 text-graphite-400 hover:text-red-700"><Trash2 size={14} /></button>
                </li>
              ))}
            </ol>

            {preview.questions.length > 0 && (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="block sm:col-span-2">Nome da prova
                  <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={150} className="mt-1 w-full rounded-lg border p-2" />
                </label>
                <label className="block">Versões
                  <select value={versions} onChange={(e) => setVersions(Number(e.target.value))} className="mt-1 w-full rounded-lg border bg-white p-2">
                    {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n === 1 ? '1 versão' : `${n} versões (A a ${String.fromCharCode(64 + n)})`}</option>)}
                  </select>
                </label>
                <label className="block">Duração em minutos <span className="text-graphite-500">(opcional)</span>
                  <input type="number" min={5} max={600} value={duration} onChange={(e) => setDuration(e.target.value)} className="mt-1 w-full rounded-lg border p-2" />
                </label>
                {versions > 1 && (
                  <label className="flex items-center gap-2 sm:col-span-2"><input type="checkbox" checked={shuffleAlternatives} onChange={(e) => setShuffleAlternatives(e.target.checked)} className="h-4 w-4 accent-graphite" />Embaralhar também as alternativas nas versões B em diante</label>
                )}
                {classId && (
                  <label className="block">Prazo <span className="text-graphite-500">(opcional)</span>
                    <input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} className="mt-1 w-full rounded-lg border p-2" />
                  </label>
                )}
                {isStaff && (
                  <label className="flex items-center gap-2"><input type="checkbox" checked={sheet} onChange={(e) => setSheet(e.target.checked)} className="h-4 w-4 accent-graphite" />Gerar cartão-resposta para leitura por foto</label>
                )}
                {versions > 1 && classId && <p className="text-xs text-graphite-500 sm:col-span-2">Na turma, cada versão aparece como uma atividade. As versões servem para aplicar a prova impressa: entregue uma versão por aluno.</p>}
                <div className="sm:col-span-2">
                  <button type="button" disabled={busy || !title.trim()} onClick={() => void create()} className="rounded-full bg-primary px-5 py-2.5 font-semibold text-graphite disabled:opacity-60">Criar prova</button>
                </div>
              </div>
            )}
          </section>
        )}

        {created && (
          <section className="mt-6 rounded-2xl border bg-white p-5 text-sm" aria-labelledby="exam-created">
            <h2 id="exam-created" className="text-lg font-semibold">Prova criada</h2>
            <ul className="mt-3 space-y-3">
              {created.versions.map((v) => (
                <li key={v.id} className="rounded-xl border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Link to={`/app/simulados?id=${v.id}`} className="font-semibold underline">{v.title}</Link>
                    <Link to={`/app/simulados?id=${v.id}`} className="text-xs underline">Abrir e imprimir</Link>
                  </div>
                  <p className="mt-2 font-mono text-xs leading-relaxed">Gabarito: {v.answerKey.map((k) => `${k.position}-${k.answer}`).join('  ')}</p>
                </li>
              ))}
            </ul>
            <button type="button" onClick={() => { setCreated(null); setPreview(null); }} className="mt-4 rounded-full border px-4 py-2 font-semibold">Gerar outra prova</button>
          </section>
        )}
      </div>
    </main>
  );
}
