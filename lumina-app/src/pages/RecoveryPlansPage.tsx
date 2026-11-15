import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Circle, Clock3, Lock, PlayCircle } from 'lucide-react';
import { QuestionResolution } from '@/components/QuestionResolution';
import { VideoLessonsModal } from '@/components/VideoLessonsModal';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import {
  ApiError,
  apiCancelRecoveryPlan,
  apiGetQuestion,
  apiGetRecoveryPlan,
  apiMyRecoveryPlans,
  apiRecoveryPlanVideo,
  type Question,
} from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import {
  PLAN_STATUS_LABEL,
  STEP_STATE_LABEL,
  currentStep,
  masteryDelta,
  planProgress,
  poolSummary,
  type RecoveryPlan,
  type RecoveryStep,
} from '@/lib/recovery-plans';

const dateBr = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });

function StepIcon({ step }: { step: RecoveryStep }) {
  if (step.state === 'DONE') return <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden />;
  if (step.state === 'LOCKED') return <Lock className="h-5 w-5 text-graphite-300" aria-hidden />;
  if (step.state === 'WAITING') return <Clock3 className="h-5 w-5 text-amber-600" aria-hidden />;
  if (step.kind === 'VIDEO') return <PlayCircle className="h-5 w-5 text-primary-700" aria-hidden />;
  return <Circle className="h-5 w-5 text-primary-700" aria-hidden />;
}

/** Questões da etapa atual, respondidas sem sair do plano. */
function StepQuestions({ step, onAnswered }: { step: RecoveryStep; onAnswered: () => void }) {
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [error, setError] = useState('');
  // Recarrega só quando o conjunto de questões muda: atualizar o progresso a
  // cada resposta não pode apagar o gabarito que o aluno acabou de ver.
  const idsKey = step.questionIds.join(',');
  useEffect(() => {
    let alive = true;
    setQuestions(null);
    Promise.all(idsKey.split(',').filter(Boolean).map((id) => apiGetQuestion(getAccessToken() ?? '', id)))
      .then((q) => alive && setQuestions(q))
      .catch(() => alive && setError('Não foi possível carregar as questões desta etapa.'));
    return () => {
      alive = false;
    };
  }, [idsKey]);

  if (error) return <p role="alert" className="text-sm text-red-700">{error}</p>;
  if (!questions) return <p role="status" className="text-sm text-graphite-500">Carregando questões…</p>;
  return (
    <ol className="space-y-5">
      {questions.map((q, i) => (
        <li key={q.id} className="rounded-2xl border border-surface-line bg-white p-4">
          <p className="text-xs font-semibold text-graphite-400">
            Questão {i + 1} de {questions.length} · {q.subject} · {q.topic}
            {step.results[q.id] === true ? ' · certa' : step.results[q.id] === false ? ' · errada (pode refazer)' : ''}
          </p>
          <p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed">{q.stem}</p>
          <QuestionResolution questionId={q.id} alternatives={q.alternatives} explanation={q.explanation} onAnswered={onAnswered} allowSimilarQuestion={false} />
        </li>
      ))}
    </ol>
  );
}

