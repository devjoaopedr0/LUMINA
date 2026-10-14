import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  BookOpenCheck,
  Calendar,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  CirclePause,
  Edit,
  FileQuestion,
  ListChecks,
  Loader2,
  LogOut,
  Play,
  RefreshCw,
  RotateCcw,
  Sparkles,
  TimerReset,
  TrendingUp,
  X,
} from "lucide-react";
import { CutoffTargetCard } from "@/components/CutoffTargetCard";
import { ScoreEstimateCard } from "@/components/ScoreEstimateCard";
import { Link, useNavigate } from "react-router-dom";
import { Logo } from "@/components/Logo";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { DiagnosticQuiz } from "@/components/schedule/DiagnosticQuiz";
import { ReplanMenu } from "@/components/schedule/ReplanMenu";
import { ScheduleForm } from "@/components/schedule/ScheduleForm";
import { SubjectTopicsView } from "@/components/schedule/SubjectTopicsView";
import { TaskLesson } from "@/components/schedule/TaskLesson";
import { TaskPractice } from "@/components/schedule/TaskPractice";
import { WeeklySummaryView } from "@/components/schedule/WeeklySummaryView";
import { STUDY_AREA_LABEL, WEEKDAY_LABELS, minutesToHours, topicQuestionsPath } from "@/components/schedule/shared";
import { useAuth } from "@/contexts/AuthContext";
import { askAi } from "@/lib/ai-chat";
import { formatCalendarDate as formatDateDisplay } from "@/lib/utils";
import {
  type SchedulePhase,
  type StudyDiagnosticArea,
  type StudyMasterySummary,
  type StudyProgressResponse,
  type StudySchedule,
  type StudySubject,
  type StudyTask,
  type StudyProgressSummary,
  type StudyWeekDay,
  type PaginatedTasks,
  type DailySession,
  ApiError,
  apiStartTaskSimulation,
  apiGetDailySession,
  apiGetDiagnostic,
  apiGetProgress,
  apiGetStudySchedule,
  apiGetWeek,
  apiListStudySubjects,
  apiListTasks,
  apiLogSubjectTime,
  apiRefreshDay,
  apiRescheduleMissed,
  apiUpdateTask,
} from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { useFocusSession } from "@/hooks/useFocusSession";

// Fase da reta até a prova: muda o tipo de atividade que o cronograma gera.
const SCHEDULE_PHASE_LABEL: Record<SchedulePhase, string> = {
  BASE: "Base",
  CONSOLIDACAO: "Consolidação",
  PREPARACAO: "Preparação",
};
const SCHEDULE_PHASE_HINT: Record<SchedulePhase, string> = {
  BASE: "Mais teoria, para cobrir o conteúdo",
  CONSOLIDACAO: "Mais questões e revisão",
  PREPARACAO: "Questões, revisão e simulados",
};
const MONTH_LABELS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const TASK_STATUS_LABEL: Record<StudyTask["status"], string> = {
  PENDING: "Pendente",
  IN_PROGRESS: "Em andamento",
  DONE: "Concluído",
  SKIPPED: "Não vou fazer",
};

const TASK_STATUS_BADGE: Record<StudyTask["status"], string> = {
  PENDING: "border-surface-line bg-graphite/5 text-graphite-500",
  IN_PROGRESS: "border-primary/30 bg-primary/10 text-primary",
  DONE: "border-success/20 bg-success/10 text-success",
  SKIPPED: "border-surface-line bg-white text-graphite-400",
};

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

// O aluno que disse "agora não" ao diagnóstico não é perguntado de novo
// para o mesmo cronograma neste navegador.
const DIAGNOSTIC_DISMISSED_PREFIX = "lumina:diagnostic-dismissed:";

function diagnosticDismissed(scheduleId: string): boolean {
  try {
    return window.localStorage.getItem(DIAGNOSTIC_DISMISSED_PREFIX + scheduleId) === "1";
  } catch {
    return false;
  }
}

function markDiagnosticDismissed(scheduleId: string): void {
  try {
    window.localStorage.setItem(DIAGNOSTIC_DISMISSED_PREFIX + scheduleId, "1");
  } catch {
    // Modo privado ou cota cheia: vale só para esta visita.
  }
}

function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Conteúdos por domínio (fase 4 do cronograma adaptativo): quanto do
 * programa o aluno já domina e quanto está com revisão vencida.
 */
function MasteryPanel({ mastery }: { mastery: StudyMasterySummary }) {
  if (mastery.totalTopics === 0) return null;
  const emEstudo = mastery.aprendendo + mastery.praticando + mastery.precisaReforco;
  const pct = (value: number) => `${(value / mastery.totalTopics) * 100}%`;
  return (
    <Card className="mt-4 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-success/10">
            <BookOpenCheck className="h-4 w-4 text-success" />
          </div>
          <div>
            <p className="text-xs text-graphite-400">Conteúdos dominados</p>
            <p className="text-2xl font-bold text-graphite">
              {mastery.dominados}<span className="text-sm font-medium text-graphite-400">/{mastery.totalTopics}</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <RefreshCw className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-xs text-graphite-400">Para revisar hoje</p>
            <p className="text-2xl font-bold text-graphite">{mastery.paraRevisar}</p>
          </div>
        </div>
        <div className="min-w-[220px] flex-1">
          <div className="flex h-2 w-full overflow-hidden rounded-full bg-surface-line" aria-hidden="true">
            <div className="h-2 bg-success" style={{ width: pct(mastery.dominados) }} />
            <div className="h-2 bg-primary" style={{ width: pct(emEstudo) }} />
          </div>
          <p className="mt-2 text-xs text-graphite-400">
            {mastery.dominados} dominados · {emEstudo} em estudo
            {mastery.precisaReforco > 0 ? ` (${mastery.precisaReforco} precisam de reforço)` : ""} · {mastery.naoEstudados} ainda não vistos
          </p>
        </div>
      </div>
    </Card>
  );
}

