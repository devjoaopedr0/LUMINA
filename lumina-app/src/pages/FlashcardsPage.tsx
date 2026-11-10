import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  Brain,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Eye,
  FileText,
  History,
  Layers,
  Loader2,
  LogOut,
  Pencil,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useAuth } from '@/contexts/AuthContext';
import {
  apiCreateFlashcard,
  apiDeleteFlashcard,
  apiGenerateFlashcards,
  apiGenerateFlashcardsFromPdf,
  apiGetFlashcardHistory,
  apiGetFlashcardSummary,
  apiGetSubjectTopics,
  apiListFlashcards,
  apiListSubjects,
  apiReviewFlashcard,
  apiUpdateFlashcard,
  ApiError,
  type CreateFlashcardPayload,
  type Flashcard,
  type FlashcardHistory,
  type FlashcardRating,
  type FlashcardSummary,
  type Subject,
  type Topic,
} from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import {
  descreverDesempenhoDoCartao,
  FILTROS_FLASHCARDS,
  filtrarFlashcards,
  NOTAS,
  ROTULO_FONTE,
  ROTULO_NOTA,
  validarArquivoPdf,
  type FiltroFlashcards,
} from '@/lib/flashcards';
import { descreverVencimento } from '@/lib/review-queue';
import { formatarData } from '@/lib/review-date';

const FORM_VAZIO: CreateFlashcardPayload = {
  front: '',
  back: '',
  subjectId: null,
  topicId: null,
};

type ModoGeracao = 'TEXTO' | 'PDF';

