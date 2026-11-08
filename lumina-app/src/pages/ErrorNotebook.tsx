import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  AlertCircle,
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  History,
  Loader2,
  LogOut,
  NotebookPen,
  Save,
  Trash2,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { QuestionResolution } from "@/components/QuestionResolution";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/contexts/AuthContext";
import {
  apiGetErrorNotebook,
  apiGetErrorNotebookSummary,
  apiGetQuestion,
  apiRemoveErrorNotebookEntry,
  apiUpdateErrorNotebookEntry,
  ApiError,
  type AttemptResult,
  type ErrorNotebookEntry,
  type ErrorNotebookPage,
  type ErrorNotebookSummary,
  type ErrorReason,
  type Question,
  type QuestionDifficulty,
} from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import {
  ACERTOS_PARA_DOMINAR,
  contarFiltrosAtivos,
  descreverEvolucao,
  descreverRevisao,
  ERROR_REASONS,
  FILTROS_VAZIOS,
  filtrosParaApi,
  type FiltrosCaderno,
  lerEvolucao,
  opcoesRevisao,
  rotuloMotivo,
  type SituacaoFiltro,
} from "@/lib/error-notebook";
import { CLASSE_DIFICULDADE, origemDaQuestao, ROTULO_DIFICULDADE } from "@/lib/question-labels";

const LIMITE_PAGINA = 20;
const SITUACOES: { valor: SituacaoFiltro; label: string }[] = [
  { valor: "ABERTA", label: "Abertas" },
  { valor: "DOMINADA", label: "Dominadas" },
  { valor: "TODAS", label: "Todas" },
];
const DIFICULDADES: QuestionDifficulty[] = ["FACIL", "MEDIA", "DIFICIL"];

/** Mudanças que o aluno pode fazer numa entrada do caderno. Cada uma é um
 *  PATCH independente: gravar o motivo não precisa reenviar a observação. */
type MudancasCaderno = {
  reason?: ErrorReason | null;
  notes?: string | null;
  reviewScheduledOn?: string | null;
};

function selectClass() {
  return "h-11 w-full rounded-xl border border-surface-line bg-white px-3 text-sm text-graphite outline-none transition-colors focus:border-primary-600 focus:ring-2 focus:ring-primary/30";
}

function filtroLabel() {
  return "block text-xs font-semibold uppercase tracking-wide text-graphite-400";
}

interface EntradaCadernoProps {
  entrada: ErrorNotebookEntry;
  hoje: Date;
  aoSalvar: (questionId: string, mudancas: MudancasCaderno) => Promise<string | null>;
  aoRemover: (questionId: string) => Promise<string | null>;
  aoResponder: (resultado: AttemptResult) => void;
}

/**
 * Um item do caderno: a questão que o aluno errou, o que ele já acertou desde
 * então, e as três decisões que só ele pode tomar — por que errou (item 13), o
 * que anotou e quando quer revisar de novo.
 */
