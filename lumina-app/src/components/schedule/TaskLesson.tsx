import { Fragment, useEffect, useState, type ReactNode } from "react";
import { Loader2, Play, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { type StudyTask, type StudyTaskLesson, type TopicLevel, ApiError, apiGetTaskLesson } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";

interface TaskLessonProps {
  task: StudyTask;
  onClose: () => void;
  /** Sai do resumo direto para as questões do tópico. */
  onPractice: () => void;
}

const LEVEL_LABEL: Record<TopicLevel, string> = {
  BASE: "Base",
  INTERMEDIARIO: "Intermediário",
  AVANCADO: "Avançado",
};

/** **negrito** dentro de uma linha; o resto é texto puro (nada de HTML). */
function inline(text: string): ReactNode {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, index) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={index} className="font-semibold text-graphite">{part.slice(2, -2)}</strong>
    ) : (
      <Fragment key={index}>{part}</Fragment>
    ),
  );
}

/** O resumo vem em seções ("## "), listas ("- ") e parágrafos. */
function LessonContent({ content }: { content: string }) {
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  const flushList = () => {
    if (list.length === 0) return;
    const items = list;
    list = [];
    blocks.push(
      <ul key={`list-${blocks.length}`} className="ml-4 flex list-disc flex-col gap-1.5 text-sm leading-relaxed text-graphite-500">
        {items.map((item, index) => <li key={index}>{inline(item)}</li>)}
      </ul>,
    );
  };

  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (line.startsWith("- ")) {
      list.push(line.slice(2));
      continue;
    }
    flushList();
    if (!line) continue;
    if (line.startsWith("## ")) {
      blocks.push(
        <h3 key={`heading-${blocks.length}`} className="mt-3 text-sm font-semibold uppercase tracking-wide text-primary-700 first:mt-0">
          {line.slice(3)}
        </h3>,
      );
    } else {
      blocks.push(
        <p key={`text-${blocks.length}`} className="text-sm leading-relaxed text-graphite-500">{inline(line)}</p>,
      );
    }
  }
  flushList();
  return <div className="flex flex-col gap-2.5">{blocks}</div>;
}

/**
 * Resumo de teoria do tópico da tarefa: o que estudar na tarefa de "Teoria",
 * sem sair do app. Na primeira abertura de um tópico o texto é preparado na
 * hora (leva alguns segundos); depois abre direto.
 */
export function TaskLesson({ task, onClose, onPractice }: TaskLessonProps) {
  const [lesson, setLesson] = useState<StudyTaskLesson | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    apiGetTaskLesson(getAccessToken() ?? "", task.id)
      .then((data) => !cancelled && setLesson(data))
      .catch((err) => !cancelled && setError(err instanceof ApiError ? err.message : "Não foi possível carregar o resumo."));
    return () => {
      cancelled = true;
    };
  }, [task.id, attempt]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <div role="dialog" aria-label="Resumo do tópico" className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-[24px] bg-white">
        <div className="flex items-start justify-between gap-4 border-b border-surface-line px-6 py-5 sm:px-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-primary-700">
              {task.subjectName ?? "Teoria"}
              {lesson?.level ? ` · ${LEVEL_LABEL[lesson.level]}` : ""}
            </p>
            <h2 className="mt-1 text-lg font-semibold text-graphite">{task.topic?.name ?? task.title}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar resumo" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-graphite-400 hover:bg-graphite/5">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 sm:px-8">
          {!lesson && !error && (
            <p className="flex items-center gap-2 py-10 text-sm text-graphite-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Preparando o resumo desse tópico... na primeira vez leva alguns segundos.
            </p>
          )}
          {error && (
            <div className="rounded-xl border border-alert/20 bg-alert/5 p-4">
              <p className="text-sm text-alert">{error}</p>
              <Button className="mt-3" size="sm" variant="outline" onClick={() => setAttempt((value) => value + 1)}>
                Tentar de novo
              </Button>
            </div>
          )}
          {lesson && (
            <>
              <LessonContent content={lesson.content} />
              {lesson.source === "AI" && (
                <p className="mt-5 flex items-start gap-2 rounded-xl bg-surface-card p-3 text-xs text-graphite-400">
                  <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  Resumo gerado por IA para você começar. Pode conter erros: confira datas, nomes e fórmulas no seu material.
                </p>
              )}
            </>
          )}
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-surface-line px-6 py-4 sm:px-8">
          <Button variant="ghost" onClick={onClose}>Fechar</Button>
          <Button onClick={onPractice}>
            <Play className="h-4 w-4" />
            Praticar agora
          </Button>
        </div>
      </div>
    </div>
  );
}
