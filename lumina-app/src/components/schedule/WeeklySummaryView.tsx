import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { Card } from "@/components/ui/Card";
import {
  type TopicMasteryStatus,
  type WeeklySummary,
  apiGetWeeklyComment,
  apiGetWeeklySummary,
} from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { minutesToHours } from "./shared";

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

/** "+2 que na semana anterior" / "igual à semana anterior". */
function comparison(current: number, previous: number, format: (value: number) => string = String): string {
  if (current === previous) return "igual à semana anterior";
  const delta = current - previous;
  return `${format(Math.abs(delta))} ${delta > 0 ? "a mais" : "a menos"} que na anterior`;
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-surface-line bg-white p-4">
      <p className="text-xs text-graphite-400">{label}</p>
      <p className="mt-1 text-2xl font-bold text-graphite">{value}</p>
      {hint && <p className="mt-1 text-xs text-graphite-400">{hint}</p>}
    </div>
  );
}

/**
 * Resumo da semana em exibição: o que foi cumprido, quanto o aluno praticou
 * e em que tópicos mexeu, com um comentário da LuminIA. Tudo sai de dados
 * registrados — não há estimativa de nota.
 */
export function WeeklySummaryView({ date }: { date: string }) {
  const [summary, setSummary] = useState<WeeklySummary | null>(null);
  const [comment, setComment] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const token = getAccessToken() ?? "";
    setSummary(null);
    setComment(null);
    setFailed(false);
    apiGetWeeklySummary(token, date)
      .then((data) => {
        if (cancelled) return;
        setSummary(data);
        // Semana sem nada registrado não precisa de comentário.
        if (!data || (data.tasks.planned === 0 && data.questions.answered === 0)) return;
        apiGetWeeklyComment(token, date)
          .then((result) => !cancelled && setComment(result.comment))
          .catch(() => undefined);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [date]);

  if (failed) {
    return <p className="mt-8 rounded-xl border border-alert/20 bg-alert/5 p-3 text-sm text-alert">Não foi possível carregar o resumo da semana.</p>;
  }
  if (!summary) return <p className="mt-8 text-sm text-graphite-400">Carregando o resumo da semana...</p>;

  const empty = summary.tasks.planned === 0 && summary.questions.answered === 0 && summary.minutes.studied === 0;

  return (
    <section className="mt-10" aria-label="Resumo da semana">
      <h2 className="text-lg font-semibold text-graphite">Resumo da semana</h2>

      {empty ? (
        <p className="mt-3 rounded-xl bg-surface-card p-4 text-sm text-graphite-400">
          Nada registrado nesta semana ainda: nenhuma tarefa planejada, questão respondida ou tempo de estudo.
        </p>
      ) : (
        <>
          <Card className="mt-4 border-primary/30 bg-primary/5 p-5">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary-700">
              <Sparkles className="h-3.5 w-3.5" /> LuminIA sobre a sua semana
            </p>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-graphite">
              {comment ?? "Olhando a sua semana..."}
            </p>
          </Card>

          <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat
              label="Tarefas concluídas"
              value={`${summary.tasks.done}/${summary.tasks.planned}`}
              hint={`${summary.inProgress ? "semana em andamento" : `${summary.tasks.completionRate}%`} · ${comparison(summary.tasks.done, summary.previous.tasksDone)}`}
            />
            <Stat
              label="Tempo no cronômetro"
              value={minutesToHours(summary.minutes.studied)}
              hint={`de ${minutesToHours(summary.minutes.planned)} planejados`}
            />
            <Stat
              label="Questões respondidas"
              value={String(summary.questions.answered)}
              hint={
                summary.questions.accuracy === null
                  ? "nenhuma nesta semana"
                  : `${summary.questions.accuracy}% de acerto · ${comparison(summary.questions.answered, summary.previous.questionsAnswered)}`
              }
            />
            <Stat
              label="Tópicos trabalhados"
              value={String(summary.topics.studied)}
              hint={
                summary.topics.studied === 0
                  ? "nenhum nesta semana"
                  : `${summary.topics.newlyMastered} dominado${summary.topics.newlyMastered === 1 ? "" : "s"} na semana · ${summary.topics.started} novo${summary.topics.started === 1 ? "" : "s"} · ${summary.topics.needAttention} pedindo atenção`
              }
            />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {summary.subjects.length > 0 && (
              <Card className="bg-white p-5">
                <h3 className="text-sm font-semibold text-graphite">Por matéria</h3>
                <ul className="mt-3 flex flex-col gap-3">
                  {summary.subjects.map((subject) => (
                    <li key={subject.subjectId}>
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="truncate text-graphite">{subject.name}</span>
                        <span className="shrink-0 text-xs text-graphite-400">
                          {subject.doneTasks}/{subject.plannedTasks} tarefas · {minutesToHours(subject.plannedMinutes)}
                        </span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-line" aria-hidden="true">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${subject.plannedTasks ? (subject.doneTasks / subject.plannedTasks) * 100 : 0}%` }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            <Card className="bg-white p-5">
              <h3 className="text-sm font-semibold text-graphite">Tópicos em que você mexeu</h3>
              {summary.topics.items.length === 0 ? (
                <p className="mt-3 text-sm text-graphite-400">
                  Nenhum tópico estudado nesta semana. Concluir uma tarefa ou responder questões já conta.
                </p>
              ) : (
                <ul className="mt-3 divide-y divide-surface-line">
                  {summary.topics.items.map((topic) => (
                    <li key={topic.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-graphite">{topic.name}</p>
                        {topic.subject && <p className="text-xs text-graphite-400">{topic.subject}</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        {/* Quanto o domínio mudou na semana; tópico novo não tem "antes". */}
                        {topic.delta === null ? (
                          <span className="text-xs text-graphite-400">novo</span>
                        ) : topic.delta !== 0 ? (
                          <span className={`text-xs font-semibold ${topic.delta > 0 ? "text-success" : "text-alert"}`}>
                            {topic.delta > 0 ? "▲" : "▼"} {Math.abs(topic.delta)}
                          </span>
                        ) : null}
                        <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${STATUS_BADGE[topic.status]}`}>
                          {STATUS_LABEL[topic.status]}
                          {topic.attempts > 0 ? ` · ${topic.masteryScore}%` : ""}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {summary.topics.studied > summary.topics.items.length && (
                <p className="mt-2 text-xs text-graphite-400">
                  e mais {summary.topics.studied - summary.topics.items.length} na aba "Por matéria".
                </p>
              )}
            </Card>
          </div>

          {summary.target && (
            <p className="mt-4 rounded-xl bg-surface-card p-3 text-xs text-graphite-400">
              Sua meta pelo Sisu{summary.target.year ? ` ${summary.target.year}` : ""} é média{" "}
              <strong className="text-graphite">{summary.target.score.toLocaleString("pt-BR")}</strong>
              {summary.target.course ? ` para ${summary.target.course}` : ""}
              {summary.target.university ? ` na ${summary.target.university}` : ""}. A sua nota estimada e quanto
              falta para a meta estão no cartão "Sua nota estimada hoje", no alto desta página.
            </p>
          )}
        </>
      )}
    </section>
  );
}