function mensagemDeErro(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

export function FlashcardsPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const destaqueId = searchParams.get('card');

  const [cards, setCards] = useState<Flashcard[]>([]);
  const [summary, setSummary] = useState<FlashcardSummary | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [filtro, setFiltro] = useState<FiltroFlashcards>('TODOS');
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const [formAberto, setFormAberto] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [form, setForm] = useState<CreateFlashcardPayload>(FORM_VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [carregandoAssuntos, setCarregandoAssuntos] = useState(false);

  const [gerarAberto, setGerarAberto] = useState(false);
  const [gerarModo, setGerarModo] = useState<ModoGeracao>('TEXTO');
  const [gerarConteudo, setGerarConteudo] = useState('');
  const [gerarCount, setGerarCount] = useState(6);
  const [gerarSubjectId, setGerarSubjectId] = useState<string | null>(null);
  const [gerarTopicId, setGerarTopicId] = useState<string | null>(null);
  const [gerarTopics, setGerarTopics] = useState<Topic[]>([]);
  const [carregandoGerarTopics, setCarregandoGerarTopics] = useState(false);
  const [gerarPdf, setGerarPdf] = useState<{ name: string; dataUrl: string } | null>(null);
  const [gerando, setGerando] = useState(false);
  const [erroGeracao, setErroGeracao] = useState<string | null>(null);

  const [revisandoId, setRevisandoId] = useState<string | null>(null);
  const [mostrarResposta, setMostrarResposta] = useState(false);
  const [revisando, setRevisando] = useState(false);

  const [historico, setHistorico] = useState<FlashcardHistory | null>(null);
  const [carregandoHistorico, setCarregandoHistorico] = useState(false);
  const [erroHistorico, setErroHistorico] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      setErro('Sua sessão expirou. Entre novamente para carregar os flashcards.');
      setCarregando(false);
      return;
    }
    setCarregando(true);
    setErro(null);
    try {
      const [lista, resumo] = await Promise.all([
        apiListFlashcards(token),
        apiGetFlashcardSummary(token),
      ]);
      setCards(lista);
      setSummary(resumo);
    } catch (error) {
      setErro(mensagemDeErro(error, 'Não foi possível carregar os flashcards.'));
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
    const token = getAccessToken();
    if (!token) return;
    apiListSubjects(token)
      .then(setSubjects)
      .catch(() => setSubjects([]));
  }, [carregar]);

  useEffect(() => {
    const token = getAccessToken();
    if (!token || !form.subjectId) {
      setTopics([]);
      return;
    }
    let cancelado = false;
    setCarregandoAssuntos(true);
    apiGetSubjectTopics(token, form.subjectId)
      .then((subject) => {
        if (!cancelado) setTopics(subject.topics);
      })
      .catch(() => {
        if (!cancelado) setTopics([]);
      })
      .finally(() => {
        if (!cancelado) setCarregandoAssuntos(false);
      });
    return () => {
      cancelado = true;
    };
  }, [form.subjectId]);

  useEffect(() => {
    const token = getAccessToken();
    if (!token || !gerarAberto || !gerarSubjectId) {
      setGerarTopics([]);
      return;
    }
    let cancelado = false;
    setCarregandoGerarTopics(true);
    apiGetSubjectTopics(token, gerarSubjectId)
      .then((subject) => {
        if (!cancelado) setGerarTopics(subject.topics);
      })
      .catch(() => {
        if (!cancelado) setGerarTopics([]);
      })
      .finally(() => {
        if (!cancelado) setCarregandoGerarTopics(false);
      });
    return () => {
      cancelado = true;
    };
  }, [gerarAberto, gerarSubjectId]);

  useEffect(() => {
    if (!destaqueId || !cards.length) return;
    const element = document.getElementById(`flashcard-${destaqueId}`);
    element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [destaqueId, cards]);

  const visiveis = useMemo(() => filtrarFlashcards(cards, filtro), [cards, filtro]);

  function fecharFormulario() {
    setFormAberto(false);
    setEditandoId(null);
    setForm(FORM_VAZIO);
    setTopics([]);
  }

  function abrirNovo() {
    setEditandoId(null);
    setForm(FORM_VAZIO);
    setFormAberto(true);
    setGerarAberto(false);
    setErro(null);
    setAviso(null);
  }

  function abrirEdicao(card: Flashcard) {
    setEditandoId(card.id);
    setForm({
      front: card.front,
      back: card.back,
      subjectId: card.subjectId,
      topicId: card.topicId,
    });
    setFormAberto(true);
    setGerarAberto(false);
    setErro(null);
    setAviso(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function abrirGeracao(modo: ModoGeracao = 'TEXTO') {
    setFormAberto(false);
    setEditandoId(null);
    setGerarModo(modo);
    setGerarAberto(true);
    setErro(null);
    setAviso(null);
    setErroGeracao(null);
  }

  function fecharGeracao() {
    if (gerando) return;
    setGerarAberto(false);
    setErroGeracao(null);
    setGerarPdf(null);
    setGerarConteudo('');
  }

  function escolherPdf(file: File | undefined) {
    if (!file) return;
    const problema = validarArquivoPdf(file);
    if (problema) {
      setErroGeracao(problema);
      setGerarPdf(null);
      return;
    }
    setErroGeracao(null);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        setErroGeracao('Não foi possível ler o PDF escolhido.');
        return;
      }
      setGerarPdf({ name: file.name, dataUrl: reader.result });
    };
    reader.onerror = () => setErroGeracao('Não foi possível ler o PDF escolhido.');
    reader.readAsDataURL(file);
  }

  async function gerarComIA(event: React.FormEvent) {
    event.preventDefault();
    const token = getAccessToken();
    if (!token) {
      setErroGeracao('Sua sessão expirou. Entre novamente para gerar os flashcards.');
      return;
    }
    if (gerarModo === 'TEXTO' && gerarConteudo.trim().length < 20) {
      setErroGeracao('Cole pelo menos 20 caracteres de conteúdo para a LuminIA usar.');
      return;
    }
    if (gerarModo === 'PDF' && !gerarPdf) {
      setErroGeracao('Escolha um PDF para gerar os flashcards.');
      return;
    }

    setGerando(true);
    setErroGeracao(null);
    try {
      const cards =
        gerarModo === 'PDF' && gerarPdf
          ? await apiGenerateFlashcardsFromPdf(token, {
              pdf: gerarPdf.dataUrl,
              count: gerarCount,
              subjectId: gerarSubjectId,
              topicId: gerarTopicId,
            })
          : await apiGenerateFlashcards(token, {
              content: gerarConteudo,
              count: gerarCount,
              subjectId: gerarSubjectId,
              topicId: gerarTopicId,
            });
      setAviso(
        `${cards.length} ${cards.length === 1 ? 'flashcard criado' : 'flashcards criados'} pela LuminIA. Revise o conteúdo antes de estudar.`,
      );
      setGerarAberto(false);
      setGerarConteudo('');
      setGerarPdf(null);
      setGerarSubjectId(null);
      setGerarTopicId(null);
      await carregar();
    } catch (error) {
      setErroGeracao(
        mensagemDeErro(error, 'Não foi possível gerar os flashcards com a LuminIA.')
      );
    } finally {
      setGerando(false);
    }
  }

  async function salvar(event: React.FormEvent) {
    event.preventDefault();
    if (!form.front.trim() || !form.back.trim()) {
      setErro('Preencha a frente e o verso do cartão.');
      return;
    }
    const token = getAccessToken();
    if (!token) {
      setErro('Sua sessão expirou. Entre novamente para salvar o cartão.');
      return;
    }
    setSalvando(true);
    setErro(null);
    try {
      const payload: CreateFlashcardPayload = {
        front: form.front,
        back: form.back,
        subjectId: form.subjectId ?? null,
        topicId: form.topicId ?? null,
      };
      if (editandoId) {
        await apiUpdateFlashcard(token, editandoId, payload);
        setAviso('Flashcard atualizado.');
      } else {
        await apiCreateFlashcard(token, payload);
        setAviso('Flashcard criado. Ele já entrou na fila de revisão de hoje.');
      }
      fecharFormulario();
      await carregar();
    } catch (error) {
      setErro(mensagemDeErro(error, 'Não foi possível salvar o flashcard.'));
    } finally {
      setSalvando(false);
    }
  }

  async function excluir(card: Flashcard) {
    if (!window.confirm(`Excluir o flashcard "${card.front.slice(0, 80)}"?`)) return;
    const token = getAccessToken();
    if (!token) {
      setErro('Sua sessão expirou. Entre novamente para excluir o cartão.');
      return;
    }
    try {
      await apiDeleteFlashcard(token, card.id);
      if (historico?.flashcard.id === card.id) setHistorico(null);
      if (revisandoId === card.id) setRevisandoId(null);
      setAviso('Flashcard excluído.');
      await carregar();
    } catch (error) {
      setErro(mensagemDeErro(error, 'Não foi possível excluir o flashcard.'));
    }
  }

  function iniciarRevisao(card: Flashcard) {
    setRevisandoId(card.id);
    setMostrarResposta(false);
    setErro(null);
    setAviso(null);
  }

  async function responder(card: Flashcard, rating: FlashcardRating) {
    const token = getAccessToken();
    if (!token) {
      setErro('Sua sessão expirou. Entre novamente para registrar a revisão.');
      return;
    }
    setRevisando(true);
    setErro(null);
    try {
      const atualizado = await apiReviewFlashcard(token, card.id, rating);
      setCards((atuais) => atuais.map((item) => (item.id === card.id ? atualizado : item)));
      setSummary(await apiGetFlashcardSummary(token));
      setRevisandoId(null);
      setMostrarResposta(false);
      setAviso(`Revisão registrada. Próxima revisão: ${descreverVencimento(atualizado.nextReviewAt)}.`);
    } catch (error) {
      setErro(mensagemDeErro(error, 'Não foi possível registrar a revisão.'));
    } finally {
      setRevisando(false);
    }
  }

  async function abrirHistorico(card: Flashcard) {
    const token = getAccessToken();
    if (!token) {
      setErro('Sua sessão expirou. Entre novamente para ver o histórico.');
      return;
    }
    setCarregandoHistorico(true);
    setErroHistorico(null);
    try {
      setHistorico(await apiGetFlashcardHistory(token, card.id));
    } catch (error) {
      setErroHistorico(mensagemDeErro(error, 'Não foi possível carregar o histórico.'));
    } finally {
      setCarregandoHistorico(false);
    }
  }

  return (
    <div className="min-h-screen bg-surface-card">
      <header className="border-b border-surface-line bg-white">
        <div className="container-lumina flex h-[72px] items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => navigate('/app')}
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
              <Sparkles className="h-3.5 w-3.5" /> Memória de longo prazo
            </p>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-graphite">
              Flashcards
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-graphite-500">
              Crie cartões do seu jeito, puxe os erros do caderno e reveja no dia
              certo. Cada resposta recalcula quando o cartão volta.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/app/revisao-espacada">
              <Button variant="outline" size="sm">
                <CalendarClock className="h-4 w-4" /> Central de revisões
              </Button>
            </Link>
            <Button variant="outline" size="sm" onClick={() => abrirGeracao('TEXTO')}>
              <Sparkles className="h-4 w-4" /> Gerar com IA
            </Button>
            <Button size="sm" onClick={abrirNovo}>
              <Plus className="h-4 w-4" /> Novo flashcard
            </Button>
          </div>
        </div>

        {erro && (
          <div role="alert" className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <p className="flex items-center gap-2 font-semibold">
              <AlertCircle className="h-4 w-4" /> Algo não saiu como esperado.
            </p>
            <p className="mt-1">{erro}</p>
          </div>
        )}
        {aviso && (
          <div role="status" className="mt-6 flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-700">
            <CheckCircle2 className="h-4 w-4" /> {aviso}
          </div>
        )}

        <section className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Resumo dos flashcards">
          {[
            { label: 'Cartões', value: summary?.total ?? 0, icon: Layers },
            { label: 'Para hoje', value: summary?.due ?? 0, icon: Clock3 },
            { label: 'Novos', value: summary?.newCards ?? 0, icon: Brain },
            {
              label: 'Lembrança',
              value: summary?.accuracy == null ? '—' : `${summary.accuracy}%`,
              icon: CheckCircle2,
            },
          ].map(({ label, value, icon: Icon }) => (
            <Card key={label} className="bg-white p-5">
              <div className="flex items-center justify-between">
                <p className="text-2xl font-bold text-graphite">{summary ? value : '—'}</p>
                <Icon className="h-5 w-5 text-primary-700" />
              </div>
              <p className="mt-1 text-xs font-medium text-graphite-500">{label}</p>
            </Card>
          ))}
        </section>

        {formAberto && (
          <Card className="mt-6 bg-white p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-graphite">
                  {editandoId ? 'Editar flashcard' : 'Novo flashcard'}
                </h2>
                <p className="mt-1 text-sm text-graphite-500">
                  Escreva uma pergunta curta na frente e a resposta no verso.
                </p>
              </div>
              <button
                type="button"
                onClick={fecharFormulario}
                className="rounded-full p-2 text-graphite-400 hover:bg-graphite/5 hover:text-graphite"
                aria-label="Fechar formulário"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={salvar} className="mt-5 grid gap-4 lg:grid-cols-2">
              <label className="block lg:col-span-2">
                <span className="text-sm font-semibold text-graphite">Frente</span>
                <textarea
                  value={form.front}
                  onChange={(event) => setForm({ ...form, front: event.target.value })}
                  placeholder="Ex.: O que é entropia?"
                  className="mt-1 min-h-[90px] w-full rounded-xl border border-surface-line p-3 text-sm outline-none focus:border-primary"
                  maxLength={2000}
                  required
                />
              </label>
              <label className="block lg:col-span-2">
                <span className="text-sm font-semibold text-graphite">Verso</span>
                <textarea
                  value={form.back}
                  onChange={(event) => setForm({ ...form, back: event.target.value })}
                  placeholder="A resposta que você quer lembrar depois."
                  className="mt-1 min-h-[110px] w-full rounded-xl border border-surface-line p-3 text-sm outline-none focus:border-primary"
                  maxLength={10000}
                  required
                />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-graphite">Matéria (opcional)</span>
                <select
                  value={form.subjectId ?? ''}
                  onChange={(event) =>
                    setForm({ ...form, subjectId: event.target.value || null, topicId: null })
                  }
                  className="mt-1 w-full rounded-xl border border-surface-line bg-white p-3 text-sm outline-none focus:border-primary"
                >
                  <option value="">Sem matéria</option>
                  {subjects.map((subject) => (
                    <option key={subject.id} value={subject.id}>
                      {subject.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-graphite">Assunto (opcional)</span>
                <select
                  value={form.topicId ?? ''}
                  onChange={(event) => setForm({ ...form, topicId: event.target.value || null })}
                  disabled={!form.subjectId || carregandoAssuntos}
                  className="mt-1 w-full rounded-xl border border-surface-line bg-white p-3 text-sm outline-none focus:border-primary disabled:bg-graphite/5"
                >
                  <option value="">
                    {carregandoAssuntos ? 'Carregando assuntos...' : 'Sem assunto'}
                  </option>
                  {topics.map((topic) => (
                    <option key={topic.id} value={topic.id}>
                      {topic.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex flex-wrap justify-end gap-2 lg:col-span-2">
                <Button type="button" variant="outline" size="sm" onClick={fecharFormulario}>
                  Cancelar
                </Button>
                <Button type="submit" size="sm" disabled={salvando}>
                  {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  {editandoId ? 'Salvar alterações' : 'Criar flashcard'}
                </Button>
              </div>
            </form>
          </Card>
        )}

        {gerarAberto && (
          <Card className="mt-6 bg-white p-6" data-flashcard-ai>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-semibold text-graphite">
                  <Sparkles className="h-5 w-5 text-primary-700" />
                  Gerar flashcards com a LuminIA
                </h2>
                <p className="mt-1 text-sm text-graphite-500">
                  Envie um conteúdo ou um PDF. A LuminIA cria os cartões apenas com
                  o que estiver no material — sem inventar fatos.
                </p>
              </div>
              <button
                type="button"
                onClick={fecharGeracao}
                disabled={gerando}
                className="rounded-full p-2 text-graphite-400 hover:bg-graphite/5 hover:text-graphite disabled:opacity-50"
                aria-label="Fechar geração com IA"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label="Origem do conteúdo">
              {([
                { value: 'TEXTO', label: 'Colar conteúdo', icon: FileText },
                { value: 'PDF', label: 'Enviar PDF', icon: Layers },
              ] as const).map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={gerarModo === value}
                  onClick={() => {
                    setGerarModo(value);
                    setErroGeracao(null);
                  }}
                  className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                    gerarModo === value
                      ? 'bg-graphite text-white'
                      : 'bg-white text-graphite-500 ring-1 ring-surface-line hover:text-graphite'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" /> {label}
                </button>
              ))}
            </div>

            <form onSubmit={gerarComIA} className="mt-5 grid gap-4 lg:grid-cols-2">
              {gerarModo === 'TEXTO' ? (
                <label className="block lg:col-span-2">
                  <span className="text-sm font-semibold text-graphite">Conteúdo de estudo</span>
                  <textarea
                    value={gerarConteudo}
                    onChange={(event) => setGerarConteudo(event.target.value)}
                    placeholder="Cole aqui o resumo, a explicação ou o trecho do material que você quer transformar em cartões."
                    className="mt-1 min-h-[150px] w-full rounded-xl border border-surface-line p-3 text-sm outline-none focus:border-primary"
                    minLength={20}
                    maxLength={20000}
                    required
                  />
                  <span className="mt-1 block text-right text-xs text-graphite-400">
                    {gerarConteudo.length}/20.000 caracteres
                  </span>
                </label>
              ) : (
                <label className="block lg:col-span-2">
                  <span className="text-sm font-semibold text-graphite">Arquivo PDF</span>
                  <input
                    type="file"
                    accept="application/pdf,.pdf"
                    onChange={(event) => escolherPdf(event.target.files?.[0])}
                    className="mt-1 block w-full cursor-pointer rounded-xl border border-dashed border-surface-line bg-surface-card p-4 text-sm text-graphite-500 file:mr-4 file:rounded-lg file:border-0 file:bg-graphite file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white hover:border-primary"
                  />
                  <span className="mt-2 block text-xs text-graphite-400">
                    Até 8 MB e 40 páginas. O PDF é lido em memória e não fica armazenado.
                  </span>
                  {gerarPdf && (
                    <span className="mt-2 flex items-center gap-2 rounded-xl bg-primary/5 px-3 py-2 text-xs font-medium text-primary-700">
                      <FileText className="h-4 w-4" /> {gerarPdf.name}
                    </span>
                  )}
                </label>
              )}

              <label className="block">
                <span className="text-sm font-semibold text-graphite">Quantidade</span>
                <select
                  value={gerarCount}
                  onChange={(event) => setGerarCount(Number(event.target.value))}
                  className="mt-1 w-full rounded-xl border border-surface-line bg-white p-3 text-sm outline-none focus:border-primary"
                >
                  {[3, 5, 6, 8, 10].map((value) => (
                    <option key={value} value={value}>
                      {value} cartões
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-sm font-semibold text-graphite">Matéria (opcional)</span>
                <select
                  value={gerarSubjectId ?? ''}
                  onChange={(event) => {
                    setGerarSubjectId(event.target.value || null);
                    setGerarTopicId(null);
                  }}
                  className="mt-1 w-full rounded-xl border border-surface-line bg-white p-3 text-sm outline-none focus:border-primary"
                >
                  <option value="">Sem matéria</option>
                  {subjects.map((subject) => (
                    <option key={subject.id} value={subject.id}>
                      {subject.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-sm font-semibold text-graphite">Assunto (opcional)</span>
                <select
                  value={gerarTopicId ?? ''}
                  onChange={(event) => setGerarTopicId(event.target.value || null)}
                  disabled={!gerarSubjectId || carregandoGerarTopics}
                  className="mt-1 w-full rounded-xl border border-surface-line bg-white p-3 text-sm outline-none focus:border-primary disabled:bg-graphite/5"
                >
                  <option value="">
                    {carregandoGerarTopics ? 'Carregando assuntos...' : 'Sem assunto'}
                  </option>
                  {gerarTopics.map((topic) => (
                    <option key={topic.id} value={topic.id}>
                      {topic.name}
                    </option>
                  ))}
                </select>
              </label>

              {erroGeracao && (
                <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 lg:col-span-2">
                  {erroGeracao}
                </p>
              )}

              <p className="text-xs text-graphite-400 lg:col-span-2">
                Os cartões nascem como gerados pela LuminIA, entram na fila de hoje
                e podem ser editados ou excluídos por você.
              </p>

              <div className="flex flex-wrap justify-end gap-2 lg:col-span-2">
                <Button type="button" variant="outline" size="sm" onClick={fecharGeracao} disabled={gerando}>
                  Cancelar
                </Button>
                <Button type="submit" size="sm" disabled={gerando}>
                  {gerando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {gerando ? 'Gerando...' : 'Gerar flashcards'}
                </Button>
              </div>
            </form>
          </Card>
        )}

        {historico && (
          <Card className="mt-6 bg-white p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-graphite-400">
                  Histórico de domínio
                </p>
                <h2 className="mt-1 text-lg font-semibold text-graphite">
                  {historico.flashcard.front}
                </h2>
                <p className="mt-1 text-sm text-graphite-500">
                  {historico.flashcard.reviewCount} revisões ·{' '}
                  {historico.flashcard.accuracy ?? 0}% de lembrança · sequência atual de{' '}
                  {historico.flashcard.streak}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setHistorico(null)}
                className="rounded-full p-2 text-graphite-400 hover:bg-graphite/5 hover:text-graphite"
                aria-label="Fechar histórico"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {carregandoHistorico ? (
              <p className="mt-4 flex items-center gap-2 text-sm text-graphite-400">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando histórico...
              </p>
            ) : erroHistorico ? (
              <p role="alert" className="mt-4 text-sm text-red-700">{erroHistorico}</p>
            ) : historico.reviews.length ? (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[620px] text-left text-sm">
                  <thead className="border-b border-surface-line text-xs uppercase tracking-wide text-graphite-400">
                    <tr>
                      <th className="py-2 pr-4">Dia</th>
                      <th className="py-2 pr-4">Resposta</th>
                      <th className="py-2 pr-4">Intervalo</th>
                      <th className="py-2">Próxima</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historico.reviews.map((review) => (
                      <tr key={review.id} className="border-b border-surface-line/60 last:border-0">
                        <td className="py-2 pr-4 text-graphite-500">{formatarData(review.reviewedAt)}</td>
                        <td className="py-2 pr-4 font-medium text-graphite">{ROTULO_NOTA[review.rating]}</td>
                        <td className="py-2 pr-4 text-graphite-500">{review.intervalDays} dia(s)</td>
                        <td className="py-2 text-graphite-500">
                          {review.nextReviewAt ? descreverVencimento(review.nextReviewAt) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mt-4 text-sm text-graphite-400">
                Este cartão ainda não foi revisado. A primeira resposta abre o histórico.
              </p>
            )}
          </Card>
        )}

        <section className="mt-8" aria-label="Meus flashcards">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-graphite">Seus cartões</h2>
              <p className="mt-1 text-sm text-graphite-500">
                Revise hoje o que venceu. O intervalo cresce quando você lembra e
                volta para amanhã quando esquece.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {FILTROS_FLASHCARDS.map((opcao) => (
                <button
                  key={opcao.value}
                  type="button"
                  onClick={() => setFiltro(opcao.value)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                    filtro === opcao.value
                      ? 'bg-graphite text-white'
                      : 'bg-white text-graphite-500 ring-1 ring-surface-line hover:text-graphite'
                  }`}
                >
                  {opcao.label}
                </button>
              ))}
              <Button variant="outline" size="sm" onClick={() => void carregar()} disabled={carregando}>
                <RefreshCw className={`h-4 w-4 ${carregando ? 'animate-spin' : ''}`} /> Atualizar
              </Button>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {visiveis.map((card) => {
              const emRevisao = revisandoId === card.id;
              const destacado = destaqueId === card.id;
              return (
                <Card
                  key={card.id}
                  id={`flashcard-${card.id}`}
                  className={`bg-white transition ${destacado ? 'ring-2 ring-primary/50' : ''}`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-graphite/5 px-3 py-1 text-xs font-semibold text-graphite">
                      {ROTULO_FONTE[card.source]}
                    </span>
                    {card.subject && (
                      <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary-700">
                        {card.subject}
                      </span>
                    )}
                    {card.topic && (
                      <span className="rounded-full bg-graphite/5 px-3 py-1 text-xs font-medium text-graphite-500">
                        {card.topic}
                      </span>
                    )}
                    <span
                      className={`ml-auto rounded-full px-3 py-1 text-xs font-semibold ${
                        card.due ? 'bg-orange-50 text-orange-600' : 'bg-emerald-50 text-emerald-700'
                      }`}
                    >
                      {descreverVencimento(card.nextReviewAt)}
                    </span>
                  </div>

                  <p className="mt-4 whitespace-pre-line text-[15px] font-medium leading-relaxed text-graphite">
                    {card.front}
                  </p>

                  {emRevisao ? (
                    <div className="mt-4 rounded-2xl bg-surface-card p-4">
                      {mostrarResposta ? (
                        <>
                          <p className="whitespace-pre-line text-sm leading-relaxed text-graphite">
                            {card.back}
                          </p>
                          <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-graphite-400">
                            Como foi lembrar?
                          </p>
                          <div className="mt-2 grid gap-2 sm:grid-cols-4">
                            {NOTAS.map((nota) => (
                              <button
                                key={nota.value}
                                type="button"
                                disabled={revisando}
                                onClick={() => void responder(card, nota.value)}
                                className={`rounded-xl border px-3 py-2 text-xs font-semibold transition disabled:opacity-60 ${nota.className}`}
                              >
                                {ROTULO_NOTA[nota.value]}
                              </button>
                            ))}
                          </div>
                        </>
                      ) : (
                        <Button size="sm" onClick={() => setMostrarResposta(true)}>
                          <Eye className="h-4 w-4" /> Mostrar resposta
                        </Button>
                      )}
                    </div>
                  ) : (
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <Button size="sm" onClick={() => iniciarRevisao(card)}>
                        <Brain className="h-4 w-4" /> Revisar
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => void abrirHistorico(card)}>
                        <History className="h-4 w-4" /> Histórico
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => abrirEdicao(card)}>
                        <Pencil className="h-4 w-4" /> Editar
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => void excluir(card)}>
                        <Trash2 className="h-4 w-4" /> Excluir
                      </Button>
                      <span className="ml-auto text-xs text-graphite-400">
                        {descreverDesempenhoDoCartao(card)}
                      </span>
                    </div>
                  )}
                </Card>
              );
            })}

            {!carregando && !erro && !visiveis.length && (
              <Card className="bg-white p-6">
                <div className="flex items-start gap-4">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary-700">
                    <Layers className="h-5 w-5" />
                  </span>
                  <div>
                    <h3 className="font-semibold text-graphite">
                      {cards.length ? 'Nenhum cartão neste filtro' : 'Seu primeiro flashcard começa aqui'}
                    </h3>
                    <p className="mt-1 text-sm text-graphite-500">
                      {cards.length
                        ? 'Troque o filtro ou crie um cartão novo.'
                        : 'Crie manualmente ou abra o caderno de erros e transforme uma questão em cartão.'}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button size="sm" onClick={abrirNovo}>
                        <Plus className="h-4 w-4" /> Criar flashcard
                      </Button>
                      <Link to="/app/caderno-de-erros">
                        <Button size="sm" variant="outline">
                          Abrir caderno de erros
                        </Button>
                      </Link>
                    </div>
                  </div>
                </div>
              </Card>
            )}

            {carregando && (
              <p className="flex items-center gap-2 rounded-2xl border border-dashed border-surface-line bg-white p-5 text-sm text-graphite-400">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando flashcards...
              </p>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
