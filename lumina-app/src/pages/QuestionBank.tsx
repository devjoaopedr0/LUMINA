import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Database,
  Loader2,
  LogOut,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useAuth } from "@/contexts/AuthContext";
import {
  apiAnswerQuestion,
  apiCreateQuestion,
  apiDeleteQuestion,
  apiGetQuestion,
  apiGetSubjectTopics,
  apiListExams,
  apiListQuestions,
  apiListSubjects,
  apiUpdateQuestion,
  ApiError,
  type AttemptResult,
  type Exam,
  type PaginatedQuestions,
  type Question,
  type QuestionAlternativePayload,
  type QuestionDifficulty,
  type QuestionFilters,
  type QuestionPayload,
  type Subject,
  type Topic,
} from "@/lib/api";
import { getAccessToken } from "@/lib/auth";

const DIFFICULTY_LABEL: Record<QuestionDifficulty, string> = {
  FACIL: "Fácil",
  MEDIA: "Média",
  DIFICIL: "Difícil",
};

const DIFFICULTY_BADGE: Record<QuestionDifficulty, string> = {
  FACIL: "border-success/25 bg-success/10 text-success",
  MEDIA: "border-primary/30 bg-primary/10 text-primary-700",
  DIFICIL: "border-alert/25 bg-alert/10 text-alert",
};

function positionLetter(position: number): string {
  return String.fromCharCode(64 + position);
}

function filterSelectClass() {
  return "h-12 w-full rounded-xl border border-surface-line bg-white px-4 text-sm text-graphite outline-none transition-colors placeholder:text-graphite-400 focus:border-primary-600 focus:ring-2 focus:ring-primary/30";
}

