import { useState, type FormEvent } from "react";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  Info,
  Loader2,
  LogOut,
  Save,
  Search,
  Sparkles,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { useAuth } from "@/contexts/AuthContext";
import {
  apiSaveWebQuestion,
  apiSearchWebQuestions,
  ApiError,
  type QuestionDifficulty,
  type WebQuestionClassification,
  type WebSearchHit,
  type WebSearchResults,
} from "@/lib/api";
import { getAccessToken } from "@/lib/auth";

const DIFFICULTIES: Array<{ value: "" | QuestionDifficulty; label: string }> = [
  { value: "", label: "Todas" },
  { value: "FACIL", label: "Fácil" },
  { value: "MEDIA", label: "Média" },
  { value: "DIFICIL", label: "Difícil" },
];

function selectClass() {
  return "h-12 w-full rounded-xl border border-surface-line bg-white px-4 text-sm text-graphite outline-none transition-colors focus:border-primary-600 focus:ring-2 focus:ring-primary/30";
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Não foi possível concluir a operação.";
}

/** Selos da classificação automática — só aparecem o que o backend de fato
 * conseguiu casar com o catálogo Lumina. */
function ClassificationBadges({ classification }: { classification?: WebQuestionClassification | null }) {
  if (!classification) {
    return <span className="text-xs text-graphite-400">Classificação automática indisponível</span>;
  }
  const badges: string[] = [];
  if (classification.subject) badges.push(classification.subject);
  if (classification.topic) badges.push(classification.topic);
  if (classification.exam) {
    badges.push(classification.year ? `${classification.exam} ${classification.year}` : classification.exam);
  }
  if (classification.difficulty) {
    badges.push(
      classification.difficulty === "FACIL"
        ? "Fácil"
        : classification.difficulty === "MEDIA"
          ? "Média"
          : "Difícil",
    );
  }
  if (badges.length === 0) {
    return <span className="text-xs text-graphite-400">Sem correspondência no catálogo</span>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {badges.map((badge) => (
        <span
          key={badge}
          className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary-700"
        >
          {badge}
        </span>
      ))}
    </div>
  );
}

