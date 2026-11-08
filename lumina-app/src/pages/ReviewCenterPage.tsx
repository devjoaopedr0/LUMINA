import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BookOpenCheck,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Loader2,
  LogOut,
  NotebookPen,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { QuestionResolution } from "@/components/QuestionResolution";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useAuth } from "@/contexts/AuthContext";
import {
  apiGetQuestion,
  apiGetReviewQueue,
  apiSetQuestionReview,
  ApiError,
  type AttemptResult,
  type Question,
  type ReviewQueueItem,
  type ReviewQueueResponse,
} from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import {
  CLASSE_DIFICULDADE,
  ROTULO_DIFICULDADE,
} from "@/lib/question-labels";
import {
  descreverVencimento,
  detalheDoItem,
  rotuloOrigem,
} from "@/lib/review-queue";

const LIMITE_POR_SECAO = 50;

function linkParaBanco(item: ReviewQueueItem): string {
  const params = new URLSearchParams();
  if (item.subjectId) params.set("subjectId", item.subjectId);
  if (item.topicId) params.set("topicId", item.topicId);
  const sufixo = params.toString();
  return `/app/questoes${sufixo ? `?${sufixo}` : ""}`;
}

function linkParaCaderno(item: ReviewQueueItem): string {
  const params = new URLSearchParams({ due: "true" });
  if (item.subject) params.set("subject", item.subject);
  if (item.topic) params.set("topic", item.topic);
  return `/app/caderno-de-erros?${params.toString()}`;
}

interface ReviewItemCardProps {
  item: ReviewQueueItem;
  agora: Date;
  aoResponder: (item: ReviewQueueItem) => void;
  aoAtualizar: () => void;
}

/**
 * Um item da central. Tópico leva ao banco já filtrado; questão abre a mesma
 * resolução usada no caderno de erros. A resposta não recarrega a fila na
 * hora: o aluno precisa ler o gabarito primeiro — o botão de atualizar fica ao
 * lado da confirmação.
 */