function ProgressPanel({ progress }: {
  progress: StudyProgressSummary | null;
}) {
  if (!progress) {
    return (
      <Card className="mt-6 bg-white p-6">
        <p className="text-sm text-graphite-500">Sem dados de progresso ainda. Complete algumas tarefas para ver sua evolução.</p>
      </Card>
    );
  }

  const completionPct =
    progress.totalScheduledMinutes > 0
      ? Math.round((progress.completedMinutes / progress.totalScheduledMinutes) * 100)
      : 0;

  const barWidth = Math.min(100, completionPct);

  return (
    <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-4">
      <Card className="bg-white p-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <TrendingUp className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-xs text-graphite-400">Conclusão</p>
            <p className="text-2xl font-bold text-graphite">{completionPct}%</p>
          </div>
        </div>
        <div className="mt-3 h-2 w-full rounded-full bg-surface-line">
          <div className="h-2 rounded-full bg-primary transition-all" style={{ width: `${barWidth}%` }} />
        </div>
      </Card>

      <Card className="bg-white p-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-graphite/5">
            <Clock className="h-4 w-4 text-graphite-500" />
          </div>
          <div>
            <p className="text-xs text-graphite-400">Horas estudadas</p>
            <p className="text-2xl font-bold text-graphite">{minutesToHours(progress.completedMinutes)}</p>
          </div>
        </div>
      </Card>

      <Card className="bg-white p-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-success/10">
            <CheckCircle2 className="h-4 w-4 text-success" />
          </div>
          <div>
            <p className="text-xs text-graphite-400">Tarefas concluídas</p>
            <p className="text-2xl font-bold text-graphite">
              {progress.completedTasks}/{progress.totalTasks}
            </p>
          </div>
        </div>
      </Card>

      <Card className="bg-white p-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-alert/10">
            <Calendar className="h-4 w-4 text-alert" />
          </div>
          <div>
            <p className="text-xs text-graphite-400">Sequência atual</p>
            <p className="text-2xl font-bold text-graphite">{progress.streakDays} dias</p>
          </div>
        </div>
      </Card>
    </div>
  );
}

/**
 * Abre o resumo ou a prática de uma tarefa. Os modais moram na página, não no
 * item: a lista se atualiza sozinha e a tarefa concluída muda de grupo — se o
 * modal fosse do item, ele sumia junto, antes de o aluno ver o resultado.
 */
interface TaskStudyActions {
  practice: (task: StudyTask) => void;
  study: (task: StudyTask) => void;
}
const PracticeContext = createContext<TaskStudyActions | null>(null);

interface TaskItemProps {
  task: StudyTask;
  onUpdate: (task: StudyTask | null) => void;
  canCreateTasks: boolean;
  /**
   * Usado dentro da aba "Por matéria", em que o card já mostra a disciplina no
   * título. Sem isso, cada linha repetiria a mesma matéria logo abaixo.
   */
  hideSubject?: boolean;
  /**
   * Usado na aba "Diária": ali o cronograma mostra só a matéria do dia,
   * sem o título/observação livre que o aluno escreveu na tarefa.
   */
  hideDetails?: boolean;
  /** Depois de reagendar: a tarefa mudou de dia, então a tela recarrega. */
  onReplanned?: (message: string) => void;
}

/**
 * A identidade de uma tarefa é a MATÉRIA, nunca o subtítulo. O título livre
 * que o aluno mesmo escreveu vira apenas uma observação em corpo menor —
 * aparecer como cabeçalho fazia o cronograma parecer organizado por
 * subtópico, que não é como o estudo é distribuído.
 */
function taskSubjectLabel(task: StudyTask): string {
  return task.subjectName ?? "Sem matéria";
}

/** Título que o aluno escreveu por conta própria (tarefa não gerada). */
function taskCustomNote(task: StudyTask): string | null {
  if (!task.subjectName) return task.title;
  const generated = `${task.subjectName}: estudo programado`;
  return task.title === generated ? null : task.title;
}

