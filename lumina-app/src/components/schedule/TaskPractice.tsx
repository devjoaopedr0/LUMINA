import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  type AttemptResult,
  type StudyTask,
  type StudyTaskPractice,
  ApiError,
  apiAnswerQuestion,
  apiCompleteTaskPractice,
  apiGetTaskPractice,
} from "@/lib/api";
import { getAccessToken } from "@/lib/auth";

interface TaskPracticeProps {
  task: StudyTask;
  onClose: () => void;
  /** A tarefa foi concluída pela prática — já vem com o resultado. */
  onCompleted: (task: StudyTask | null) => void;
}

function resultMessage(correct: number, answered: number): string {
  const rate = answered > 0 ? correct / answered : 0;
  if (rate >= 0.8) return "Mandou bem! Esse tópico está avançando — ele volta mais para frente só para revisar.";
  if (rate >= 0.5) return "Bom caminho. O cronograma vai trazer mais questões desse tópico para firmar o que falta.";
  return "Esse tópico ainda precisa de atenção, e tudo bem: os erros já estão no seu caderno e o cronograma vai reforçar esse conteúdo.";
}

/**
 * Prática da tarefa do cronograma: um bloco de questões do tópico, uma por
 * vez. Cada resposta é uma tentativa normal (alimenta o domínio do tópico) e,
 * ao terminar, a tarefa é concluída com o resultado — sem o aluno precisar
 * marcar "Concluir" à mão.
 */
