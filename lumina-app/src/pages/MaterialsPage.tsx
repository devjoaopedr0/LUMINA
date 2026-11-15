import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ExternalLink, FileText, Link2, Search, Sparkles, Trash2, Video } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useAuth } from '@/contexts/AuthContext';
import {
  ApiError,
  apiAskMaterials,
  apiCreateMaterial,
  apiCreateQuestion,
  apiDeleteMaterial,
  apiListMaterials,
  apiListSubjects,
  apiMaterialFileUrl,
  apiMaterialQuestions,
  apiSearchMaterials,
  apiSimulationClasses,
  type SimulationClass,
  type Subject,
} from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import {
  KIND_LABEL,
  fileToDataUrl,
  formatSize,
  groupByClass,
  needsFile,
  validateUpload,
  type DraftQuestion,
  type Material,
  type MaterialAnswer,
  type MaterialKind,
  type MaterialSearchResult,
} from '@/lib/materials';

const field = 'mt-1 w-full rounded-xl border border-surface-line bg-white px-3 py-2.5 text-sm';
const token = () => getAccessToken() ?? '';

async function openMaterial(m: { id: string; url?: string | null; hasFile?: boolean }, page?: number) {
  if (m.url && !m.hasFile) {
    window.open(m.url, '_blank', 'noopener,noreferrer');
    return;
  }
  // Abre a aba antes do download para o navegador não bloquear o pop-up.
  const tab = window.open('', '_blank');
  try {
    const url = await apiMaterialFileUrl(token(), m.id);
    if (tab) tab.location.href = page ? `${url}#page=${page}` : url;
  } catch {
    tab?.close();
    alert('Não foi possível abrir o arquivo do material.');
  }
}