function TaskItem({ task, onUpdate, canCreateTasks, hideSubject = false, hideDetails = false, onReplanned }: TaskItemProps) {
  const [error, setError] = useState<string | null>(null);
  const studyActions = useContext(PracticeContext);
  const navigate = useNavigate();
  const [startingSimulation, setStartingSimulation] = useState(false);
  const isSimulation = task.activityType === "SIMULADO";

  // A tarefa de simulado abre um simulado de verdade, cronometrado; ao
  // enviá-lo, a tarefa se conclui com a nota.
  function openSimulation() {
    setError(null);
    setStartingSimulation(true);
    apiStartTaskSimulation(getAccessToken() ?? "", task.id)
      .then(({ simulationId }) => navigate(`/app/simulados?id=${simulationId}`))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Não foi possível abrir o simulado."))
      .finally(() => setStartingSimulation(false));
  }

  const status = task.status;
  const badgeClass = TASK_STATUS_BADGE[status];
  const note = taskCustomNote(task);
  const open = status === "PENDING" || status === "IN_PROGRESS";
  // Tarefa do gerador (tópico ou redação): o título diz O QUE estudar e tem
  // um motivo que a LuminIA sabe explicar.
  const generated = Boolean(task.topicId) || task.activityType === "REDACAO";

  function toggleStatus() {
    setError(null);
    // O botão diz "Concluir": vai direto para DONE. "Em andamento" é estado
    // que o cronômetro marca sozinho, não um degrau do clique.
    const newStatus: StudyTask["status"] = open ? "DONE" : "PENDING";
    apiUpdateTask(getAccessToken() ?? "", task.id, { status: newStatus })
      .then(onUpdate)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Erro ao atualizar."));
  }

  return (
    <div className="rounded-xl border border-surface-line bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${badgeClass}`}>
              {TASK_STATUS_LABEL[status]}
            </span>
            <span className="rounded-full bg-graphite/5 px-2 py-0.5 text-xs text-graphite-500">
              {minutesToHours(task.scheduledMinutes)} planejados
            </span>
            {status === "DONE" && task.practiceAnswered != null && task.practiceAnswered > 0 && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-graphite">
                {task.practiceCorrect ?? 0}/{task.practiceAnswered} acertos
              </span>
            )}
            {Boolean(task.loggedMinutes) && (
              <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs text-success">
                {minutesToHours(task.loggedMinutes!)} estudados
              </span>
            )}
          </div>
          <h3 className="mt-1 text-sm font-semibold text-graphite">
            {hideSubject ? "Estudo" : taskSubjectLabel(task)}
          </h3>
          {/* Tarefa gerada por tópico: sem o título ("Teoria — Porcentagem")
              o aluno veria só a matéria repetida, sem saber o que estudar. */}
          {(!hideDetails || generated) && note && (
            <p className="mt-1 text-xs text-graphite-400">{note}</p>
          )}
          {(!hideDetails || task.activityType === "REDACAO") && task.description && (
            <p className="mt-1 text-xs text-graphite-400">{task.description}</p>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              askAi({
                message: `Por que "${task.title}" está no meu cronograma?`,
                scheduleTaskId: task.id,
              })
            }
          >
            <Sparkles className="h-4 w-4" />
            Por quê?
          </Button>
          {/* Tarefa aberta tem "Estudar" e "Praticar"; na concluída fica o
              atalho para as questões do tópico no banco. */}
          {task.topic && !(canCreateTasks && open) && (
            <Link
              to={topicQuestionsPath(task.topic.subjectId, task.topic.id)}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-sm font-medium text-graphite transition-colors hover:bg-graphite/5"
            >
              <FileQuestion className="h-4 w-4" />
              Questões
            </Link>
          )}
          {canCreateTasks && open && onReplanned && <ReplanMenu task={task} onDone={onReplanned} />}
          {canCreateTasks && (
            <Button size="sm" variant="ghost" onClick={toggleStatus}>
              {open ? "Concluir" : "Reabrir"}
            </Button>
          )}
          {/* Praticar conclui a tarefa com o resultado das questões — é o
              caminho principal; "Concluir" fica para quem estudou por fora. */}
          {canCreateTasks && open && task.topic && studyActions && (
            <>
              <Button
                size="sm"
                variant={task.activityType === "TEORIA" ? "primary" : "outline"}
                onClick={() => studyActions.study(task)}
              >
                <BookOpenCheck className="h-4 w-4" />
                Estudar
              </Button>
              <Button
                size="sm"
                variant={task.activityType === "TEORIA" || isSimulation ? "outline" : "primary"}
                onClick={() => studyActions.practice(task)}
              >
                <Play className="h-4 w-4" />
                Praticar
              </Button>
              {isSimulation && (
                <Button size="sm" onClick={openSimulation} disabled={startingSimulation}>
                  <TimerReset className="h-4 w-4" />
                  {startingSimulation ? "Montando..." : task.simulationId ? "Continuar simulado" : "Fazer simulado"}
                </Button>
              )}
            </>
          )}
          {!open && task.simulationId && (
            <Link
              to={`/app/simulados?id=${task.simulationId}`}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-sm font-medium text-graphite transition-colors hover:bg-graphite/5"
            >
              <TimerReset className="h-4 w-4" />
              Ver simulado
            </Link>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-2 flex items-start gap-1.5 rounded border border-alert/20 bg-alert/5 p-2 text-xs text-alert">
          <X className="mt-0.5 h-3 w-3 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}

export function StudySchedulePage() {
  const { user, logout } = useAuth();
  const [subjects, setSubjects] = useState<StudySubject[]>([]);
  const [schedule, setSchedule] = useState<StudySchedule | null>(null);
  const [dailyData, setDailyData] = useState<DailySession | null>(null);
  const [tasks, setTasks] = useState<PaginatedTasks | null>(null);
  const [catalogTasks, setCatalogTasks] = useState<StudyTask[]>([]);
  const [progress, setProgress] = useState<StudyProgressResponse | null>(null);
  const [weekData, setWeekData] = useState<StudyWeekDay[]>([]);
  // Diagnóstico inicial: só é oferecido a quem ainda não tem domínio
  // registrado (o backend decide), e o aluno pode dispensar.
  const [diagnosticAreas, setDiagnosticAreas] = useState<StudyDiagnosticArea[] | null>(null);
  const [showDiagnostic, setShowDiagnostic] = useState(false);
  const [practiceTask, setPracticeTask] = useState<StudyTask | null>(null);
  const [lessonTask, setLessonTask] = useState<StudyTask | null>(null);
  const studyActions = useMemo(() => ({ practice: setPracticeTask, study: setLessonTask }), []);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [activeTab, setActiveTab] = useState<"daily" | "subjects" | "timer" | "weekly" | "monthly" | "tasks">("daily");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [taskFilter, setTaskFilter] = useState<"all" | "PENDING" | "IN_PROGRESS" | "DONE">("all");

  const token = getAccessToken() ?? "";

  /**
   * `silent` recarrega os dados sem acionar o estado de carregamento. O
   * carregamento é o que desmonta a página inteira, e a Sala de Foco vive aqui:
   * recarregá-la a cada registro derrubaria o cronômetro no meio do estudo.
   */
  const loadAll = useCallback((options?: { silent?: boolean }) => {
    if (!token) return;
    if (!options?.silent) setLoading(true);
    setError(null);

    Promise.all([
      apiListStudySubjects(token),
      apiGetStudySchedule(token),
      apiGetProgress(token),
    ])
      .then(([subjectList, sched, prog]) => {
        setSubjects(subjectList);
        setSchedule(sched);
        setProgress(prog);
      })
      .catch((err) =>
        setError(
          err instanceof ApiError ? err.message : "Erro ao carregar dados.",
        ),
      )
      .finally(() => {
        if (!options?.silent) setLoading(false);
      });
  }, [token]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (schedule && token) {
      apiListTasks(token, { page: 1, limit: 200 })
        .then((result) => setCatalogTasks(result?.items ?? []))
        .catch(() => undefined);
      apiListTasks(token, {
        status: taskFilter === "all" ? undefined : taskFilter,
        page: 1,
        limit: 50,
      })
        .then(setTasks)
        .catch(() => undefined);
    }
  }, [schedule, token, taskFilter]);

  useEffect(() => {
    if (schedule && token && activeTab === "daily") {
      apiGetDailySession(token, formatDate(currentDate))
        .then(setDailyData)
        .catch(() => undefined);
    }
  }, [schedule, token, activeTab, currentDate]);

  useEffect(() => {
    if (schedule && token && activeTab === "daily") {
      const timer = setInterval(() => {
        apiGetDailySession(token, formatDate(currentDate))
          .then(setDailyData)
          .catch(() => undefined);
      }, 30000);
      return () => clearInterval(timer);
    }
  }, [schedule, token, activeTab, currentDate]);

  // A visão semanal lê o resumo dos sete dias de uma vez; dia ainda não
  // aberto vem sem tarefas (elas nascem quando o dia é aberto).
  const weekStartKey = formatDate(addDays(startOfDay(currentDate), -startOfDay(currentDate).getDay()));
  useEffect(() => {
    if (schedule && token && activeTab === "weekly") {
      apiGetWeek(token, weekStartKey)
        .then((days) => setWeekData(days ?? []))
        .catch(() => undefined);
    }
  }, [schedule, token, activeTab, weekStartKey]);

  const scheduleId = schedule?.id;
  useEffect(() => {
    if (!scheduleId || !token) return;
    if (diagnosticDismissed(scheduleId)) return;
    apiGetDiagnostic(token)
      .then((result) => setDiagnosticAreas(result?.recommended ? result.areas : null))
      .catch(() => undefined);
  }, [scheduleId, token]);

  /** Depois de qualquer coisa que mude tarefas de dia (replanejar, refazer o
   *  plano): recarrega o dia aberto, as listas e os cartões do topo. */
  function reloadTasks() {
    if (!token) return;
    apiGetDailySession(token, formatDate(currentDate)).then(setDailyData).catch(() => undefined);
    apiGetProgress(token).then(setProgress).catch(() => undefined);
    apiListTasks(token, { page: 1, limit: 200 })
      .then((result) => setCatalogTasks(result?.items ?? []))
      .catch(() => undefined);
    apiListTasks(token, { status: taskFilter === "all" ? undefined : taskFilter, page: 1, limit: 50 })
      .then(setTasks)
      .catch(() => undefined);
  }

  function handleReplanned(message: string) {
    setNotice(message);
    reloadTasks();
  }

  function dismissDiagnostic() {
    if (scheduleId) markDiagnosticDismissed(scheduleId);
    setDiagnosticAreas(null);
    setShowDiagnostic(false);
  }

  /** Fim do diagnóstico: o dia de hoje é refeito já sabendo o nível do aluno. */
  function handleDiagnosticFinished() {
    dismissDiagnostic();
    if (!token) return;
    apiRefreshDay(token, formatDate(new Date()))
      .then(() => {
        setNotice("Cronograma atualizado com o resultado do diagnóstico.");
        reloadTasks();
      })
      .catch(() => reloadTasks());
  }

  function handleTaskUpdate(updatedTask: StudyTask | null) {
    if (!updatedTask) return;
    setTasks((current) => {
      if (!current) return current;
      return {
        ...current,
        items: current.items.map((t) => (t.id === updatedTask.id ? updatedTask : t)),
      };
    });
    setCatalogTasks((current) => current.map((task) => task.id === updatedTask.id ? updatedTask : task));
    setDailyData((current) => {
      if (!current || !current.session) return current;
      const applyUpdate = (task: StudyTask) =>
        task.id === updatedTask.id ? { ...updatedTask, loggedMinutes: task.loggedMinutes } : task;
      const nextTasks = current.session.tasks.map(applyUpdate);
      return {
        ...current,
        session: { ...current.session, tasks: nextTasks },
        tasks: nextTasks,
      };
    });
    // Os cartões do topo (conclusão, tarefas concluídas, sequência) vêm do
    // progresso, que muda a cada tarefa concluída ou reaberta.
    if (token) apiGetProgress(token).then(setProgress).catch(() => undefined);
  }

  const studyDaysLabel = schedule
    ? schedule.studyDays.map((d) => WEEKDAY_LABELS[d]).join(", ")
    : "-";
  // Com tempo diferente por dia da semana, "2h/dia" seria mentira: mostra o total da semana.
  const dailyTimeLabel = !schedule
    ? "-"
    : schedule.dayMinutes?.length
      ? `${minutesToHours(schedule.dayMinutes.reduce((sum, day) => sum + day.minutes, 0))}/semana`
      : `${minutesToHours(schedule.dailyMinutes)}/dia`;

  const startDay = startOfDay(currentDate);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(startDay, i - startDay.getDay()));

  const monthlyDays = (() => {
    const first = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const last = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
    const start = startOfDay(first);
    start.setDate(start.getDate() - start.getDay());
    const days: Date[] = [];
    let current = start;
    while (current <= last) {
      days.push(new Date(current));
      current = addDays(current, 1);
    }
    return days;
  })();

  // Diária anda de dia em dia; semanal, de semana em semana; mensal, de mês.
  function prevPeriod() {
    if (activeTab === "monthly") setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
    else setCurrentDate(addDays(currentDate, activeTab === "daily" ? -1 : -7));
  }

  function nextPeriod() {
    if (activeTab === "monthly") setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
    else setCurrentDate(addDays(currentDate, activeTab === "daily" ? 1 : 7));
  }

  function goToToday() {
    setCurrentDate(new Date());
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-card">
        <Loader2 className="h-8 w-8 animate-spin text-graphite-400" />
      </div>
    );
  }

  return (
    <PracticeContext.Provider value={studyActions}>
    <div className="min-h-screen bg-surface-card">
      <header className="border-b border-surface-line bg-white">
        <div className="container-lumina flex h-[72px] items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => (window.location.href = "/app")}
              className="flex h-9 w-9 items-center justify-center rounded-full text-graphite-500 transition-colors hover:bg-graphite/5 hover:text-graphite"
              title="Voltar ao início"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <Logo />
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden text-sm text-graphite-500 sm:inline">
              Olá, <span className="font-semibold text-graphite">{user?.firstName || user?.email}</span>
            </span>
            <Button variant="outline" size="sm" onClick={logout}>
              <LogOut className="h-4 w-4" />
              Sair
            </Button>
          </div>
        </div>
      </header>

      {/* Folga no rodapé: o botão flutuante da LuminIA fica no canto inferior
          direito e cobria os botões de ação do fim da página. */}
      <main className="container-lumina pb-28 pt-10">
        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-xl border border-alert/20 bg-alert/5 p-3 text-sm text-alert">
            <X className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {!schedule ? (
          <div>
            <div className="mb-8">
              <h1 className="text-2xl font-semibold tracking-tight text-graphite">
                Cronograma de estudos
              </h1>
              <p className="mt-1 text-sm text-graphite-500">
                Ainda não há um cronograma. Em três passos ele fica pronto: quando você estuda, o que quer alcançar e quais matérias entram.
              </p>
            </div>
            <Card className="bg-white">
              <ScheduleForm
                subjects={subjects}
                existingSchedule={null}
                onCancel={() => {}}
                onSuccess={() => loadAll()}
              />
            </Card>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-graphite">
                  Cronograma de estudos
                </h1>
                <p className="mt-1 text-sm text-graphite-500">
                  {formatDateDisplay(schedule.startDate)} → {formatDateDisplay(schedule.endDate)} ·{" "}
                  Estudo em: {studyDaysLabel} · {dailyTimeLabel}
                </p>
                {(schedule.targetCourse || Boolean(schedule.priorityAreas?.length)) && (
                  <p className="mt-1 text-xs text-graphite-400">
                    {[
                      schedule.targetCourse ? `Curso: ${schedule.targetCourse}` : null,
                      schedule.priorityAreas?.length
                        ? `${schedule.priorityAreas.length > 1 ? "Áreas prioritárias" : "Área prioritária"}: ${schedule.priorityAreas.map((area) => STUDY_AREA_LABEL[area]).join(", ")}`
                        : null,
                    ].filter(Boolean).join(" · ")}
                  </p>
                )}
              </div>
              {schedule.status === "ACTIVE" && (
                <Button size="sm" onClick={() => setShowCreateForm(true)}>
                  <Edit className="h-4 w-4" />
                  Editar cronograma
                </Button>
              )}
            </div>

            <CutoffTargetCard className="mt-6" />
            <ScoreEstimateCard className="mt-4" />

            <ProgressPanel progress={progress?.summary ?? null} />
            {progress?.mastery && <MasteryPanel mastery={progress.mastery} />}

            {diagnosticAreas && (
              <Card className="mt-4 border-primary/30 bg-primary/5 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-graphite">Diagnóstico rápido</p>
                    <p className="mt-1 text-xs text-graphite-500">
                      {diagnosticAreas.reduce((sum, area) => sum + area.questions.length, 0)} questões para o cronograma começar sabendo o que você já domina — hoje ele trata todo conteúdo como novo.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={dismissDiagnostic}>Agora não</Button>
                    <Button size="sm" onClick={() => setShowDiagnostic(true)}>Fazer diagnóstico</Button>
                  </div>
                </div>
              </Card>
            )}

            {notice && (
              <div role="status" className="mt-4 flex items-start justify-between gap-2 rounded-xl border border-success/20 bg-success/10 p-3 text-sm text-graphite">
                <span>{notice}</span>
                <button type="button" onClick={() => setNotice(null)} aria-label="Fechar aviso" className="text-graphite-400 hover:text-graphite">
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            <div className="mt-8 flex gap-4 overflow-x-auto border-b border-surface-line">
              <button
                type="button"
                onClick={() => { setActiveTab("daily"); goToToday(); }}
                className={`pb-3 text-sm font-medium transition-colors ${
                  activeTab === "daily"
                    ? "border-b-2 border-primary text-primary"
                    : "text-graphite-500 hover:text-graphite"
                }}`}
              >
                Diária
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("subjects")}
                className={`pb-3 text-sm font-medium transition-colors ${activeTab === "subjects" ? "border-b-2 border-primary text-primary" : "text-graphite-500 hover:text-graphite"}`}
              >
                Por matéria
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("timer")}
                className={`inline-flex items-center gap-1.5 pb-3 text-sm font-medium transition-colors ${activeTab === "timer" ? "border-b-2 border-primary text-primary" : "text-graphite-500 hover:text-graphite"}`}
              >
                <TimerReset className="h-4 w-4" /> Cronômetro
              </button>
              <button
                type="button"
                onClick={() => { setActiveTab("weekly"); goToToday(); }}
                className={`pb-3 text-sm font-medium transition-colors ${
                  activeTab === "weekly"
                    ? "border-b-2 border-primary text-primary"
                    : "text-graphite-500 hover:text-graphite"
                }}`}
              >
                Semanal
              </button>
              <button
                type="button"
                onClick={() => { setActiveTab("monthly"); }}
                className={`pb-3 text-sm font-medium transition-colors ${
                  activeTab === "monthly"
                    ? "border-b-2 border-primary text-primary"
                    : "text-graphite-500 hover:text-graphite"
                }}`}
              >
                Mensal
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("tasks")}
                className={`pb-3 text-sm font-medium transition-colors ${
                  activeTab === "tasks"
                    ? "border-b-2 border-primary text-primary"
                    : "text-graphite-500 hover:text-graphite"
                }}`}
              >
                Tarefas
              </button>
            </div>

            <div className="mt-6">
              {activeTab === "daily" && (
                <DailyView
                  date={currentDate}
                  data={dailyData}
                  onTaskUpdate={handleTaskUpdate}
                  onReplanned={handleReplanned}
                  canCreateTasks={schedule.status === "ACTIVE"}
                />
              )}
              {activeTab === "subjects" && (
                <SubjectTopicsView tasks={catalogTasks} canEdit={schedule.status === "ACTIVE"} onPlanChanged={handleReplanned} />
              )}
              {activeTab === "timer" && (
                <FocusTimer subjects={subjects} onSaved={() => loadAll({ silent: true })} />
              )}
               {activeTab === "weekly" && (
                <>
                  <WeeklyView
                    weekDays={weekDays}
                    week={weekData}
                    onOpenDay={(day) => { setCurrentDate(day); setActiveTab("daily"); }}
                  />
                  <WeeklySummaryView date={weekStartKey} />
                </>
              )}
              {activeTab === "monthly" && (
                <MonthlyView
                  monthlyDays={monthlyDays}
                  date={currentDate}
                  schedule={schedule}
                  completedTaskDates={
                    progress?.evolution?.filter((p) => p.completedTasks > 0).map((p) => p.date) ?? []
                  }
                />
              )}
              {activeTab === "tasks" && (
                <TaskListView
                  tasks={tasks}
                  taskFilter={taskFilter}
                  setTaskFilter={setTaskFilter}
                  onTaskUpdate={handleTaskUpdate}
                  canCreateTasks={schedule.status === "ACTIVE"}
                />
              )}
            </div>

            {(activeTab === "daily" || activeTab === "weekly" || activeTab === "monthly") && <div className="mt-8 flex items-center justify-center gap-3">
              <Button variant="outline" size="sm" onClick={prevPeriod}>
                <ChevronLeft className="h-4 w-4" />
                Anterior
              </Button>
              <span className="text-sm text-graphite-500">
                {activeTab === "monthly"
                  ? `${MONTH_LABELS[currentDate.getMonth()]} ${currentDate.getFullYear()}`
                  : activeTab === "daily"
                    ? formatDateDisplay(formatDate(currentDate))
                    : formatDateDisplay(formatDate(weekDays[0])) + " — " + formatDateDisplay(formatDate(weekDays[6]))}
              </span>
              <Button variant="outline" size="sm" onClick={nextPeriod}>
                Próximo
                <ChevronRight className="h-4 w-4" />
              </Button>
              {activeTab !== "monthly" && (
                <Button variant="ghost" size="sm" onClick={goToToday}>
                  Hoje
                </Button>
              )}
            </div>}

            <div className="mt-8">
              <Button variant="ghost" size="sm" onClick={() => {
                apiRescheduleMissed(getAccessToken() ?? "", formatDate(currentDate))
                  .then((result) => {
                    setNotice(
                      result?.rescheduled
                        ? `${result.rescheduled} tarefa(s) não feita(s) deste dia foram para os próximos dias de estudo.`
                        : "Não há tarefa pendente neste dia para reorganizar.",
                    );
                    reloadTasks();
                  })
                  .catch(() => undefined);
              }}>
                <RotateCcw className="h-4 w-4" />
                Reorganizar tarefas perdidas
              </Button>
            </div>
          </>
        )}

        {showCreateForm && schedule && (
          <CreateScheduleOverlay
            subjects={subjects}
            existingSchedule={schedule}
            onClose={() => setShowCreateForm(false)}
            onSuccess={() => { setShowCreateForm(false); loadAll(); }}
          />
        )}

        {lessonTask && (
          <TaskLesson
            task={lessonTask}
            onClose={() => setLessonTask(null)}
            onPractice={() => {
              setPracticeTask(lessonTask);
              setLessonTask(null);
            }}
          />
        )}
        {practiceTask && (
          <TaskPractice
            task={practiceTask}
            onClose={() => setPracticeTask(null)}
            onCompleted={(done) => {
              setPracticeTask(null);
              handleTaskUpdate(done);
            }}
          />
        )}
        {showDiagnostic && diagnosticAreas && (
          <DiagnosticQuiz
            areas={diagnosticAreas}
            onClose={() => setShowDiagnostic(false)}
            onFinished={handleDiagnosticFinished}
          />
        )}
      </main>
    </div>
    </PracticeContext.Provider>
  );
}

