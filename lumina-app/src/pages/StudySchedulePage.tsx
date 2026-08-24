import {
  useEffect,
  useState,
  type FormEvent,
} from "react";
import {
  Calendar,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Edit,
  ListChecks,
  Loader2,
  LogOut,
  Play,
  RotateCcw,
  TrendingUp,
  X,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useAuth } from "@/contexts/AuthContext";
import {
  type StudySchedule,
  type StudySubject,
  type StudySession,
  type StudyTask,
  type StudyScheduleSubjectTarget,
  type StudyProgressSummary,
  type ProgressEvolutionPoint,
  type PaginatedTasks,
  ApiError,
  apiCreateStudySchedule,
  apiGetDailySession,
  apiGetProgress,
  apiGetStudySchedule,
  apiListStudySubjects,
  apiListTasks,
  apiLogTime,
  apiRescheduleMissed,
  apiUpdateStudySchedule,
  apiUpdateTask,
} from "@/lib/api";
import { getAccessToken } from "@/lib/auth";

const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTH_LABELS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const TASK_STATUS_LABEL: Record<StudyTask["status"], string> = {
  PENDING: "Pendente",
  IN_PROGRESS: "Em andamento",
  DONE: "Concluído",
};

const TASK_STATUS_BADGE: Record<StudyTask["status"], string> = {
  PENDING: "border-surface-line bg-graphite/5 text-graphite-500",
  IN_PROGRESS: "border-primary/30 bg-primary/10 text-primary",
  DONE: "border-success/20 bg-success/10 text-success",
};

const STUDY_SUBJECTS_DEFAULT_HOURS: Record<string, number> = {
  Matemática: 120,
  Física: 80,
  Química: 80,
  Biologia: 60,
  Português: 100,
  Literatura: 60,
  História: 70,
  Geografia: 70,
  Filosofia: 40,
  Sociologia: 40,
  Inglês: 60,
  Redação: 80,
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

function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDateDisplay(date: Date | string): string {
  return new Date(date).toLocaleDateString("pt-BR");
}

function minutesToHours(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0) return `${h}h${m > 0 ? ` ${m}min` : ""}`;
  return `${m}min`;
}

interface CreateScheduleFormProps {
  subjects: StudySubject[];
  existingSchedule: StudySchedule | null;
  onCancel: () => void;
  onSuccess: () => void;
}

