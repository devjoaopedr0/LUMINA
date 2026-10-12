import { useEffect, useState, type FormEvent } from "react";
import { CheckCircle2, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  type CreateStudySchedulePayload,
  type StudyArea,
  type StudyEssayFrequency,
  type StudySchedule,
  type StudyScheduleSubjectTarget,
  type StudySubject,
  type UserVestibular,
  ApiError,
  apiCreateStudySchedule,
  apiGetUserVestibular,
  apiSetVestibular,
  apiUpdateStudySchedule,
} from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import {
  STUDY_AREA_LABEL,
  STUDY_SUBJECTS_DEFAULT_HOURS,
  WEEKDAY_LABELS,
  WEEKDAY_NAMES,
  minutesToHours,
} from "./shared";

interface ScheduleFormProps {
  subjects: StudySubject[];
  existingSchedule: StudySchedule | null;
  onCancel: () => void;
  onSuccess: () => void;
}

/** Etapas do onboarding (criação). Na edição tudo aparece numa tela só. */
const STEPS = ["Disponibilidade", "Objetivo", "Matérias"] as const;

const SELECT_CLASS =
  "h-12 w-full rounded-xl border border-surface-line bg-white px-4 text-sm text-graphite outline-none transition-colors focus:border-primary-600 focus:ring-2 focus:ring-primary/30";

function clampMinutes(value: string, fallback: number): number {
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.max(0, Math.min(1440, parsed));
}

/**
 * Criação e edição do cronograma. A criação é o onboarding em três etapas:
 * quando o aluno pode estudar (com tempo diferente por dia da semana), o que
 * ele quer (objetivo, curso, área prioritária, data da prova) e quais
 * matérias entram, com a rotina de redação.
 */