function uniqueNames(items: { name: string }[]): string[] {
  return [...new Set(items.map((item) => item.name))].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

/** Catálogo de classificação: matérias, tópicos e exames do banco. As opções
 * são carregadas uma vez e os tópicos são buscados sob demanda por matéria. */
function useQuestionCatalog() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [topics, setTopics] = useState<Record<string, Topic[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;
    let active = true;
    Promise.all([apiListSubjects(token), apiListExams(token)])
      .then(([subjectList, examList]) => {
        if (!active) return;
        setSubjects(subjectList);
        setExams(examList.items);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  function loadTopics(subjectId: string) {
    if (!subjectId || topics[subjectId]) return;
    const token = getAccessToken();
    if (!token) return;
    apiGetSubjectTopics(token, subjectId)
      .then((data) => setTopics((current) => ({ ...current, [subjectId]: data.topics })))
      .catch(() => undefined);
  }

  const examNames = useMemo(() => uniqueNames(exams), [exams]);

  const yearsForExam = useCallback(
    (name: string): number[] => {
      if (!name) return [];
      return [
        ...new Set(
          exams
            .filter((exam) => exam.name === name)
            .map((exam) => exam.year)
            .filter((year): year is number => year !== null)
        ),
      ].sort((a, b) => b - a);
    },
    [exams]
  );

  const examIdFor = useCallback(
    (name: string, year: number | null): string | undefined => {
      if (!name || year === null) return undefined;
      return exams.find((exam) => exam.name === name && exam.year === year)?.id;
    },
    [exams]
  );

  return { subjects, exams, topics, loading, loadTopics, examNames, yearsForExam, examIdFor };
}

interface QuestionFormProps {
  initial: Question | null;
  onSaved: (question: Question) => void;
  onCancel: () => void;
}

function QuestionForm({ initial, onSaved, onCancel }: QuestionFormProps) {
  const catalog = useQuestionCatalog();
  const emptyAlternatives = (): QuestionAlternativePayload[] => [
    { text: "", isCorrect: false },
    { text: "", isCorrect: false },
    { text: "", isCorrect: false },
    { text: "", isCorrect: false },
  ];

  const [subjectId, setSubjectId] = useState(initial?.subjectId ?? "");
  const [topicId, setTopicId] = useState(initial?.topicId ?? "");
  const [difficulty, setDifficulty] = useState<QuestionDifficulty>(
    initial?.difficulty ?? "MEDIA"
  );
  const [examName, setExamName] = useState(initial?.exam ?? "");
  const [year, setYear] = useState(initial?.year?.toString() ?? "");
  const [examNumber, setExamNumber] = useState(initial?.examNumber?.toString() ?? "");
  const [stem, setStem] = useState(initial?.stem ?? "");
  const [alternatives, setAlternatives] = useState<QuestionAlternativePayload[]>(
    initial?.alternatives
      ? initial.alternatives.map((a) => ({ text: a.text, isCorrect: a.isCorrect ?? false }))
      : emptyAlternatives()
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (initial?.subjectId) catalog.loadTopics(initial.subjectId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const subjectName = catalog.subjects.find((s) => s.id === subjectId)?.name ?? "";
  const topicName = (catalog.topics[subjectId] ?? []).find((t) => t.id === topicId)?.name ?? "";
  const availableTopics = catalog.topics[subjectId] ?? [];
  const availableYears = catalog.yearsForExam(examName);

  function handleSubjectChange(id: string) {
    setSubjectId(id);
    setTopicId("");
    if (id) catalog.loadTopics(id);
  }

  function setCorrect(index: number) {
    setAlternatives((current) =>
      current.map((alternative, i) => ({ ...alternative, isCorrect: i === index }))
    );
  }

  function updateAlternative(index: number, text: string) {
    setAlternatives((current) =>
      current.map((alternative, i) => (i === index ? { ...alternative, text } : alternative))
    );
  }

  function removeAlternative(index: number) {
    setAlternatives((current) => current.filter((_, i) => i !== index));
  }

  function addAlternative() {
    setAlternatives((current) => [
      ...current,
      { text: "", isCorrect: current.length === 0 },
    ]);
  }

  function validate(): string | null {
    if (!subjectId) return "Selecione a matéria.";
    if (!topicId) return "Selecione o conteúdo/tópico.";
    if (!examName) return "Selecione o exame/vestibular de origem.";
    if (!year) return "Selecione o ano do exame.";
    if (stem.trim().length < 5) return "O enunciado precisa de pelo menos 5 caracteres.";
    if (alternatives.length < 2) return "Uma questão precisa de pelo menos 2 alternativas.";
    if (alternatives.some((a) => !a.text.trim()))
      return "Todas as alternativas precisam de texto.";
    if (alternatives.filter((a) => a.isCorrect).length !== 1)
      return "Marque exatamente uma alternativa como correta.";
    if (year && (Number.isNaN(Number(year)) || Number(year) < 1970 || Number(year) > 2100))
      return "O ano deve ser válido (ex: 2023).";
    if (examNumber && (Number.isNaN(Number(examNumber)) || Number(examNumber) < 1))
      return "O número da questão deve ser maior ou igual a 1.";
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

    const payload: QuestionPayload = {
      subject: subjectName,
      subjectId,
      topic: topicName,
      topicId,
      difficulty,
      exam: examName,
      examId: catalog.examIdFor(examName, Number(year)),
      year: Number(year),
      examNumber: examNumber ? Number(examNumber) : null,
      stem: stem.trim(),
      alternatives,
    };

    const token = getAccessToken() ?? "";
    try {
      const saved = initial
        ? await apiUpdateQuestion(token, initial.id, payload)
        : await apiCreateQuestion(token, payload);
      onSaved(saved);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Não foi possível salvar a questão. Tente novamente."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label htmlFor="subject" className="mb-1.5 block text-sm font-medium text-graphite">
            Matéria
          </label>
          <select
            id="subject"
            value={subjectId}
            onChange={(e) => handleSubjectChange(e.target.value)}
            className={filterSelectClass()}
            required
          >
            <option value="">Selecione a matéria</option>
            {catalog.subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="topic" className="mb-1.5 block text-sm font-medium text-graphite">
            Conteúdo / tópico
          </label>
          <select
            id="topic"
            value={topicId}
            onChange={(e) => setTopicId(e.target.value)}
            className={filterSelectClass()}
            disabled={!subjectId}
            required
          >
            <option value="">
              {subjectId ? "Selecione o tópico" : "Escolha a matéria primeiro"}
            </option>
            {availableTopics.map((topic) => (
              <option key={topic.id} value={topic.id}>
                {topic.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div>
          <label htmlFor="difficulty" className="mb-1.5 block text-sm font-medium text-graphite">
            Dificuldade
          </label>
          <select
            id="difficulty"
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value as QuestionDifficulty)}
            className={filterSelectClass()}
          >
            <option value="FACIL">Fácil</option>
            <option value="MEDIA">Média</option>
            <option value="DIFICIL">Difícil</option>
          </select>
        </div>
        <div>
          <label htmlFor="exam" className="mb-1.5 block text-sm font-medium text-graphite">
            Exame / vestibular
          </label>
          <select
            id="exam"
            value={examName}
            onChange={(e) => {
              setExamName(e.target.value);
              setYear("");
            }}
            className={filterSelectClass()}
            required
          >
            <option value="">Selecione o exame</option>
            {catalog.examNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="year" className="mb-1.5 block text-sm font-medium text-graphite">
              Ano
            </label>
            <select
              id="year"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className={filterSelectClass()}
              disabled={!examName}
              required
            >
              <option value="">
                {examName ? "Selecione o ano" : "Escolha o exame primeiro"}
              </option>
              {availableYears.map((yearOption) => (
                <option key={yearOption} value={yearOption}>
                  {yearOption}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="examNumber" className="mb-1.5 block text-sm font-medium text-graphite">
              Nº da questão
            </label>
            <Input
              id="examNumber"
              type="number"
              value={examNumber}
              onChange={(e) => setExamNumber(e.target.value)}
              placeholder="47"
            />
          </div>
        </div>
      </div>

      <div>
        <label htmlFor="stem" className="mb-1.5 block text-sm font-medium text-graphite">
          Enunciado
        </label>
        <textarea
          id="stem"
          value={stem}
          onChange={(e) => setStem(e.target.value)}
          placeholder="Digite o enunciado da questão..."
          maxLength={4000}
          required
          rows={4}
          className="min-h-[120px] w-full rounded-xl border border-surface-line bg-white px-4 py-3 text-sm text-graphite outline-none transition-colors placeholder:text-graphite-400 focus:border-primary-600 focus:ring-2 focus:ring-primary/30"
        />
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-medium text-graphite">Alternativas</span>
          {alternatives.length < 6 && (
            <button
              type="button"
              onClick={addAlternative}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-700 transition-colors hover:text-graphite"
            >
              <Plus className="h-4 w-4" />
              Adicionar alternativa
            </button>
          )}
        </div>
        <div className="flex flex-col gap-2.5">
          {alternatives.map((alternative, index) => (
            <div key={index} className="flex items-start gap-3 rounded-xl border border-surface-line bg-white p-3">
              <button
                type="button"
                onClick={() => setCorrect(index)}
                title="Marcar como correta"
                className={`mt-3 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                  alternative.isCorrect
                    ? "border-success bg-success text-white"
                    : "border-surface-line text-transparent hover:border-graphite/40"
                }`}
              >
                <CheckCircle2 className="h-4 w-4" />
              </button>
              <span className="mt-3.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-graphite/5 text-xs font-semibold text-graphite-500">
                {positionLetter(index + 1)}
              </span>
              <Input
                value={alternative.text}
                onChange={(e) => updateAlternative(index, e.target.value)}
                placeholder={`Texto da alternativa ${positionLetter(index + 1)}`}
                maxLength={1000}
                className="flex-1"
              />
              {alternatives.length > 2 && (
                <button
                  type="button"
                  onClick={() => removeAlternative(index)}
                  className="mt-3 text-graphite-400 transition-colors hover:text-alert"
                  title="Remover alternativa"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-alert/20 bg-alert/5 p-3 text-sm text-alert">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
          Cancelar
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? "Salvando..." : initial ? "Salvar alterações" : "Criar questão"}
        </Button>
      </div>
    </form>
  );
}

interface QuestionCardProps {
  question: Question;
  onEdit: (question: Question) => void;
  onDelete: (question: Question) => void;
}

function QuestionCard({ question, onEdit, onDelete }: QuestionCardProps) {
  const [selectedPosition, setSelectedPosition] = useState<number | null>(null);
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const origin = [
    question.exam,
    question.year ? String(question.year) : null,
    question.examNumber ? `questão ${question.examNumber}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  async function handleAnswer() {
    if (selectedPosition === null) {
      setError("Escolha uma alternativa para responder.");
      return;
    }
    setError(null);
    setSubmitting(true);
    const token = getAccessToken() ?? "";
    try {
      const attempt = await apiAnswerQuestion(token, question.id, selectedPosition);
      setResult(attempt);
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
    <Card className="bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-graphite/5 px-3 py-1 text-xs font-semibold text-graphite">
            {question.subject}
          </span>
          <span className="rounded-full bg-graphite/5 px-3 py-1 text-xs font-medium text-graphite-500">
            {question.topic}
          </span>
          <span
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${DIFFICULTY_BADGE[question.difficulty]}`}
          >
            {DIFFICULTY_LABEL[question.difficulty]}
          </span>
          <span className="rounded-full bg-graphite/5 px-3 py-1 text-xs font-medium text-graphite-500">
            {origin}
          </span>
        </div>
        {question.canManage && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onEdit(question)}
              title="Editar questão"
              className="flex h-9 w-9 items-center justify-center rounded-full text-graphite-400 transition-colors hover:bg-graphite/5 hover:text-graphite"
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => onDelete(question)}
              title="Excluir questão"
              className="flex h-9 w-9 items-center justify-center rounded-full text-graphite-400 transition-colors hover:bg-alert/10 hover:text-alert"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      <p className="mt-4 whitespace-pre-line text-[15px] leading-relaxed text-graphite">
        {question.stem}
      </p>

      <div className="mt-5 flex flex-col gap-2.5">
        {question.alternatives.map((alternative) => (
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

      <div className="mt-4 flex justify-end">
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
            Responder
          </Button>
        )}
      </div>
    </Card>
  );
}

export function QuestionBank() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const catalog = useQuestionCatalog();

  const [filters, setFilters] = useState<QuestionFilters>({ page: 1, limit: 10 });
  const [draft, setDraft] = useState({
    subjectId: "",
    topicId: "",
    difficulty: "",
    examName: "",
    year: "",
  });
  const [data, setData] = useState<PaginatedQuestions | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [view, setView] = useState<"list" | "form">("list");
  const [editing, setEditing] = useState<Question | null>(null);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;
    setLoading(true);
    setError(null);
    apiListQuestions(token, filters)
      .then(setData)
      .catch((err) =>
        setError(
          err instanceof ApiError
            ? err.message
            : "Não foi possível carregar as questões. Tente novamente."
        )
      )
      .finally(() => setLoading(false));
  }, [filters]);

  function handleSubjectChange(id: string) {
    setDraft((d) => ({ ...d, subjectId: id, topicId: "" }));
    if (id) catalog.loadTopics(id);
  }

  function handleExamChange(name: string) {
    setDraft((d) => ({ ...d, examName: name, year: "" }));
  }

  function applyFilters(e: FormEvent) {
    e.preventDefault();
    const year = draft.year ? Number(draft.year) : undefined;
    setFilters({
      page: 1,
      limit: filters.limit,
      subjectId: draft.subjectId || undefined,
      topicId: draft.topicId || undefined,
      difficulty: (draft.difficulty || undefined) as QuestionDifficulty | undefined,
      examId: year ? catalog.examIdFor(draft.examName, year) : undefined,
      exam: draft.examName || undefined,
      year,
    });
  }

  function clearFilters() {
    setDraft({ subjectId: "", topicId: "", difficulty: "", examName: "", year: "" });
    setFilters({ page: 1, limit: filters.limit });
  }

  function startCreate() {
    setEditing(null);
    setView("form");
  }

  async function startEdit(question: Question) {
    const token = getAccessToken() ?? "";
    try {
      const detail = await apiGetQuestion(token, question.id, true);
      setEditing(detail);
      setView("form");
    } catch {
      setError("Não foi possível carregar a questão para edição.");
    }
  }

  async function handleDelete(question: Question) {
    if (!window.confirm("Excluir esta questão? Essa ação não pode ser desfeita.")) return;
    const token = getAccessToken() ?? "";
    try {
      await apiDeleteQuestion(token, question.id);
      setFilters((current) => ({ ...current }));
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Não foi possível excluir a questão."
      );
    }
  }

  function handleSaved() {
    setView("list");
    setEditing(null);
    setFilters((current) => ({ ...current }));
  }

  return (
    <div className="min-h-screen bg-surface-card">
      <header className="border-b border-surface-line bg-white">
        <div className="container-lumina flex h-[72px] items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => navigate("/app")}
              className="flex h-9 w-9 items-center justify-center rounded-full text-graphite-500 transition-colors hover:bg-graphite/5 hover:text-graphite"
              title="Voltar ao início"
            >
              <ArrowLeft className="h-5 w-5" />
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
        {view === "form" ? (
          <>
            <div className="mb-8 flex items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-graphite">
                  {editing ? "Editar questão" : "Nova questão"}
                </h1>
                <p className="mt-1 text-sm text-graphite-500">
                  Preencha os dados da questão e marque a alternativa correta.
                </p>
              </div>
            </div>
            <Card className="bg-white">
              <QuestionForm
                initial={editing}
                onSaved={handleSaved}
                onCancel={() => {
                  setView("list");
                  setEditing(null);
                }}
              />
            </Card>
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-graphite">
                  Banco de questões
                </h1>
                <p className="mt-1 text-sm text-graphite-500">
                  Questões de vestibulares como ENEM, UECE e FUVEST, com filtros por
                  matéria, conteúdo, dificuldade e origem.
                </p>
              </div>
              {data?.canManageBank && (
                <Button onClick={startCreate}>
                  <Plus className="h-4 w-4" />
                  Nova questão
                </Button>
              )}
            </div>

            <Card className="mt-8 bg-white">
              <form onSubmit={applyFilters} className="grid grid-cols-1 gap-4 md:grid-cols-5">
                <select
                  value={draft.subjectId}
                  onChange={(e) => handleSubjectChange(e.target.value)}
                  className={filterSelectClass()}
                >
                  <option value="">Matéria</option>
                  {catalog.subjects.map((subject) => (
                    <option key={subject.id} value={subject.id}>
                      {subject.name}
                    </option>
                  ))}
                </select>
                <select
                  value={draft.topicId}
                  onChange={(e) => setDraft((d) => ({ ...d, topicId: e.target.value }))}
                  className={filterSelectClass()}
                  disabled={!draft.subjectId}
                >
                  <option value="">
                    {draft.subjectId ? "Conteúdo / tópico" : "Escolha a matéria"}
                  </option>
                  {(catalog.topics[draft.subjectId] ?? []).map((topic) => (
                    <option key={topic.id} value={topic.id}>
                      {topic.name}
                    </option>
                  ))}
                </select>
                <select
                  value={draft.examName}
                  onChange={(e) => handleExamChange(e.target.value)}
                  className={filterSelectClass()}
                >
                  <option value="">Exame / vestibular</option>
                  {catalog.examNames.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
                <select
                  value={draft.year}
                  onChange={(e) => setDraft((d) => ({ ...d, year: e.target.value }))}
                  className={filterSelectClass()}
                  disabled={!draft.examName}
                >
                  <option value="">
                    {draft.examName ? "Ano" : "Escolha o exame"}
                  </option>
                  {catalog.yearsForExam(draft.examName).map((yearOption) => (
                    <option key={yearOption} value={yearOption}>
                      {yearOption}
                    </option>
                  ))}
                </select>
                <select
                  value={draft.difficulty}
                  onChange={(e) => setDraft((d) => ({ ...d, difficulty: e.target.value }))}
                  className={filterSelectClass()}
                >
                  <option value="">Dificuldade</option>
                  <option value="FACIL">Fácil</option>
                  <option value="MEDIA">Média</option>
                  <option value="DIFICIL">Difícil</option>
                </select>
                <div className="flex items-center gap-2 md:col-span-5">
                  <Button type="submit" size="sm">
                    <Search className="h-4 w-4" />
                    Aplicar filtros
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
                    <X className="h-4 w-4" />
                    Limpar
                  </Button>
                </div>
              </form>
            </Card>

            <div className="mt-6 flex items-center justify-between">
              <p className="text-sm text-graphite-500">
                {data ? `${data.total} ${data.total === 1 ? "questão encontrada" : "questões encontradas"}` : ""}
              </p>
            </div>

            {loading ? (
              <div className="mt-10 flex items-center justify-center gap-2 text-sm text-graphite-500">
                <Loader2 className="h-5 w-5 animate-spin" />
                Carregando questões...
              </div>
            ) : error && !data ? (
              <Card className="mt-6 bg-white">
                <div className="flex items-start gap-2 text-sm text-alert">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              </Card>
            ) : data && data.items.length === 0 ? (
              <Card className="mt-6 bg-white text-center">
                <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-graphite/5 text-graphite">
                  <Database className="h-6 w-6" />
                </span>
                <p className="mt-4 text-sm font-semibold text-graphite">Nenhuma questão encontrada</p>
                <p className="mx-auto mt-1 max-w-sm text-xs text-graphite-400">
                  {data?.canManageBank
                    ? "Ajuste os filtros ou crie a primeira questão do banco."
                    : "Ajuste os filtros para encontrar questões."}
                </p>
                {data?.canManageBank && (
                  <Button className="mt-5" size="sm" onClick={startCreate}>
                    <Plus className="h-4 w-4" />
                    Criar questão
                  </Button>
                )}
              </Card>
            ) : (
              <div className="mt-6 flex flex-col gap-5">
                {data?.items.map((question) => (
                  <QuestionCard
                    key={question.id}
                    question={question}
                    onEdit={startEdit}
                    onDelete={handleDelete}
                  />
                ))}

                {data && data.totalPages > 1 && (
                  <div className="flex items-center justify-center gap-4">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={data.page <= 1}
                      onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) - 1 }))}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Anterior
                    </Button>
                    <span className="text-sm text-graphite-500">
                      Página {data.page} de {data.totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={data.page >= data.totalPages}
                      onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) + 1 }))}
                    >
                      Próxima
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
