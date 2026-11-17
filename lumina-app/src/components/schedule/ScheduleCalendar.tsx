import { useEffect, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { apiScheduleCalendar } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import {
  WEEKDAYS_MON_FIRST,
  bySubject,
  calendarGrid,
  isoDate,
  subjectColor,
  type CalendarDay,
  type CalendarMode,
  type ScheduleCalendar as CalendarData,
} from "@/lib/calendar";

const minutesLabel = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? String(m % 60).padStart(2, "0") : ""}` : `${m} min`);

/**
 * Calendário do cronograma (semana ou mês, de segunda a domingo): em cada
 * dia, as matérias e os assuntos. Dias futuros ainda não planejados vêm como
 * previsão; o dia de hoje fica em destaque. Clicar no dia abre a visão diária.
 */
export function ScheduleCalendar({ mode, reference, onOpenDay }: { mode: CalendarMode; reference: Date; onOpenDay: (day: Date) => void }) {
  const grid = calendarGrid(mode, reference);
  const from = isoDate(grid[0]);
  const to = isoDate(grid[grid.length - 1]);
  const [data, setData] = useState<CalendarData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    apiScheduleCalendar(getAccessToken() ?? "", from, to)
      .then((d) => alive && setData(d))
      .catch(() => alive && setError("Não foi possível montar o calendário agora."))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [from, to]);

  const byDate = new Map<string, CalendarDay>((data?.days ?? []).map((d) => [d.date, d]));
  const today = isoDate(new Date());
  const month = reference.getMonth();
  const compact = mode === "month";

  return (
    <div className="space-y-3">
      {loading ? (
        <p role="status" className="flex items-center gap-2 text-sm text-graphite-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          {mode === "month" ? "Montando a previsão do mês…" : "Montando a semana…"}
        </p>
      ) : null}
      {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}

      <div className="overflow-x-auto rounded-2xl border border-surface-line bg-white">
        <div className="grid min-w-[760px] grid-cols-7">
          {WEEKDAYS_MON_FIRST.map((label) => (
            <div key={label} className="border-b border-surface-line py-2 text-center text-xs font-semibold text-graphite-400">{label}</div>
          ))}
          {grid.map((day) => {
            const key = isoDate(day);
            const info = byDate.get(key);
            const isToday = key === today;
            const outside = compact && day.getMonth() !== month;
            const inSchedule = data ? key >= data.scheduleStart && key <= data.scheduleEnd : true;
            const isExam = data?.examDate === key;
            const groups = info ? bySubject(info.tasks) : [];
            return (
              <button
                key={key}
                type="button"
                onClick={() => onOpenDay(day)}
                className={`flex flex-col gap-1 border-b border-r border-surface-line p-2 text-left align-top transition hover:bg-primary/5 ${compact ? "min-h-[118px]" : "min-h-[260px]"} ${outside ? "bg-surface-card/60" : ""}`}
                aria-label={`${day.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}${info ? `: ${groups.map((g) => g.subject).join(", ")}` : ""}`}
              >
                <div className="flex items-center justify-between">
                  <span className={`flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold ${isToday ? "bg-graphite text-white" : outside ? "text-graphite-300" : "text-graphite"}`}>
                    {day.getDate()}
                  </span>
                  {info ? <span className="text-[10px] text-graphite-400">{minutesLabel(info.scheduledMinutes)}</span> : null}
                </div>
                {isExam ? <span className="rounded-md bg-graphite px-1.5 py-0.5 text-[10px] font-bold text-white">Dia da prova</span> : null}
                {!info && inSchedule && !outside && data ? <span className="text-[11px] text-graphite-300">Sem estudo</span> : null}
                {info && info.projected ? <span className="text-[10px] font-semibold uppercase tracking-wide text-graphite-400">Previsão</span> : null}
                <ul className="flex flex-col gap-1">
                  {groups.slice(0, compact ? 3 : 8).map((g) => (
                    <li key={g.subject} className={`rounded-md border px-1.5 py-1 text-[11px] leading-tight ${subjectColor(g.subject)} ${info?.projected ? "border-dashed" : ""}`}>
                      <span className="flex items-center gap-1 font-semibold">
                        {g.done ? <CheckCircle2 className="h-3 w-3" aria-label="feito" /> : null}
                        {g.subject}
                        {!compact ? <span className="ml-auto font-normal opacity-70">{minutesLabel(g.minutes)}</span> : null}
                      </span>
                      {!compact ? <span className="block opacity-80">{g.topics.join(" · ")}</span> : <span className="block truncate opacity-80">{g.topics[0]}</span>}
                    </li>
                  ))}
                  {compact && groups.length > 3 ? <li className="text-[10px] text-graphite-400">+{groups.length - 3} matérias</li> : null}
                </ul>
              </button>
            );
          })}
        </div>
      </div>
      <p className="text-xs text-graphite-400">
        Dias marcados como "Previsão" ainda não foram planejados: o cronograma se ajusta ao seu desempenho e refaz o dia quando ele chegar.
      </p>
    </div>
  );
}