function UploadForm({ classes, subjects, onCreated }: { classes: SimulationClass[]; subjects: Subject[]; onCreated: (m: Material) => void }) {
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<MaterialKind>('PDF');
  const [classId, setClassId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const problem = validateUpload({ title, kind, url, file });
    if (problem) return setError(problem);
    setSaving(true);
    setError('');
    try {
      const created = await apiCreateMaterial(token(), {
        title: title.trim(),
        description: description.trim() || undefined,
        kind,
        classId: classId || undefined,
        subjectId: subjectId || undefined,
        ...(needsFile(kind) ? { file: await fileToDataUrl(file!) } : { url: url.trim() }),
      });
      onCreated(created);
      setTitle('');
      setUrl('');
      setDescription('');
      setFile(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível enviar o material.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="bg-white p-5">
      <h2 className="text-lg font-bold">Enviar material</h2>
      <form onSubmit={submit} className="mt-3 grid gap-3 md:grid-cols-2">
        <label className="text-sm md:col-span-2">Título<input className={field} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="Ex.: Apostila de estequiometria" /></label>
        <label className="text-sm">Tipo
          <select className={field} value={kind} onChange={(e) => setKind(e.target.value as MaterialKind)}>
            {(Object.keys(KIND_LABEL) as MaterialKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </select>
        </label>
        <label className="text-sm">Turma
          <select className={field} value={classId} onChange={(e) => setClassId(e.target.value)}>
            <option value="">Minha biblioteca (só eu vejo)</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="text-sm">Matéria
          <select className={field} value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
            <option value="">Sem matéria</option>
            {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        {needsFile(kind) ? (
          <label className="text-sm">Arquivo (PDF, até 15 MB)<input className={field} type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></label>
        ) : (
          <label className="text-sm">Endereço<input className={field} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" /></label>
        )}
        <label className="text-sm md:col-span-2">Descrição (opcional)<textarea className={field} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} /></label>
        {error ? <p role="alert" className="text-sm text-red-700 md:col-span-2">{error}</p> : null}
        <div className="md:col-span-2"><Button type="submit" disabled={saving}>{saving ? 'Enviando e lendo o PDF…' : 'Enviar'}</Button></div>
      </form>
    </Card>
  );
}

function QuestionDrafts({ material, subjects, onClose }: { material: Material; subjects: Subject[]; onClose: () => void }) {
  const [count, setCount] = useState(3);
  const [drafts, setDrafts] = useState<DraftQuestion[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [topic, setTopic] = useState(material.title);
  const [saved, setSaved] = useState<Record<number, string>>({});
  const subject = subjects.find((s) => s.id === material.subjectId);

  async function generate() {
    setBusy(true);
    setError('');
    try {
      setDrafts((await apiMaterialQuestions(token(), material.id, { count })).questions);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'A LuminIA não gerou as questões.');
    } finally {
      setBusy(false);
    }
  }

  async function save(i: number, q: DraftQuestion) {
    if (!subject) return setSaved((s) => ({ ...s, [i]: 'Defina a matéria do material para salvar a questão.' }));
    try {
      await apiCreateQuestion(token(), {
        subject: subject.name,
        subjectId: subject.id,
        topic: topic.trim() || material.title,
        difficulty: 'MEDIA',
        stem: q.stem,
        explanation: q.explanation || undefined,
        alternatives: q.alternatives,
      });
      setSaved((s) => ({ ...s, [i]: 'Salva no seu banco de questões.' }));
    } catch (e) {
      setSaved((s) => ({ ...s, [i]: e instanceof ApiError ? e.message : 'Não foi possível salvar.' }));
    }
  }

  return (
    <Card className="mt-3 bg-surface-card p-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">Quantidade
          <select className={field} value={count} onChange={(e) => setCount(Number(e.target.value))}>{[1, 2, 3, 4, 5].map((n) => <option key={n}>{n}</option>)}</select>
        </label>
        <Button size="sm" disabled={busy} onClick={() => void generate()}><Sparkles className="h-4 w-4" />{busy ? 'Gerando…' : 'Gerar questões com a LuminIA'}</Button>
        <Button size="sm" variant="ghost" onClick={onClose}>Fechar</Button>
      </div>
      <p className="mt-2 text-xs text-graphite-500">As questões saem só do conteúdo do material e ficam como rascunho: revise antes de salvar. Cada geração gasta uma mensagem da LuminIA.</p>
      {error ? <p role="alert" className="mt-2 text-sm text-red-700">{error}</p> : null}
      {drafts ? (
        <>
          <label className="mt-3 block text-sm">Assunto para salvar<input className={field} value={topic} onChange={(e) => setTopic(e.target.value)} /></label>
          <ol className="mt-3 space-y-3">
            {drafts.map((q, i) => (
              <li key={i} className="rounded-xl bg-white p-3 text-sm">
                <p className="font-semibold">{i + 1}. {q.stem}</p>
                <ul className="mt-2 space-y-1">
                  {q.alternatives.map((a, k) => <li key={k} className={a.isCorrect ? 'font-semibold text-emerald-700' : ''}>{String.fromCharCode(65 + k)}) {a.text}{a.isCorrect ? ' ✓' : ''}</li>)}
                </ul>
                {q.explanation ? <p className="mt-2 text-graphite-500">{q.explanation}{q.page ? ` (p. ${q.page})` : ''}</p> : null}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="outline" disabled={!!saved[i]?.startsWith('Salva')} onClick={() => void save(i, q)}>Salvar no meu banco</Button>
                  {saved[i] ? <span className="text-xs text-graphite-500">{saved[i]}</span> : null}
                </div>
              </li>
            ))}
          </ol>
        </>
      ) : null}
    </Card>
  );
}

/** /app/materiais — central de materiais da turma (itens 48 a 50). */
export function MaterialsPage() {
  const { user } = useAuth();
  const [classes, setClasses] = useState<SimulationClass[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [items, setItems] = useState<Material[] | null>(null);
  const [error, setError] = useState('');
  const [classId, setClassId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [kind, setKind] = useState('');
  const [q, setQ] = useState('');
  const [results, setResults] = useState<MaterialSearchResult | null>(null);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<MaterialAnswer | null>(null);
  const [asking, setAsking] = useState(false);
  const [drafting, setDrafting] = useState<string | null>(null);
  const teaching = useMemo(() => classes.filter((c) => c.isTeacher), [classes]);
  const isTeacher = !!user?.teacherSubject || teaching.length > 0;

  useEffect(() => {
    apiSimulationClasses(token()).then(setClasses).catch(() => undefined);
    apiListSubjects(token()).then(setSubjects).catch(() => undefined);
  }, []);
  const load = useCallback(() => {
    apiListMaterials(token(), { classId, subjectId, kind })
      .then(setItems)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Não foi possível carregar os materiais.'));
  }, [classId, subjectId, kind]);
  useEffect(load, [load]);

  async function search(e: FormEvent) {
    e.preventDefault();
    if (q.trim().length < 3) return;
    try {
      setResults(await apiSearchMaterials(token(), q.trim(), classId || undefined));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'A busca falhou.');
    }
  }

  async function ask(e: FormEvent) {
    e.preventDefault();
    if (question.trim().length < 3) return;
    setAsking(true);
    setAnswer(null);
    try {
      setAnswer(await apiAskMaterials(token(), { question: question.trim(), classId: classId || undefined }));
    } catch (err) {
      setAnswer({ found: false, answer: err instanceof ApiError ? err.message : 'A LuminIA não respondeu agora.', citations: [], model: null });
    } finally {
      setAsking(false);
    }
  }

  async function remove(m: Material) {
    if (!confirm(`Excluir "${m.title}"? Os alunos deixam de ver o material.`)) return;
    await apiDeleteMaterial(token(), m.id).catch(() => undefined);
    load();
  }

  const subjectName = (id: string | null) => subjects.find((s) => s.id === id)?.name ?? null;

  return (
    <main className="min-h-screen bg-surface-card px-5 py-8 text-graphite sm:px-8">
      <div className="mx-auto max-w-6xl">
        <Link to="/app" className="inline-flex items-center gap-2 text-sm font-semibold"><ArrowLeft size={16} />Voltar à visão geral</Link>
        <header className="my-8">
          <h1 className="text-3xl font-bold">Materiais</h1>
          <p className="mt-3 max-w-3xl text-graphite-500">
            PDFs, slides, apostilas, listas, links e vídeos das suas turmas. Busque um assunto para achar a página certa, ou pergunte à LuminIA: ela responde com base no material do professor e mostra de onde tirou.
          </p>
        </header>

        {isTeacher ? <UploadForm classes={teaching} subjects={subjects} onCreated={() => load()} /> : null}

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <Card className="bg-white p-5">
            <h2 className="flex items-center gap-2 text-lg font-bold"><Search className="h-4 w-4" />Buscar nos materiais</h2>
            <form onSubmit={search} className="mt-3 flex gap-2">
              <input className={`${field} mt-0`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ex.: estequiometria" aria-label="Buscar nos materiais" />
              <Button type="submit" disabled={q.trim().length < 3}>Buscar</Button>
            </form>
            {results ? (
              results.pages.length || results.materials.length ? (
                <ul className="mt-3 space-y-2 text-sm">
                  {results.pages.map((h) => (
                    <li key={`${h.materialId}-${h.page}`} className="rounded-xl border border-surface-line p-3">
                      <button type="button" className="font-semibold text-primary-700 underline" onClick={() => void openMaterial({ id: h.materialId, hasFile: true }, h.page)}>{h.title}, página {h.page}</button>
                      <p className="mt-1 text-graphite-500">{h.snippet}</p>
                    </li>
                  ))}
                  {results.materials.filter((m) => !results.pages.some((p) => p.materialId === m.id)).map((m) => (
                    <li key={m.id} className="rounded-xl border border-surface-line p-3">
                      <button type="button" className="font-semibold text-primary-700 underline" onClick={() => void openMaterial({ id: m.id, url: m.url, hasFile: !m.url })}>{m.title}</button> <span className="text-graphite-400">· {KIND_LABEL[m.kind]}</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="mt-3 text-sm text-graphite-500">Nada encontrado para "{results.query}".</p>
            ) : null}
          </Card>

          <Card className="bg-white p-5">
            <h2 className="flex items-center gap-2 text-lg font-bold"><Sparkles className="h-4 w-4" />Perguntar à LuminIA sobre os materiais</h2>
            <form onSubmit={ask} className="mt-3 space-y-2">
              <textarea className={field} rows={2} value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={1000} placeholder='Ex.: "Onde o professor explicou estequiometria?"' aria-label="Pergunta sobre os materiais" />
              <Button type="submit" disabled={asking || question.trim().length < 3}>{asking ? 'Procurando nos materiais…' : 'Perguntar'}</Button>
            </form>
            {answer ? (
              <div className={`mt-3 rounded-xl p-3 text-sm ${answer.found ? 'bg-surface-card' : 'bg-amber-50 text-amber-900'}`}>
                <p className="whitespace-pre-line">{answer.answer}</p>
                {answer.citations.length ? (
                  <p className="mt-2 text-xs">Fonte: {answer.citations.map((c, i) => (
                    <span key={`${c.materialId}-${c.page}`}>{i ? '; ' : ''}<button type="button" className="text-primary-700 underline" onClick={() => void openMaterial({ id: c.materialId, hasFile: true }, c.page)}>{c.title}, p. {c.page}</button></span>
                  ))}</p>
                ) : null}
              </div>
            ) : null}
          </Card>
        </div>

        <section className="mt-6">
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm">Turma<select className={field} value={classId} onChange={(e) => setClassId(e.target.value)}><option value="">Todas</option>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
            <label className="text-sm">Matéria<select className={field} value={subjectId} onChange={(e) => setSubjectId(e.target.value)}><option value="">Todas</option>{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
            <label className="text-sm">Tipo<select className={field} value={kind} onChange={(e) => setKind(e.target.value)}><option value="">Todos</option>{(Object.keys(KIND_LABEL) as MaterialKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</select></label>
          </div>
          {error ? <p role="alert" className="mt-3 text-sm text-red-700">{error}</p> : null}
          {items && items.length === 0 ? (
            <Card className="mt-4 bg-white p-6"><p className="text-sm text-graphite-500">{isTeacher ? 'Nenhum material ainda. Envie o primeiro acima.' : 'Seus professores ainda não publicaram materiais nas suas turmas.'}</p></Card>
          ) : null}
          {items ? groupByClass(items).map((g) => (
            <div key={g.key} className="mt-6">
              <h2 className="text-lg font-bold">{g.label}</h2>
              <ul className="mt-3 grid gap-3 md:grid-cols-2">
                {g.items.map((m) => (
                  <li key={m.id} className="rounded-2xl border border-surface-line bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="flex items-center gap-2 font-semibold">
                          {m.kind === 'VIDEO' ? <Video className="h-4 w-4" /> : m.kind === 'LINK' ? <Link2 className="h-4 w-4" /> : <FileText className="h-4 w-4" />}{m.title}
                        </p>
                        <p className="mt-1 text-xs text-graphite-500">
                          {KIND_LABEL[m.kind]}{subjectName(m.subjectId) ? ` · ${subjectName(m.subjectId)}` : ''}{m.pageCount ? ` · ${m.pageCount} páginas` : ''}{m.sizeBytes ? ` · ${formatSize(m.sizeBytes)}` : ''} · {m.ownerName}
                        </p>
                        {m.description ? <p className="mt-2 text-sm text-graphite-500">{m.description}</p> : null}
                        {m.textStatus === 'NO_TEXT' ? <p className="mt-2 text-xs text-amber-800">PDF digitalizado (imagem): abre normalmente, mas não entra na busca nem na LuminIA.</p> : null}
                      </div>
                      {m.isOwner ? <button type="button" onClick={() => void remove(m)} aria-label={`Excluir ${m.title}`} className="rounded-full p-2 text-graphite-400 hover:bg-alert/10 hover:text-alert"><Trash2 className="h-4 w-4" /></button> : null}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => void openMaterial(m)}><ExternalLink className="h-4 w-4" />Abrir</Button>
                      {isTeacher && m.textStatus === 'OK' ? <Button size="sm" variant="ghost" onClick={() => setDrafting(drafting === m.id ? null : m.id)}>Gerar questões</Button> : null}
                    </div>
                    {drafting === m.id ? <QuestionDrafts material={m} subjects={subjects} onClose={() => setDrafting(null)} /> : null}
                  </li>
                ))}
              </ul>
            </div>
          )) : null}
        </section>
      </div>
    </main>
  );
}