export function WebQuestionSearch() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [query, setQuery] = useState("");
  const [exam, setExam] = useState("");
  const [subject, setSubject] = useState("");
  const [difficulty, setDifficulty] = useState<"" | QuestionDifficulty>("");
  const [limit, setLimit] = useState("10");

  const [results, setResults] = useState<WebSearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [savingId, setSavingId] = useState<number | null>(null);
  const [savedId, setSavedId] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const initials = `${user?.firstName?.[0] ?? ""}${user?.lastName?.[0] ?? ""}` || "LU";

  function logoutAndLeave() {
    logout();
    navigate("/");
  }

  async function handleSearch(event: FormEvent) {
    event.preventDefault();
    const token = getAccessToken();
    if (!token) return;

    setLoading(true);
    setError(null);
    setSavedId(null);
    setSaveError(null);
    setNotice(null);

    try {
      const data = await apiSearchWebQuestions(token, {
        q: query.trim(),
        ...(exam ? { exam } : {}),
        ...(subject ? { subject } : {}),
        ...(difficulty ? { difficulty } : {}),
        ...(limit ? { limit: Number(limit) } : {}),
      });
      setResults(data);
    } catch (err) {
      setError(errorMessage(err));
      setResults(null);
    } finally {
      setLoading(false);
    }
  }

  /** Abre o link original para o usuário conferir a fonte e transcrever a
   * questão. Deliberadamente NÃO baixa nem armazena o conteúdo da página. */
  function openSource(hit: WebSearchHit) {
    if (!hit.link) return;
    const target = /^https?:\/\//i.test(hit.link) ? hit.link : `${window.location.origin}${hit.link}`;
    window.open(target, "_blank", "noopener,noreferrer");
  }

  /** A transcrição/editação da questão é feita pelo usuário; esta função
   * apenas confirma a intenção de salvar o resultado atual. */
  async function handleSave(hit: WebSearchHit, index: number) {
    const token = getAccessToken();
    if (!token) return;
    if (!hit.link) {
      setSaveError("Este resultado não tem link de origem — não é possível atribuir a fonte.");
      return;
    }

    setSavingId(index);
    setSaveError(null);
    setNotice(null);

    try {
      const report = await apiSaveWebQuestion(token, {
        sourceUrl: hit.link,
        sourceName: hit.sourceName ?? new URL(hit.link).hostname,
        question: {
          sourceType: "IMPORTED",
          sourceName: hit.sourceName ?? "Fonte web",
          sourceId: hit.sourceId,
          exam: hit.classification?.exam ?? undefined,
          year: hit.classification?.year ?? undefined,
          subject: hit.classification?.subject ?? "Não classificada",
          topic: hit.classification?.topic ?? undefined,
          difficulty: hit.classification?.difficulty ?? "MEDIA",
          stem: hit.snippet ?? hit.title,
          options: [
            { text: "Alternativa 1 (transcrever do original)" },
            { text: "Alternativa 2 (transcrever do original)" },
          ],
        },
      });
      setSavedId(index);
      if (report.imported > 0) {
        setNotice(
          `Questão salva no banco (${report.imported} importada` +
            `${report.duplicates > 0 ? `, ${report.duplicates} duplicada(s) ignorada(s)` : ""}).`,
        );
      } else if (report.duplicates > 0) {
        setNotice("Esta questão já estava no banco — nada foi duplicado.");
      } else {
        setNotice("Nada foi importado. Confira os dados transcritos.");
      }
    } catch (err) {
      setSaveError(errorMessage(err));
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="min-h-screen bg-surface-page">
      <header className="border-b border-surface-line bg-white">
        <div className="mx-auto flex h-20 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => navigate("/app/questoes")}>
              <ArrowLeft className="h-4 w-4" /> Voltar
            </Button>
            <Logo />
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-graphite sm:inline">
              {user?.firstName} {user?.lastName}
            </span>
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-sm font-bold text-graphite">
              {initials}
            </span>
            <Button variant="ghost" size="sm" onClick={logoutAndLeave} aria-label="Sair">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="flex items-start gap-3">
          <Sparkles className="mt-1 h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold text-graphite">Buscar questões na web</h1>
            <p className="mt-1 text-sm text-graphite-400">
              Pesquise questões públicas por conteúdo, prova, disciplina e dificuldade. A Lumina
              guarda apenas metadados e atribuição — você transcreve o conteúdo para salvar.
            </p>
          </div>
        </div>

        <Card className="mt-6 bg-white">
          <form onSubmit={handleSearch} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div className="sm:col-span-2 lg:col-span-2">
              <label htmlFor="q" className="mb-1.5 block text-xs font-semibold text-graphite">
                Conteúdo ou tema
              </label>
              <Input
                id="q"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="ex: funções exponenciais"
                minLength={3}
                required
              />
            </div>
            <div>
              <label htmlFor="exam" className="mb-1.5 block text-xs font-semibold text-graphite">
                Prova
              </label>
              <Input
                id="exam"
                value={exam}
                onChange={(e) => setExam(e.target.value)}
                placeholder="ex: ENEM"
              />
            </div>
            <div>
              <label htmlFor="subject" className="mb-1.5 block text-xs font-semibold text-graphite">
                Disciplina
              </label>
              <Input
                id="subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="ex: Matemática"
              />
            </div>
            <div>
              <label htmlFor="difficulty" className="mb-1.5 block text-xs font-semibold text-graphite">
                Dificuldade
              </label>
              <select
                id="difficulty"
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as "" | QuestionDifficulty)}
                className={selectClass()}
              >
                {DIFFICULTIES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-5">
              <div className="w-28">
                <label htmlFor="limit" className="mb-1.5 block text-xs font-semibold text-graphite">
                  Resultados
                </label>
                <Input
                  id="limit"
                  type="number"
                  min={1}
                  max={20}
                  value={limit}
                  onChange={(e) => setLimit(e.target.value)}
                />
              </div>
              <Button type="submit" disabled={loading || query.trim().length < 3} className="flex-1 sm:flex-none">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                Buscar
              </Button>
            </div>
          </form>
        </Card>

        {error && (
          <Card className="mt-4 flex items-start gap-3 border-alert/30 bg-alert/10">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-alert" />
            <p className="text-sm text-alert">{error}</p>
          </Card>
        )}

        {results?.demoMode && (
          <Card className="mt-4 flex items-start gap-3 border-primary/30 bg-primary/10">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-primary-700" />
            <div className="text-sm text-graphite">
              <p className="font-semibold text-primary-700">Modo demonstração</p>
              <p className="mt-1 text-graphite/70">
                As chaves do Google Programmable Search não estão configuradas, então a busca está
                sendo feita no banco de questões da própria Lumina. Para buscar na web real,
                configure <code className="rounded bg-white/60 px-1">GOOGLE_CSE_ID</code> e{" "}
                <code className="rounded bg-white/60 px-1">GOOGLE_CSE_API_KEY</code> no servidor.
              </p>
            </div>
          </Card>
        )}

        {notice && (
          <Card className="mt-4 flex items-start gap-3 border-success/30 bg-success/10">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
            <p className="text-sm text-graphite">{notice}</p>
          </Card>
        )}

        {saveError && (
          <Card className="mt-4 flex items-start gap-3 border-alert/30 bg-alert/10">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-alert" />
            <p className="text-sm text-alert">{saveError}</p>
          </Card>
        )}

        {results && (
          <section className="mt-8">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-graphite">
                {results.total} {results.total === 1 ? "resultado" : "resultados"}
              </h2>
              <span className="text-xs text-graphite-400">provedor: {results.provider}</span>
            </div>

            {results.items.length === 0 ? (
              <Card className="mt-4 text-center text-sm text-graphite-400">
                Nenhuma questão encontrada com esses filtros.
              </Card>
            ) : (
              <ul className="mt-4 space-y-3">
                {results.items.map((hit, index) => (
                  <li key={`${hit.link}-${index}`}>
                    <Card className="bg-white">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <h3 className="text-base font-semibold text-graphite">{hit.title}</h3>
                          <p className="mt-1 text-sm text-graphite/70">
                            {hit.snippet ?? "Sem trecho disponível."}
                          </p>
                          <div className="mt-3">
                            <ClassificationBadges classification={hit.classification} />
                          </div>
                          <p className="mt-2 truncate text-xs text-graphite-400">
                            Fonte: {hit.sourceName ?? "—"} · {hit.link}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col gap-2">
                          <Button variant="outline" size="sm" onClick={() => openSource(hit)}>
                            <ExternalLink className="h-4 w-4" /> Ver original
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleSave(hit, index)}
                            disabled={savingId === index}
                          >
                            {savingId === index ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Save className="h-4 w-4" />
                            )}
                            {savedId === index ? "Salva" : "Salvar"}
                          </Button>
                        </div>
                      </div>
                    </Card>
                  </li>
                ))}
              </ul>
            )}

            <p className="mt-6 text-xs text-graphite-400">
              A Lumina exibe apenas metadados públicos (título, trecho e link). Para salvar, confira
              o enunciado e as alternativas no site de origem — a questão é armazenada como
              importada, com o link da fonte preservado.
            </p>
          </section>
        )}
      </main>
    </div>
  );
}