function ReviewItemCard({ item, agora, aoResponder, aoAtualizar }: ReviewItemCardProps) {
  const [aberta, setAberta] = useState(false);
  const [questao, setQuestao] = useState<Question | null>(null);
  const [carregandoQuestao, setCarregandoQuestao] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [respondida, setRespondida] = useState(false);

  const temQuestao = Boolean(item.questionId);

  async function alternarQuestao() {
    if (!item.questionId) return;
    if (aberta) {
      setAberta(false);
      return;
    }
    if (questao) {
      setAberta(true);
      return;
    }
    const token = getAccessToken();
    if (!token) {
      setErro("Sua sessão expirou. Entre novamente para abrir a questão.");
      return;
    }
    setAberta(true);
    setCarregandoQuestao(true);
    setErro(null);
    try {
      setQuestao(await apiGetQuestion(token, item.questionId));
    } catch (err) {
      setErro(
        err instanceof ApiError
          ? err.message
          : "Não foi possível carregar a questão."
      );
      setAberta(false);
    } finally {
      setCarregandoQuestao(false);
    }
  }

  async function responder(_resultado: AttemptResult) {
    setRespondida(true);
    // A questão sai da fila manual assim que é respondida aqui; o caderno de
    // erros se atualiza sozinho pela própria tentativa. Uma falha ao limpar a
    // marcação não pode passar em silêncio: sem isso a questão reapareceria
    // como se a revisão não tivesse acontecido.
    if (item.questionId && (item.kind === "MARKED_QUESTION" || item.kind === "ERROR_NOTEBOOK")) {
      const token = getAccessToken();
      if (!token) {
        setErro("Resposta registrada, mas sua sessão expirou. Entre novamente para atualizar a fila.");
      } else {
        try {
          await apiSetQuestionReview(token, item.questionId, false);
        } catch (err) {
          setErro(
            err instanceof ApiError
              ? `Resposta registrada; não foi possível remover a marcação: ${err.message}`
              : "Resposta registrada, mas não foi possível remover a marcação de revisão."
          );
        }
      }
    }
    aoResponder(item);
  }

  return (
    <Card className="bg-white" data-review-item={`${item.kind}-${item.id}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-graphite/5 px-3 py-1 text-xs font-semibold text-graphite">
          {rotuloOrigem(item.kind)}
        </span>
        <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary-700">
          {item.subject}
        </span>
        {item.topic && (
          <span className="rounded-full bg-graphite/5 px-3 py-1 text-xs font-medium text-graphite-500">
            {item.topic}
          </span>
        )}
        {item.difficulty && (
          <span
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${CLASSE_DIFICULDADE[item.difficulty]}`}
          >
            {ROTULO_DIFICULDADE[item.difficulty]}
          </span>
        )}
        {item.dueAt ? (
          <span className="ml-auto rounded-full bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-600">
            {descreverVencimento(item.dueAt, agora)}
          </span>
        ) : item.kind === "ERROR_NOTEBOOK" ? (
          <span className="ml-auto rounded-full bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-600">
            Sem data
          </span>
        ) : null}
      </div>

      <p className="mt-3 text-sm text-graphite-500">{detalheDoItem(item)}</p>
      {item.stem && (
        <p className="mt-4 line-clamp-2 whitespace-pre-line text-[15px] leading-relaxed text-graphite">
          {item.stem}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {item.kind === "TOPIC" ? (
          <Link to={linkParaBanco(item)}>
            <Button size="sm">
              Praticar tópico <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        ) : (
          <Button
            size="sm"
            variant={aberta ? "outline" : "primary"}
            disabled={carregandoQuestao}
            onClick={() => void alternarQuestao()}
          >
            {carregandoQuestao ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <BookOpenCheck className="h-4 w-4" />
            )}
            {aberta ? "Fechar questão" : "Responder agora"}
          </Button>
        )}

        {item.kind === "ERROR_NOTEBOOK" ? (
          <Link
            to={linkParaCaderno(item)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-surface-line px-3 py-2 text-xs font-semibold text-graphite-500 transition hover:border-primary/40 hover:text-graphite"
          >
            <NotebookPen className="h-3.5 w-3.5" /> Abrir no caderno
          </Link>
        ) : item.kind === "MARKED_QUESTION" ? (
          <Link
            to={linkParaBanco(item)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-surface-line px-3 py-2 text-xs font-semibold text-graphite-500 transition hover:border-primary/40 hover:text-graphite"
          >
            Ver no banco <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        ) : null}
      </div>

      {erro && (
        <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
          {erro}
        </p>
      )}

      {aberta && temQuestao && (
        <div className="mt-5 border-t border-surface-line pt-5">
          {questao ? (
            <>
              <p className="whitespace-pre-line text-sm leading-relaxed text-graphite">
                {questao.stem}
              </p>
              <QuestionResolution
                questionId={questao.id}
                alternatives={questao.alternatives}
                explanation={questao.explanation}
                answerLabel="Registrar revisão"
                onAnswered={(resultado) => void responder(resultado)}
              />
            </>
          ) : (
            <p className="flex items-center gap-2 text-sm text-graphite-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando a questão...
            </p>
          )}
        </div>
      )}

      {respondida && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-success/10 px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-medium text-success">
            <CheckCircle2 className="h-4 w-4" /> Resposta registrada.
          </p>
          <button
            type="button"
            onClick={aoAtualizar}
            className="text-xs font-semibold text-success underline-offset-2 hover:underline"
          >
            Atualizar fila
          </button>
        </div>
      )}
    </Card>
  );
}