export function TaskPractice({ task, onClose, onCompleted }: TaskPracticeProps) {
  const [practice, setPractice] = useState<StudyTaskPractice | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [score, setScore] = useState({ answered: 0, correct: 0 });
  /** Parou no meio: mostra o resultado e deixa escolher concluir ou não. */
  const [stopped, setStopped] = useState(false);
  const [completed, setCompleted] = useState<StudyTask | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiGetTaskPractice(getAccessToken() ?? "", task.id)
      .then((data) => !cancelled && setPractice(data))
      .catch((err) => !cancelled && setLoadError(err instanceof ApiError ? err.message : "Não foi possível carregar as questões."));
    return () => {
      cancelled = true;
    };
  }, [task.id]);

  const questions = practice?.questions ?? [];
  const reachedEnd = practice !== null && questions.length > 0 && index >= questions.length;
  const showResult = reachedEnd || stopped;
  const current = showResult ? null : questions[index];

  async function complete() {
    if (!practice || completed) return;
    setBusy(true);
    setError(null);
    try {
      const done = await apiCompleteTaskPractice(
        getAccessToken() ?? "",
        task.id,
        practice.questions.map((question) => question.id),
      );
      setCompleted(done);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível concluir a tarefa.");
    } finally {
      setBusy(false);
    }
  }

  // Chegou ao fim do bloco: a tarefa se conclui sozinha.
  useEffect(() => {
    if (reachedEnd && score.answered > 0 && !completed) void complete();
    // `complete` depende só do que já está nas dependências abaixo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reachedEnd]);

  async function answer() {
    if (!current || selected === null) return;
    setBusy(true);
    setError(null);
    try {
      const attempt = await apiAnswerQuestion(getAccessToken() ?? "", current.id, selected);
      setResult(attempt);
      setScore((previous) => ({
        answered: previous.answered + 1,
        correct: previous.correct + (attempt.isCorrect ? 1 : 0),
      }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível registrar a resposta.");
    } finally {
      setBusy(false);
    }
  }

  function next() {
    setSelected(null);
    setResult(null);
    setIndex((value) => value + 1);
  }

  function close() {
    if (completed) onCompleted(completed);
    else onClose();
  }

  function stop() {
    if (score.answered > 0 && !showResult) setStopped(true);
    else close();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div role="dialog" aria-label="Praticar tarefa" className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[24px] bg-white p-6 sm:p-8">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-primary-700">
              {task.subjectName ?? "Prática"}{task.topic ? ` · ${task.topic.name}` : ""}
            </p>
            <h2 className="mt-1 text-lg font-semibold text-graphite">
              {current
                ? `Questão ${index + 1} de ${questions.length}`
                : showResult
                  ? "Resultado da prática"
                  : "Praticar"}
            </h2>
          </div>
          <button type="button" onClick={stop} aria-label="Fechar prática" className="flex h-8 w-8 items-center justify-center rounded-full text-graphite-400 hover:bg-graphite/5">
            <X className="h-4 w-4" />
          </button>
        </div>

        {practice === null && !loadError && (
          <p className="flex items-center gap-2 py-8 text-sm text-graphite-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Separando as questões...
          </p>
        )}
        {loadError && <p className="rounded-xl border border-alert/20 bg-alert/5 p-3 text-sm text-alert">{loadError}</p>}

        {practice !== null && questions.length === 0 && (
          <>
            <p className="text-sm text-graphite-500">
              Esse tópico ainda não tem questões no banco. Estude pelo seu material e, quando terminar, marque a tarefa em "Concluir".
            </p>
            <div className="mt-5 flex justify-end">
              <Button onClick={onClose}>Entendi</Button>
            </div>
          </>
        )}

        {questions.length > 0 && (
          <div className="mb-5 h-1.5 w-full rounded-full bg-surface-line">
            <div
              className="h-1.5 rounded-full bg-primary transition-all"
              style={{ width: `${(Math.min(showResult ? score.answered : index, questions.length) / questions.length) * 100}%` }}
            />
          </div>
        )}

        {current && (
          <>
            <p className="whitespace-pre-line text-sm leading-relaxed text-graphite">{current.stem}</p>

            <div className="mt-4 flex flex-col gap-2">
              {[...current.alternatives]
                .sort((a, b) => a.position - b.position)
                .map((alternative) => {
                  const isSelected = selected === alternative.position;
                  const isCorrect = result?.correctPosition === alternative.position;
                  const isWrongPick = result !== null && isSelected && !result.isCorrect;
                  return (
                    <button
                      key={alternative.id}
                      type="button"
                      disabled={result !== null || busy}
                      onClick={() => setSelected(alternative.position)}
                      aria-pressed={isSelected}
                      className={`flex items-start gap-3 rounded-xl border p-3 text-left text-sm transition-colors ${
                        isCorrect
                          ? "border-success/40 bg-success/10 text-graphite"
                          : isWrongPick
                            ? "border-alert/40 bg-alert/5 text-graphite"
                            : isSelected
                              ? "border-primary bg-primary/10 text-graphite"
                              : "border-surface-line bg-white text-graphite hover:border-graphite/30"
                      }`}
                    >
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-graphite/5 text-xs font-semibold">
                        {String.fromCharCode(64 + alternative.position)}
                      </span>
                      <span className="flex-1">{alternative.text}</span>
                      {isCorrect && <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />}
                    </button>
                  );
                })}
            </div>

            {error && <p className="mt-3 text-xs text-alert">{error}</p>}
            {result && (
              <p className={`mt-3 text-sm font-medium ${result.isCorrect ? "text-success" : "text-alert"}`}>
                {result.isCorrect ? "Acertou!" : "Não foi dessa vez — a correta está marcada, e a questão foi para o seu caderno de erros."}
              </p>
            )}

            <div className="mt-5 flex flex-wrap justify-between gap-3">
              <Button variant="ghost" size="sm" onClick={stop}>
                {score.answered > 0 ? "Parar por aqui" : "Agora não"}
              </Button>
              {result ? (
                <Button onClick={next}>{index + 1 < questions.length ? "Próxima" : "Ver resultado"}</Button>
              ) : (
                <div className="flex gap-2">
                  <Button variant="outline" onClick={next} disabled={busy}>Pular</Button>
                  <Button onClick={() => void answer()} disabled={selected === null || busy}>
                    {busy ? "Enviando..." : "Responder"}
                  </Button>
                </div>
              )}
            </div>
          </>
        )}

        {showResult && (
          <>
            {score.answered > 0 ? (
              <>
                <p className="text-3xl font-bold text-graphite">
                  {score.correct}/{score.answered}
                  <span className="ml-2 text-base font-medium text-graphite-400">
                    acerto{score.correct === 1 ? "" : "s"}
                  </span>
                </p>
                <p className="mt-2 text-sm text-graphite-500">{resultMessage(score.correct, score.answered)}</p>
              </>
            ) : (
              <p className="text-sm text-graphite-500">
                Você pulou todas as questões, então a tarefa continua em aberto. Volte quando quiser tentar.
              </p>
            )}

            {error && <p className="mt-3 text-xs text-alert">{error}</p>}
            {completed && (
              <p className="mt-4 flex items-center gap-2 rounded-xl bg-success/10 p-3 text-sm font-medium text-success">
                <CheckCircle2 className="h-4 w-4" /> Tarefa concluída com esse resultado.
              </p>
            )}

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              {completed || score.answered === 0 ? (
                <Button onClick={close}>Fechar</Button>
              ) : (
                <>
                  {stopped && (
                    <Button variant="ghost" onClick={onClose} disabled={busy}>Continuar depois</Button>
                  )}
                  <Button onClick={() => void complete()} disabled={busy}>
                    {busy ? "Concluindo..." : "Concluir tarefa"}
                  </Button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
