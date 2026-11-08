import { useState } from "react";
import {
  AlertCircle,
  Brain,
  CheckCircle2,
  Lightbulb,
  Loader2,
  Plus,
  RotateCcw,
  Sparkles,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  apiAnswerQuestion,
  apiGenerateSimilarQuestion,
  apiGetQuestionHint,
  ApiError,
  type AttemptResult,
  type Question,
  type QuestionHint,
} from "@/lib/api";
import { askAi } from "@/lib/ai-chat";
import { getAccessToken } from "@/lib/auth";
import { positionLetter } from "@/lib/question-labels";

export interface ResolutionAlternative {
  id: string;
  text: string;
  position: number;
}

export interface QuestionResolutionProps {
  questionId: string;
  alternatives: ResolutionAlternative[];
  /** Comentário do gabarito, mostrado só depois de responder. */
  explanation?: string | null;
  /** Chamada a cada resposta registrada. O caderno de erros usa para atualizar
   *  a linha do tempo sem precisar chamar a API de novo. */
  onAnswered?: (result: AttemptResult) => void;
  /** Texto do botão de responder (o caderno escreve "Tentar de novo"). */
  answerLabel?: string;
  /** A questão gerada pela LuminIA não oferece nova geração em cascata. */
  allowSimilarQuestion?: boolean;
}

/**
 * Resolver a questão: escolher alternativa, pedir dica, responder e ver o
 * gabarito comentado.
 *
 * Vive fora do cartão de propósito — é a mesma mecânica no banco de questões e
 * no caderno de erros, e o item que o aluno errou precisa ser respondível de
 * novo sem sair da fila. As dicas empilham (nível 1, 2, 3) e param no máximo
 * informado pelo servidor; nenhuma delas revela a alternativa correta.
 */