function PlanDetail({ plan, onChange }: { plan: RecoveryPlan; onChange: (p: RecoveryPlan) => void }) {
  const [video, setVideo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const step = currentStep(plan);
  // A etapa que o aluno está vendo só muda quando ele pede: ao bater a meta,
  // o gabarito da última resposta continua na tela.
  const [viewKind, setViewKind] = useState<string | null>(step?.kind ?? null);
  const viewing = plan.steps.find((s) => s.kind === viewKind && s.questionIds.length > 0) ?? step;
  const finishedViewing = viewing && viewing.state === 'DONE' && viewing.kind !== step?.kind;
  const delta = masteryDelta(plan);
  const pool = poolSummary(plan.poolInfo);
  const refresh = useCallback(() => {
    apiGetRecoveryPlan(getAccessToken() ?? '', plan.id).then(onChange).catch(() => undefined);
  }, [plan.id, onChange]);

  async function act(fn: () => Promise<RecoveryPlan>) {
    setBusy(true);
    setError('');
    try {
      onChange(await fn());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Não foi possível concluir a ação.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <Card className="bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-primary-700">{plan.subjectName}</p>
            <h2 className="text-2xl font-bold">{plan.topicName}</h2>
            <p className="mt-1 text-sm text-graphite-500">
              {PLAN_STATUS_LABEL[plan.status]} · {planProgress(plan)}% · criado em {dateBr(plan.createdAt)}
              {plan.createdBySelf ? '' : ' pelo seu professor'}
            </p>
          </div>
          {plan.status === 'ACTIVE' ? (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => void act(() => apiCancelRecoveryPlan(getAccessToken() ?? '', plan.id))}>Cancelar plano</Button>
          ) : null}
        </div>
        <div className="mt-3 h-2 rounded-full bg-surface-card" aria-hidden>
          <div className="h-2 rounded-full bg-primary" style={{ width: `${planProgress(plan)}%` }} />
        </div>
        {pool ? <p className="mt-3 text-xs text-graphite-500">{pool}</p> : null}
        {plan.status === 'COMPLETED' ? (
          <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">
            Plano concluído.{' '}
            {delta === null
              ? 'O domínio do assunto passa a ser acompanhado no mapa de domínio.'
              : `Domínio do assunto: ${plan.baselineMastery} → ${plan.currentMastery} (${delta >= 0 ? '+' : ''}${delta} pontos).`}
          </p>
        ) : null}
        {error ? <p role="alert" className="mt-3 text-sm text-red-700">{error}</p> : null}
      </Card>

      <ol className="space-y-2" aria-label="Etapas do plano">
        {plan.steps.map((s) => (
          <li key={s.kind} className={`flex items-start gap-3 rounded-xl border p-3 text-sm ${step?.kind === s.kind ? 'border-primary bg-primary/5' : 'border-surface-line bg-white'}`}>
            <StepIcon step={s} />
            <div className="flex-1">
              <p className="font-semibold">{s.title} <span className="font-normal text-graphite-400">· {STEP_STATE_LABEL[s.state]}</span></p>
              {s.questionIds.length ? (
                <p className="text-graphite-500">{s.correct} de {s.questionIds.length} certas · meta {s.target}</p>
              ) : null}
              {s.kind === 'REVIEW' && s.state === 'WAITING' ? <p className="text-graphite-500">Libera em {dateBr(plan.reviewAt)}: rever depois de alguns dias fixa o conteúdo.</p> : null}
              {s.kind === 'REASSESS' && s.state === 'DONE' && delta !== null ? <p className="text-graphite-500">Domínio {plan.baselineMastery} → {plan.currentMastery}</p> : null}
              {s.note ? <p className="text-xs text-amber-800">{s.note}</p> : null}
              {s.kind === 'VIDEO' && plan.status === 'ACTIVE' ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => setVideo(true)}>Ver videoaulas</Button>
                  {s.state !== 'DONE' ? <Button size="sm" variant="ghost" disabled={busy} onClick={() => void act(() => apiRecoveryPlanVideo(getAccessToken() ?? '', plan.id))}>Já assisti</Button> : null}
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ol>

      {viewing && (plan.status === 'ACTIVE' || finishedViewing) ? (
        <section aria-label={viewing.title}>
          <h3 className="mb-3 text-lg font-bold">{viewing.title}</h3>
          {finishedViewing ? (
            <div role="status" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">
              <span>Etapa concluída: {viewing.correct} de {viewing.questionIds.length} certas.</span>
              {step ? <Button size="sm" onClick={() => setViewKind(step.kind)}>Ir para: {step.title}</Button> : null}
            </div>
          ) : null}
          <StepQuestions key={viewing.kind} step={viewing} onAnswered={refresh} />
        </section>
      ) : null}
      {video ? <VideoLessonsModal topicId={plan.topicId} topic={plan.topicName} onClose={() => setVideo(false)} /> : null}
    </div>
  );
}

/** /app/recuperacao — planos de recuperação do aluno. */
export function RecoveryPlansPage() {
  const [plans, setPlans] = useState<RecoveryPlan[] | null>(null);
  const [error, setError] = useState('');
  const [params, setParams] = useSearchParams();
  const selectedId = params.get('plano');

  useEffect(() => {
    apiMyRecoveryPlans(getAccessToken() ?? '')
      .then(setPlans)
      .catch(() => setError('Não foi possível carregar seus planos.'));
  }, []);

  const replace = useCallback((p: RecoveryPlan) => setPlans((list) => (list ? list.map((x) => (x.id === p.id ? p : x)) : list)), []);
  const selected = plans?.find((p) => p.id === selectedId) ?? plans?.find((p) => p.status === 'ACTIVE') ?? null;

  return (
    <main className="min-h-screen bg-surface-card px-5 py-8 text-graphite sm:px-8">
      <div className="mx-auto max-w-5xl">
        <Link to="/app" className="inline-flex items-center gap-2 text-sm font-semibold"><ArrowLeft size={16} />Voltar à visão geral</Link>
        <header className="my-8">
          <h1 className="text-3xl font-bold">Planos de recuperação</h1>
          <p className="mt-3 max-w-3xl text-graphite-500">
            Um caminho curto para um assunto em que você tem dificuldade: videoaula, questões que sobem de nível, uma revisão alguns dias depois e a reavaliação do domínio.
            Para começar um plano, abra o <Link to="/app/dominio" className="text-primary-700 underline">mapa de domínio</Link> e escolha um assunto em atenção.
          </p>
        </header>
        {error ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">{error}</p> : null}
        {!plans && !error ? <p role="status" className="text-sm text-graphite-500">Carregando…</p> : null}
        {plans && plans.length === 0 ? (
          <Card className="bg-white p-6">
            <p className="text-sm text-graphite-500">Você ainda não tem planos. No mapa de domínio, os assuntos em atenção ou críticos têm o botão "Plano de recuperação".</p>
          </Card>
        ) : null}
        {plans && plans.length > 0 ? (
          <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
            <nav aria-label="Seus planos" className="space-y-2">
              {plans.map((p) => (
                <button key={p.id} type="button" onClick={() => setParams({ plano: p.id }, { replace: true })}
                  className={`w-full rounded-xl border p-3 text-left text-sm ${selected?.id === p.id ? 'border-primary bg-white' : 'border-surface-line bg-white/60'}`}>
                  <p className="font-semibold">{p.topicName}</p>
                  <p className="text-xs text-graphite-500">{PLAN_STATUS_LABEL[p.status]} · {planProgress(p)}%</p>
                </button>
              ))}
            </nav>
            {selected ? <PlanDetail key={selected.id} plan={selected} onChange={replace} /> : null}
          </div>
        ) : null}
      </div>
    </main>
  );
}
