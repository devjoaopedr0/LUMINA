import { useState } from "react";
import { CheckCircle2, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  type AttemptResult,
  type StudyDiagnosticArea,
  ApiError,
  apiAnswerQuestion,
} from "@/lib/api";
import { getAccessToken } from "@/lib/auth";

interface DiagnosticQuizProps {
  areas: StudyDiagnosticArea[];
  onClose: () => void;
  /** Chamado ao terminar (ou parar no meio, com pelo menos uma resposta). */
  onFinished: () => void;
}

/**
 * Diagnóstico inicial do onboarding (fase 5): poucas questões por área,
 * uma de cada vez. Cada resposta usa a tentativa normal de questão, que já
 * alimenta o domínio por tópico — ao terminar, o cronograma é refeito
 * sabendo o nível do aluno.
 */
export function DiagnosticQuiz({ areas, onClose, onFinished }: DiagnosticQuizProps) {
  const questions = areas.flatMap((area) => area.questions.map((question) => ({ area, question })));
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scores, setScores] = useState<Record<string, { correct: number; total: number }>>({});

  const answered = Object.values(scores).reduce((sum, score) => sum + score.total, 0);
  const finished = index >= questions.length;
  const current = finished ? null : questions[index];

  async function answer() {
    if (!current || selected === null) return;
    setBusy(true);
    setError(null);
    try {
      const attempt = await apiAnswerQuestion(getAccessToken() ?? "", current.question.id, selected);
      setResult(attempt);
      setScores((previous) => {
        const score = previous[current.area.label] ?? { correct: 0, total: 0 };
        return {
          ...previous,
          [current.area.label]: {
            correct: score.correct + (attempt.isCorrect ? 1 : 0),
            total: score.total + 1,
          },
        };
      });
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

  function stop() {
    if (answered > 0) onFinished();
    else onClose();
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <div role="dialog" aria-label="Diagnóstico inicial" className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[24px] bg-white p-6 sm:p-8">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-primary-700">Diagnóstico inicial</p>
            <h2 className="mt-1 text-lg font-semibold text-graphite">
              {current ? `${current.area.label} · questão ${index + 1} de ${questions.length}` : "Diagnóstico concluído"}
            </h2>
          </div>
          <button type="button" onClick={stop} aria-label="Fechar diagnóstico" className="flex h-8 w-8 items-center justify-center rounded-full text-graphite-400 hover:bg-graphite/5">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-5 h-1.5 w-full rounded-full bg-surface-line">
          <div className="h-1.5 rounded-full bg-primary transition-all" style={{ width: `${(Math.min(index, questions.length) / Math.max(questions.length, 1)) * 100}%` }} />
        </div>

        {current ? (
          <>
            <p className="text-xs text-graphite-400">{current.question.subject} · {current.question.topic}</p>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-graphite">{current.question.stem}</p>

            <div className="mt-4 flex flex-col gap-2">
              {[...current.question.alternatives]
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
                {result.isCorrect ? "Acertou!" : "Não foi dessa vez — a correta está marcada."}
              </p>
            )}

            <div className="mt-5 flex flex-wrap justify-between gap-3">
              <Button variant="ghost" size="sm" onClick={stop}>
                {answered > 0 ? "Parar por aqui" : "Agora não"}
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
        ) : (
          <>
            <p className="text-sm text-graphite-500">
              Seu cronograma agora sabe por onde começar: os tópicos em que você errou sobem na fila e os que você acertou avançam para questões.
            </p>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {areas.map((area) => {
                const score = scores[area.label] ?? { correct: 0, total: 0 };
                return (
                  <div key={area.area} className="rounded-xl border border-surface-line p-3">
                    <p className="text-xs text-graphite-400">{area.label}</p>
                    <p className="mt-1 text-lg font-bold text-graphite">
                      {score.total > 0 ? `${score.correct}/${score.total} acertos` : "Sem respostas"}
                    </p>
                  </div>
                );
              })}
            </div>
            <div className="mt-5 flex justify-end">
              <Button onClick={answered > 0 ? onFinished : onClose}>Atualizar meu cronograma</Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