export function ScheduleForm({ subjects, existingSchedule, onCancel, onSuccess }: ScheduleFormProps) {
  const token = getAccessToken() ?? "";
  const editing = existingSchedule !== null;
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Ao editar, os campos precisam começar preenchidos com os valores atuais
  // do cronograma — sem isso, "Data de início"/"Data de término" ficam em
  // branco e, por serem obrigatórios, bloqueiam silenciosamente qualquer
  // salvamento. `.slice(0, 10)` em vez de `new Date(...)`: o backend manda
  // meia-noite UTC, e converter para o fuso local voltaria um dia.
  const [startDate, setStartDate] = useState(existingSchedule?.startDate.slice(0, 10) ?? "");
  const [endDate, setEndDate] = useState(existingSchedule?.endDate.slice(0, 10) ?? "");
  const [dailyMinutes, setDailyMinutes] = useState(existingSchedule?.dailyMinutes ?? 120);
  const [studyDays, setStudyDays] = useState<number[]>(existingSchedule?.studyDays ?? [1, 2, 3, 4, 5]);
  const existingDayMinutes = existingSchedule?.dayMinutes ?? [];
  const [sameEveryDay, setSameEveryDay] = useState(existingDayMinutes.length === 0);
  const [minutesByDay, setMinutesByDay] = useState<Record<number, number>>(
    Object.fromEntries(existingDayMinutes.map((day) => [day.weekday, day.minutes])),
  );

  const [objective, setObjective] = useState(existingSchedule?.objective ?? "");
  const [targetCourse, setTargetCourse] = useState(existingSchedule?.targetCourse ?? "");
  const [priorityArea, setPriorityArea] = useState<StudyArea | "">(existingSchedule?.priorityArea ?? "");
  // A data da prova é do aluno (vestibular), não do cronograma: é ela que
  // define as fases (base, consolidação, preparação).
  const [vestibular, setVestibular] = useState<UserVestibular | null>(null);
  const [examDate, setExamDate] = useState("");

  const [essayFrequency, setEssayFrequency] = useState<StudyEssayFrequency>(
    existingSchedule?.essayFrequency ?? "WEEKLY",
  );
  // Língua estrangeira: o ENEM cobra só uma (Inglês OU Espanhol), então as
  // duas nunca aparecem juntas na lista geral — o aluno escolhe uma das duas.
  const languageSubjects = subjects.filter((s) => s.code === "ENGLISH" || s.code === "SPANISH");
  const regularSubjects = subjects.filter((s) => s.code !== "ENGLISH" && s.code !== "SPANISH");
  const [selectedSubjects, setSelectedSubjects] = useState<Record<string, number>>(
    existingSchedule?.scheduleSubjects
      ? Object.fromEntries(
          existingSchedule.scheduleSubjects.map((s) => [s.subjectId, Math.round(s.targetHours)]),
        )
      : Object.fromEntries(
          subjects
            .filter((s) => s.name !== "Redação" && s.code !== "SPANISH")
            .map((s) => [s.id, STUDY_SUBJECTS_DEFAULT_HOURS[s.name] ?? 60]),
        ),
  );
  const selectedLanguageId = languageSubjects.find((s) => selectedSubjects[s.id] !== undefined)?.id ?? null;
  const essaySubject = subjects.find((s) => s.code === "ESSAY");
  const essaySelected = essaySubject ? selectedSubjects[essaySubject.id] !== undefined : false;

  useEffect(() => {
    if (!token) return;
    apiGetUserVestibular(token)
      .then((current) => {
        setVestibular(current);
        setExamDate(current?.targetDate?.slice(0, 10) ?? "");
      })
      .catch(() => undefined);
  }, [token]);

  const minutesFor = (day: number) => minutesByDay[day] ?? dailyMinutes;
  const weeklyMinutes = studyDays.reduce(
    (sum, day) => sum + (sameEveryDay ? dailyMinutes : minutesFor(day)),
    0,
  );

  function selectLanguage(subjectId: string | null) {
    setSelectedSubjects((current) => {
      const next = { ...current };
      for (const lang of languageSubjects) delete next[lang.id];
      if (subjectId) {
        const entry = subjects.find((s) => s.id === subjectId);
        const defaultHours = entry ? STUDY_SUBJECTS_DEFAULT_HOURS[entry.name] ?? 60 : 60;
        next[subjectId] = current[subjectId] ?? defaultHours;
      }
      return next;
    });
  }

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

  function validateAvailability(): string | null {
    if (!startDate || !endDate) return "Selecione as datas de início e término.";
    if (new Date(startDate) > new Date(endDate)) return "A data de início deve ser anterior à de término.";
    if (studyDays.length === 0) return "Selecione pelo menos um dia de estudo por semana.";
    if (sameEveryDay) {
      if (dailyMinutes < 15) return "O tempo diário mínimo é 15 minutos.";
    } else if (studyDays.some((day) => minutesFor(day) < 15)) {
      return "Cada dia de estudo precisa de pelo menos 15 minutos — ou desmarque o dia.";
    }
    return null;
  }

  function validateGoal(): string | null {
    if (examDate && startDate && new Date(examDate) < new Date(startDate)) {
      return "A data da prova deve ser depois do início do cronograma.";
    }
    return null;
  }

  function validateSubjects(): string | null {
    if (Object.keys(selectedSubjects).length === 0) return "Selecione pelo menos uma disciplina.";
    return null;
  }

  function goNext() {
    const stepError = step === 0 ? validateAvailability() : validateGoal();
    setError(stepError);
    if (!stepError) setStep((current) => current + 1);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    // Enter num campo das primeiras etapas avança em vez de salvar pela metade.
    if (!editing && step < STEPS.length - 1) {
      goNext();
      return;
    }
    const validationError = validateAvailability() ?? validateGoal() ?? validateSubjects();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setSaving(true);

    const perDay = sameEveryDay ? [] : studyDays.map((weekday) => ({ weekday, minutes: minutesFor(weekday) }));
    const payload: CreateStudySchedulePayload = {
      startDate,
      endDate,
      studyDays,
      // Com tempo por dia, `dailyMinutes` vira só o valor de reserva.
      dailyMinutes: sameEveryDay ? dailyMinutes : Math.max(...perDay.map((day) => day.minutes)),
      objective: objective || undefined,
      targetCourse: targetCourse || undefined,
      priorityArea: priorityArea || undefined,
      essayFrequency: essaySelected ? essayFrequency : undefined,
      subjects: Object.entries(selectedSubjects).map(
        ([subjectId, targetHours]) => ({ subjectId, targetHours }),
      ) as StudyScheduleSubjectTarget[],
    };

    try {
      const savedExamDate = vestibular?.targetDate?.slice(0, 10) ?? "";
      if (examDate !== savedExamDate) {
        // O que o aluno já tinha escolhido (prova, nome) vai junto: o backend
        // regrava o registro inteiro.
        await apiSetVestibular(token, {
          examId: vestibular?.examId ?? undefined,
          customName: vestibular?.customName ?? undefined,
          targetDate: examDate || undefined,
        });
      }
      if (existingSchedule) {
        // Na edição a lista vai sempre (vazia = voltar ao mesmo tempo todo dia).
        // Campo vazio precisa ir explícito para LIMPAR o valor antigo — omitido,
        // o backend entende "não mexer".
        await apiUpdateStudySchedule(token, existingSchedule.id, {
          ...payload,
          objective,
          targetCourse,
          priorityArea: priorityArea || null,
          dayMinutes: perDay,
        });
      } else {
        await apiCreateStudySchedule(token, perDay.length ? { ...payload, dayMinutes: perDay } : payload);
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

  const showStep = (index: number) => editing || step === index;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      {!editing && (
        <ol className="flex items-center gap-2 text-xs font-semibold">
          {STEPS.map((label, index) => (
            <li key={label} className="flex items-center gap-2">
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full ${
                  index <= step ? "bg-primary text-graphite" : "bg-graphite/5 text-graphite-400"
                }`}
              >
                {index + 1}
              </span>
              <span className={index === step ? "text-graphite" : "text-graphite-400"}>{label}</span>
              {index < STEPS.length - 1 && <span className="mx-1 h-px w-6 bg-surface-line" />}
            </li>
          ))}
        </ol>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-alert/20 bg-alert/5 p-3 text-sm text-alert">
          <X className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {showStep(0) && (
        <section className="flex flex-col gap-5">
          <div>
            <h3 className="text-sm font-semibold text-graphite">Quando você pode estudar</h3>
            <p className="mt-1 text-xs text-graphite-400">
              O cronograma monta cada dia dentro do tempo que você informar aqui.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="startDate" className="mb-1.5 block text-sm font-medium text-graphite">
                Data de início
              </label>
              <Input id="startDate" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
            </div>
            <div>
              <label htmlFor="endDate" className="mb-1.5 block text-sm font-medium text-graphite">
                Data de término
              </label>
              <Input id="endDate" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
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
                  aria-pressed={studyDays.includes(idx)}
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
            <label className="flex items-center gap-2 text-sm font-medium text-graphite">
              <input
                type="checkbox"
                checked={sameEveryDay}
                onChange={(e) => setSameEveryDay(e.target.checked)}
                className="h-4 w-4 accent-primary"
              />
              Mesmo tempo em todos os dias
            </label>

            {sameEveryDay ? (
              <div className="mt-3">
                <label htmlFor="dailyMinutes" className="mb-1.5 block text-sm font-medium text-graphite">
                  Tempo diário (minutos)
                </label>
                <Input
                  id="dailyMinutes"
                  type="number"
                  min={15}
                  max={1440}
                  value={dailyMinutes}
                  onChange={(e) => setDailyMinutes(clampMinutes(e.target.value, 120))}
                  required
                />
              </div>
            ) : (
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {studyDays.map((day) => (
                  <div key={day} className="flex items-center gap-3 rounded-xl border border-surface-line bg-white p-3">
                    <label htmlFor={`dayMinutes-${day}`} className="w-20 text-sm font-medium text-graphite">
                      {WEEKDAY_NAMES[day]}
                    </label>
                    <Input
                      id={`dayMinutes-${day}`}
                      type="number"
                      min={15}
                      max={1440}
                      value={minutesFor(day)}
                      onChange={(e) =>
                        setMinutesByDay((current) => ({ ...current, [day]: clampMinutes(e.target.value, dailyMinutes) }))
                      }
                      className="w-24"
                    />
                    <span className="text-xs text-graphite-400">min · {minutesToHours(minutesFor(day))}</span>
                  </div>
                ))}
              </div>
            )}
            <p className="mt-2 text-xs text-graphite-400">Total por semana: {minutesToHours(weeklyMinutes)}</p>
          </div>
        </section>
      )}

      {showStep(1) && (
        <section className="flex flex-col gap-5">
          <div>
            <h3 className="text-sm font-semibold text-graphite">O que você quer alcançar</h3>
            <p className="mt-1 text-xs text-graphite-400">
              Tudo opcional. A data da prova define as fases do cronograma; a área prioritária ganha mais tempo.
            </p>
          </div>

          <div>
            <label htmlFor="objective" className="mb-1.5 block text-sm font-medium text-graphite">
              Objetivo
            </label>
            <Input
              id="objective"
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              placeholder="Ex: Passar no ENEM com 1400+ pontos"
              maxLength={500}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="targetCourse" className="mb-1.5 block text-sm font-medium text-graphite">
                Curso que você quer
              </label>
              <Input
                id="targetCourse"
                value={targetCourse}
                onChange={(e) => setTargetCourse(e.target.value)}
                placeholder="Ex: Medicina"
                maxLength={120}
              />
            </div>
            <div>
              <label htmlFor="examDate" className="mb-1.5 block text-sm font-medium text-graphite">
                Data da prova
              </label>
              <Input id="examDate" type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} />
            </div>
          </div>

          <div>
            <label htmlFor="priorityArea" className="mb-1.5 block text-sm font-medium text-graphite">
              Área prioritária
            </label>
            <select
              id="priorityArea"
              value={priorityArea}
              onChange={(e) => setPriorityArea(e.target.value as StudyArea | "")}
              className={SELECT_CLASS}
            >
              <option value="">Nenhuma — dividir só pelas horas de cada matéria</option>
              {(Object.keys(STUDY_AREA_LABEL) as StudyArea[]).map((area) => (
                <option key={area} value={area}>{STUDY_AREA_LABEL[area]}</option>
              ))}
            </select>
          </div>
        </section>
      )}

      {showStep(2) && (
        <section className="flex flex-col gap-5">
          <div>
            <h3 className="text-sm font-semibold text-graphite">O que entra no cronograma</h3>
            <p className="mt-1 text-xs text-graphite-400">
              As horas definem quanto do dia cada matéria recebe.
            </p>
          </div>

          {languageSubjects.length > 0 && (
            <div>
              <label className="mb-2 block text-sm font-medium text-graphite">
                Língua estrangeira
              </label>
              <div className="flex flex-wrap gap-2">
                {languageSubjects.map((lang) => (
                  <button
                    key={lang.id}
                    type="button"
                    onClick={() => selectLanguage(selectedLanguageId === lang.id ? null : lang.id)}
                    className={`h-10 px-4 rounded-xl border text-sm font-medium transition-all ${
                      selectedLanguageId === lang.id
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-surface-line bg-white text-graphite hover:border-graphite/30"
                    }`}
                  >
                    {lang.name}
                  </button>
                ))}
              </div>
              {selectedLanguageId && (
                <div className="mt-2 flex items-center gap-2">
                  <Input
                    type="number"
                    min={0}
                    max={500}
                    value={selectedSubjects[selectedLanguageId]}
                    onChange={(e) => updateHours(selectedLanguageId, parseInt(e.target.value) || 0)}
                    className="w-24"
                  />
                  <span className="text-xs text-graphite-400">horas</span>
                </div>
              )}
            </div>
          )}

          <div>
            <label className="mb-2 block text-sm font-medium text-graphite">
              Disciplinas — marque e ajuste as horas alvo
            </label>
            <div className="flex flex-col gap-3">
              {regularSubjects.map((subj) => {
                const isSelected = selectedSubjects[subj.id] !== undefined;
                const isEssay = subj.code === "ESSAY";
                return (
                  <div
                    key={subj.id}
                    className={`flex flex-wrap items-center gap-3 rounded-xl border p-3 transition-all ${
                      isSelected
                        ? "border-primary/30 bg-primary/5"
                        : "border-surface-line bg-white"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleSubject(subj.id)}
                      aria-label={`${isSelected ? "Tirar" : "Incluir"} ${subj.name}`}
                      aria-pressed={isSelected}
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs font-bold transition-all ${
                        isSelected
                          ? "border-primary bg-primary text-white"
                          : "border-surface-line text-transparent"
                      }`}
                    >
                      {isSelected && <CheckCircle2 className="h-3.5 w-3.5" />}
                    </button>
                    <span className="text-sm font-medium text-graphite">{subj.name}</span>
                    {/* Redação não divide o dia por horas: tem rotina própria. */}
                    {isSelected && !isEssay && (
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
                    {isSelected && isEssay && (
                      <>
                        <select
                          aria-label="Frequência da redação"
                          value={essayFrequency}
                          onChange={(e) => setEssayFrequency(e.target.value as StudyEssayFrequency)}
                          className="h-10 rounded-xl border border-surface-line bg-white px-3 text-sm text-graphite outline-none focus:border-primary-600"
                        >
                          <option value="WEEKLY">Uma atividade por semana</option>
                          <option value="BIWEEKLY">Uma a cada duas semanas</option>
                        </select>
                        <span className="basis-full text-xs text-graphite-400">
                          Ciclo: repertório → estrutura e produção → competências e correção.
                        </span>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        {!editing && step > 0 ? (
          <Button type="button" variant="outline" onClick={() => { setError(null); setStep(step - 1); }} disabled={saving}>
            Voltar
          </Button>
        ) : (
          editing && (
            <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
              Cancelar
            </Button>
          )
        )}
        {/* `key` diferente de propósito: sem ele o React reaproveita o mesmo
            <button> ao chegar na última etapa, o clique em "Continuar" termina
            num botão que já é submit e o cronograma é criado antes de o
            aluno escolher as matérias. */}
        {!editing && step < STEPS.length - 1 ? (
          <Button key="next" type="button" onClick={goNext}>Continuar</Button>
        ) : (
          <Button key="submit" type="submit" disabled={saving}>
            {saving ? "Salvando..." : editing ? "Atualizar cronograma" : "Criar cronograma"}
          </Button>
        )}
      </div>
    </form>
  );
}