function EntradaCaderno({ entrada, hoje, aoSalvar, aoRemover, aoResponder }: EntradaCadernoProps) {
  const [rascunho, setRascunho] = useState(entrada.notes ?? "");
  const [salvando, setSalvando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [rever, setRever] = useState(false);
  const [questao, setQuestao] = useState<Question | null>(null);
  const [carregandoQuestao, setCarregandoQuestao] = useState(false);

  // Depois de salvar, a entrada que vem do servidor é a verdade — inclusive
  // quando o servidor aparou o texto da observação.
  useEffect(() => {
    setRascunho(entrada.notes ?? "");
  }, [entrada.notes]);

  async function salvar(alvo: string, mudancas: MudancasCaderno) {
    setSalvando(alvo);
    setErro(null);
    const falha = await aoSalvar(entrada.questionId, mudancas);
    if (falha) setErro(falha);
    setSalvando(null);
  }

  async function alternarRevisao() {
    if (!rever) {
      setRever(true);
      if (questao) return;
      setCarregandoQuestao(true);
      setErro(null);
      try {
        const detalhe = await apiGetQuestion(getAccessToken() ?? "", entrada.questionId);
        setQuestao(detalhe);
      } catch (err) {
        setErro(
          err instanceof ApiError ? err.message : "Não foi possível carregar a questão."
        );
        setRever(false);
      } finally {
        setCarregandoQuestao(false);
      }
      return;
    }
    setRever(false);
  }

  async function remover() {
    if (!window.confirm("Remover esta questão do caderno de erros?")) return;
    setSalvando("remover");
    setErro(null);
    const falha = await aoRemover(entrada.questionId);
    if (falha) {
      setErro(falha);
      setSalvando(null);
    }
  }

  const origem = origemDaQuestao(entrada);
  const atalhos = opcoesRevisao(hoje);
  const notaVencida = rascunho !== (entrada.notes ?? "");

  return (
    <Card className="bg-white" data-notebook-entry={entrada.questionId}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-graphite/5 px-3 py-1 text-xs font-semibold text-graphite">
          {entrada.subject}
        </span>
        {entrada.topic && (
          <span className="rounded-full bg-graphite/5 px-3 py-1 text-xs font-medium text-graphite-500">
            {entrada.topic}
          </span>
        )}
        <span
          className={`rounded-full border px-3 py-1 text-xs font-semibold ${CLASSE_DIFICULDADE[entrada.difficulty]}`}
        >
          {ROTULO_DIFICULDADE[entrada.difficulty]}
        </span>
        {origem && (
          <span className="rounded-full bg-graphite/5 px-3 py-1 text-xs font-medium text-graphite-500">
            {origem}
          </span>
        )}
        {entrada.status === "DOMINADA" ? (
          <span className="rounded-full border border-success/25 bg-success/10 px-3 py-1 text-xs font-semibold text-success">
            Dominada
          </span>
        ) : (
          <span className="rounded-full border border-alert/25 bg-alert/10 px-3 py-1 text-xs font-semibold text-alert">
            Aberta
          </span>
        )}
        {entrada.due && entrada.status === "ABERTA" && (
          <span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-600">
            {descreverRevisao(entrada, hoje)}
          </span>
        )}
      </div>

      <p className="mt-4 whitespace-pre-line text-[15px] leading-relaxed text-graphite">
        {entrada.stem}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-surface-card px-4 py-3">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-graphite-400">
          <History className="h-3.5 w-3.5" />
          Linha do tempo
        </span>
        <span className="flex items-center gap-1" aria-label={`${entrada.evolution.length} tentativas`}>
          {lerEvolucao(entrada.evolution).map((marca) => (
            <span
              key={marca.ordem}
              title={marca.titulo}
              className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${
                marca.marca === "A"
                  ? "bg-success/15 text-success"
                  : "bg-alert/10 text-alert"
              }`}
            >
              {marca.marca}
            </span>
          ))}
        </span>
        <span className="text-sm text-graphite-500">{descreverEvolucao(entrada)}</span>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <div>
          <label className={filtroLabel()} htmlFor={`motivo-${entrada.questionId}`}>
            Por que errou?
          </label>
          <select
            id={`motivo-${entrada.questionId}`}
            data-notebook-reason
            className={`${selectClass()} mt-1.5`}
            value={entrada.reason ?? ""}
            disabled={salvando !== null}
            onChange={(e) => {
              const motivo = e.target.value as ErrorReason | "";
              void salvar("motivo", { reason: motivo === "" ? null : motivo });
            }}
          >
            <option value="">Sem motivo</option>
            {ERROR_REASONS.map((motivo) => (
              <option key={motivo} value={motivo}>
                {rotuloMotivo(motivo)}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-xs text-graphite-400">
            Classificar o motivo é o que permite revisar por assunto — e comparar
            o que mais cai.
          </p>
        </div>

        <div>
          <span className={filtroLabel()}>Revisão combinada</span>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {atalhos.map((atalho) => {
              const ativa = entrada.reviewScheduledAt?.slice(0, 10) === atalho.value;
              return (
                <button
                  key={atalho.value}
                  type="button"
                  data-notebook-review-preset={atalho.value}
                  aria-pressed={ativa}
                  disabled={salvando !== null}
                  onClick={() => void salvar("revisao", { reviewScheduledOn: atalho.value })}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${
                    ativa
                      ? "border-primary/30 bg-primary/10 text-primary-700"
                      : "border-surface-line bg-white text-graphite-500 hover:border-graphite/30"
                  }`}
                >
                  {atalho.label}
                </button>
              );
            })}
            <input
              type="date"
              data-notebook-review-date
              aria-label="Data da revisão"
              className="h-9 rounded-xl border border-surface-line bg-white px-2 text-xs text-graphite outline-none focus:border-primary-600"
              value={entrada.reviewScheduledAt?.slice(0, 10) ?? ""}
              disabled={salvando !== null}
              onChange={(e) => void salvar("revisao", { reviewScheduledOn: e.target.value })}
            />
            {entrada.reviewScheduledAt && (
              <button
                type="button"
                disabled={salvando !== null}
                onClick={() => void salvar("revisao", { reviewScheduledOn: null })}
                className="text-xs font-semibold text-graphite-400 underline-offset-2 hover:text-alert hover:underline disabled:opacity-50"
              >
                Sem data
              </button>
            )}
          </div>
          <p className="mt-1.5 text-xs text-graphite-400">
            {descreverRevisao(entrada, hoje)} — marcar é opcional, mas é o que
            transforma a lista em fila de estudo.
          </p>
        </div>
      </div>

      <div className="mt-5">
        <label className={filtroLabel()} htmlFor={`nota-${entrada.questionId}`}>
          Observação
        </label>
        <textarea
          id={`nota-${entrada.questionId}`}
          data-notebook-notes
          rows={2}
          maxLength={1000}
          value={rascunho}
          placeholder="O que faltou? Escreva para você mesmo daqui a duas semanas."
          onChange={(e) => setRascunho(e.target.value)}
          className="mt-1.5 w-full resize-y rounded-xl border border-surface-line bg-white px-3 py-2 text-sm leading-relaxed text-graphite outline-none transition-colors placeholder:text-graphite-400 focus:border-primary-600 focus:ring-2 focus:ring-primary/30"
        />
        {notaVencida && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2"
            disabled={salvando !== null}
            onClick={() => void salvar("nota", { notes: rascunho })}
          >
            {salvando === "nota" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Salvar observação
          </Button>
        )}
      </div>

      {erro && (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-alert/20 bg-alert/5 p-3 text-sm text-alert">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{erro}</span>
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={alternarRevisao}
          disabled={carregandoQuestao}
        >
          {carregandoQuestao ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <NotebookPen className="h-4 w-4" />
          )}
          {rever ? "Fechar questão" : "Rever questão"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={remover}
          disabled={salvando !== null}
          aria-label="Remover do caderno de erros"
          className="text-alert hover:bg-alert/5"
        >
          {salvando === "remover" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4" />
          )}
          Remover do caderno
        </Button>
        <span className="text-xs text-graphite-400">
          Errou {entrada.wrongAttempts === 1 ? "uma vez" : `${entrada.wrongAttempts} vezes`} desde que
          entrou no caderno.
        </span>
      </div>

      {rever && (
        <div className="mt-5 border-t border-surface-line pt-5" data-notebook-resolution>
          {questao ? (
            <>
              <p className="whitespace-pre-line text-sm leading-relaxed text-graphite">
                {questao.stem}
              </p>
              <QuestionResolution
                questionId={questao.id}
                alternatives={questao.alternatives}
                explanation={questao.explanation}
                answerLabel="Tentar de novo"
                onAnswered={aoResponder}
                allowSimilarQuestion={questao.sourceType !== "GENERATED"}
              />
            </>
          ) : (
            <p className="text-sm text-graphite-400">Carregando a questão...</p>
          )}
        </div>
      )}
    </Card>
  );
}