function CreateScheduleOverlay({
  subjects,
  existingSchedule,
  onClose,
  onSuccess,
}: {
  subjects: StudySubject[];
  existingSchedule: StudySchedule;
  onClose: () => void;
  onSuccess: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-[24px] bg-surface-card p-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-graphite">Editar cronograma</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full text-graphite-400 hover:bg-graphite/5"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <ScheduleForm
          subjects={subjects}
          existingSchedule={existingSchedule}
          onCancel={onClose}
          onSuccess={onSuccess}
        />
      </div>
    </div>
  );
}

interface DailyViewProps {
  date: Date;
  data: DailySession | null;
  onTaskUpdate: (task: StudyTask | null) => void;
  onReplanned: (message: string) => void;
  canCreateTasks: boolean;
}

function DailyView({ date, data, onTaskUpdate, onReplanned, canCreateTasks }: DailyViewProps) {
  if (!data) {
    return (
      <div className="flex flex-col items-center gap-4 py-12 text-center">
        <CalendarDays className="h-12 w-12 text-graphite-300" />
        <p className="text-sm text-graphite-500">Carregando sessão de hoje...</p>
      </div>
    );
  }

  const { session } = data;
  const scheduled = session?.scheduledMinutes ?? 0;

  const tasks = session?.tasks ?? [];
  const byStatus = (status: StudyTask["status"]) => tasks.filter((t) => t.status === status);
  const groups = [
    { title: "A fazer", tasks: byStatus("PENDING") },
    { title: "Em andamento", tasks: byStatus("IN_PROGRESS") },
    { title: "Concluídos", tasks: byStatus("DONE") },
    { title: "Não vou fazer", tasks: byStatus("SKIPPED") },
  ];
  // O tempo vem por tarefa (registro antigo) e por matéria (cronômetro).
  // Somar os dois é o que faz a linha "Estudado" refletir o cronômetro.
  const taskMinutes = tasks.reduce((sum: number, t: StudyTask) => sum + (t.loggedMinutes ?? 0), 0);
  const subjectMinutes = Object.values(data.loggedMinutesBySubject ?? {}).reduce(
    (sum, value) => sum + value,
    0,
  );
  const loggedMinutes = taskMinutes + subjectMinutes;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-graphite">
            {formatDateDisplay(date)} — {date.toLocaleDateString("pt-BR", { weekday: "long" })}
          </h2>
          <p className="text-sm text-graphite-500">
            Planejado: {minutesToHours(scheduled)} · Estudado: {minutesToHours(loggedMinutes)}
          </p>
        </div>
        {data.phase && (
          <div className="text-right">
            <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-graphite">
              Fase: {SCHEDULE_PHASE_LABEL[data.phase]}
            </span>
            <p className="mt-1.5 text-xs text-graphite-400">{SCHEDULE_PHASE_HINT[data.phase]}</p>
          </div>
        )}
      </div>

      {groups.map((group) => group.tasks.length > 0 && (
        <div key={group.title}>
          <h3 className="mb-2 text-xs font-semibold uppercase text-graphite-400">{group.title}</h3>
          <div className="flex flex-col gap-3">
            {group.tasks.map((t) => (
              <TaskItem
                key={t.id}
                task={t}
                onUpdate={onTaskUpdate}
                onReplanned={onReplanned}
                canCreateTasks={canCreateTasks}
                hideDetails
              />
            ))}
          </div>
        </div>
      ))}

      {tasks.length === 0 && (
        <div className="py-12 text-center">
          <ListChecks className="mx-auto mb-3 h-10 w-10 text-graphite-300" />
          <p className="text-sm text-graphite-500">Nenhuma tarefa programada para este dia.</p>
        </div>
      )}
    </div>
  );
}