function CreateScheduleForm({ subjects, existingSchedule, onCancel, onSuccess }: CreateScheduleFormProps) {
  const token = getAccessToken() ?? "";
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [dailyMinutes, setDailyMinutes] = useState(120);
  const [studyDays, setStudyDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [objective, setObjective] = useState("");
  const [selectedSubjects, setSelectedSubjects] = useState<Record<string, number>>(
    existingSchedule?.scheduleSubjects
      ? Object.fromEntries(
          existingSchedule.scheduleSubjects.map((s) => [s.subjectId, Math.round(s.targetHours)]),
        )
      : Object.fromEntries(
          subjects
            .filter((s) => s.name !== "Redação")
            .map((s) => [s.id, STUDY_SUBJECTS_DEFAULT_HOURS[s.name] ?? 60]),
        ),
  );

  function toggleDay(day: number) {
    setStudyDays((current) =>
      current.includes(day)
        ? current.filter((d) => d !== day)
        : [...current, day].sort((a, b) => a - b),
    );
  }

  function toggleSubject(subjectId: string) {
    const entry = subjects.find((s) => s.id === subjectId);
    if (!entry) return;
    const defaultHours = STUDY_SUBJECTS_DEFAULT_HOURS[entry.name] ?? 60;
    setSelectedSubjects((current) => {
      const next = { ...current };
      if (next[subjectId] !== undefined) {
        delete next[subjectId];
      } else {
        next[subjectId] = defaultHours;
      }
      return next;
    });
  }

  function updateHours(subjectId: string, hours: number) {
    setSelectedSubjects((current) => ({
      ...current,
      [subjectId]: Math.max(0, hours),
    }));
  }

  function validate(): string | null {
    if (!startDate || !endDate) return "Selecione as datas de início e término.";
    if (new Date(startDate) > new Date(endDate)) return "A data de início deve ser anterior à de término.";
    if (studyDays.length === 0) return "Selecione pelo menos um dia de estudo por semana.";
    if (dailyMinutes < 15) return "O tempo diário mínimo é 15 minutos.";
    const selected = Object.keys(selectedSubjects);
    if (selected.length === 0) return "Selecione pelo menos uma disciplina.";
    return null;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setSaving(true);

    const payload = {
      startDate,
      endDate,
      studyDays,
      dailyMinutes,
      objective: objective || undefined,
      subjects: Object.entries(selectedSubjects).map(
        ([subjectId, targetHours]) => ({ subjectId, targetHours }),
      ) as StudyScheduleSubjectTarget[],
    };

    try {
      if (existingSchedule) {
        await apiUpdateStudySchedule(token, existingSchedule.id, payload);
      } else {
        await apiCreateStudySchedule(token, payload);
      }
      onSuccess();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Não foi possível salvar o cronograma.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-alert/20 bg-alert/5 p-3 text-sm text-alert">
          <X className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label htmlFor="startDate" className="mb-1.5 block text-sm font-medium text-graphite">
            Data de início
          </label>
          <Input
            id="startDate"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            required
          />
        </div>
        <div>
          <label htmlFor="endDate" className="mb-1.5 block text-sm font-medium text-graphite">
            Data de término
          </label>
          <Input
            id="endDate"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            required
          />
        </div>
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-graphite">Dias de estudo na semana</label>
        <div className="flex flex-wrap gap-2">
          {WEEKDAY_LABELS.map((label, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => toggleDay(idx)}
              className={`h-10 px-3 rounded-xl border text-sm font-medium transition-all ${
                studyDays.includes(idx)
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-surface-line bg-white text-graphite hover:border-graphite/30"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label htmlFor="dailyMinutes" className="mb-1.5 block text-sm font-medium text-graphite">
          Tempo diário (minutos)
        </label>
        <Input
          id="dailyMinutes"
          type="number"
          min={15}
          max={1440}
          value={dailyMinutes}
          onChange={(e) => setDailyMinutes(Math.max(15, Math.min(1440, parseInt(e.target.value) || 120)))}
          required
        />
      </div>

      <div>
        <label htmlFor="objective" className="mb-1.5 block text-sm font-medium text-graphite">
          Objetivo (opcional)
        </label>
        <Input
          id="objective"
          value={objective}
          onChange={(e) => setObjective(e.target.value)}
          placeholder="Ex: Passar no ENEM com 1400+ pontos"
          maxLength={500}
        />
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-graphite">
          Disciplinas — marque e ajuste as horas alvo
        </label>
        <div className="flex flex-col gap-3">
          {subjects.map((subj) => {
            const isSelected = selectedSubjects[subj.id] !== undefined;
            return (
              <div
                key={subj.id}
                className={`flex items-center gap-3 rounded-xl border p-3 transition-all ${
                  isSelected
                    ? "border-primary/30 bg-primary/5"
                    : "border-surface-line bg-white"
                }`}
              >
                <button
                  type="button"
                  onClick={() => toggleSubject(subj.id)}
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs font-bold transition-all ${
                    isSelected
                      ? "border-primary bg-primary text-white"
                      : "border-surface-line text-transparent"
                  }`}
                >
                  {isSelected && <CheckCircle2 className="h-3.5 w-3.5" />}
                </button>
                <span className="text-sm font-medium text-graphite">{subj.name}</span>
                {isSelected && (
                  <>
                    <Input
                      type="number"
                      min={0}
                      max={500}
                      value={selectedSubjects[subj.id]}
                      onChange={(e) =>
                        updateHours(subj.id, parseInt(e.target.value) || 0)
                      }
                      className="w-24"
                    />
                    <span className="text-xs text-graphite-400">horas</span>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
          Cancelar
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? "Salvando..." : existingSchedule ? "Atualizar cronograma" : "Criar cronograma"}
        </Button>
      </div>
    </form>
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

interface TaskItemProps {
  task: StudyTask;
  onUpdate: (task: StudyTask | null) => void;
  onLogTime: (minutes: number) => void;
  canCreateTasks: boolean;
}

function TaskItem({ task, onUpdate, onLogTime, canCreateTasks }: TaskItemProps) {
  const [timer, setTimer] = useState<{ active: boolean; seconds: number }>({ active: false, seconds: 0 });
  const [error, setError] = useState<string | null>(null);

  const status = task.status;
  const badgeClass = TASK_STATUS_BADGE[status];

  function toggleStatus() {
    setError(null);
    const newStatus: StudyTask["status"] =
      status === "PENDING" ? "IN_PROGRESS" :
      status === "IN_PROGRESS" ? "DONE" : "PENDING";
    apiUpdateTask(getAccessToken() ?? "", task.id, { status: newStatus })
      .then(onUpdate)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Erro ao atualizar."));
  }

  function startTimer() {
    setTimer({ active: true, seconds: 0 });
  }

  function stopTimer() {
    setTimer({ active: false, seconds: 0 });
    const minutes = Math.ceil(timer.seconds / 60);
    if (minutes > 0) {
      setError(null);
      apiLogTime(getAccessToken() ?? "", task.id, minutes)
        .then(() => onLogTime(minutes))
        .catch((err) => setError(err instanceof ApiError ? err.message : "Erro ao salvar tempo."));
    }
  }

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    if (timer.active) {
      interval = setInterval(() => {
        setTimer((t) => ({ ...t, seconds: t.seconds + 1 }));
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [timer.active]);

  return (
    <div className="rounded-xl border border-surface-line bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${badgeClass}`}>
              {TASK_STATUS_LABEL[status]}
            </span>
            {task.subjectName && (
              <span className="rounded-full bg-graphite/5 px-2 py-0.5 text-xs text-graphite-500">
                {task.subjectName}
              </span>
            )}
          </div>
          <h3 className="mt-1 text-sm font-medium text-graphite">{task.title}</h3>
          {task.description && (
            <p className="mt-1 text-xs text-graphite-400">{task.description}</p>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {timer.active ? (
            <Button size="sm" variant="outline" onClick={stopTimer}>
              <Pause className="h-3.5 w-3.5" />
              Para
            </Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={startTimer}>
              <Play className="h-3.5 w-3.5" />
              Cronômetro
            </Button>
          )}
          {canCreateTasks && (
            <Button size="sm" variant="ghost" onClick={toggleStatus}>
              {status === "DONE" ? "Reabrir" : "Concluir"}
            </Button>
          )}
        </div>
      </div>

      {timer.active && (
        <div className="mt-3 flex items-center gap-2">
          <Clock className="h-4 w-4 text-graphite-400" />
          <span className="font-mono text-sm text-graphite">
            {Math.floor(timer.seconds / 60)}:{String(timer.seconds % 60).padStart(2, "0")}
          </span>
        </div>
      )}

      {error && (
        <div className="mt-2 flex items-start gap-1.5 rounded border border-alert/20 bg-alert/5 p-2 text-xs text-alert">
          <X className="mt-0.5 h-3 w-3 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}

const Pause = (props: { className?: string }) => (
  <svg {...props} viewBox="0 0 24 24" fill="currentColor">
    <path d="M6 4h4v16H6zM14 4h4v16h-4z" />
  </svg>
);

export function StudySchedulePage() {
  const { user, logout } = useAuth();
  const [subjects, setSubjects] = useState<StudySubject[]>([]);
  const [schedule, setSchedule] = useState<StudySchedule | null>(null);
  const [dailyData, setDailyData] = useState<{ schedule: StudySchedule; session: StudySession | null } | null>(null);
  const [tasks, setTasks] = useState<PaginatedTasks | null>(null);
  const [progress, setProgress] = useState<{ summary: StudyProgressSummary | null; evolution: ProgressEvolutionPoint[] | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [activeTab, setActiveTab] = useState<"daily" | "weekly" | "monthly" | "tasks">("daily");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [taskFilter, setTaskFilter] = useState<"all" | "PENDING" | "IN_PROGRESS" | "DONE">("all");

  const token = getAccessToken() ?? "";

  function loadAll() {
    if (!token) return;
    setLoading(true);
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
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    if (schedule && token) {
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

  function handleTaskUpdate(updatedTask: StudyTask | null) {
    if (!updatedTask) return;
    setTasks((current) => {
      if (!current) return current;
      return {
        ...current,
        items: current.items.map((t) => (t.id === updatedTask.id ? updatedTask : t)),
      };
    });
    if (dailyData?.session) {
      setDailyData((current) => {
        if (!current || !current.session) return current;
        return {
          schedule: current.schedule,
          session: {
            ...current.session,
            tasks: current.session.tasks.map((t) =>
              t.id === updatedTask.id ? updatedTask : t,
            ),
          },
        };
      });
    }
  }

  function handleLogTime(minutes: number) {
    if (!progress) return;
    setProgress({
      summary: {
        ...progress.summary!,
        completedMinutes: progress.summary!.completedMinutes + minutes,
      },
      evolution: progress.evolution,
    });
  }

  const studyDaysLabel = schedule
    ? schedule.studyDays.map((d) => WEEKDAY_LABELS[d]).join(", ")
    : "-";

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

  function prevPeriod() {
    if (activeTab === "monthly") setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
    else setCurrentDate(addDays(currentDate, -7));
  }

  function nextPeriod() {
    if (activeTab === "monthly") setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
    else setCurrentDate(addDays(currentDate, 7));
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

      <main className="container-lumina py-10">
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
                Ainda não há um cronograma. Crie um para começar a organizar seus estudos.
              </p>
            </div>
            <Card className="bg-white">
              <CreateScheduleForm
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
                  Estudo em: {studyDaysLabel} · {minutesToHours(schedule.dailyMinutes)}/dia
                </p>
              </div>
              {schedule.status === "ACTIVE" && (
                <Button size="sm" onClick={() => setShowCreateForm(true)}>
                  <Edit className="h-4 w-4" />
                  Editar cronograma
                </Button>
              )}
            </div>

            <ProgressPanel progress={progress?.summary ?? null} />

            <div className="mt-8 flex gap-4 border-b border-surface-line">
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
                  onLogTime={handleLogTime}
                  canCreateTasks={schedule.status === "ACTIVE"}
                />
              )}
               {activeTab === "weekly" && (
                <WeeklyView
                  weekDays={weekDays}
                  dailyData={dailyData}
                  currentDate={currentDate}
                />
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

            <div className="mt-8 flex items-center justify-center gap-3">
              <Button variant="outline" size="sm" onClick={prevPeriod}>
                <ChevronLeft className="h-4 w-4" />
                Anterior
              </Button>
              <span className="text-sm text-graphite-500">
                {activeTab === "monthly"
                  ? `${MONTH_LABELS[currentDate.getMonth()]} ${currentDate.getFullYear()}`
                  : formatDateDisplay(weekDays[0]) + " — " + formatDateDisplay(weekDays[6])}
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
            </div>

            <div className="mt-8">
              <Button variant="ghost" size="sm" onClick={() => {
                apiRescheduleMissed(getAccessToken() ?? "", formatDate(currentDate))
                  .then(() => loadAll())
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
      </main>
    </div>
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
        <CreateScheduleForm
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
  data: { schedule: StudySchedule; session: StudySession | null } | null;
  onTaskUpdate: (task: StudyTask | null) => void;
  onLogTime: (minutes: number) => void;
  canCreateTasks: boolean;
}

function DailyView({ date, data, onTaskUpdate, onLogTime, canCreateTasks }: DailyViewProps) {
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
  const inProgress = tasks.filter((t) => t.status === "IN_PROGRESS");
  const pending = tasks.filter((t) => t.status === "PENDING");
  const done = tasks.filter((t) => t.status === "DONE");
  const loggedMinutes = tasks.reduce(
    (sum: number, t: StudyTask) => sum + (t.loggedMinutes ?? 0),
    0,
  );

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
      </div>

      {pending.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase text-graphite-400">A fazer</h3>
          <div className="flex flex-col gap-3">
            {pending.map((t) => (
              <TaskItem
                key={t.id}
                task={t}
                onUpdate={onTaskUpdate}
                onLogTime={onLogTime}
                canCreateTasks={canCreateTasks}
              />
            ))}
          </div>
        </div>
      )}

      {inProgress.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase text-graphite-400">Em andamento</h3>
          <div className="flex flex-col gap-3">
            {inProgress.map((t) => (
              <TaskItem
                key={t.id}
                task={t}
                onUpdate={onTaskUpdate}
                onLogTime={onLogTime}
                canCreateTasks={canCreateTasks}
              />
            ))}
          </div>
        </div>
      )}

      {done.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase text-graphite-400">Concluídos</h3>
          <div className="flex flex-col gap-3">
            {done.map((t) => (
              <TaskItem
                key={t.id}
                task={t}
                onUpdate={onTaskUpdate}
                onLogTime={onLogTime}
                canCreateTasks={canCreateTasks}
              />
            ))}
          </div>
        </div>
      )}

      {tasks.length === 0 && (
        <div className="py-12 text-center">
          <ListChecks className="mx-auto mb-3 h-10 w-10 text-graphite-300" />
          <p className="text-sm text-graphite-500">Nenhuma tarefa programada para este dia.</p>
        </div>
      )}
    </div>
  );
}

function WeeklyView({
  weekDays,
  dailyData,
  currentDate,
}: {
  weekDays: Date[];
  dailyData: { schedule: StudySchedule; session: StudySession | null } | null;
  currentDate: Date;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-7">
      {weekDays.map((day, idx) => {
        const isToday = formatDate(day) === formatDate(currentDate);
        const hasSession = dailyData?.session && formatDate(dailyData.session.date) === formatDate(day);
        const tasks = (dailyData?.session?.tasks ?? []).filter(
          (t: StudyTask) => t.status === "DONE",
        ).length;
        const totalTasks = dailyData?.session?.tasks?.length ?? 0;

        return (
          <div
            key={idx}
            className={`rounded-xl border p-3 ${
              isToday
                ? "border-primary bg-primary/5"
                : "border-surface-line bg-white"
            }`}
          >
            <div className="text-center">
              <p className="text-xs font-semibold text-graphite-500">
                {WEEKDAY_LABELS[day.getDay()]}
              </p>
              <p className={`text-lg font-bold ${isToday ? "text-primary" : "text-graphite"}`}>
                {day.getDate()}
              </p>
              {hasSession && (
                <>
                  <div className="mt-1 h-1.5 w-full rounded-full bg-surface-line">
                    <div
                      className="h-1.5 rounded-full bg-primary"
                      style={{
                        width: `${totalTasks > 0 ? (tasks / totalTasks) * 100 : 0}%`,
                      }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-graphite-400">
                    {tasks}/{totalTasks}
                  </p>
                </>
              )}
              {!hasSession && (
                <p className="mt-1 text-xs text-graphite-400">Não estuda</p>
              )}
            </div>
          </div>
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
            onLogTime={() => {}}
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