export function ReviewCenterPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [fila, setFila] = useState<ReviewQueueResponse | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [revisaoRegistrada, setRevisaoRegistrada] = useState(false);
  const [agora, setAgora] = useState(() => new Date());

  const carregar = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      setErro("Sua sessão expirou. Entre novamente para carregar a fila.");
      setCarregando(false);
      return;
    }
    setCarregando(true);
    setErro(null);
    try {
      setFila(await apiGetReviewQueue(token, LIMITE_POR_SECAO));
      setAgora(new Date());
    } catch (err) {
      setErro(
        err instanceof ApiError
          ? err.message
          : "Não foi possível carregar a fila de revisões."
      );
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  function atualizarFila() {
    setRevisaoRegistrada(false);
    void carregar();
  }

  const itensVencidos = fila?.due.items ?? [];
  const itensManuais = fila?.manual.items ?? [];

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
            <p className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary-700">
              <Sparkles className="h-3.5 w-3.5" /> Seu dia de revisão
            </p>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-graphite">
              Revisão espaçada
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-graphite-500">
              O que venceu no domínio por tópico, no caderno de erros e nas
              questões que você marcou para retomar — em uma fila só.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={atualizarFila} disabled={carregando}>
            <RefreshCw className={`h-4 w-4 ${carregando ? "animate-spin" : ""}`} />
            Atualizar fila
          </Button>
        </div>

        {erro && (
          <div role="alert" className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <p className="flex items-center gap-2 font-semibold">
              <AlertCircle className="h-4 w-4" /> A fila não carregou.
            </p>
            <p className="mt-1">{erro}</p>
            <button
              type="button"
              onClick={() => void carregar()}
              className="mt-2 font-semibold underline underline-offset-2"
            >
              Tentar de novo
            </button>
          </div>
        )}

        {revisaoRegistrada && (
          <section
            className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-success/25 bg-success/10 p-4"
            aria-label="Revisão registrada"
          >
            <p className="flex items-center gap-2 text-sm font-medium text-success">
              <CheckCircle2 className="h-4 w-4" />
              Resposta registrada. Leia o gabarito e atualize a fila para seguir.
            </p>
            <Button size="sm" variant="outline" onClick={atualizarFila}>
              <RefreshCw className="h-4 w-4" /> Atualizar fila
            </Button>
          </section>
        )}

        <section className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Resumo das revisões">
          {[
            { label: "Vencidas hoje", value: fila?.due.total ?? 0, icon: Clock3 },
            { label: "Tópicos", value: fila?.due.topics ?? 0, icon: CalendarClock },
            { label: "Caderno de erros", value: fila?.due.errorNotebook ?? 0, icon: NotebookPen },
            { label: "Fila manual", value: fila?.manual.total ?? 0, icon: BookOpenCheck },
          ].map(({ label, value, icon: Icon }) => (
            <Card key={label} className="bg-white p-5">
              <div className="flex items-center justify-between">
                <p className="text-2xl font-bold text-graphite">
                  {fila ? value : "—"}
                </p>
                <Icon className="h-5 w-5 text-primary-700" />
              </div>
              <p className="mt-1 text-xs font-medium text-graphite-500">{label}</p>
            </Card>
          ))}
        </section>

        <section className="mt-8" aria-label="Revisões vencidas">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-graphite">Vencidas para hoje</h2>
              <p className="mt-1 text-sm text-graphite-500">
                {(fila?.due.total ?? 0) > 0
                  ? "Comece pelas mais antigas: cada resposta recalcula a próxima data."
                  : "Nada vencido. A próxima revisão aparece quando chegar o dia."}
              </p>
            </div>
            {fila && <span className="text-sm font-semibold text-graphite-500">{fila.due.total} no total</span>}
          </div>

          <div className="mt-4 space-y-3">
            {itensVencidos.map((item) => (
              <ReviewItemCard
                key={`${item.kind}-${item.id}`}
                item={item}
                agora={agora}
                aoResponder={() => setRevisaoRegistrada(true)}
                aoAtualizar={atualizarFila}
              />
            ))}

            {!carregando && !erro && fila && !itensVencidos.length && (
              <Card className="bg-white p-6">
                <div className="flex items-start gap-4">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-success/10 text-success">
                    <CheckCircle2 className="h-5 w-5" />
                  </span>
                  <div>
                    <h3 className="font-semibold text-graphite">Nada vencido para hoje</h3>
                    <p className="mt-1 text-sm text-graphite-500">
                      {fila?.nextReviewAt
                        ? `Próxima revisão: ${descreverVencimento(fila.nextReviewAt, agora)}.`
                        : "Responda questões e conclua tarefas para começar a construir sua fila."}
                    </p>
                  </div>
                </div>
              </Card>
            )}

            {fila?.due.truncated && (
              <p className="text-xs text-graphite-400">
                Mostrando os primeiros itens. Abra o caderno de erros ou o banco
                de questões para ver o restante da fila.
              </p>
            )}
          </div>
        </section>

        <section className="mt-8" aria-label="Questões marcadas para revisar">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-graphite">Fila manual</h2>
              <p className="mt-1 text-sm text-graphite-500">
                Questões que você marcou para retomar e que ainda não estão no
                caderno de erros.
              </p>
            </div>
            {fila && <span className="text-sm font-semibold text-graphite-500">{fila.manual.total} no total</span>}
          </div>

          <div className="mt-4 space-y-3">
            {itensManuais.map((item) => (
              <ReviewItemCard
                key={`${item.kind}-${item.id}`}
                item={item}
                agora={agora}
                aoResponder={() => setRevisaoRegistrada(true)}
                aoAtualizar={atualizarFila}
              />
            ))}

            {!carregando && !erro && fila && !itensManuais.length && (
              <p className="rounded-2xl border border-dashed border-surface-line bg-white p-5 text-sm text-graphite-400">
                Nenhuma questão marcada fora do caderno. Use "Revisar depois" no
                banco de questões quando quiser voltar a uma questão.
              </p>
            )}

            {fila?.manual.truncated && (
              <p className="text-xs text-graphite-400">
                Há mais questões marcadas do que o limite desta tela.
              </p>
            )}
          </div>
        </section>

        {!carregando && !fila && !erro && (
          <p className="mt-6 text-sm text-graphite-400">A fila ainda não tem dados.</p>
        )}
      </main>
    </div>
  );
}