/**
 * Cronômetro por MATÉRIA. O seletor lista só as disciplinas planejadas no
 * cronograma — nada de subtópico nem de tarefa do dia — porque é assim que o
 * tempo é distribuído e contabilizado.
 *
 * O componente fica MONTADO o tempo todo (a aba só oculta o container): se
 * ele fosse desmontado ao trocar de aba, o estado e o intervalo morreriam e a
 * sala de foco se perderia no meio do estudo.
 */
function FocusTimer({
  subjects,
  onSaved,
}: {
  subjects: StudySubject[];
  onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const focus = useFocusSession(subjects[0]?.id ?? "");
  const { subjectId, running, elapsedSeconds, hasProgress } = focus;

  // A matéria escolhida pode sair do plano (o aluno editou o cronograma).
  const subject = subjects.find((s) => s.id === subjectId) ?? subjects[0];
  const effectiveSubjectId = subject?.id ?? "";

  async function finishSession() {
    if (!effectiveSubjectId) return;
    setSaving(true);
    try {
      const minutes = Math.floor(elapsedSeconds / 60);
      if (minutes < 1) {
        setMessage("Estude por pelo menos 1 minuto para registrar.");
        return;
      }
      await apiLogSubjectTime(getAccessToken() ?? "", effectiveSubjectId, minutes);
      setMessage(`${minutesToHours(minutes)} registrados em ${subject?.name ?? "matéria"}.`);
      focus.clearElapsed();
      onSaved();
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "Não foi possível registrar o tempo.");
    } finally {
      setSaving(false);
    }
  }

  const display = `${String(Math.floor(elapsedSeconds / 3600)).padStart(2, "0")}:${String(Math.floor((elapsedSeconds % 3600) / 60)).padStart(2, "0")}:${String(elapsedSeconds % 60).padStart(2, "0")}`;

  return (
    <div className="mx-auto max-w-3xl">
      <Card className="overflow-hidden bg-graphite p-0 text-white">
        <div className="border-b border-white/10 px-6 py-5 text-center"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Sala de foco</p><h2 className="mt-2 text-xl font-semibold">Cronômetro de estudos</h2><p className="mt-1 text-sm text-white/45">Uma matéria por vez. Concentração total.</p></div>
        <div className="px-6 py-10 text-center sm:py-14">
          <label htmlFor="focusSubject" className="mx-auto block max-w-md text-left text-xs font-semibold text-white/55">Matéria</label>
          <select
            id="focusSubject"
            value={effectiveSubjectId}
            onChange={(event) => { focus.selectSubject(event.target.value); setMessage(""); }}
            disabled={running || subjects.length === 0}
            className="mx-auto mt-2 block w-full max-w-md rounded-xl border border-white/10 bg-white/10 px-4 py-3 text-sm text-white outline-none focus:border-primary disabled:opacity-50"
          >
            {subjects.length === 0 && <option value="" className="text-graphite">Nenhuma matéria no cronograma</option>}
            {subjects.map((item) => <option key={item.id} value={item.id} className="text-graphite">{item.name}</option>)}
          </select>
          <div className="my-10 font-mono text-5xl font-semibold tracking-tight sm:text-7xl" aria-live="off">{display}</div>
          <div className="flex flex-wrap justify-center gap-3">
            {!running ? <Button disabled={!effectiveSubjectId} onClick={() => { focus.start(); setMessage(""); }}><Play className="h-4 w-4" />Iniciar foco</Button> : <Button variant="outline" onClick={focus.pause}><CirclePause className="h-4 w-4" />Pausar</Button>}
            <Button variant="ghost" disabled={!hasProgress} onClick={() => { focus.reset(); setMessage(""); }}><RotateCcw className="h-4 w-4" />Reiniciar</Button>
            <Button variant="ghost" disabled={!hasProgress || saving || running} onClick={() => void finishSession()}><CheckCircle2 className="h-4 w-4" />{saving ? "Salvando..." : "Finalizar e salvar"}</Button>
          </div>
          {message && <p className="mt-6 text-sm text-primary">{message}</p>}
          <p className="mt-4 text-xs text-white/35">
            O cronômetro continua valendo enquanto o app estiver aberto, mesmo se você trocar de aba ou sair desta tela.
          </p>
        </div>
      </Card>
    </div>
  );
}

