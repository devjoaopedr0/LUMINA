import { Fragment, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, BadgeCheck, Camera, ClipboardCheck, History, Plus, Printer, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/contexts/AuthContext';
import { getAccessToken } from '@/lib/auth';
import { detectDocument, enhanceDocument, outputSize, warpPerspective } from '@/lib/doc-scanner';
import { fileToRaster, nextFrame, rasterToGrayPage } from '@/lib/doc-scanner-canvas';
import { buildPdf, bytesToBase64 } from '@/lib/pdf-writer';
import {
  apiAnswerKey,
  apiAnswerKeyCheck,
  apiAnswerKeyExams,
  apiAnswerKeyPerformance,
  apiAnswerKeyStats,
  apiAnswerKeys,
  apiCheckAnswerKey,
  apiContributeCommunity,
  apiCreateAnswerKey,
  apiImportInepAnswerKey,
  apiReadAnswerKeySheet,
  apiSetAnswerKeyStatus,
  ApiError,
  type AnswerKeyCheckResult,
  type AnswerKeyCheckStatus,
  type AnswerKeyDetail,
  type AnswerKeyExam,
  type AnswerKeyPerformance,
  type AnswerKeyStats,
  type AnswerKeySummary,
} from '@/lib/api';

const token = () => getAccessToken() ?? '';
const LETTERS = ['A', 'B', 'C', 'D', 'E'];
const letter = (p: number | null | undefined) => (p ? LETTERS[p - 1] : '—');
const errorText = (e: unknown, fallback: string) => (e instanceof ApiError || e instanceof Error ? e.message : fallback);
const STAFF = ['TEACHER', 'COORDINATOR', 'DIRECTOR', 'ADMIN'];

/** Foto → folha recortada e endireitada → PDF de uma página (mesmo caminho do scanner de gabarito). */
async function photoToPdf(file: File): Promise<string> {
  const raster = await fileToRaster(file);
  await nextFrame();
  const { quad } = detectDocument(raster);
  const page = enhanceDocument(warpPerspective(raster, quad, outputSize(quad, 1600)), 'gray');
  const pdf = await buildPdf([rasterToGrayPage(page, 1100)]);
  return `data:application/pdf;base64,${bytesToBase64(pdf)}`;
}

/** Verde = acerto, vermelho = erro, cinza = em branco, amarelo = pendente de validação. */
const STATUS_STYLE: Record<AnswerKeyCheckStatus, { cell: string; label: string }> = {
  CORRECT: { cell: 'border-emerald-300 bg-emerald-50 text-emerald-800', label: 'Acerto' },
  WRONG: { cell: 'border-red-300 bg-red-50 text-red-800', label: 'Erro' },
  BLANK: { cell: 'border-gray-300 bg-gray-100 text-gray-600', label: 'Em branco' },
  PENDING: { cell: 'border-amber-300 bg-amber-50 text-amber-800', label: 'Pendente de validação' },
  ANNULLED: { cell: 'border-slate-300 bg-white text-slate-500 line-through', label: 'Anulada' },
};

function keyTitle(k: AnswerKeySummary) {
  return [k.exam.name, k.exam.year, k.day ? `${k.day}º dia` : null, k.application !== 'Regular' ? k.application : null, k.bookletColor ? `Caderno ${k.bookletColor}` : null, k.area].filter(Boolean).join(' · ');
}

function OriginBadge({ k }: { k: AnswerKeySummary }) {
  if (k.official) return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800"><BadgeCheck size={13} />Oficial</span>;
  return <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800"><ShieldAlert size={13} />Não oficial · {k.origin === 'TEACHER' ? 'professor' : k.origin === 'AI_SUGGESTED' ? 'sugerido por IA' : 'comunitário'}</span>;
}

function KeySource({ k }: { k: AnswerKeySummary }) {
  return (
    <p className="mt-1 text-xs text-graphite-500">
      {k.official ? <>Fonte: {k.sourceUrl ? <a className="underline" href={k.sourceUrl} target="_blank" rel="noreferrer">{k.sourceName ?? 'banca'}</a> : k.sourceName}{k.publishedAt ? ` · publicado em ${new Date(k.publishedAt).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}` : ''}</> : k.origin === 'COMMUNITY' ? <>Resposta mais votada pelos alunos da Lumina, sem validação. Some quando o oficial sair.</> : <>Cadastrado por {k.author ?? 'professor'} — confira com o gabarito oficial quando ele sair.</>}
      {k.version > 1 ? ` · versão ${k.version}${k.correctionNote ? ` (${k.correctionNote})` : ''}` : ''}
      {k.status === 'DRAFT' ? ' · rascunho (só você vê)' : ''}
    </p>
  );
}

// ------------------------------------------------------------------ resultado

function ResultView({ result, onBack }: { result: AnswerKeyCheckResult; onBack: () => void }) {
  const wrongOnes = result.questions.filter((q) => q.status === 'WRONG' || q.status === 'BLANK');
  return (
    <section className="mt-6 space-y-5">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-sm font-semibold"><ArrowLeft size={15} />Voltar</button>
      <div>
        <h2 className="text-xl font-bold">{keyTitle(result.answerKey)}</h2>
        <div className="mt-1 flex flex-wrap items-center gap-2"><OriginBadge k={result.answerKey} /><span className="text-xs text-graphite-500">Conferido em {new Date(result.createdAt).toLocaleString('pt-BR')}</span></div>
        {result.outdated ? <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">O gabarito foi corrigido depois desta conferência. O resultado abaixo já usa a versão atual.</p> : null}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          ['Acertos', result.correct, 'text-emerald-700'],
          ['Erros', result.wrong, 'text-red-700'],
          ['Em branco', result.blank, 'text-gray-600'],
          ['Respondidas', `${result.answered}/${result.total}`, 'text-graphite'],
          ['Acerto', `${result.percent.toLocaleString('pt-BR')}%`, 'text-graphite'],
        ].map(([label, value, color]) => (
          <div key={label as string} className="rounded-xl border bg-white p-4"><p className="text-xs text-graphite-500">{label}</p><p className={`mt-1 text-2xl font-bold ${color}`}>{value}</p></div>
        ))}
      </div>
      <p className="text-xs text-graphite-500">
        O percentual é de acertos, <strong>não é a nota TRI</strong>: a TRI depende dos parâmetros de cada questão, que a banca não publica com o gabarito.
        {result.annulled ? ` ${result.annulled} anulada(s) e` : ''}{result.pending ? ` ${result.pending} pendente(s) de validação` : ''}{result.annulled || result.pending ? ' não entram no percentual.' : ''}
      </p>
      {result.pending ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">Estimativa pelo gabarito {result.answerKey.origin === 'COMMUNITY' ? 'comunitário' : 'não validado'} (não oficial)</p>
          <p className="mt-1">{result.provisional.matches} das suas respostas batem com a mais votada, {result.provisional.differs} diferem e {result.provisional.blank} ficaram em branco. Não é resultado: confira de novo quando o gabarito oficial sair.</p>
        </div>
      ) : null}
      {result.byArea.length > 1 || result.byArea[0]?.area !== 'Geral' ? (
        <div className="rounded-xl border bg-white p-4">
          <h3 className="font-semibold">Por área</h3>
          <div className="mt-3 space-y-3">
            {result.byArea.map((a) => (
              <div key={a.area}>
                <div className="flex justify-between text-sm"><span>{a.area}</span><span className="font-semibold">{a.correct}/{a.scored} · {a.percent.toLocaleString('pt-BR')}%</span></div>
                <div className="mt-1 h-2 rounded-full bg-surface-card"><div className="h-2 rounded-full bg-primary" style={{ width: `${a.percent}%` }} /></div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <div className="rounded-xl border bg-white p-4">
        <h3 className="font-semibold">Questão a questão</h3>
        <div className="mt-2 flex flex-wrap gap-3 text-xs">{(Object.keys(STATUS_STYLE) as AnswerKeyCheckStatus[]).map((s) => <span key={s} className={`rounded border px-2 py-0.5 ${STATUS_STYLE[s].cell}`}>{STATUS_STYLE[s].label}</span>)}</div>
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6 lg:grid-cols-9">
          {result.questions.map((q) => (
            <div key={q.number} className={`rounded-lg border px-2 py-1.5 text-center text-xs ${STATUS_STYLE[q.status].cell}`} title={STATUS_STYLE[q.status].label}>
              <p className="font-bold">{q.number}</p>
              <p>{letter(q.selected)} → {q.status === 'ANNULLED' ? 'anul.' : q.status === 'PENDING' ? `${letter(q.answer)}?` : letter(q.answer)}</p>
              {q.status === 'PENDING' && q.agreement != null ? <p className="text-[10px]">{Math.round(q.agreement * 100)}% concordam</p> : null}
            </div>
          ))}
        </div>
      </div>
      {wrongOnes.length ? (
        <div className="rounded-xl border bg-white p-4">
          <h3 className="font-semibold">Para revisar ({wrongOnes.length})</h3>
          <p className="mt-1 text-xs text-graphite-500">Questões erradas ou em branco. Em breve a LuminIA explica cada uma com o texto real da questão.</p>
          <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">{wrongOnes.map((q) => <li key={q.number}>Questão {q.number}{q.area ? ` · ${q.area}` : ''}: você marcou {letter(q.selected)}, gabarito {letter(q.answer)}</li>)}</ul>
        </div>
      ) : null}
    </section>
  );
}

// ------------------------------------------------------------------ conferir

function CheckTab({ onResult }: { onResult: (r: AnswerKeyCheckResult) => void }) {
  const [keys, setKeys] = useState<AnswerKeySummary[] | null>(null);
  const [error, setError] = useState('');
  const [examName, setExamName] = useState('');
  const [year, setYear] = useState('');
  const [day, setDay] = useState('');
  const [selected, setSelected] = useState<AnswerKeyDetail | null>(null);
  const [answers, setAnswers] = useState<Record<string, number | null>>({});
  const [language, setLanguage] = useState('');
  const [paste, setPaste] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fromPhoto, setFromPhoto] = useState(false);
  /** Respondendo para o gabarito comunitário (prova ainda sem oficial). */
  const [contribution, setContribution] = useState<{ examId: string; application: string; day: number | null; bookletColor: string | null } | null>(null);
  const [allExams, setAllExams] = useState<AnswerKeyExam[]>([]);
  const [cExam, setCExam] = useState('');
  const [cDay, setCDay] = useState('');
  const [cColor, setCColor] = useState('');
  const [cCount, setCCount] = useState('45');
  const [thanks, setThanks] = useState('');
  const [review, setReview] = useState<Set<number>>(new Set());
  const [photoNote, setPhotoNote] = useState('');

  useEffect(() => {
    apiAnswerKeys(token()).then(setKeys).catch((e) => setError(errorText(e, 'Não foi possível carregar os gabaritos.')));
    apiAnswerKeyExams(token()).then(setAllExams).catch(() => undefined);
  }, []);

  /** Abre a grade para responder uma prova que ainda não tem gabarito oficial. */
  function startContribution() {
    const exam = allExams.find((x) => x.id === cExam);
    if (!exam) return;
    const day = cDay ? Number(cDay) : null;
    const enem = /enem/i.test(exam.name);
    const count = enem && day ? 90 : Math.max(1, Math.min(400, Number(cCount) || 45));
    const first = enem && day === 2 ? 91 : 1;
    const numbers = Array.from({ length: count }, (_, i) => first + i);
    const area = (n: number) => (enem ? (n <= 45 ? 'Linguagens, Códigos e suas Tecnologias' : n <= 90 ? 'Ciências Humanas e suas Tecnologias' : n <= 135 ? 'Ciências da Natureza e suas Tecnologias' : 'Matemática e suas Tecnologias') : null);
    setContribution({ examId: exam.id, application: 'Regular', day, bookletColor: cColor.trim() || null });
    setSelected({
      id: '', exam, application: 'Regular', day, bookletColor: cColor.trim() || null, area: null, origin: 'COMMUNITY', official: false, status: 'PUBLISHED',
      sourceName: null, sourceUrl: null, publishedAt: null, version: 1, correctionNote: null, questionCount: count, author: null, mine: false, updatedAt: '',
      needsLanguage: enem && day === 1, numbers, items: numbers.map((n) => ({ number: n, language: '', area: area(n), validated: false })),
    });
    setAnswers({}); setLanguage(''); setPaste(''); setConfirming(false); setFromPhoto(false); setReview(new Set()); setPhotoNote(''); setThanks('');
  }

  const exams = useMemo(() => [...new Set((keys ?? []).map((k) => k.exam.name))].sort(), [keys]);
  const years = useMemo(() => [...new Set((keys ?? []).filter((k) => !examName || k.exam.name === examName).map((k) => k.exam.year).filter(Boolean))].sort((a, b) => Number(b) - Number(a)), [keys, examName]);
  const filtered = (keys ?? []).filter((k) => (!examName || k.exam.name === examName) && (!year || String(k.exam.year) === year) && (!day || String(k.day) === day));

  async function choose(k: AnswerKeySummary) {
    setError(''); setBusy(true);
    try {
      const detail = await apiAnswerKey(token(), k.id);
      setSelected(detail); setContribution(null); setAnswers({}); setLanguage(''); setPaste(''); setConfirming(false); setFromPhoto(false); setReview(new Set()); setPhotoNote(''); setThanks('');
    } catch (e) { setError(errorText(e, 'Não foi possível abrir o gabarito.')); }
    finally { setBusy(false); }
  }

  /** Cola uma sequência de letras ("ABCDE..."; "-" ou "." = em branco) a partir da primeira questão. */
  function applyPaste() {
    if (!selected) return;
    const chars = paste.toUpperCase().replace(/\s+/g, '').split('');
    const next: Record<string, number | null> = { ...answers };
    selected.numbers.forEach((n, i) => {
      const c = chars[i];
      if (c === undefined) return;
      const p = LETTERS.indexOf(c);
      next[String(n)] = p >= 0 ? p + 1 : null;
    });
    setAnswers(next);
  }

  /** Lê a foto do cartão e preenche a grade; as duvidosas ficam destacadas para o aluno conferir. */
  async function readPhoto(file: File | undefined) {
    if (!selected || !file) return;
    setBusy(true); setError(''); setPhotoNote('Lendo o cartão…');
    try {
      const reading = await apiReadAnswerKeySheet(token(), selected.id, await photoToPdf(file));
      setAnswers(Object.fromEntries(reading.answers.map((a) => [String(a.number), a.selected])));
      setReview(new Set(reading.answers.filter((a) => a.review).map((a) => a.number)));
      setFromPhoto(true); setConfirming(false);
      setPhotoNote([
        `Cartão lido: ${reading.answers.filter((a) => a.selected).length} respostas.`,
        reading.reviewCount ? `${reading.reviewCount} duvidosa(s) em amarelo: confira na grade antes de corrigir (dupla marcação fica em branco).` : 'Nenhuma duvidosa, mas confira a grade antes de corrigir.',
        ...reading.warnings,
      ].join(' '));
    } catch (e) { setPhotoNote(''); setError(errorText(e, 'Não foi possível ler o cartão.')); }
    finally { setBusy(false); }
  }

  async function submit() {
    if (!selected) return;
    setBusy(true); setError('');
    try {
      if (contribution) {
        // Vira voto no comunitário; depois confere contra a resposta mais votada.
        const key = await apiContributeCommunity(token(), { ...contribution, language: language || undefined, answers });
        const own = Object.fromEntries(key.numbers.map((n) => [String(n), answers[String(n)] ?? null]));
        if (!key.numbers.length) { setThanks('Obrigado! Suas respostas entraram no gabarito comunitário. Ainda há poucos votos para mostrar a resposta mais votada: volte mais tarde.'); setConfirming(false); return; }
        onResult(await apiCheckAnswerKey(token(), key.id, own, language || null, fromPhoto ? 'PHOTO' : 'MANUAL'));
        return;
      }
      const payload = Object.fromEntries(selected.numbers.map((n) => [String(n), answers[String(n)] ?? null]));
      onResult(await apiCheckAnswerKey(token(), selected.id, payload, language || null, fromPhoto ? 'PHOTO' : 'MANUAL'));
    } catch (e) { setError(errorText(e, 'Não foi possível conferir.')); setConfirming(false); }
    finally { setBusy(false); }
  }

  if (selected) {
    const answered = selected.numbers.filter((n) => answers[String(n)]).length;
    const areaOf = new Map(selected.items.map((i) => [i.number, i.area]));
    return (
      <section className="mt-6">
        <button type="button" onClick={() => { setSelected(null); setContribution(null); }} className="inline-flex items-center gap-1 text-sm font-semibold"><ArrowLeft size={15} />Trocar de gabarito</button>
        <h2 className="mt-3 text-xl font-bold">{keyTitle(selected)}</h2>
        <div className="mt-1"><OriginBadge k={selected} /></div>
        <KeySource k={selected} />
        {error ? <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
        <div className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border bg-white p-4">
          {selected.needsLanguage ? (
            <label className="text-sm">Língua estrangeira
              <select className="mt-1 block rounded-lg border px-3 py-2" value={language} onChange={(e) => setLanguage(e.target.value)}>
                <option value="">Escolha…</option><option value="INGLES">Inglês</option><option value="ESPANHOL">Espanhol</option>
              </select>
            </label>
          ) : null}
          <label className="min-w-[240px] flex-1 text-sm">Colar respostas em sequência (opcional)
            <input className="mt-1 block w-full rounded-lg border px-3 py-2 font-mono" placeholder="ex.: ABDCE-AB… (- = em branco)" value={paste} onChange={(e) => setPaste(e.target.value)} />
          </label>
          <Button size="sm" variant="outline" type="button" onClick={applyPaste} disabled={!paste.trim()}>Preencher</Button>
          <p className="text-sm text-graphite-500">{answered} de {selected.numbers.length} respondidas</p>
        </div>
        {contribution ? <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Você está respondendo para o <strong>gabarito comunitário</strong>: suas respostas viram votos (um por questão, reenviar substitui). Em branco não conta. A resposta mais votada aparece só a partir de 3 votos e nunca é tratada como oficial.</p> : null}
        {thanks ? <p role="status" className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{thanks}</p> : null}
        <div className={`mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-dashed bg-white p-4 text-sm ${contribution ? 'hidden' : ''}`}>
          <span className="font-semibold">Marcou num cartão impresso?</span>
          <Link to={`/app/gabarito-inteligente/${selected.id}/cartao`} className="inline-flex items-center gap-1 underline"><Printer size={15} />Imprimir cartão</Link>
          <label className={`inline-flex cursor-pointer items-center gap-1 rounded-lg border px-3 py-1.5 font-semibold ${busy ? 'opacity-50' : 'hover:bg-primary/20'}`}>
            <Camera size={15} />Ler foto do cartão
            <input type="file" accept="image/*" capture="environment" className="sr-only" disabled={busy} onChange={(e) => { void readPhoto(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
          {photoNote ? <p role="status" className="basis-full text-graphite-600">{photoNote}</p> : null}
        </div>
        <div className="mt-4 grid gap-x-6 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {selected.numbers.map((n, i) => {
            const area = areaOf.get(n);
            const newArea = area && areaOf.get(selected.numbers[i - 1]) !== area;
            return (
              <Fragment key={n}>
                {newArea ? <p className="col-span-full mt-3 text-xs font-semibold uppercase tracking-wide text-graphite-400">{area}</p> : null}
                <div className="flex items-center gap-2">
                  <span className={`w-9 rounded text-right text-sm font-bold ${review.has(n) ? 'bg-amber-200 px-1' : ''}`} title={review.has(n) ? 'Leitura duvidosa: confira' : undefined}>{n}</span>
                  {LETTERS.map((l, p) => {
                    const on = answers[String(n)] === p + 1;
                    return <button key={l} type="button" aria-pressed={on} aria-label={`Questão ${n}, alternativa ${l}`} onClick={() => { setAnswers({ ...answers, [String(n)]: on ? null : p + 1 }); if (review.has(n)) setReview(new Set([...review].filter((x) => x !== n))); }} className={`h-8 w-8 rounded-full border text-xs font-semibold ${on ? 'border-graphite bg-graphite text-white' : 'bg-white hover:bg-primary/20'}`}>{l}</button>;
                  })}
                </div>
              </Fragment>
            );
          })}
        </div>
        <div className="sticky bottom-0 mt-6 rounded-xl border bg-white p-4 shadow-sm">
          {confirming ? (
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm">Confira antes de corrigir: <strong>{answered}</strong> respondidas e <strong>{selected.numbers.length - answered}</strong> em branco{selected.needsLanguage ? `, língua: ${language === 'INGLES' ? 'inglês' : language === 'ESPANHOL' ? 'espanhol' : 'não escolhida'}` : ''}.</p>
              <Button size="sm" onClick={() => void submit()} disabled={busy || (selected.needsLanguage && !language)}>{busy ? 'Enviando…' : contribution ? 'Enviar ao comunitário e conferir' : 'Confirmar e corrigir'}</Button>
              <Button size="sm" variant="outline" onClick={() => setConfirming(false)}>Voltar e ajustar</Button>
            </div>
          ) : <Button onClick={() => setConfirming(true)} disabled={selected.needsLanguage && !language}><ClipboardCheck size={18} />Revisar e corrigir</Button>}
          {selected.needsLanguage && !language ? <p className="mt-2 text-xs text-amber-700">Escolha a língua estrangeira para corrigir as questões de língua.</p> : null}
        </div>
      </section>
    );
  }

  return (
    <section className="mt-6">
      {error ? <p role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      <div className="flex flex-wrap gap-3 rounded-xl border bg-white p-4">
        <label className="text-sm">Prova<select className="mt-1 block rounded-lg border px-3 py-2" value={examName} onChange={(e) => { setExamName(e.target.value); setYear(''); }}><option value="">Todas</option>{exams.map((e) => <option key={e}>{e}</option>)}</select></label>
        <label className="text-sm">Ano<select className="mt-1 block rounded-lg border px-3 py-2" value={year} onChange={(e) => setYear(e.target.value)}><option value="">Todos</option>{years.map((y) => <option key={String(y)}>{y}</option>)}</select></label>
        <label className="text-sm">Dia<select className="mt-1 block rounded-lg border px-3 py-2" value={day} onChange={(e) => setDay(e.target.value)}><option value="">Todos</option><option value="1">1º dia</option><option value="2">2º dia</option></select></label>
      </div>
      {keys === null && !error ? <p role="status" className="mt-4">Carregando gabaritos…</p> : null}
      {keys && !filtered.length ? (
        <p className="mt-4 rounded-xl bg-surface-card p-4 text-sm text-graphite-500">{keys.length ? 'Nenhum gabarito com esses filtros.' : 'Ainda não há gabaritos disponíveis para você. Os oficiais aparecem aqui assim que a banca publica e a Lumina cadastra; os do seu professor, quando ele publicar para a sua turma.'}</p>
      ) : null}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {filtered.map((k) => (
          <button key={k.id} type="button" disabled={busy} onClick={() => void choose(k)} className="rounded-xl border bg-white p-4 text-left transition hover:border-primary">
            <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold">{keyTitle(k)}</p><OriginBadge k={k} /></div>
            <p className="mt-1 text-sm text-graphite-500">{k.questionCount} questões</p>
            <KeySource k={k} />
          </button>
        ))}
      </div>
      <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50/50 p-4">
        <h3 className="font-semibold">Prova sem gabarito oficial ainda?</h3>
        <p className="mt-1 text-sm text-graphite-500">Marque o que você respondeu e contribua com o gabarito comunitário: você vê a resposta mais votada e quantos concordam. Ele é sempre não oficial e sai de cena quando o oficial for publicado.</p>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="text-sm">Prova<select className="mt-1 block rounded-lg border px-3 py-2" value={cExam} onChange={(e) => setCExam(e.target.value)}><option value="">Escolha…</option>{allExams.map((x) => <option key={x.id} value={x.id}>{x.name} {x.year ?? ''}</option>)}</select></label>
          <label className="text-sm">Dia<select className="mt-1 block rounded-lg border px-3 py-2" value={cDay} onChange={(e) => setCDay(e.target.value)}><option value="">Único</option><option value="1">1º</option><option value="2">2º</option></select></label>
          <label className="text-sm">Cor do caderno<input className="mt-1 block w-32 rounded-lg border px-3 py-2" value={cColor} onChange={(e) => setCColor(e.target.value)} placeholder="Azul…" /></label>
          {!(/enem/i.test(allExams.find((x) => x.id === cExam)?.name ?? '') && cDay) ? <label className="text-sm">Questões<input type="number" min={1} max={400} className="mt-1 block w-24 rounded-lg border px-3 py-2" value={cCount} onChange={(e) => setCCount(e.target.value)} /></label> : null}
          <Button size="sm" variant="outline" type="button" disabled={!cExam} onClick={startContribution}>Responder e contribuir</Button>
        </div>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ desempenho

function PerformanceTab({ onOpen }: { onOpen: (checkId: string) => void }) {
  const [data, setData] = useState<AnswerKeyPerformance | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { apiAnswerKeyPerformance(token()).then(setData).catch((e) => setError(errorText(e, 'Não foi possível carregar o desempenho.'))); }, []);
  if (error) return <p role="alert" className="mt-6 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>;
  if (!data) return <p role="status" className="mt-6">Carregando…</p>;
  if (!data.checks) return <p className="mt-6 rounded-xl bg-surface-card p-4 text-sm text-graphite-500">Você ainda não conferiu nenhuma prova. Confira um gabarito para ver seu desempenho aqui.</p>;
  return (
    <section className="mt-6 space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[['Provas conferidas', data.checks], ['Acertos', data.correct], ['Erros + brancos', data.wrong + data.blank], ['Acerto geral', `${data.percent.toLocaleString('pt-BR')}%`]].map(([l, v]) => (
          <div key={l as string} className="rounded-xl border bg-white p-4"><p className="text-xs text-graphite-500">{l}</p><p className="mt-1 text-2xl font-bold">{v}</p></div>
        ))}
      </div>
      <p className="text-xs text-graphite-500">Percentual de acertos, não nota TRI.</p>
      {data.byArea.length ? (
        <div className="rounded-xl border bg-white p-4">
          <h3 className="font-semibold">Por área (da mais fraca para a mais forte)</h3>
          <div className="mt-3 space-y-3">{data.byArea.map((a) => (
            <div key={a.area}><div className="flex justify-between text-sm"><span>{a.area}</span><span className="font-semibold">{a.percent.toLocaleString('pt-BR')}% · {a.correct}/{a.scored}</span></div><div className="mt-1 h-2 rounded-full bg-surface-card"><div className="h-2 rounded-full bg-primary" style={{ width: `${a.percent}%` }} /></div></div>
          ))}</div>
        </div>
      ) : null}
      <div className="rounded-xl border bg-white p-4">
        <h3 className="flex items-center gap-2 font-semibold"><History size={17} />Histórico</h3>
        <ul className="mt-2 divide-y">{data.history.map((h) => (
          <li key={h.id}><button type="button" onClick={() => onOpen(h.id)} className="flex w-full flex-wrap items-center justify-between gap-2 py-2 text-left text-sm hover:text-primary-700">
            <span>{keyTitle(h.answerKey)} <span className="text-graphite-400">· {new Date(h.createdAt).toLocaleDateString('pt-BR')}</span>{h.outdated ? <span className="ml-1 text-xs text-amber-700">(gabarito corrigido depois)</span> : null}</span>
            <span className="font-semibold">{h.correct}/{h.correct + h.wrong + h.blank} · {h.percent.toLocaleString('pt-BR')}%</span>
          </button></li>
        ))}</ul>
      </div>
      {data.difficultQuestions.length ? (
        <div className="rounded-xl border bg-white p-4">
          <h3 className="font-semibold">Questões que você mais erra</h3>
          <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">{data.difficultQuestions.map((q) => <li key={`${q.answerKeyId}:${q.number}`}>{q.label} · questão {q.number}{q.area ? ` (${q.area})` : ''}{q.misses > 1 ? ` · ${q.misses} vezes` : ''}</li>)}</ul>
        </div>
      ) : null}
    </section>
  );
}

// ------------------------------------------------------------------ cadastro (professor/gestão)

/** Administração: importa o gabarito oficial direto do PDF do INEP. */
function InepImport({ onDone }: { onDone: () => void }) {
  const [url, setUrl] = useState('');
  const [publishedAt, setPublishedAt] = useState('');
  const [application, setApplication] = useState('Regular');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const field = 'mt-1 block w-full rounded-lg border px-3 py-2';
  async function run(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setMessage(null);
    try {
      const k = await apiImportInepAnswerKey(token(), { gabaritoUrl: url.trim(), publishedAt, application });
      setMessage({ ok: true, text: `Importado: ${keyTitle(k)} (${k.numbers.length} questões${k.needsLanguage ? ', com inglês e espanhol' : ''}).` });
      setUrl(''); onDone();
    } catch (err) { setMessage({ ok: false, text: errorText(err, 'Não foi possível importar.') }); }
    finally { setBusy(false); }
  }
  return (
    <form onSubmit={(e) => void run(e)} className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/40 p-5">
      <h2 className="flex items-center gap-2 font-semibold"><BadgeCheck size={18} />Importar gabarito oficial do INEP</h2>
      <p className="text-xs text-graphite-500">Cole o link do PDF do gabarito (download.inep.gov.br). Ano, dia, cor do caderno e as duas línguas do 1º dia são lidos do próprio PDF, e um gabarito incompleto é recusado.</p>
      <label className="block text-sm">Link do PDF<input required type="url" className={field} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://download.inep.gov.br/enem/provas_e_gabaritos/2024_GB_impresso_D2_CD5.pdf" /></label>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm">Publicado pelo INEP em<input required type="date" className={field} value={publishedAt} onChange={(e) => setPublishedAt(e.target.value)} /></label>
        <label className="text-sm">Aplicação<input className={field} value={application} onChange={(e) => setApplication(e.target.value)} /></label>
      </div>
      {message ? <p role={message.ok ? 'status' : 'alert'} className={`rounded-lg p-3 text-sm ${message.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>{message.text}</p> : null}
      <Button disabled={busy}>{busy ? 'Importando…' : 'Importar'}</Button>
    </form>
  );
}

function CreateTab({ isAdmin }: { isAdmin: boolean }) {
  const [exams, setExams] = useState<AnswerKeyExam[]>([]);
  const [mine, setMine] = useState<AnswerKeySummary[]>([]);
  const [examId, setExamId] = useState('');
  const [examName, setExamName] = useState('');
  const [examYear, setExamYear] = useState('');
  const [application, setApplication] = useState('Regular');
  const [day, setDay] = useState('');
  const [color, setColor] = useState('');
  const [first, setFirst] = useState('1');
  const [letters, setLetters] = useState('');
  const [withLanguage, setWithLanguage] = useState(false);
  const [english, setEnglish] = useState('');
  const [spanish, setSpanish] = useState('');
  const [official, setOfficial] = useState(false);
  const [sourceName, setSourceName] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [publishedAt, setPublishedAt] = useState('');
  const [publish, setPublish] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const reload = () => apiAnswerKeys(token()).then((rows) => setMine(rows.filter((r) => r.mine))).catch(() => undefined);
  useEffect(() => { apiAnswerKeyExams(token()).then(setExams).catch(() => undefined); void reload(); }, []);

  const parsed = letters.toUpperCase().replace(/[^A-EX]/g, '').split('');
  const field = 'mt-1 block w-full rounded-lg border px-3 py-2';

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setMessage(null);
    try {
      const start = Math.max(1, Number(first) || 1);
      const toPos = (c: string) => { const i = LETTERS.indexOf(c); return i >= 0 ? i + 1 : null; };
      const lang = (s: string) => s.toUpperCase().replace(/[^A-EX]/g, '').split('');
      const items: { number: number; answer: number | null; language?: string }[] = [];
      parsed.forEach((c, i) => {
        const number = start + i;
        if (withLanguage && number <= start + 4) return; // as 5 primeiras vêm dos campos de língua
        items.push({ number, answer: toPos(c) });
      });
      if (withLanguage) {
        const en = lang(english); const es = lang(spanish);
        if (en.length !== 5 || es.length !== 5) throw new Error('Informe as 5 respostas de inglês e as 5 de espanhol.');
        for (let i = 0; i < 5; i++) items.push({ number: start + i, answer: toPos(en[i]), language: 'INGLES' }, { number: start + i, answer: toPos(es[i]), language: 'ESPANHOL' });
      }
      if (!items.length) throw new Error('Digite as respostas do gabarito.');
      const created = await apiCreateAnswerKey(token(), {
        examId: examId || undefined,
        examName: examId ? undefined : examName.trim(),
        examYear: examId ? undefined : Number(examYear) || undefined,
        application, day: day ? Number(day) : null, bookletColor: color || null,
        origin: official ? 'OFFICIAL' : 'TEACHER',
        sourceName: official ? sourceName : undefined, sourceUrl: official ? sourceUrl : undefined, publishedAt: official ? publishedAt : undefined,
        publish, items,
      });
      setMessage({ ok: true, text: `Gabarito salvo: ${keyTitle(created)} (${created.numbers.length} questões).` });
      setLetters(''); setEnglish(''); setSpanish('');
      void reload();
    } catch (err) { setMessage({ ok: false, text: errorText(err, 'Não foi possível salvar.') }); }
    finally { setBusy(false); }
  }

  async function setStatus(id: string, status: 'PUBLISHED' | 'ARCHIVED' | 'DRAFT') {
    try { await apiSetAnswerKeyStatus(token(), id, status); void reload(); } catch (e) { setMessage({ ok: false, text: errorText(e, 'Não foi possível alterar.') }); }
  }

  return (
    <section className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      {isAdmin ? <div className="lg:col-span-2"><InepImport onDone={() => void reload()} /></div> : null}
      <form onSubmit={(e) => void save(e)} className="space-y-3 rounded-xl border bg-white p-5">
        <h2 className="font-semibold">Cadastrar gabarito</h2>
        <p className="text-xs text-graphite-500">{official ? 'Gabarito oficial: copie exatamente o documento da banca e informe a fonte e a data de publicação.' : 'Gabarito de professor: aparece como "não oficial" para os alunos das suas turmas quando publicado.'}</p>
        {isAdmin ? <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={official} onChange={(e) => setOfficial(e.target.checked)} />Gabarito oficial da banca</label> : null}
        <label className="block text-sm">Prova
          <select className={field} value={examId} onChange={(e) => setExamId(e.target.value)}>
            <option value="">Nova prova…</option>
            {exams.map((x) => <option key={x.id} value={x.id}>{x.name} {x.year ?? ''}</option>)}
          </select>
        </label>
        {!examId ? (
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">Nome<input required className={field} value={examName} onChange={(e) => setExamName(e.target.value)} placeholder="ENEM, FUVEST, UECE…" /></label>
            <label className="text-sm">Ano<input required type="number" min={1990} max={2100} className={field} value={examYear} onChange={(e) => setExamYear(e.target.value)} /></label>
          </div>
        ) : null}
        <div className="grid grid-cols-3 gap-3">
          <label className="text-sm">Aplicação<input className={field} value={application} onChange={(e) => setApplication(e.target.value)} /></label>
          <label className="text-sm">Dia<select className={field} value={day} onChange={(e) => setDay(e.target.value)}><option value="">Único</option><option value="1">1º</option><option value="2">2º</option></select></label>
          <label className="text-sm">Cor do caderno<input className={field} value={color} onChange={(e) => setColor(e.target.value)} placeholder="Azul…" /></label>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <label className="text-sm">1ª questão<input type="number" min={1} className={field} value={first} onChange={(e) => setFirst(e.target.value)} /></label>
          <label className="col-span-2 flex items-end gap-2 pb-2 text-sm"><input type="checkbox" checked={withLanguage} onChange={(e) => setWithLanguage(e.target.checked)} />As 5 primeiras têm inglês e espanhol (Enem 1º dia)</label>
        </div>
        {withLanguage ? (
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">Inglês (5 letras)<input className={`${field} font-mono`} value={english} onChange={(e) => setEnglish(e.target.value)} placeholder="ABCDE" /></label>
            <label className="text-sm">Espanhol (5 letras)<input className={`${field} font-mono`} value={spanish} onChange={(e) => setSpanish(e.target.value)} placeholder="EDCBA" /></label>
          </div>
        ) : null}
        <label className="block text-sm">Respostas em sequência, a partir da 1ª questão (X = anulada)
          <textarea className={`${field} h-28 font-mono`} value={letters} onChange={(e) => setLetters(e.target.value)} placeholder={withLanguage ? 'Comece pela questão 1 (as 5 de língua são ignoradas aqui: use os campos acima)' : 'ABCDEABCDE…'} />
          <span className="text-xs text-graphite-500">{parsed.length} respostas lidas{parsed.length ? `: questões ${Number(first) || 1} a ${(Number(first) || 1) + parsed.length - 1}` : ''}.</span>
        </label>
        {official ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-sm">Fonte<input required className={field} value={sourceName} onChange={(e) => setSourceName(e.target.value)} placeholder="INEP" /></label>
            <label className="text-sm">Link do documento<input required type="url" className={field} value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} /></label>
            <label className="text-sm">Publicado em<input required type="date" className={field} value={publishedAt} onChange={(e) => setPublishedAt(e.target.value)} /></label>
          </div>
        ) : null}
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} />Publicar agora (senão fica em rascunho)</label>
        {message ? <p role={message.ok ? 'status' : 'alert'} className={`rounded-lg p-3 text-sm ${message.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>{message.text}</p> : null}
        <Button disabled={busy}><Plus size={17} />{busy ? 'Salvando…' : 'Salvar gabarito'}</Button>
      </form>
      <div className="rounded-xl border bg-white p-5">
        <h2 className="font-semibold">Meus gabaritos</h2>
        {!mine.length ? <p className="mt-2 text-sm text-graphite-500">Nenhum ainda.</p> : null}
        <ul className="mt-2 divide-y">{mine.map((k) => (
          <li key={k.id} className="py-2 text-sm">
            <p className="font-medium">{keyTitle(k)}</p>
            <p className="text-xs text-graphite-500">{k.questionCount} questões · {k.status === 'PUBLISHED' ? 'publicado' : k.status === 'DRAFT' ? 'rascunho' : 'arquivado'}</p>
            <div className="mt-1 flex gap-2">
              {k.status !== 'PUBLISHED' ? <button type="button" className="text-xs underline" onClick={() => void setStatus(k.id, 'PUBLISHED')}>Publicar</button> : <button type="button" className="text-xs underline" onClick={() => void setStatus(k.id, 'DRAFT')}>Despublicar</button>}
              <button type="button" className="text-xs text-red-700 underline" onClick={() => void setStatus(k.id, 'ARCHIVED')}>Arquivar</button>
            </div>
          </li>
        ))}</ul>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ painel do professor

function ClassStatsTab() {
  const [keys, setKeys] = useState<AnswerKeySummary[]>([]);
  const [keyId, setKeyId] = useState('');
  const [stats, setStats] = useState<AnswerKeyStats | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { apiAnswerKeys(token()).then(setKeys).catch((e) => setError(errorText(e, 'Não foi possível carregar os gabaritos.'))); }, []);
  useEffect(() => {
    if (!keyId) { setStats(null); return; }
    setError('');
    apiAnswerKeyStats(token(), keyId).then(setStats).catch((e) => setError(errorText(e, 'Não foi possível carregar o desempenho.')));
  }, [keyId]);
  return (
    <section className="mt-6 space-y-5">
      <label className="block max-w-xl text-sm">Gabarito
        <select className="mt-1 block w-full rounded-lg border px-3 py-2" value={keyId} onChange={(e) => setKeyId(e.target.value)}>
          <option value="">Escolha…</option>
          {keys.map((k) => <option key={k.id} value={k.id}>{keyTitle(k)}{k.official ? ' (oficial)' : ''}</option>)}
        </select>
      </label>
      <p className="text-xs text-graphite-500">Mostra a conferência mais recente de cada aluno das suas turmas neste gabarito.</p>
      {error ? <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {stats && !stats.students ? <p className="rounded-xl bg-surface-card p-4 text-sm text-graphite-500">Nenhum aluno das suas turmas conferiu este gabarito ainda.</p> : null}
      {stats && stats.students ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border bg-white p-4"><p className="text-xs text-graphite-500">Alunos que conferiram</p><p className="mt-1 text-2xl font-bold">{stats.students}</p></div>
            <div className="rounded-xl border bg-white p-4"><p className="text-xs text-graphite-500">Acerto médio</p><p className="mt-1 text-2xl font-bold">{stats.averagePercent.toLocaleString('pt-BR')}%</p></div>
          </div>
          {stats.byArea.length ? (
            <div className="rounded-xl border bg-white p-4">
              <h3 className="font-semibold">Por área</h3>
              <div className="mt-3 space-y-3">{stats.byArea.map((a) => (
                <div key={a.area}><div className="flex justify-between text-sm"><span>{a.area}</span><span className="font-semibold">{a.percent.toLocaleString('pt-BR')}%</span></div><div className="mt-1 h-2 rounded-full bg-surface-card"><div className="h-2 rounded-full bg-primary" style={{ width: `${a.percent}%` }} /></div></div>
              ))}</div>
            </div>
          ) : null}
          <div className="overflow-x-auto rounded-xl border bg-white p-4">
            <h3 className="font-semibold">Questões mais difíceis para a turma</h3>
            <table className="mt-2 w-full min-w-[520px] text-left text-sm">
              <thead className="text-xs text-graphite-400"><tr><th className="py-1">Questão</th><th>Área</th><th>Acerto</th><th>Gabarito</th><th>Distrator mais escolhido</th></tr></thead>
              <tbody className="divide-y">{stats.questions.slice(0, 15).map((q) => (
                <tr key={q.number}><td className="py-1.5 font-semibold">{q.number}</td><td className="text-xs">{q.area}</td><td>{q.correctPercent.toLocaleString('pt-BR')}%</td><td>{letter(q.answer)}</td><td>{q.topDistractor ? `${letter(q.topDistractor.position)} (${q.topDistractor.count} aluno${q.topDistractor.count > 1 ? 's' : ''})` : '—'}</td></tr>
              ))}</tbody>
            </table>
          </div>
          <div className="overflow-x-auto rounded-xl border bg-white p-4">
            <h3 className="font-semibold">Alunos</h3>
            <table className="mt-2 w-full min-w-[420px] text-left text-sm">
              <thead className="text-xs text-graphite-400"><tr><th className="py-1">Aluno</th><th>Acerto</th><th>Acertos</th><th>Conferido em</th></tr></thead>
              <tbody className="divide-y">{stats.ranking.map((r) => (
                <tr key={r.userId}><td className="py-1.5">{r.name}</td><td className="font-semibold">{r.percent.toLocaleString('pt-BR')}%</td><td>{r.correct}/{r.scored}</td><td className="text-xs">{new Date(r.checkedAt).toLocaleDateString('pt-BR')}</td></tr>
              ))}</tbody>
            </table>
          </div>
        </>
      ) : null}
    </section>
  );
}

// ------------------------------------------------------------------ página

export function SmartAnswerKey() {
  const { user } = useAuth();
  const staff = STAFF.includes(user?.accountType ?? '');
  const [tab, setTab] = useState<'check' | 'performance' | 'create' | 'classes'>('check');
  const [result, setResult] = useState<AnswerKeyCheckResult | null>(null);
  const [error, setError] = useState('');

  async function openCheck(id: string) {
    setError('');
    try { setResult(await apiAnswerKeyCheck(token(), id)); } catch (e) { setError(errorText(e, 'Não foi possível abrir a conferência.')); }
  }

  const tabs: { id: typeof tab; label: string }[] = [
    { id: 'check', label: 'Conferir prova' },
    { id: 'performance', label: 'Meu desempenho' },
    ...(staff ? [{ id: 'create' as const, label: 'Cadastrar gabarito' }, { id: 'classes' as const, label: 'Desempenho das turmas' }] : []),
  ];

  return (
    <main className="min-h-screen bg-surface-card px-5 py-8 text-graphite sm:px-8">
      <div className="mx-auto max-w-5xl">
        <Link to="/app" className="text-sm font-semibold">← Voltar à visão geral</Link>
        <h1 className="mt-6 text-3xl font-bold">Gabarito Inteligente</h1>
        <p className="mt-2 max-w-2xl text-graphite-500">Escolha a prova, marque suas respostas e veja na hora acertos, erros e desempenho por área. O gabarito oficial vem marcado como <strong>Oficial</strong>, com a fonte; os demais aparecem como não oficiais.</p>
        {error ? <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
        {result ? <ResultView result={result} onBack={() => setResult(null)} /> : (
          <>
            <div className="mt-6 flex gap-2 border-b" role="tablist">
              {tabs.map((t) => <button key={t.id} role="tab" aria-selected={tab === t.id} type="button" onClick={() => setTab(t.id)} className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold ${tab === t.id ? 'border-primary text-graphite' : 'border-transparent text-graphite-400'}`}>{t.label}</button>)}
            </div>
            {tab === 'check' ? <CheckTab onResult={setResult} /> : tab === 'performance' ? <PerformanceTab onOpen={(id) => void openCheck(id)} /> : tab === 'classes' ? <ClassStatsTab /> : <CreateTab isAdmin={user?.accountType === 'ADMIN'} />}
          </>
        )}
      </div>
    </main>
  );
}
