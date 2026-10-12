import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronUp, FileQuestion, RefreshCw } from "lucide-react";
import { Card } from "@/components/ui/Card";
import {
  type StudySubjectTopics,
  type StudyTask,
  type TopicMasteryStatus,
  ApiError,
  apiGetStudyTopics,
  apiSetTopicIncluded,
} from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { minutesToHours, topicQuestionsPath } from "./shared";

const STATUS_LABEL: Record<TopicMasteryStatus, string> = {
  NAO_ESTUDADO: "Não visto",
  APRENDENDO: "Aprendendo",
  PRATICANDO: "Praticando",
  DOMINADO: "Dominado",
  PRECISA_REFORCO: "Precisa de reforço",
};

const STATUS_BADGE: Record<TopicMasteryStatus, string> = {
  NAO_ESTUDADO: "border-surface-line bg-graphite/5 text-graphite-500",
  APRENDENDO: "border-primary/30 bg-primary/10 text-graphite",
  PRATICANDO: "border-primary/30 bg-primary/10 text-graphite",
  DOMINADO: "border-success/20 bg-success/10 text-success",
  PRECISA_REFORCO: "border-alert/20 bg-alert/5 text-alert",
};

interface SubjectTopicsViewProps {
  /** Tarefas já geradas — de onde sai a carga planejada de cada matéria. */
  tasks: StudyTask[];
  canEdit: boolean;
  /** Tirar um tópico refaz dias do cronograma: a página recarrega as tarefas. */
  onPlanChanged: (message: string) => void;
}

/**
 * Aba "Por matéria": os tópicos de cada disciplina do cronograma, com a
 * situação do aluno em cada um. É aqui que ele escolhe o que estudar —
 * desmarcar um tópico o tira do plano — e de onde vai direto às questões.
 */
export function SubjectTopicsView({ tasks, canEdit, onPlanChanged }: SubjectTopicsViewProps) {
  const [subjects, setSubjects] = useState<StudySubjectTopics[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [busyTopic, setBusyTopic] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    const token = getAccessToken();
    if (!token) return;
    apiGetStudyTopics(token)
      .then((result) => setSubjects(result ?? []))
      .catch(() => setSubjects([]));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function toggle(topicId: string, topicName: string, included: boolean) {
    setBusyTopic(topicId);
    setError(null);
    try {
      await apiSetTopicIncluded(getAccessToken() ?? "", topicId, included);
      load();
      onPlanChanged(
        included
          ? `"${topicName}" voltou para o cronograma: entra nos próximos dias planejados.`
          : `"${topicName}" saiu do cronograma. Os dias em que ele estava foram refeitos.`,
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível alterar o tópico.");
    } finally {
      setBusyTopic(null);
    }
  }

  if (!subjects) {
    return <p className="py-12 text-center text-sm text-graphite-500">Carregando tópicos...</p>;
  }

  return (
    <div>
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-graphite">Tópicos por matéria</h2>
        <p className="mt-1 text-sm text-graphite-500">
          Veja onde você está em cada conteúdo e escolha o que entra no cronograma. Redação tem rotina própria e não é dividida em tópicos.
        </p>
      </div>

      {error && <p className="mb-4 rounded-xl border border-alert/20 bg-alert/5 p-3 text-sm text-alert">{error}</p>}

      <div className="grid gap-4 lg:grid-cols-2">
        {subjects.map((subject) => {
          const inPlan = subject.topics.filter((topic) => topic.included);
          const mastered = inPlan.filter((topic) => topic.status === "DOMINADO").length;
          const started = inPlan.filter((topic) => topic.status !== "NAO_ESTUDADO").length;
          const due = inPlan.filter((topic) => topic.due).length;
          const subjectTasks = tasks.filter((task) => task.subjectId === subject.subjectId && task.status !== "SKIPPED");
          const minutes = subjectTasks.reduce((sum, task) => sum + task.scheduledMinutes, 0);
          const expanded = open === subject.subjectId;
          const pct = (value: number) => `${inPlan.length ? (value / inPlan.length) * 100 : 0}%`;

          return (
            <Card key={subject.subjectId} className={`bg-white p-5 ${expanded ? "lg:col-span-2" : ""}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-graphite">{subject.subjectName}</h3>
                  <p className="mt-1 text-xs text-graphite-400">
                    {mastered} dominado{mastered === 1 ? "" : "s"} · {started - mastered} em estudo · {inPlan.length - started} não visto{inPlan.length - started === 1 ? "" : "s"}
                    {subject.topics.length > inPlan.length ? ` · ${subject.topics.length - inPlan.length} fora do plano` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="rounded-full bg-graphite/5 px-2.5 py-1 text-xs text-graphite-500">
                    {minutesToHours(minutes)} planejadas
                  </span>
                  {due > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-graphite">
                      <RefreshCw className="h-3 w-3" /> {due} para revisar
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-4 flex h-1.5 overflow-hidden rounded-full bg-surface-line" aria-hidden="true">
                <div className="h-full bg-success" style={{ width: pct(mastered) }} />
                <div className="h-full bg-primary" style={{ width: pct(started - mastered) }} />
              </div>

              {subject.topics.length === 0 ? (
                <p className="mt-4 rounded-xl bg-surface-card p-3 text-xs text-graphite-400">
                  Esta matéria ainda não tem tópicos cadastrados.
                </p>
              ) : (
                <button
                  type="button"
                  onClick={() => setOpen(expanded ? null : subject.subjectId)}
                  aria-expanded={expanded}
                  className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary-700 hover:underline"
                >
                  {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  {expanded ? "Fechar tópicos" : `Ver os ${subject.topics.length} tópicos`}
                </button>
              )}

              {expanded && (
                <ul className="mt-3 divide-y divide-surface-line">
                  {subject.topics.map((topic) => (
                    <li key={topic.id} className={`flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 ${topic.included ? "" : "opacity-60"}`}>
                      <label className="flex min-w-0 flex-1 items-center gap-3 text-sm text-graphite">
                        <input
                          type="checkbox"
                          checked={topic.included}
                          disabled={!canEdit || busyTopic === topic.id}
                          onChange={(event) => void toggle(topic.id, topic.name, event.target.checked)}
                          aria-label={`${topic.name} no cronograma`}
                          className="h-4 w-4 shrink-0 accent-primary"
                        />
                        <span className={`truncate ${topic.included ? "font-medium" : "line-through"}`}>{topic.name}</span>
                      </label>

                      {topic.included ? (
                        <>
                          <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${STATUS_BADGE[topic.status]}`}>
                            {STATUS_LABEL[topic.status]}
                            {topic.attempts > 0 ? ` · ${topic.masteryScore}%` : ""}
                          </span>
                          {topic.due && (
                            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-graphite">Revisar</span>
                          )}
                        </>
                      ) : (
                        <span className="text-xs text-graphite-400">Fora do plano</span>
                      )}

                      {subject.questionBankSubjectId && topic.questionCount > 0 ? (
                        <Link
                          to={topicQuestionsPath(subject.questionBankSubjectId, topic.id)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-primary-700 hover:underline"
                        >
                          <FileQuestion className="h-3.5 w-3.5" />
                          {topic.questionCount} {topic.questionCount === 1 ? "questão" : "questões"}
                        </Link>
                      ) : (
                        <span className="text-xs text-graphite-400">Sem questões ainda</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
