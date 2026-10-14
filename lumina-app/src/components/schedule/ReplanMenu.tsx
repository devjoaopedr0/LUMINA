import { useState } from "react";
import { CalendarClock, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  type ReplanPreview,
  type ReplanStrategy,
  type StudyTask,
  ApiError,
  apiReplanTask,
} from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { formatCalendarDate, localDateKey } from "@/lib/utils";
import { minutesToHours } from "./shared";

const OPTIONS: { strategy: ReplanStrategy; label: string; hint: string }[] = [
  { strategy: "TOMORROW", label: "Próximo dia de estudo", hint: "Entra por cima do plano do dia." },
  { strategy: "SATURDAY", label: "Sábado", hint: "Vai para o próximo sábado." },
  { strategy: "AUTO", label: "Encaixar redistribuindo", hint: "Cabe no tempo do dia: as outras matérias cedem." },
  { strategy: "SKIP", label: "Não vou fazer", hint: "Sai das pendências." },
];

interface ReplanMenuProps {
  task: StudyTask;
  /** Chamado depois que o replanejamento foi gravado. */
  onDone: (message: string) => void;
}

/**
 * Replanejamento de uma tarefa não feita (fase 4): o aluno escolhe o que
 * fazer com ela. "Encaixar redistribuindo" mostra antes quanto cada matéria
 * perde ou ganha no dia de destino, e só grava depois da confirmação.
 */
export function ReplanMenu({ task, onDone }: ReplanMenuProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ReplanPreview | null>(null);

  function close() {
    setOpen(false);
    setPreview(null);
    setError(null);
  }

  async function run(strategy: ReplanStrategy, confirm = false) {
    setBusy(true);
    setError(null);
    try {
      const result = await apiReplanTask(getAccessToken() ?? "", task.id, {
        strategy,
        date: localDateKey(),
        confirm,
      });
      if (!result.applied && result.preview) {
        setPreview(result.preview);
        return;
      }
      close();
      onDone(
        result.movedTo
          ? `Tarefa movida para ${formatCalendarDate(result.movedTo)}.`
          : "Tarefa marcada como não feita.",
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível reagendar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative">
      <Button size="sm" variant="ghost" onClick={() => (open ? close() : setOpen(true))} aria-expanded={open}>
        <CalendarClock className="h-4 w-4" />
        Reagendar
      </Button>

      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-72 rounded-xl border border-surface-line bg-white p-2 shadow-xl shadow-graphite/10">
          {!preview ? (
            <>
              <p className="px-2 py-1 text-xs font-semibold text-graphite-500">O que fazer com esta tarefa?</p>
              {OPTIONS.map((option) => (
                <button
                  key={option.strategy}
                  type="button"
                  disabled={busy}
                  onClick={() => void run(option.strategy)}
                  className="block w-full rounded-lg px-2 py-2 text-left transition-colors hover:bg-graphite/5 disabled:opacity-50"
                >
                  <span className="block text-sm font-medium text-graphite">{option.label}</span>
                  <span className="block text-xs text-graphite-400">{option.hint}</span>
                </button>
              ))}
            </>
          ) : (
            <div className="p-2">
              <p className="text-sm font-semibold text-graphite">
                Encaixar em {formatCalendarDate(preview.date)}
              </p>
              <p className="mt-1 text-xs text-graphite-400">Tempo de cada matéria nesse dia, antes e depois:</p>
              <table className="mt-2 w-full text-xs">
                <tbody>
                  {preview.subjects.map((subject) => (
                    <tr key={subject.subjectName} className="border-t border-surface-line">
                      <td className="py-1.5 text-graphite">{subject.subjectName}</td>
                      <td className="py-1.5 text-right text-graphite-400">{minutesToHours(subject.beforeMinutes)}</td>
                      <td className="px-1 py-1.5 text-graphite-400">→</td>
                      <td
                        className={`py-1.5 text-right font-semibold ${
                          subject.afterMinutes < subject.beforeMinutes ? "text-alert" : "text-graphite"
                        }`}
                      >
                        {minutesToHours(subject.afterMinutes)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.warnings.length > 0 && (
                <ul className="mt-2 space-y-1 rounded-lg bg-alert/5 p-2 text-xs text-alert">
                  {preview.warnings.map((warning) => <li key={warning}>{warning}</li>)}
                </ul>
              )}
              <div className="mt-3 flex justify-end gap-2">
                <Button size="sm" variant="outline" disabled={busy} onClick={() => setPreview(null)}>Voltar</Button>
                <Button size="sm" disabled={busy} onClick={() => void run("AUTO", true)}>
                  {busy ? "Aplicando..." : "Confirmar"}
                </Button>
              </div>
            </div>
          )}

          {busy && !preview && <p className="px-2 py-1 text-xs text-graphite-400">Calculando...</p>}
          {error && (
            <div className="mt-1 flex items-start gap-1.5 rounded-lg border border-alert/20 bg-alert/5 p-2 text-xs text-alert">
              <X className="mt-0.5 h-3 w-3 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