/**
 * Semana inteira de uma vez. Dia de estudo ainda não aberto aparece com o
 * tempo planejado — as tarefas dele nascem quando o dia é aberto, com a
 * prioridade daquele momento. Clicar num dia abre a visão diária dele.
 */
function WeeklyView({
  weekDays,
  week,
  onOpenDay,
}: {
  weekDays: Date[];
  week: StudyWeekDay[];
  onOpenDay: (day: Date) => void;
}) {
  const todayKey = formatDate(new Date());
  const byDate = new Map(week.map((day) => [day.date, day]));

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-7">
      {weekDays.map((day) => {
        const key = formatDate(day);
        const info = byDate.get(key);
        const isToday = key === todayKey;

        return (
          <button
            key={key}
            type="button"
            onClick={() => onOpenDay(day)}
            className={`rounded-xl border p-3 text-center transition-colors hover:border-primary/60 ${
              isToday ? "border-primary bg-primary/5" : "border-surface-line bg-white"
            }`}
          >
            <p className="text-xs font-semibold text-graphite-500">{WEEKDAY_LABELS[day.getDay()]}</p>
            <p className={`text-lg font-bold ${isToday ? "text-primary" : "text-graphite"}`}>{day.getDate()}</p>
            {!info && <p className="mt-1 text-xs text-graphite-400">Não estuda</p>}
            {info && info.totalTasks > 0 && (
              <>
                <div className="mt-1 h-1.5 w-full rounded-full bg-surface-line">
                  <div
                    className="h-1.5 rounded-full bg-primary"
                    style={{ width: `${(info.doneTasks / info.totalTasks) * 100}%` }}
                  />
                </div>
                <p className="mt-1 text-xs text-graphite-400">
                  {info.doneTasks}/{info.totalTasks} tarefas
                </p>
              </>
            )}
            {info && info.totalTasks === 0 && (
              <p className="mt-1 text-xs text-graphite-400">
                {info.scheduledMinutes > 0 ? `${minutesToHours(info.scheduledMinutes)} planejadas` : "Dia extra"}
              </p>
            )}
          </button>
        );
      })}
    </div>
  );
}