export function ErrorNotebookPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // A central de revisões chega com o recorte pronto (?due=true&subject=...
  // &topic=...). O caderno continua editável: isso só define o estado inicial.
  const [filtros, setFiltros] = useState<FiltrosCaderno>(() => ({
    ...FILTROS_VAZIOS,
    materia: searchParams.get("subject") ?? "",
    assunto: searchParams.get("topic") ?? "",
    soVencidas: searchParams.get("due") === "true",
  }));
  const [pagina, setPagina] = useState(1);
  const [dados, setDados] = useState<ErrorNotebookPage | null>(null);
  const [resumo, setResumo] = useState<ErrorNotebookSummary | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [dominada, setDominada] = useState<ErrorNotebookEntry | null>(null);

  // Um único "hoje" para a página: a frase de revisão não pode mudar no meio da
  // leitura porque o minuto virou.
  const hoje = useMemo(() => new Date(), []);

  const carregar = useCallback(async () => {
    const token = getAccessToken();
    if (!token) return;
    setCarregando(true);
    setErro(null);
    try {
      const [lista, conta] = await Promise.all([
        apiGetErrorNotebook(token, filtrosParaApi(filtros, pagina, LIMITE_PAGINA)),
        apiGetErrorNotebookSummary(token),
      ]);
      setDados(lista);
      setResumo(conta);
    } catch (err) {
      setErro(
        err instanceof ApiError
          ? err.message
          : "Não foi possível carregar o caderno de erros. Tente novamente."
      );
    } finally {
      setCarregando(false);
    }
  }, [filtros, pagina]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  function mudarFiltro(mudanca: Partial<FiltrosCaderno>) {
    setFiltros((atual) => ({ ...atual, ...mudanca }));
    setPagina(1);
  }

  async function salvarEntrada(
    questionId: string,
    mudancas: MudancasCaderno,
  ): Promise<string | null> {
    const token = getAccessToken() ?? "";
    try {
      await apiUpdateErrorNotebookEntry(token, questionId, mudancas);
      await carregar();
      return null;
    } catch (err) {
      return err instanceof ApiError
        ? err.message
        : "Não foi possível salvar no caderno de erros.";
    }
  }

  async function removerEntrada(questionId: string): Promise<string | null> {
    const token = getAccessToken() ?? "";
    try {
      await apiRemoveErrorNotebookEntry(token, questionId);
      await carregar();
      return null;
    } catch (err) {
      return err instanceof ApiError
        ? err.message
        : "Não foi possível remover do caderno de erros.";
    }
  }

  /** Responder dentro do caderno muda o estado da entrada. A tentativa já
   *  devolve o caderno atualizado, então não é preciso adivinhar: se a questão
   *  ficou dominada, ela sai da fila aberta e a página diz isso. */
  function aoResponder(resultado: AttemptResult) {
    if (resultado.errorNotebook?.status === "DOMINADA") {
      setDominada(resultado.errorNotebook);
    }
    void carregar();
  }

  const ativos = contarFiltrosAtivos(filtros);
  const itens = dados?.items ?? [];

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
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-graphite">
              Caderno de erros
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-graphite-500">
              Toda questão que você erra entra aqui automaticamente. Ela sai da
              fila depois de {ACERTOS_PARA_DOMINAR} acertos seguidos — e o motivo do
              erro, quando classificado, vira recorte para estudar.
            </p>
          </div>
        </div>

        {resumo && (
          <section className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Resumo do caderno de erros" data-notebook-summary>
            {[
              { label: "Abertas", value: resumo.open },
              { label: "Dominadas", value: resumo.mastered },
              { label: "Para revisar hoje", value: resumo.dueToday },
              { label: "Sem motivo classificado", value: resumo.withoutReason },
            ].map((item) => (
              <Card key={item.label} className="bg-white p-5">
                <p className="text-2xl font-bold text-graphite">{item.value}</p>
                <p className="mt-1 text-xs font-medium text-graphite-500">{item.label}</p>
              </Card>
            ))}
          </section>
        )}

        <Card className="mt-6 bg-white" data-notebook-filters>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <label className={filtroLabel()} htmlFor="filtro-situacao">
                Situação
              </label>
              <select
                id="filtro-situacao"
                className={`${selectClass()} mt-1.5`}
                value={filtros.situacao}
                onChange={(e) => mudarFiltro({ situacao: e.target.value as SituacaoFiltro })}
              >
                {SITUACOES.map((situacao) => (
                  <option key={situacao.valor} value={situacao.valor}>
                    {situacao.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={filtroLabel()} htmlFor="filtro-materia">
                Matéria
              </label>
              <select
                id="filtro-materia"
                className={`${selectClass()} mt-1.5`}
                value={filtros.materia}
                onChange={(e) => mudarFiltro({ materia: e.target.value, assunto: "" })}
              >
                <option value="">Todas</option>
                {(resumo?.bySubject ?? []).map((faceta) => (
                  <option key={faceta.value} value={faceta.value}>
                    {faceta.label} ({faceta.open})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={filtroLabel()} htmlFor="filtro-assunto">
                Assunto
              </label>
              <select
                id="filtro-assunto"
                className={`${selectClass()} mt-1.5`}
                value={filtros.assunto}
                onChange={(e) => mudarFiltro({ assunto: e.target.value })}
              >
                <option value="">Todos</option>
                {(resumo?.byTopic ?? []).map((faceta) => (
                  <option key={faceta.value} value={faceta.value}>
                    {faceta.label} ({faceta.open})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={filtroLabel()} htmlFor="filtro-motivo">
                Motivo do erro
              </label>
              <select
                id="filtro-motivo"
                className={`${selectClass()} mt-1.5`}
                value={filtros.motivo}
                onChange={(e) => mudarFiltro({ motivo: e.target.value })}
              >
                <option value="">Todos</option>
                {(resumo?.byReason ?? []).map((faceta) => (
                  <option key={faceta.value} value={faceta.value}>
                    {faceta.label} ({faceta.open})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={filtroLabel()} htmlFor="filtro-dificuldade">
                Dificuldade
              </label>
              <select
                id="filtro-dificuldade"
                className={`${selectClass()} mt-1.5`}
                value={filtros.dificuldade}
                onChange={(e) => mudarFiltro({ dificuldade: e.target.value })}
              >
                <option value="">Todas</option>
                {DIFICULDADES.map((dificuldade) => (
                  <option key={dificuldade} value={dificuldade}>
                    {ROTULO_DIFICULDADE[dificuldade]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2 text-sm text-graphite-600">
              <input
                type="checkbox"
                data-notebook-due-only
                checked={filtros.soVencidas}
                onChange={(e) => mudarFiltro({ soVencidas: e.target.checked })}
                className="h-4 w-4 rounded border-surface-line text-primary focus:ring-primary/30"
              />
              Só o que está vencido para hoje
            </label>
            {ativos > 0 && (
              <button
                type="button"
                onClick={() => setFiltros({ ...FILTROS_VAZIOS, situacao: filtros.situacao })}
                className="text-xs font-semibold text-primary-700 hover:text-graphite"
              >
                Limpar {ativos === 1 ? "filtro" : `filtros (${ativos})`}
              </button>
            )}
            {dados && (
              <span className="text-xs text-graphite-400">
                {dados.total === 1 ? "1 questão" : `${dados.total} questões`} neste recorte
              </span>
            )}
          </div>
        </Card>

        {dominada && (
          <div
            className="mt-6 flex items-start gap-2 rounded-xl border border-success/25 bg-success/5 p-4 text-sm text-graphite-600"
            data-notebook-notice
          >
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
            <span>
              <span className="font-semibold text-graphite">Você dominou esta questão.</span>{" "}
              {dominada.subject}
              {dominada.topic ? ` · ${dominada.topic}` : ""} saiu da fila aberta com{" "}
              {ACERTOS_PARA_DOMINAR} acertos seguidos. Ela continua no histórico, em
              “Dominadas”.
            </span>
          </div>
        )}

        {erro && (
          <div className="mt-6 flex items-start gap-2 rounded-xl border border-alert/20 bg-alert/5 p-4 text-sm text-alert">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{erro}</span>
          </div>
        )}

        <div className="mt-6 flex flex-col gap-4">
          {carregando && !itens.length && (
            <div className="space-y-4">
              {[1, 2].map((item) => (
                <div key={item} className="h-40 animate-pulse rounded-2xl bg-graphite/5" />
              ))}
            </div>
          )}

          {!carregando && !erro && itens.length === 0 && (
            <Card className="bg-white text-center">
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15">
                <NotebookPen className="h-6 w-6 text-primary-700" />
              </span>
              <h2 className="mt-4 font-semibold text-graphite">
                {ativos > 0 || filtros.situacao !== "ABERTA"
                  ? "Nenhuma questão neste recorte"
                  : "Seu caderno está vazio"}
              </h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-graphite-400">
                {ativos > 0 || filtros.situacao !== "ABERTA"
                  ? "Ajuste ou limpe os filtros para ver o resto do caderno."
                  : "Errar uma questão já a coloca aqui, com a linha do tempo das tentativas. Também dá para incluir à mão uma questão que você errou em prova."}
              </p>
              <Button
                variant="outline"
                className="mt-5"
                onClick={() => navigate("/app/questoes")}
              >
                Ir para o banco de questões
              </Button>
            </Card>
          )}

          {itens.map((entrada) => (
            <EntradaCaderno
              key={entrada.questionId}
              entrada={entrada}
              hoje={hoje}
              aoSalvar={salvarEntrada}
              aoRemover={removerEntrada}
              aoResponder={aoResponder}
            />
          ))}
        </div>

        {dados && dados.totalPages > 1 && (
          <div className="mt-8 flex items-center justify-center gap-3">
            <Button
              variant="outline"
              size="sm"
              disabled={pagina <= 1 || carregando}
              onClick={() => setPagina((atual) => Math.max(1, atual - 1))}
            >
              <ChevronLeft className="h-4 w-4" />
              Anterior
            </Button>
            <span className="text-sm text-graphite-500">
              Página {dados.page} de {dados.totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={pagina >= dados.totalPages || carregando}
              onClick={() => setPagina((atual) => Math.min(dados.totalPages, atual + 1))}
            >
              Próxima
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}

        {resumo && resumo.byReason.length > 0 && (
          <Card className="mt-8 bg-white" data-notebook-reasons>
            <div className="flex items-center gap-3">
              <CalendarClock className="h-5 w-5 text-primary-700" />
              <h2 className="font-semibold text-graphite">Por onde seus erros se concentram</h2>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {resumo.byReason.map((faceta) => (
                <button
                  key={faceta.value}
                  type="button"
                  onClick={() => mudarFiltro({ motivo: faceta.value })}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                    filtros.motivo === faceta.value
                      ? "border-primary/30 bg-primary/10 text-primary-700"
                      : "border-surface-line bg-white text-graphite-500 hover:border-graphite/30"
                  }`}
                >
                  {faceta.label} · {faceta.open} aberta{faceta.open === 1 ? "" : "s"}
                </button>
              ))}
            </div>
          </Card>
        )}
      </main>
    </div>
  );
}
