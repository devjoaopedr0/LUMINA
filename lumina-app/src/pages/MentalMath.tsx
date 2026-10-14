import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Brain, Flame, Timer } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { getAccessToken } from '@/lib/auth';
import { apiMathStart, apiMathAnswer, apiMathSession, apiMathHistory, type MathSession, type MathHistory } from '@/lib/api';

export function MentalMath() {
  const [params, setParams] = useSearchParams();
  const id = params.get('sessao');
  const [session, setSession] = useState<MathSession | null>(null);
  const [history, setHistory] = useState<MathHistory | null>(null);
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [historyError, setHistoryError] = useState('');
  const [seconds, setSeconds] = useState(15);
  const deadline = useRef(0);
  const locked = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const failedTimeout = useRef('');

  const accept = useCallback((next: MathSession) => {
    deadline.current = performance.now() + next.remainingMs;
    setSeconds(Math.ceil(next.remainingMs / 1000));
    setSession(next);
    setAnswer('');
  }, []);

  useEffect(() => {
    let active = true;
    apiMathHistory(getAccessToken() ?? '').then(data => { if (active) { setHistory(data); setHistoryError(''); } })
      .catch(() => { if (active) setHistoryError('Não foi possível carregar o histórico. Recarregue a página para tentar novamente.'); });
    return () => { active = false; };
  }, [session?.completed]);

  useEffect(() => {
    if (!id) { setSession(null); return; }
    let active = true;
    setSession(null);
    setBusy(true);
    setError('');
    apiMathSession(getAccessToken() ?? '', id).then(data => { if (active) accept(data); })
      .catch(() => { if (active) setError('Não foi possível abrir o treino. Recarregue a página para tentar novamente.'); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [id, accept]);

  async function start(mode: 'free' | 'daily') {
    if (locked.current) return;
    locked.current = true;
    setBusy(true); setError('');
    try {
      const next = await apiMathStart(getAccessToken() ?? '', mode);
      accept(next);
      setParams({ sessao: next.id });
    } catch { setError('Não foi possível iniciar o treino. Tente novamente.'); }
    finally { locked.current = false; setBusy(false); }
  }

  const submit = useCallback(async (value: number | null) => {
    if (!session || session.completed || locked.current) return;
    locked.current = true;
    setBusy(true); setError('');
    try { accept(await apiMathAnswer(getAccessToken() ?? '', session.id, session.version, value)); }
    catch {
      failedTimeout.current = `${session.id}:${session.version}`;
      setError('Não foi possível confirmar a resposta. Tente enviar novamente; ela será registrada uma única vez.');
    } finally { locked.current = false; setBusy(false); }
  }, [session, accept]);

  useEffect(() => {
    if (!session || session.completed || busy || error) return;
    input.current?.focus();
    const tick = () => {
      const remaining = Math.max(0, deadline.current - performance.now());
      setSeconds(Math.ceil(remaining / 1000));
      if (!remaining && failedTimeout.current !== `${session.id}:${session.version}`) void submit(null);
    };
    tick();
    const timer = window.setInterval(tick, 100);
    return () => window.clearInterval(timer);
  }, [session, busy, error, submit]);

  const playing = session && !session.completed;
  const last = session?.attempts.at(-1);
  return <main className="min-h-screen bg-surface-card px-5 py-8 text-graphite sm:px-8">
    <div className="mx-auto max-w-4xl">
      <Link to="/app" className="inline-flex items-center gap-2 text-sm font-semibold"><ArrowLeft size={16} />Voltar à visão geral</Link>
      <header className="my-8"><span className="inline-flex items-center gap-2 text-sm font-semibold text-primary-700"><Brain size={20} />Matemática em movimento</span><h1 className="mt-3 text-3xl font-bold">Cálculo mental rápido</h1><p className="mt-3 text-graphite-500">Dez cálculos. Quinze segundos por resposta. Acerte três seguidos para subir de nível.</p></header>
      {error ? <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">{error}</p> : null}
      {busy ? <p role="status" className="mb-3 text-sm">Carregando…</p> : null}
      {!playing ? <div className="mb-6 flex flex-wrap gap-3"><Button disabled={busy} onClick={() => void start('free')}>Iniciar treino livre</Button><Button disabled={busy} onClick={() => void start('daily')}>Desafio diário</Button><p className="w-full text-xs text-graphite-500">Um desafio por dia, no horário de Brasília. Você pode retomar pela mesma URL; o tempo continua correndo.</p></div> : null}
      {playing && session.question ? <Card className="bg-white p-6 sm:p-10">
        <div className="flex flex-wrap justify-between gap-3 text-sm font-semibold"><span>Questão {session.version + 1} de {session.totalQuestions} · Nível {session.level}</span><span className="inline-flex items-center gap-2"><Flame size={18} />{session.streak} seguidos</span><span className="inline-flex items-center gap-2" role="timer" aria-label={`${seconds} segundos restantes`}><Timer size={18} />{seconds}s</span></div>
        <progress aria-label="Tempo restante" max={15} value={seconds} className="mt-4 h-2 w-full accent-primary" />
        <p className="my-10 text-center text-5xl font-bold sm:text-7xl">{session.question.left} {session.question.operation} {session.question.right}</p>
        <form className="mx-auto flex max-w-sm flex-col gap-3" onSubmit={event => { event.preventDefault(); if (/^-?\d+$/.test(answer) && Math.abs(Number(answer)) <= 100000) void submit(Number(answer)); }}>
          <label htmlFor="math-answer" className="text-sm font-semibold">Sua resposta</label>
          <input ref={input} id="math-answer" inputMode="numeric" autoComplete="off" value={answer} disabled={busy || seconds === 0} onChange={event => setAnswer(event.target.value)} className="rounded-xl border border-surface-line p-4 text-center text-2xl focus:outline-primary" />
          <Button type="submit" disabled={busy || seconds === 0 || !/^-?\d+$/.test(answer) || Math.abs(Number(answer)) > 100000}>Responder · Enter</Button>
          <button type="button" disabled={busy} onClick={() => void submit(null)} className="p-2 text-sm underline">{seconds === 0 ? 'Continuar após o tempo esgotado' : 'Pular cálculo'}</button>
        </form>
        <p aria-live="polite" className="mt-6 min-h-6 text-center text-sm">{last ? last.correct ? 'Você acertou o cálculo anterior!' : `Anterior: ${last.left} ${last.operation} ${last.right} = ${last.answer}. Vamos tentar o próximo!` : 'Concentre-se e responda pelo teclado.'}</p>
      </Card> : null}
      {session?.completed ? <Card className="mb-6 bg-white p-6"><h2 className="text-xl font-bold">Rodada concluída</h2><p className="my-3">{session.summary.correct}/{session.summary.total} acertos · {session.summary.accuracy}% de precisão · {(session.summary.averageMs / 1000).toFixed(1)}s por resposta · Melhor sequência: {session.bestStreak}</p><h3 className="mt-5 font-semibold">Cálculos para revisar</h3>{session.attempts.every(a => a.correct) ? <p className="mt-2">Você acertou todos os cálculos!</p> : <ul className="mt-2 space-y-2">{session.attempts.map((a, i) => !a.correct ? <li key={i}>{a.left} {a.operation} {a.right} = <strong>{a.answer}</strong> <span className="text-graphite-500">· Sua resposta: {a.submitted ?? 'não respondida'}{a.elapsedMs >= 15000 ? ' (tempo esgotado)' : ''}</span></li> : null)}</ul>}</Card> : null}
      <section className="mt-8"><h2 className="text-xl font-bold">Sua evolução</h2><p className="mt-1 text-sm text-graphite-500">Últimas 30 rodadas concluídas. O tempo médio inclui erros e respostas expiradas.</p>
        {historyError ? <p role="alert" className="mt-4">{historyError}</p> : null}
        {history ? history.sessions.length ? <>
          <div className="my-5 grid grid-cols-2 gap-3 sm:grid-cols-4">{history.operations.map(item => <Card key={item.operation} className="bg-white p-4"><p className="text-2xl font-bold">{item.operation}</p><p className="mt-2">{item.total ? `${item.accuracy}% de acertos` : 'Sem respostas'}</p><p className="text-sm text-graphite-500">{item.total ? `${(item.averageMs / 1000).toFixed(1)}s · ${item.total - item.correct} erros` : 'Faça um treino'}</p></Card>)}</div>
          <ul className="divide-y divide-surface-line rounded-xl bg-white px-5">{history.sessions.map(item => <li key={item.id} className="flex flex-wrap justify-between gap-2 py-4">{playing || busy ? <span>{item.mode === 'daily' ? 'Desafio diário' : 'Treino livre'} · {new Date(item.createdAt).toLocaleDateString('pt-BR')}</span> : <Link className="font-semibold underline" to={`?sessao=${item.id}`}>{item.mode === 'daily' ? 'Desafio diário' : 'Treino livre'} · {new Date(item.createdAt).toLocaleDateString('pt-BR')}</Link>}<span>{item.accuracy}% · {(item.averageMs / 1000).toFixed(1)}s</span></li>)}</ul>
        </> : <p className="mt-4 rounded-xl bg-white p-6">Conclua sua primeira rodada para acompanhar a velocidade e os acertos por operação.</p> : !historyError ? <p className="mt-4">Carregando histórico…</p> : null}
      </section>
    </div>
  </main>;
}