function MonthlyView({
  monthlyDays,
  date,
  schedule,
  completedTaskDates,
}: {
  monthlyDays: Date[];
  date: Date;
  schedule: StudySchedule;
  completedTaskDates: string[];
}) {
  return (
    <div className="grid grid-cols-7 gap-px bg-surface-line">
      {WEEKDAY_LABELS.map((label) => (
        <div key={label} className="bg-surface-card p-2 text-center text-xs font-semibold text-graphite-400">
          {label}
        </div>
      ))}
      {monthlyDays.map((day, idx) => {
        const isCurrentMonth = day.getMonth() === date.getMonth();
        const isToday = formatDate(day) === formatDate(new Date());
        const hasActivity = completedTaskDates.includes(formatDate(day));
        const isStudyDay = schedule.studyDays.includes(day.getDay());

        return (
          <div
            key={idx}
            className={`aspect-square p-1 ${
              isCurrentMonth ? "bg-white" : "bg-graphite/5"
            }`}
          >
            <div className="relative h-full w-full">
              <span
                className={`text-xs ${
                  isCurrentMonth ? "text-graphite" : "text-graphite-400"
                } ${isToday ? "font-bold text-primary" : ""}`}
              >
                {day.getDate()}
              </span>
              {isStudyDay && hasActivity && (
                <span className="absolute bottom-0 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-success" />
              )}
              {isToday && (
                <span className="absolute bottom-0 left-1/2 h-1 w-3 -translate-x-1/2 rounded-full bg-primary" />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TaskListView({
  tasks,
  taskFilter,
  setTaskFilter,
  onTaskUpdate,
  canCreateTasks,
}: {
  tasks: PaginatedTasks | null;
  taskFilter: "all" | "PENDING" | "IN_PROGRESS" | "DONE";
  setTaskFilter: (v: "all" | "PENDING" | "IN_PROGRESS" | "DONE") => void;
  onTaskUpdate: (task: StudyTask | null) => void;
  canCreateTasks: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2 border-b border-surface-line">
        <button
          type="button"
          onClick={() => setTaskFilter("all")}
          className={`pb-2 px-1 text-sm font-medium ${
            taskFilter === "all" ? "border-b-2 border-primary text-primary" : "text-graphite-500"
          }`}
        >
          Todas
        </button>
        <button
          type="button"
          onClick={() => setTaskFilter("PENDING")}
          className={`pb-2 px-1 text-sm font-medium ${
            taskFilter === "PENDING" ? "border-b-2 border-primary text-primary" : "text-graphite-500"
          }`}
        >
          Pendentes
        </button>
        <button
          type="button"
          onClick={() => setTaskFilter("IN_PROGRESS")}
          className={`pb-2 px-1 text-sm font-medium ${
            taskFilter === "IN_PROGRESS" ? "border-b-2 border-primary text-primary" : "text-graphite-500"
          }`}
        >
          Em andamento
        </button>
        <button
          type="button"
          onClick={() => setTaskFilter("DONE")}
          className={`pb-2 px-1 text-sm font-medium ${
            taskFilter === "DONE" ? "border-b-2 border-primary text-primary" : "text-graphite-500"
          }`}
        >
          Concluídas
        </button>
      </div>

      {tasks?.items.length === 0 && (
        <div className="py-12 text-center">
          <ListChecks className="mx-auto mb-3 h-10 w-10 text-graphite-300" />
          <p className="text-sm text-graphite-500">Nenhuma tarefa nesta categoria.</p>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {tasks?.items.map((task) => (
          <TaskItem
            key={task.id}
            task={task}
            onUpdate={onTaskUpdate}
            canCreateTasks={canCreateTasks}
          />
        ))}
      </div>

      {tasks && tasks.total > 0 && (
        <p className="text-xs text-graphite-400">
          {tasks.total} tarefa{tasks.total !== 1 ? "s" : ""} no total
        </p>
      )}
    </div>
  );
}
