import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getAccessToken } from '@/lib/auth';
import { useAuth } from '@/contexts/AuthContext';
import {
  apiAdaptiveAbandon,
  apiAdaptiveAnswer,
  apiAdaptiveList,
  apiAdaptiveNext,
  apiAdaptiveStart,
  apiAdaptiveSummary,
  type AdaptiveAnswerResult,
  type AdaptiveNextQuestion,
  type AdaptiveSessionSummary,
  type AdaptiveSessionSummaryDetail,
  type QuestionDifficulty,
} from '@/lib/api';

const token = () => getAccessToken() ?? '';
const DIFFICULTY_LABEL: Record<QuestionDifficulty, string> = { FACIL: 'Fácil', MEDIA: 'Média', DIFICIL: 'Difícil' };
const DIFFICULTY_COLOR: Record<QuestionDifficulty, string> = { FACIL: 'bg-success/15 text-success', MEDIA: 'bg-primary/15 text-primary-700', DIFICIL: 'bg-alert/15 text-alert' };

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function AdaptiveSimulation() {
  const { user: _user } = useAuth();
  const [params, setParams] = useSearchParams();
  const id = params.get('id');
  const [sessions, setSessions] = useState<AdaptiveSessionSummary[]>([]);
  const [session, setSession] = useState<AdaptiveSessionSummaryDetail | null>(null);
  const [question, setQuestion] = useState<AdaptiveNextQuestion | null>(null);
  const [result, setResult] = useState<AdaptiveAnswerResult | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [examId, setExamId] = useState('');
  const [timeSpent, setTimeSpent] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refreshSessions = async () => {
    try { setSessions(await apiAdaptiveList(token())); } catch { setError('Não foi possível carregar as sessões.'); }
  };

  useEffect(() => { void refreshSessions(); }, []);
  useEffect(() => { if (!id) { setSession(null); setQuestion(null); setResult(null); stopTimer(); return; } loadSession(); }, [id]);

  async function loadSession() {
    try {
      const summary = await apiAdaptiveSummary(token(), id!);
      setSession(summary);
      if (summary.status === 'IN_PROGRESS') await loadNextQuestion();
    } catch { setError('Não foi possível carregar a sessão.'); }
  }

  async function loadNextQuestion() {
    try {
      const next = await apiAdaptiveNext(token(), id!);
      setQuestion(next);
      setAnswers({});
      setTimeSpent(0);
      startTimer();
    } catch { setError('Não foi possível carregar a próxima questão.'); }
  }

  function startTimer() {
    stopTimer();
    timerRef.current = setInterval(() => setTimeSpent((t) => t + 1), 1000);
  }

  function stopTimer() { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } }

  async function run(action: () => Promise<unknown>) {
    setBusy(true); setError('');
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : 'Erro inesperado.'); }
    finally { setBusy(false); }
  }

  async function handleStart() {
    await run(async () => {
      const { sessionId } = await apiAdaptiveStart(token(), examId || undefined);
      setParams({ id: sessionId });
    });
  }

  async function handleAnswer() {
    if (!question || !id) return;
    const selected = Object.values(answers).find((v) => v !== undefined) ?? 0;
    if (!selected) { setError('Selecione uma alternativa.'); return; }
    stopTimer();
    await run(async () => {
      const res = await apiAdaptiveAnswer(token(), id, { questionId: question.questionId, selectedPosition: selected, timeSpentSeconds: timeSpent });
      setResult(res);
      if (res.finished) {
        await loadSession();
      } else {
        setTimeout(() => { setResult(null); loadNextQuestion(); }, 1500);
      }
    });
  }

  async function handleAbandon() {
    if (!id) return;
    await run(async () => {
      await apiAdaptiveAbandon(token(), id);
      setParams({});
      await refreshSessions();
    });
  }

  return <main className="min-h-screen bg-surface-card px-5 py-8 text-graphite sm:px-8">
    <div className="mx-auto max-w-5xl">
      <div className="print:hidden"><Link to="/app" className="text-sm font-semibold">← Voltar à visão geral</Link></div>
      <h1 className="mt-6 text-3xl font-bold">Simulado Adaptativo</h1>
      <p className="mt-2 text-sm text-graphite-500">A dificuldade muda em tempo real conforme seu desempenho. O diagnóstico final aponta seus pontos fortes e lacunas.</p>
      {error && <p role="alert" className="my-4 rounded-lg bg-red-50 p-3 text-red-700">{error}</p>}

      {/* Lista de sessões */}
      {!id && (
        <>
          <section className="mt-6 rounded-xl border bg-white p-5">
            <h2 className="font-bold">Nova sessão</h2>
            <div className="my-4 flex gap-3 flex-wrap">
              <input value={examId} onChange={e => setExamId(e.target.value)} placeholder="ID do exame (opcional, ex: ENEM)" className="flex-1 min-w-[200px] rounded-lg border p-2" />
              <button onClick={handleStart} disabled={busy} className="rounded-lg bg-graphite px-5 py-2 text-white disabled:opacity-50">Iniciar simulado adaptativo</button>
            </div>
          </section>

          <section className="mt-6 rounded-xl border bg-white p-5">
            <h2 className="font-bold">Histórico</h2>
            {sessions.length ? (
              <div className="mt-4 space-y-3">
                {sessions.map(s => (
                  <Link key={s.id} to={`/app/simulados/adaptativo?id=${s.id}`} className="block border-b pb-3 hover:underline last:border-0">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{s.examId ? `Exame: ${s.examId}` : 'Exame: todos'}</p>
                        <p className="text-sm text-graphite-500">
                          {s.status === 'IN_PROGRESS' ? 'Em andamento' : s.status === 'COMPLETED' ? 'Concluído' : 'Abandonado'} ·
                          {s.stepsCount} questões · Nível estimado: {Math.round(s.estimatedAbility * 100)}%
                        </p>
                      </div>
                      <span className="px-2 py-0.5 rounded text-xs font-medium
                        {s.status === 'IN_PROGRESS' ? 'bg-primary-100 text-primary-700' :
                         s.status === 'COMPLETED' ? 'bg-success-100 text-success-700' :
                         'bg-graphite-100 text-graphite-700'}">
                        {s.status === 'IN_PROGRESS' ? 'Em andamento' : s.status === 'COMPLETED' ? 'Concluído' : 'Abandonado'}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-graphite-400">Iniciado: {new Date(s.startedAt).toLocaleString('pt-BR')}{s.finishedAt ? ` · Finalizado: ${new Date(s.finishedAt).toLocaleString('pt-BR')}` : ''}</p>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-graphite-400">Nenhuma sessão ainda.</p>
            )}
          </section>
        </>
      )}

      {/* Sessão ativa */}
      {id && session && (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-3 print:hidden">
            <Link to="/app/simulados/adaptativo" className="underline">← Voltar à lista</Link>
            <div className="ml-auto flex items-center gap-4 text-sm">
              <span className="px-2 py-0.5 rounded font-medium
                {session.status === 'IN_PROGRESS' ? 'bg-primary-100 text-primary-700' :
                 session.status === 'COMPLETED' ? 'bg-success-100 text-success-700' :
                 'bg-graphite-100 text-graphite-700'}">
                {session.status === 'IN_PROGRESS' ? 'Em andamento' : session.status === 'COMPLETED' ? 'Concluído' : 'Abandonado'}
              </span>
              <span className="font-mono">Nível: {Math.round(session.estimatedAbility * 100)}%</span>
              <span className="font-mono">Questão {session.steps + 1}</span>
              {session.status === 'IN_PROGRESS' && <span className="px-2 py-0.5 rounded bg-primary-50 text-primary-700 font-mono">{formatTime(timeSpent)}</span>}
            </div>
          </div>

          {session.status === 'IN_PROGRESS' && question ? (
            <section className="mt-6 rounded-xl border bg-white p-5">
              <h2 className="text-xl font-bold mb-4">Questão {session.steps + 1}</h2>
              <div className="mb-4 flex items-center gap-3">
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${DIFFICULTY_COLOR[question.difficulty]}`}>{DIFFICULTY_LABEL[question.difficulty]}</span>
                <span className="px-2 py-0.5 rounded bg-surface-card text-xs text-graphite-500">{question.skill}</span>
                {question.subSkill && <span className="px-2 py-0.5 rounded bg-surface-card text-xs text-graphite-500">{question.subSkill}</span>}
              </div>
              <p className="mb-4 text-lg">{question.stem}</p>
              <div className="space-y-2">
                {question.alternatives.map(a => (
                  <label key={a.position} className="flex cursor-pointer gap-3 rounded-lg border p-3 hover:bg-surface-card">
                    <input type="radio" name={`answer-${question.questionId}`} checked={answers[question.questionId] === a.position} onChange={() => setAnswers({ ...answers, [question.questionId]: a.position })} />
                    <span className="font-medium">{String.fromCharCode(64 + a.position)}</span>
                    <span>{a.text}</span>
                  </label>
                ))}
              </div>
              <div className="mt-6 flex gap-3">
                <button onClick={handleAnswer} disabled={busy || !Object.values(answers).length} className="rounded-lg bg-graphite px-5 py-3 font-semibold text-white disabled:opacity-50 flex-1">Enviar resposta</button>
                <button onClick={handleAbandon} className="rounded-lg border px-5 py-3 text-graphite">Abandonar</button>
              </div>
            </section>
          ) : null}

          {/* Feedback da resposta */}
          {result && (
            <section className="mt-6 rounded-xl border bg-white p-5" role="alert">
              <div className="flex items-center gap-3 mb-3">
                <span className={`text-2xl ${result.isCorrect ? 'text-green-600' : 'text-red-600'}`}>{result.isCorrect ? '✓' : '✗'}</span>
                <div>
                  <p className="font-semibold">{result.isCorrect ? 'Correto!' : 'Incorreto.'}</p>
                  <p className="text-sm text-graphite-500">Sua habilidade: {Math.round(result.abilityBefore * 100)}% → {Math.round(result.estimatedAbility * 100)}%</p>
                </div>
              </div>
              {result.finished && (
                <div className="mt-4 p-3 rounded-lg bg-primary-50">
                  <p className="font-semibold">Simulado concluído!</p>
                  <p className="text-sm text-graphite-500">Nível final estimado: {Math.round(result.estimatedAbility * 100)}%</p>
                  <p className="text-sm text-graphite-500">Pontos fortes: {result.diagnosis?.filter(d => d.ability > 0.7).map(d => d.skill).join(', ') || '—'}</p>
                  <p className="text-sm text-graphite-500">Lacunas: {result.diagnosis?.filter(d => d.ability < 0.3).map(d => d.skill).join(', ') || '—'}</p>
                </div>
              )}
            </section>
          )}

          {/* Resumo final */}
          {session.status === 'COMPLETED' && (
            <section className="mt-6 rounded-xl border bg-white p-5">
              <h2 className="text-xl font-bold">Diagnóstico Final</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="p-4 rounded-lg bg-success-50">
                  <h3 className="font-semibold text-success-700">Pontos fortes</h3>
                  <ul className="mt-2 space-y-1">
                    {session.strongAreas.length ? session.strongAreas.map(s => <li key={s} className="text-sm text-success-600">{s} ({Math.round((session.skills.find((x: { skill: string; ability: number }) => x.skill === s)?.ability ?? 0) * 100)}%)</li>) : <li className="text-sm text-graphite-400">Nenhum identificado ainda.</li>}
                  </ul>
                </div>
                <div className="p-4 rounded-lg bg-red-50">
                  <h3 className="font-semibold text-red-700">Lacunas a trabalhar</h3>
                  <ul className="mt-2 space-y-1">
                    {session.weakAreas.length ? session.weakAreas.map(s => <li key={s} className="text-sm text-red-600">{s} ({Math.round((session.skills.find((x: { skill: string; ability: number }) => x.skill === s)?.ability ?? 0) * 100)}%)</li>) : <li className="text-sm text-graphite-400">Nenhuma identificada ainda.</li>}
                  </ul>
                </div>
              </div>
              <div className="mt-6 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-graphite-500"><th className="pb-2">Habilidade</th><th className="pb-2">Acertos</th><th className="pb-2">Total</th><th className="pb-2">Precisão</th><th className="pb-2">Nível</th></tr></thead>
                  <tbody>
                    {session.skills.map(s => (
                      <tr key={s.skill} className="border-t border-surface-line">
                        <td className="py-2">{s.skill}</td>
                        <td className="py-2">{s.correct}</td>
                        <td className="py-2">{s.total}</td>
                        <td className="py-2">{s.accuracy}%</td>
                        <td className="py-2">{Math.round(s.ability * 100)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  </main>;
}