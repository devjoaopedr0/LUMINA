import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getAccessToken } from '@/lib/auth';
import { useAuth } from '@/contexts/AuthContext';
import {
  apiCreateSimulation,
  apiCreateSimulationClass,
  apiJoinSimulationClass,
  apiListQuestions,
  apiSimulation,
  apiSimulationClasses,
  apiSimulationResult,
  apiSimulations,
  apiSubmitSimulation,
  type AssessmentType,
  type Question,
  type Simulation,
  type SimulationClass,
  type SimulationResult,
  type SimulationSummary,
} from '@/lib/api';

const token = () => getAccessToken() ?? '';
const ASSESSMENT_LABEL: Record<AssessmentType, string> = { ACTIVITY: 'Atividade', LIST: 'Lista', TEST: 'Prova', SIMULATION: 'Simulado' };

/** Converte segundos em MM:SS. */
function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function Simulations() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const id = params.get('id');
  const [classes, setClasses] = useState<SimulationClass[]>([]);
  const [list, setList] = useState<SimulationSummary[]>([]);
  const [simulation, setSimulation] = useState<Simulation | null>(null);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [questions, setQuestions] = useState<Question[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [classId, setClassId] = useState('');
  const [assessmentType, setAssessmentType] = useState<AssessmentType>('SIMULATION');
  const [dueAt, setDueAt] = useState('');
  const [className, setClassName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [durationMinutes, setDurationMinutes] = useState<number | undefined>(undefined);
  const [isRealExam, setIsRealExam] = useState(false);

  // Timer state
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [timerActive, setTimerActive] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef<Date | null>(null);

  const refresh = async () => {
    const [nextClasses, nextList] = await Promise.all([apiSimulationClasses(token()), apiSimulations(token())]);
    setClasses(nextClasses); setList(nextList);
  };

  useEffect(() => { void refresh().catch(() => setError('Não foi possível carregar os simulados.')); }, []);

  // Load simulation when id changes
  useEffect(() => {
    if (!id) { setSimulation(null); setResult(null); setAnswers({}); stopTimer(); return; }
    let active = true;
    Promise.all([apiSimulation(token(), id), apiSimulationResult(token(), id).catch(() => null)])
      .then(([row, saved]) => {
        if (active) {
          setSimulation(row);
          setResult(saved);
          setAnswers({});
          // Start timer if simulation has duration and not already submitted
          if (row.durationMinutes && !saved) startTimer(row.durationMinutes * 60, row.isRealExam);
        }
      })
      .catch(() => { if (active) setError('Não foi possível abrir o simulado.'); });
    return () => { active = false; };
  }, [id]);

  // Load questions for the question bank (when not viewing a simulation)
  useEffect(() => {
    if (id) return;
    let active = true;
    apiListQuestions(token(), { search, page, limit: 20 })
      .then(result => { if (active) { setQuestions(result.items); setTotalPages(result.totalPages); } })
      .catch(() => { if (active) setError('Não foi possível carregar as questões.'); });
    return () => { active = false; };
  }, [id, search, page]);

  // Timer logic
  function startTimer(initialSeconds: number, isRealExamMode: boolean) {
    stopTimer();
    setTimeLeft(initialSeconds);
    setTimerActive(true);
    startedAtRef.current = new Date();
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev === null || prev <= 1) {
          stopTimer();
          if (isRealExamMode) autoSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  function stopTimer() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setTimerActive(false);
    setTimeLeft(null);
  }

  async function autoSubmit() {
    if (busy || !simulation) return;
    setBusy(true); setError('');
    try {
      const saved = await apiSubmitSimulation(token(), simulation.id,
        simulation.items.map(item => ({ position: item.position, selectedPosition: answers[item.position] ?? 0 })));
      setResult(saved);
      stopTimer();
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível enviar automaticamente.'); }
    finally { setBusy(false); }
  }

  async function run(action: () => Promise<unknown>) {
    setBusy(true); setError('');
    try { await action(); await refresh(); } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível concluir a ação.'); }
    finally { setBusy(false); }
  }

  function toggle(questionId: string) {
    setSelected(current => current.includes(questionId) ? current.filter(x => x !== questionId) : current.length < 90 ? [...current, questionId] : current);
  }

  const canSubmit = simulation && !result && Object.keys(answers).length === simulation.items.length;
  const isRealExamMode = simulation?.isRealExam ?? false;
  const showTimer = simulation?.durationMinutes !== null && simulation?.durationMinutes !== undefined && !result;

  return <main className="min-h-screen bg-surface-card px-5 py-8 text-graphite sm:px-8">
    <div className="mx-auto max-w-5xl">
      <div className="print:hidden"><Link to="/app" className="text-sm font-semibold">← Voltar à visão geral</Link></div>
      <h1 className="mt-6 text-3xl font-bold">Simulados</h1>
      <Link to="/app/turmas" className="my-4 inline-block underline print:hidden">Gerenciar turmas, vínculos e histórico</Link>
      {error && <p role="alert" className="my-4 rounded-lg bg-red-50 p-3 text-red-700 print:hidden">{error}</p>}

      {id ? simulation ? <>
        {/* Header with timer */}
        <div className="my-5 flex flex-wrap items-center gap-3 print:hidden">
          <button onClick={() => { stopTimer(); setParams({}); }} className="rounded-lg border px-4 py-2">Voltar aos simulados</button>
          <button onClick={() => window.print()} className="rounded-lg bg-graphite px-4 py-2 text-white">Imprimir prova e cartão</button>
          {showTimer && (
            <div className={`ml-auto flex items-center gap-2 px-3 py-1 rounded-lg font-mono text-lg ${isRealExamMode ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-primary-50 text-primary-700 border border-primary-200'}`}>
              <span className="sr-only">Tempo restante</span>
              {timerActive ? (
                <>
                  <span aria-live="polite">{formatTime(timeLeft ?? 0)}</span>
                  {isRealExamMode && <span className="text-xs uppercase tracking-wide">prova real</span>}
                </>
              ) : (
                <span className={isRealExamMode ? 'text-red-600' : 'text-graphite-500'}>Tempo esgotado</span>
              )}
            </div>
          )}
        </div>

        <h2 className="text-2xl font-bold">{simulation.title}</h2>
        <div className="mb-4 flex flex-wrap items-center gap-4 text-sm text-graphite-500">
          {simulation.className && <span>Turma: {simulation.className}</span>}
          {simulation.durationMinutes && <span>⏱ {simulation.durationMinutes} min</span>}
          {isRealExamMode && <span className="px-2 py-0.5 rounded bg-red-100 text-red-700 text-xs font-medium">Modo prova real</span>}
          {simulation.assessmentType !== 'SIMULATION' && <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-700 text-xs uppercase">{ASSESSMENT_LABEL[simulation.assessmentType].toLowerCase()}</span>}
        </div>
        <p className="mb-8 text-sm">Nome: ____________________________________ Data: ____ / ____ / ______</p>

        {/* Print version: questions grouped by area if available */}
        {simulation.items.map(item => <section key={item.id} className="mb-7 break-inside-avoid rounded-xl border bg-white p-5">
          <div className="flex items-baseline justify-between mb-2">
            <h3 className="font-semibold">{item.position}. {item.stem}</h3>
            {item.area && <span className="px-2 py-0.5 rounded bg-surface-card text-xs text-graphite-500">{item.area}</span>}
          </div>
          <p className="mb-3 text-xs text-graphite-400">{item.subject}</p>
          {item.alternatives.map(a => <p key={a.position} className="py-1">{String.fromCharCode(64 + a.position)}) {a.text}</p>)}
        </section>)}

        {/* Answering interface */}
        <section className="mb-7 rounded-xl border bg-white p-5 print:hidden">
          <h2 className="text-xl font-bold">Responder na plataforma</h2>
          {result ? (
            <>
              <p className="my-3 font-semibold">Resultado: {result.correct} de {result.total} acertos ({Math.round(100 * result.correct / result.total)}%).</p>
              {result.timeSpentMinutes && <p className="mb-3 text-sm text-graphite-500">Tempo gasto: {result.timeSpentMinutes} min</p>}
              {result.startedAt && <p className="mb-3 text-sm text-graphite-500">Iniciado em: {new Date(result.startedAt).toLocaleString('pt-BR')}</p>}
              {result.items.map(item => (
                <p key={item.position} className={item.isCorrect ? 'text-green-700' : 'text-red-700'}>
                  Questão {item.position} · marcou {String.fromCharCode(64 + item.selectedPosition)} · correta {String.fromCharCode(64 + item.correctPosition)} · {item.subject}{item.area ? ` (${item.area})` : ''}
                </p>
              ))}
            </>
          ) : (
            <>
              <p className="my-3 text-sm">Marque uma alternativa por questão. O envio é definitivo.{isRealExamMode && ' No modo prova real, o envio automático ocorre ao fim do tempo.'}</p>
              {simulation.items.map(item => (
                <div key={item.id} className="mb-4 border-b pb-3">
                  <div className="flex items-baseline justify-between mb-2">
                    <strong>Questão {item.position}</strong>
                    {item.area && <span className="px-2 py-0.5 rounded bg-surface-card text-xs text-graphite-500">{item.area}</span>}
                  </div>
                  <p className="mb-2 text-xs text-graphite-400">{item.subject}</p>
                  <div className="mt-2 flex flex-wrap gap-4">
                    {item.alternatives.map(a => (
                      <label key={a.position} className="cursor-pointer">
                        <input type="radio" name={`answer-${item.position}`} checked={answers[item.position] === a.position} onChange={() => setAnswers(current => ({ ...current, [item.position]: a.position }))} />
                        {String.fromCharCode(64 + a.position)}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              <button
                disabled={busy || !canSubmit || (isRealExamMode && timerActive)}
                onClick={() => void run(async () => {
                  const saved = await apiSubmitSimulation(token(), simulation!.id,
                    simulation!.items.map(item => ({ position: item.position, selectedPosition: answers[item.position] ?? 0 })));
                  setResult(saved);
                  stopTimer();
                })}
                className="rounded-lg bg-graphite px-5 py-3 font-semibold text-white disabled:opacity-50"
              >
                {isRealExamMode && timerActive ? 'Envio automático ao fim do tempo' : 'Enviar respostas'}
              </button>
            </>
          )}
        </section>

        {/* Answer sheet */}
        <section className="break-before-page rounded-xl border bg-white p-6">
          <h2 className="text-xl font-bold">Cartão-resposta</h2>
          <p className="text-xs">Lumina · versão {simulation.sheetVersion} · simulado {simulation.id}</p>
          <p className="my-5">Nome: ____________________________________ Turma: __________________</p>
          <p className="mb-5 text-sm">Pinte completamente uma bolinha por questão. Confira o número antes de marcar.</p>
          <div className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2 print:grid-cols-2">
            {simulation.items.map(item => (
              <div key={item.id} className="flex items-center gap-3 border-b pb-2 text-sm">
                <strong className="w-7">{String(item.position).padStart(2, '0')}</strong>
                {item.alternatives.map(a => <span key={a.position} className="whitespace-nowrap">◯ {String.fromCharCode(64 + a.position)}</span>)}
              </div>
            ))}
          </div>
        </section>
      </> : <p>Carregando simulado...</p> : (
        <>
          {/* Create class / join class */}
          <div className="my-7 grid gap-5 md:grid-cols-2">
            {user?.teacherSubject && (
              <form className="rounded-xl border bg-white p-5" onSubmit={e => { e.preventDefault(); void run(async () => { await apiCreateSimulationClass(token(), className); setClassName(''); }); }}>
                <h2 className="font-bold">Criar turma</h2>
                <input required maxLength={120} value={className} onChange={e => setClassName(e.target.value)} placeholder="Nome da turma" className="my-3 w-full rounded-lg border p-2" />
                <button disabled={busy} className="rounded-lg bg-graphite px-4 py-2 text-white">Criar turma</button>
              </form>
            )}
            <form className="rounded-xl border bg-white p-5" onSubmit={e => { e.preventDefault(); void run(async () => { await apiJoinSimulationClass(token(), joinCode); setJoinCode(''); }); }}>
              <h2 className="font-bold">Entrar em uma turma</h2>
              <input required maxLength={12} value={joinCode} onChange={e => setJoinCode(e.target.value)} placeholder="Código de ingresso" className="my-3 w-full rounded-lg border p-2" />
              <button disabled={busy} className="rounded-lg bg-graphite px-4 py-2 text-white">Entrar</button>
            </form>
          </div>
          {classes.length > 0 && (
            <section className="mb-7 rounded-xl border bg-white p-5">
              <h2 className="font-bold">Minhas turmas</h2>
              {classes.map(c => <p key={c.id} className="mt-2 text-sm">{c.name}{c.joinCode && <> · código para alunos: <strong>{c.joinCode}</strong></>}</p>)}
            </section>
          )}
          <section className="mb-7 rounded-xl border bg-white p-5">
            <h2 className="font-bold">Simulados disponíveis</h2>
            {list.length ? (
              list.map(s => (
                <button key={s.id} onClick={() => setParams({ id: s.id })} className="block w-full border-b py-3 text-left hover:underline">
                  <div className="flex items-center justify-between">
                    <span>{s.title} · {s.questionCount} questões{s.className ? ` · ${s.className}` : ''}</span>
                    <div className="flex items-center gap-2 text-xs text-graphite-500">
                      {s.durationMinutes && <span>⏱ {s.durationMinutes} min</span>}
                      {s.isRealExam && <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700">Prova real</span>}
                      {s.assessmentType !== 'SIMULATION' && <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">{ASSESSMENT_LABEL[s.assessmentType].toLowerCase()}</span>}
                    </div>
                  </div>
                  {s.result && <p className="mt-1 text-sm text-graphite-500">{s.result.correct} de {s.result.total} acertos · {new Date(s.result.submittedAt).toLocaleDateString('pt-BR')}</p>}
                </button>
              ))
            ) : (
              <p className="mt-3 text-sm">Nenhum simulado ainda.</p>
            )}
          </section>

          {/* Create simulation form */}
          <section className="rounded-xl border bg-white p-5">
            <h2 className="font-bold">Montar simulado</h2>
            <p className="text-sm text-graphite-400">Selecione de 1 a 90 questões. A ordem de seleção será a ordem da prova.</p>
            <div className="my-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <input value={title} maxLength={160} onChange={e => setTitle(e.target.value)} placeholder="Título do simulado" className="rounded-lg border p-2 sm:col-span-2 lg:col-span-3" />
              <select value={classId} onChange={e => setClassId(e.target.value)} className="rounded-lg border p-2">
                <option value="">Simulado pessoal</option>
                {classes.filter(c => c.isTeacher).map(c => <option key={c.id} value={c.id}>Turma: {c.name}</option>)}
              </select>
              <select value={assessmentType} onChange={e => setAssessmentType(e.target.value as AssessmentType)} className="rounded-lg border p-2">
                <option value="SIMULATION">Simulado</option>
                <option value="ACTIVITY">Atividade</option>
                <option value="LIST">Lista</option>
                <option value="TEST">Prova</option>
              </select>
              <label className="text-sm text-graphite-500">Prazo opcional<input type="datetime-local" value={dueAt} onChange={e => setDueAt(e.target.value)} className="mt-1 w-full rounded-lg border p-2" /></label>
              <label className="text-sm text-graphite-500">Duração (min) — opcional<input type="number" min={1} max={600} step={5} value={durationMinutes ?? ''} onChange={e => setDurationMinutes(e.target.value ? parseInt(e.target.value, 10) : undefined)} className="mt-1 w-full rounded-lg border p-2" /></label>
              <label className="flex items-center gap-2 text-sm text-graphite-500">
                <input type="checkbox" checked={isRealExam} onChange={e => setIsRealExam(e.target.checked)} />
                Modo prova real (exige duração)
              </label>
            </div>
            <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Buscar questões" className="mb-4 w-full rounded-lg border p-2" />
            <div className="space-y-2">{questions.map(q => <label key={q.id} className="flex cursor-pointer gap-3 rounded-lg border p-3"><input type="checkbox" checked={selected.includes(q.id)} onChange={() => toggle(q.id)} /><span><strong>{q.subject}</strong> · {q.stem.slice(0, 240)}</span></label>)}</div>
            <div className="my-4 flex items-center gap-3"><button disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded border px-3 py-1">Anterior</button><span>Página {page} de {totalPages}</span><button disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="rounded border px-3 py-1">Próxima</button></div>
            <button disabled={busy || !title.trim() || !selected.length} onClick={() => void run(async () => { const row = await apiCreateSimulation(token(), title, selected, classId || undefined, assessmentType, dueAt ? new Date(dueAt).toISOString() : undefined, durationMinutes, isRealExam); setSelected([]); setTitle(''); setDueAt(''); setDurationMinutes(undefined); setIsRealExam(false); setParams({ id: row.id }); })} className="rounded-lg bg-graphite px-5 py-3 font-semibold text-white disabled:opacity-50">Criar {ASSESSMENT_LABEL[assessmentType].toLowerCase()} com {selected.length} questões</button>
          </section>
        </>
      )}
    </div>
  </main>;
}