export function QuestionResolution({
  questionId,
  alternatives,
  explanation,
  onAnswered,
  answerLabel = "Responder",
  allowSimilarQuestion = true,
}: QuestionResolutionProps) {
  const [selectedPosition, setSelectedPosition] = useState<number | null>(null);
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hints, setHints] = useState<QuestionHint[]>([]);
  const [hintLoading, setHintLoading] = useState(false);
  const [hintError, setHintError] = useState<string | null>(null);
  const [similar, setSimilar] = useState<Question | null>(null);
  const [similarLoading, setSimilarLoading] = useState(false);
  const [similarError, setSimilarError] = useState<string | null>(null);

  /** O servidor informa o teto de dicas. Chegou nele, não há o que pedir. */
  const semMaisDicas =
    hints.length > 0 && hints.length >= (hints[hints.length - 1]?.maxLevel ?? 3);

  async function askHint() {
    const nextLevel = hints.length + 1;
    setHintLoading(true);
    setHintError(null);
    const token = getAccessToken() ?? "";
    try {
      const hint = await apiGetQuestionHint(token, questionId, nextLevel);
      setHints((current) => [...current, hint]);
    } catch (err) {
      setHintError(
        err instanceof ApiError ? err.message : "Não foi possível obter a dica."
      );
    } finally {
      setHintLoading(false);
    }
  }

  async function handleAnswer() {
    if (selectedPosition === null) {
      setError("Escolha uma alternativa para responder.");
      return;
    }
    setError(null);
    setSubmitting(true);
    const token = getAccessToken() ?? "";
    try {
      const attempt = await apiAnswerQuestion(token, questionId, selectedPosition);
      setResult(attempt);
      onAnswered?.(attempt);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Não foi possível registrar sua resposta. Tente novamente."
      );
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setSelectedPosition(null);
    setResult(null);
    setError(null);
  }

  /** Abre a LuminIA já com a questão como contexto. Antes de responder, o
   *  servidor recebe a instrução de não entregar o gabarito; depois, ele
   *  recebe a alternativa marcada e o comentário para explicar o erro/acerto. */
  function askLuminia() {
    const message = result
      ? result.isCorrect
        ? "Explique por que a minha resposta está correta e qual é o conceito por trás desta questão."
        : "Explique por que a minha resposta está errada e como chegar à alternativa correta nesta questão."
      : "Me ajude a resolver esta questão, sem entregar a resposta.";
    askAi({ message, questionId });
  }

  /** Pede ao servidor uma variação inédita da questão. O cliente não manda
   *  enunciado, alternativas nem gabarito: a referência é carregada e validada
   *  no backend, e a nova questão fica salva no workspace pessoal. */
  async function createSimilar() {
    setSimilarLoading(true);
    setSimilarError(null);
    const token = getAccessToken() ?? "";
    try {
      const generated = await apiGenerateSimilarQuestion(token, questionId);
      setSimilar(generated);
    } catch (err) {
      setSimilarError(
        err instanceof ApiError
          ? err.message
          : "Não foi possível criar uma questão parecida agora. Tente novamente."
      );
    } finally {
      setSimilarLoading(false);
    }
  }

  function closeSimilar() {
    setSimilar(null);
    setSimilarError(null);
  }

  /** Abre o chat no modo socrático: a LuminIA faz perguntas e dá pistas
   *  progressivas, sem entregar a alternativa correta antes da tentativa. */
  function askLuminiaSocratic() {
    const message = result
      ? result.isCorrect
        ? "Quero consolidar esta questão com perguntas. Me ajude a explicar por que cheguei à resposta certa, sem repetir a resolução pronta."
        : "Quero entender onde errei usando perguntas, sem receber a resposta pronta. Me conduza passo a passo."
      : "Quero resolver esta questão com perguntas, sem receber a resposta. Me conduza com pistas progressivas.";
    askAi({ message, questionId, socratic: true });
  }

  function alternativeStyle(position: number): string {
    if (result) {
      if (position === result.correctPosition) {
        return "border-success bg-success/5 text-graphite";
      }
      if (position === result.selectedPosition && !result.isCorrect) {
        return "border-alert bg-alert/5 text-alert";
      }
      return "border-surface-line bg-white text-graphite-500";
    }
    if (selectedPosition === position) {
      return "border-primary bg-primary/10 text-graphite";
    }
    return "border-surface-line bg-white text-graphite hover:border-graphite/30";
  }

  return (
    <div>
      <div className="mt-5 flex flex-col gap-2.5">
        {alternatives.map((alternative) => (
          <button
            key={alternative.id}
            type="button"
            onClick={() => {
              setSelectedPosition(alternative.position);
              setError(null);
            }}
            disabled={result !== null || submitting}
            className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-all disabled:cursor-default ${alternativeStyle(alternative.position)}`}
          >
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-graphite/5 text-xs font-semibold text-graphite-600">
              {positionLetter(alternative.position)}
            </span>
            <span className="text-sm leading-relaxed">{alternative.text}</span>
            {result && alternative.position === result.correctPosition && (
              <CheckCircle2 className="ml-auto mt-0.5 h-5 w-5 shrink-0 text-success" />
            )}
            {result && alternative.position === result.selectedPosition && !result.isCorrect && (
              <XCircle className="ml-auto mt-0.5 h-5 w-5 shrink-0 text-alert" />
            )}
          </button>
        ))}
      </div>

      {hints.length > 0 && (
        <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-3">
          <p className="text-xs font-semibold text-primary-700">
            {hints.length === 1 ? "Dica" : "Dicas (" + hints.length + ")"}
          </p>
          <ul className="mt-2 flex flex-col gap-2">
            {hints.map((hint, index) => (
              <li key={hint.level} className="text-sm leading-relaxed text-graphite-600">
                <span className="font-semibold text-graphite">{index + 1}.</span>{" "}
                {hint.hint}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-graphite-400">
            As dicas ajudam a destravar a questão, mas nunca revelam a alternativa correta.
          </p>
        </div>
      )}

      {hintError && (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-alert/20 bg-alert/5 p-3 text-sm text-alert">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{hintError}</span>
        </div>
      )}

      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-alert/20 bg-alert/5 p-3 text-sm text-alert">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {result && (
        <div
          className={`mt-4 flex items-start gap-2 rounded-xl border p-3 text-sm ${
            result.isCorrect
              ? "border-success/25 bg-success/5 text-graphite-600"
              : "border-alert/25 bg-alert/5 text-alert"
          }`}
        >
          {result.isCorrect ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
          ) : (
            <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-alert" />
          )}
          <span>
            {result.isCorrect
              ? "Acertou!"
              : `Errou — a alternativa correta é a ${positionLetter(result.correctPosition)}.`}
          </span>
        </div>
      )}

      {result && explanation && (
        <div className="mt-3 rounded-xl border border-primary/20 bg-primary/5 p-3">
          <p className="text-xs font-semibold text-primary-700">Gabarito comentado</p>
          <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-graphite-600">
            {explanation}
          </p>
        </div>
      )}

      {result && result.explanations && result.explanations.length > 0 && (
        <div className="mt-3 rounded-xl border border-surface-line bg-white p-3">
          <p className="text-xs font-semibold text-graphite">Por que cada alternativa está assim</p>
          <ul className="mt-2 flex flex-col gap-2">
            {result.explanations.map((feedback) => (
              <li key={feedback.position} className="text-sm leading-relaxed text-graphite-600">
                <span className="font-semibold text-graphite">
                  {positionLetter(feedback.position)}
                  {feedback.selected ? " (sua resposta)" : ""}:
                </span>{" "}
                {feedback.explanation}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={askLuminia}>
            <Sparkles className="h-4 w-4" />
            Pedir ajuda à LuminIA
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={askLuminiaSocratic}>
            <Brain className="h-4 w-4" />
            Modo socrático
          </Button>
          {allowSimilarQuestion && !similar && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={createSimilar}
              disabled={similarLoading}
            >
              {similarLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              {similarLoading ? "Criando questão..." : "Criar questão parecida"}
            </Button>
          )}
          {!result && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={askHint}
              disabled={hintLoading || semMaisDicas}
            >
              {hintLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Lightbulb className="h-4 w-4" />
              )}
              {hints.length === 0 ? "Pedir dica" : semMaisDicas ? "Sem mais dicas" : "Outra dica"}
            </Button>
          )}
        </div>
        {result ? (
          <Button type="button" variant="outline" size="sm" onClick={reset}>
            <RotateCcw className="h-4 w-4" />
            Responder novamente
          </Button>
        ) : (
          <Button type="button" size="sm" onClick={handleAnswer} disabled={submitting}>
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            {answerLabel}
          </Button>
        )}
      </div>

      {similarError && !similar && (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-alert/20 bg-alert/5 p-3 text-sm text-alert">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{similarError}</span>
        </div>
      )}

      {similar && (
        <section
          aria-live="polite"
          className="mt-5 rounded-2xl border border-primary/25 bg-primary/5 p-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="flex items-center gap-1.5 text-sm font-semibold text-primary-700">
                <Sparkles className="h-4 w-4" />
                Questão parecida
              </p>
              <p className="mt-1 text-xs leading-relaxed text-graphite-500">
                Gerada pela LuminIA e salva no seu banco pessoal. Ela não é uma
                questão oficial e não passou por revisão humana.
              </p>
            </div>
            <button
              type="button"
              onClick={closeSimilar}
              className="shrink-0 text-xs font-medium text-graphite-400 transition-colors hover:text-graphite"
            >
              Fechar
            </button>
          </div>
          <p className="mt-4 whitespace-pre-line text-[15px] leading-relaxed text-graphite">
            {similar.stem}
          </p>
          <QuestionResolution
            questionId={similar.id}
            alternatives={similar.alternatives}
            explanation={similar.explanation}
            allowSimilarQuestion={false}
          />
        </section>
      )}
    </div>
  );
}
