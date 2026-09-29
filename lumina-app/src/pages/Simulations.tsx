import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getAccessToken } from '@/lib/auth';
import { useAuth } from '@/contexts/AuthContext';
import {
  apiCreateQuestion,
  apiCreateSimulation,
  apiCreateSimulationClass,
  apiGetSubjectTopics,
  apiJoinSimulationClass,
  apiListQuestions,
  apiListSubjects,
  apiSimulation,
  apiSimulationClasses,
  apiSimulationResult,
  apiSimulations,
  apiSubmitSimulation,
  type AssessmentType,
  type Question,
  type QuestionDifficulty,
  type QuestionSort,
  type Simulation,
  type SimulationClass,
  type SimulationResult,
  type SimulationSummary,
  type Subject,
  type Topic,
} from '@/lib/api';

const INSTITUTION_STAFF_ACCOUNT_TYPES = ['TEACHER', 'COORDINATOR', 'DIRECTOR'];
const DIFFICULTY_LABEL: Record<QuestionDifficulty, string> = { FACIL: 'Fácil', MEDIA: 'Média', DIFICIL: 'Difícil' };
const SORT_LABEL: Record<QuestionSort, string> = { newest: 'Mais recentes', oldest: 'Mais antigas', year_desc: 'Ano (mais novo)', year_asc: 'Ano (mais antigo)' };

const token = () => getAccessToken() ?? '';
const ASSESSMENT_LABEL: Record<AssessmentType, string> = { ACTIVITY: 'Atividade', LIST: 'Lista', TEST: 'Prova', SIMULATION: 'Simulado', ADAPTIVE: 'Simulado Adaptativo' };

/** Converte segundos em MM:SS. */
function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function Simulations() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const id = params.get('id');
  const [classes, setClasses] = useState<SimulationClass[]>([]);
  const [list, setList] = useState<SimulationSummary[]>([]);
  const [simulation, setSimulation] = useState<Simulation | null>(null);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [questions, setQuestions] = useState<Question[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [classId, setClassId] = useState('');
  const [assessmentType, setAssessmentType] = useState<AssessmentType>('SIMULATION');
  const [dueAt, setDueAt] = useState('');
  const [className, setClassName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [examFilter, setExamFilter] = useState('');
  const [yearFilter, setYearFilter] = useState<number | undefined>(undefined);
  const [difficultyFilter, setDifficultyFilter] = useState<QuestionDifficulty | ''>('');
  const [sortFilter, setSortFilter] = useState<QuestionSort>('newest');
  const [limit, setLimit] = useState(20);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [durationMinutes, setDurationMinutes] = useState<number | undefined>(undefined);
  const [isRealExam, setIsRealExam] = useState(false);
  const [generateAnswerSheet, setGenerateAnswerSheet] = useState(false);

  // Escolha por tema/subtema (disciplina/assunto), como no QConcursos: primeiro
  // a disciplina, depois o assunto dentro dela — só então as questões
  // disponíveis aparecem para seleção.
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [subjectId, setSubjectId] = useState('');
  const [topics, setTopics] = useState<Topic[]>([]);
  const [topicId, setTopicId] = useState('');
  const canGenerateAnswerSheet = !!user?.accountType && INSTITUTION_STAFF_ACCOUNT_TYPES.includes(user.accountType);

  // Quantidade desejada: em vez de marcar questão por questão, pede N e o
  // sistema seleciona automaticamente respeitando os filtros atuais.
  const [desiredCount, setDesiredCount] = useState(10);

  // Simulado multidisciplinar: em vez de um tema só, o simulado é composto
  // por blocos — cada um com sua matéria e sua quantidade de questões, que
  // define o intervalo (ex.: 1–10 Português, 11–20 Matemática). A ordem dos
  // blocos é a ordem da prova.
  const [multidisciplinar, setMultidisciplinar] = useState(false);
  const [blocks, setBlocks] = useState<{ subjectId: string; topicId: string; count: number }[]>([
    { subjectId: '', topicId: '', count: 10 },
  ]);
  const [blockTopics, setBlockTopics] = useState<Record<string, Topic[]>>({});
  // O backend só deixa o professor criar questão da própria matéria
  // cadastrada — mostrar o atalho só quando o tema escolhido bate evita um
  // clique que sempre terminaria em erro.
  const selectedSubjectName = subjects.find(s => s.id === subjectId)?.name;
  const canCreateQuestionHere = user?.accountType === 'TEACHER' && !!user.teacherSubject && user.teacherSubject === selectedSubjectName;

  // Criação de questão inline pelo professor, quando o banco não tem nada
  // que sirva para o tema/subtema escolhido.
  const [showCreateQuestion, setShowCreateQuestion] = useState(false);
  const [newStem, setNewStem] = useState('');
  const [newDifficulty, setNewDifficulty] = useState<QuestionDifficulty>('MEDIA');
  const [newAlternatives, setNewAlternatives] = useState(['', '', '', '']);
  const [newCorrectIndex, setNewCorrectIndex] = useState(0);
  const [createQuestionError, setCreateQuestionError] = useState('');

  // Timer state
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [timerActive, setTimerActive] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef<Date | null>(null);

  const refresh = async () => {
    const [nextClasses, nextList] = await Promise.all([apiSimulationClasses(token()), apiSimulations(token())]);
    setClasses(nextClasses); setList(nextList);
  };

  useEffect(() => { void refresh().catch(() => setError('Não foi possível carregar os simulados.')); }, []);

  // Load simulation when id changes
  useEffect(() => {
    if (!id) { setSimulation(null); setResult(null); setAnswers({}); stopTimer(); return; }
    let active = true;
    Promise.all([apiSimulation(token(), id), apiSimulationResult(token(), id).catch(() => null)])
      .then(([row, saved]) => {
        if (active) {
          setSimulation(row);
          setResult(saved);
          setAnswers({});
          // Start timer if simulation has duration and not already submitted
          if (row.durationMinutes && !saved) startTimer(row.durationMinutes * 60, row.isRealExam);
        }
      })
      .catch(() => { if (active) setError('Não foi possível abrir o simulado.'); });
    return () => { active = false; };
  }, [id]);

  // Disciplinas para a escolha por tema (carrega uma vez).
  useEffect(() => {
    apiListSubjects(token()).then(setSubjects).catch(() => undefined);
  }, []);

  // Assuntos da disciplina escolhida — o subtema só existe dentro de um tema.
  useEffect(() => {
    setTopicId(''); setPage(1);
    if (!subjectId) { setTopics([]); return; }
    let active = true;
    apiGetSubjectTopics(token(), subjectId)
      .then(row => { if (active) setTopics(row.topics); })
      .catch(() => { if (active) setTopics([]); });
    return () => { active = false; };
  }, [subjectId]);

  // Load questions for the question bank (when not viewing a simulation).
  // Tema e subtema vêm primeiro (como no QConcursos): sem disciplina
  // escolhida, nenhuma questão é listada ainda.
  useEffect(() => {
    if (id || !subjectId) { setQuestions([]); return; }
    let active = true;
    apiListQuestions(token(), {
      subjectId, topicId: topicId || undefined, search,
      exam: examFilter || undefined, year: yearFilter, difficulty: difficultyFilter || undefined,
      sort: sortFilter, page, limit,
    })
      .then(result => { if (active) { setQuestions(result.items); setTotalPages(result.totalPages); setTotalQuestions(result.total); } })
      .catch(() => { if (active) setError('Não foi possível carregar as questões.'); });
    return () => { active = false; };
  }, [id, subjectId, topicId, search, examFilter, yearFilter, difficultyFilter, sortFilter, page, limit]);

  // Timer logic
  function startTimer(initialSeconds: number, isRealExamMode: boolean) {
    stopTimer();
    setTimeLeft(initialSeconds);
    setTimerActive(true);
    startedAtRef.current = new Date();
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev === null || prev <= 1) {
          stopTimer();
          if (isRealExamMode) autoSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  function stopTimer() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setTimerActive(false);
    setTimeLeft(null);
  }

  async function autoSubmit() {
    if (busy || !simulation) return;
    setBusy(true); setError('');
    try {
      const saved = await apiSubmitSimulation(token(), simulation.id,
        simulation.items.map(item => ({ position: item.position, selectedPosition: answers[item.position] ?? 0 })));
      setResult(saved);
      stopTimer();
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível enviar automaticamente.'); }
    finally { setBusy(false); }
  }

  async function run(action: () => Promise<unknown>) {
    setBusy(true); setError('');
    try { await action(); await refresh(); } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível concluir a ação.'); }
    finally { setBusy(false); }
  }

  function toggle(questionId: string) {
    setSelected(current => current.includes(questionId) ? current.filter(x => x !== questionId) : current.length < 90 ? [...current, questionId] : current);
  }

  /** Professor cria uma questão nova para o tema/subtema escolhido, quando o
   *  banco não tem nada que sirva — ela já entra selecionada no simulado. */
  async function createQuestionInline() {
    setCreateQuestionError('');
    const filledAlternatives = newAlternatives.map(a => a.trim()).filter(Boolean);
    if (filledAlternatives.length < 2) { setCreateQuestionError('Preencha pelo menos 2 alternativas.'); return; }
    if (newStem.trim().length < 5) { setCreateQuestionError('O enunciado precisa de pelo menos 5 caracteres.'); return; }
    setBusy(true);
    try {
      const created = await apiCreateQuestion(token(), {
        subject: subjects.find(s => s.id === subjectId)?.name ?? '',
        topic: topics.find(t => t.id === topicId)?.name ?? 'Geral',
        subjectId: subjectId || undefined,
        topicId: topicId || undefined,
        difficulty: newDifficulty,
        stem: newStem.trim(),
        alternatives: filledAlternatives.map((text, i) => ({ text, isCorrect: i === newCorrectIndex })),
      });
      setQuestions(current => [created, ...current]);
      setSelected(current => current.includes(created.id) ? current : [...current, created.id]);
      setShowCreateQuestion(false);
      setNewStem(''); setNewAlternatives(['', '', '', '']); setNewCorrectIndex(0); setNewDifficulty('MEDIA');
    } catch (e) {
      setCreateQuestionError(e instanceof Error ? e.message : 'Não foi possível criar a questão.');
    } finally {
      setBusy(false);
    }
  }

  /** Pede N questões ao backend (respeitando os filtros atuais) em vez de
   *  marcar uma por uma — substitui a seleção manual. */
  async function selectAutomatically() {
    if (!subjectId || desiredCount < 1) return;
    setBusy(true); setError('');
    try {
      const result = await apiListQuestions(token(), {
        subjectId, topicId: topicId || undefined, exam: examFilter || undefined, year: yearFilter,
        difficulty: difficultyFilter || undefined, sort: sortFilter, page: 1, limit: desiredCount,
      });
      setSelected(result.items.map(q => q.id));
      if (result.items.length < desiredCount) {
        setError(`Só há ${result.items.length} questões disponíveis para esse filtro (pediu ${desiredCount}).`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível selecionar as questões automaticamente.');
    } finally {
      setBusy(false);
    }
  }

  function loadBlockTopics(id: string) {
    if (!id || blockTopics[id]) return;
    apiGetSubjectTopics(token(), id)
      .then(row => setBlockTopics(current => ({ ...current, [id]: row.topics })))
      .catch(() => undefined);
  }

  function updateBlock(index: number, patch: Partial<{ subjectId: string; topicId: string; count: number }>) {
    setBlocks(current => current.map((b, i) => (i === index ? { ...b, ...patch } : b)));
    if (patch.subjectId) loadBlockTopics(patch.subjectId);
  }

  function addBlock() {
    setBlocks(current => [...current, { subjectId: '', topicId: '', count: 10 }]);
  }

  function removeBlock(index: number) {
    setBlocks(current => current.filter((_, i) => i !== index));
  }

  // Intervalo de posições de cada bloco (1–10 Português, 11–20 Matemática...).
  const blockRanges = (() => {
    let start = 1;
    return blocks.map(b => {
      if (b.count <= 0) return null;
      const range = { start, end: start + b.count - 1 };
      start = range.end + 1;
      return range;
    });
  })();
  const totalMultiCount = blocks.reduce((sum, b) => sum + Math.max(0, b.count), 0);

  /** Busca, bloco a bloco e na ordem definida, as questões de cada matéria —
   *  o resultado concatenado vira a prova (posição = ordem dos blocos). */
  async function buildMultidisciplinaryQuestionIds(): Promise<string[]> {
    const ids: string[] = [];
    for (const block of blocks) {
      if (!block.subjectId || block.count <= 0) continue;
      const result = await apiListQuestions(token(), {
        subjectId: block.subjectId, topicId: block.topicId || undefined, page: 1, limit: block.count,
      });
      if (result.items.length < block.count) {
        const name = subjects.find(s => s.id === block.subjectId)?.name ?? 'matéria';
        throw new Error(`Só há ${result.items.length} questões disponíveis de ${name} (pediu ${block.count}).`);
      }
      ids.push(...result.items.map(q => q.id));
    }
    return ids;
  }

  const canSubmit = simulation && !result && Object.keys(answers).length === simulation.items.length;
  const isRealExamMode = simulation?.isRealExam ?? false;
  const showTimer = simulation?.durationMinutes !== null && simulation?.durationMinutes !== undefined && !result;

  return <main className="min-h-screen bg-surface-card px-5 py-8 text-graphite sm:px-8">
    <div className="mx-auto max-w-5xl">
      <div className="print:hidden"><Link to="/app" className="text-sm font-semibold">← Voltar à visão geral</Link></div>
      <h1 className="mt-6 text-3xl font-bold">Simulados</h1>
      <Link to="/app/turmas" className="my-4 inline-block underline print:hidden">Gerenciar turmas, vínculos e histórico</Link>
      {error && <p role="alert" className="my-4 rounded-lg bg-red-50 p-3 text-red-700 print:hidden">{error}</p>}

      {id ? simulation ? <>
        {/* Header with timer */}
        <div className="my-5 flex flex-wrap items-center gap-3 print:hidden">
          <button onClick={() => { stopTimer(); setParams({}); }} className="rounded-lg border px-4 py-2">Voltar aos simulados</button>
          <button onClick={() => window.print()} className="rounded-lg bg-graphite px-4 py-2 text-white">Imprimir prova e cartão</button>
          {simulation.answerSheetTemplateId && (
            <Link to="/app/gabarito-scanner" className="rounded-lg border border-primary/30 bg-primary/10 px-4 py-2 text-sm text-primary">
              Cartão-resposta pronto para leitura →
            </Link>
          )}
          {showTimer && (
            <div className={`ml-auto flex items-center gap-2 px-3 py-1 rounded-lg font-mono text-lg ${isRealExamMode ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-primary-50 text-primary-700 border border-primary-200'}`}>
              <span className="sr-only">Tempo restante</span>
              {timerActive ? (
                <>
                  <span aria-live="polite">{formatTime(timeLeft ?? 0)}</span>
                  {isRealExamMode && <span className="text-xs uppercase tracking-wide">prova real</span>}
                </>
              ) : (
                <span className={isRealExamMode ? 'text-red-600' : 'text-graphite-500'}>Tempo esgotado</span>
              )}
            </div>
          )}
        </div>

        <h2 className="text-2xl font-bold">{simulation.title}</h2>
        <div className="mb-4 flex flex-wrap items-center gap-4 text-sm text-graphite-500">
          {simulation.className && <span>Turma: {simulation.className}</span>}
          {simulation.durationMinutes && <span>⏱ {simulation.durationMinutes} min</span>}
          {isRealExamMode && <span className="px-2 py-0.5 rounded bg-red-100 text-red-700 text-xs font-medium">Modo prova real</span>}
          {simulation.assessmentType !== 'SIMULATION' && <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-700 text-xs uppercase">{ASSESSMENT_LABEL[simulation.assessmentType].toLowerCase()}</span>}
        </div>
        <p className="mb-8 text-sm">Nome: ____________________________________ Data: ____ / ____ / ______</p>

        {/* Print version: questions grouped by area if available */}
        {simulation.items.map(item => <section key={item.id} className="mb-7 break-inside-avoid rounded-xl border bg-white p-5">
          <div className="flex items-baseline justify-between mb-2">
            <h3 className="font-semibold">{item.position}. {item.stem}</h3>
            {item.area && <span className="px-2 py-0.5 rounded bg-surface-card text-xs text-graphite-500">{item.area}</span>}
          </div>
          <p className="mb-3 text-xs text-graphite-400">{item.subject}</p>
          {item.alternatives.map(a => <p key={a.position} className="py-1">{String.fromCharCode(64 + a.position)}) {a.text}</p>)}
        </section>)}

        {/* Answering interface */}
        <section className="mb-7 rounded-xl border bg-white p-5 print:hidden">
          <h2 className="text-xl font-bold">Responder na plataforma</h2>
          {result ? (
            <>
              <p className="my-3 font-semibold">Resultado: {result.correct} de {result.total} acertos ({Math.round(100 * result.correct / result.total)}%).</p>
              {result.timeSpentMinutes && <p className="mb-3 text-sm text-graphite-500">Tempo gasto: {result.timeSpentMinutes} min</p>}
              {result.startedAt && <p className="mb-3 text-sm text-graphite-500">Iniciado em: {new Date(result.startedAt).toLocaleString('pt-BR')}</p>}
              {result.items.map(item => (
                <p key={item.position} className={item.isCorrect ? 'text-green-700' : 'text-red-700'}>
                  Questão {item.position} · marcou {String.fromCharCode(64 + item.selectedPosition)} · correta {String.fromCharCode(64 + item.correctPosition)} · {item.subject}{item.area ? ` (${item.area})` : ''}
                </p>
              ))}
            </>
          ) : (
            <>
              <p className="my-3 text-sm">Marque uma alternativa por questão. O envio é definitivo.{isRealExamMode && ' No modo prova real, o envio automático ocorre ao fim do tempo.'}</p>
              {simulation.items.map(item => (
                <div key={item.id} className="mb-4 border-b pb-3">
                  <div className="flex items-baseline justify-between mb-2">
                    <strong>Questão {item.position}</strong>
                    {item.area && <span className="px-2 py-0.5 rounded bg-surface-card text-xs text-graphite-500">{item.area}</span>}
                  </div>
                  <p className="mb-2 text-xs text-graphite-400">{item.subject}</p>
                  <div className="mt-2 flex flex-wrap gap-4">
                    {item.alternatives.map(a => (
                      <label key={a.position} className="cursor-pointer">
                        <input type="radio" name={`answer-${item.position}`} checked={answers[item.position] === a.position} onChange={() => setAnswers(current => ({ ...current, [item.position]: a.position }))} />
                        {String.fromCharCode(64 + a.position)}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              <button
                disabled={busy || !canSubmit || (isRealExamMode && timerActive)}
                onClick={() => void run(async () => {
                  const saved = await apiSubmitSimulation(token(), simulation!.id,
                    simulation!.items.map(item => ({ position: item.position, selectedPosition: answers[item.position] ?? 0 })));
                  setResult(saved);
                  stopTimer();
                })}
                className="rounded-lg bg-graphite px-5 py-3 font-semibold text-white disabled:opacity-50"
              >
                {isRealExamMode && timerActive ? 'Envio automático ao fim do tempo' : 'Enviar respostas'}
              </button>
            </>
          )}
        </section>

        {/* Answer sheet */}
        <section className="break-before-page rounded-xl border bg-white p-6">
          <h2 className="text-xl font-bold">Cartão-resposta</h2>
          <p className="text-xs">Lumina · versão {simulation.sheetVersion} · simulado {simulation.id}</p>
          <p className="my-5">Nome: ____________________________________ Turma: __________________</p>
          <p className="mb-5 text-sm">Pinte completamente uma bolinha por questão. Confira o número antes de marcar.</p>
          <div className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2 print:grid-cols-2">
            {simulation.items.map(item => (
              <div key={item.id} className="flex items-center gap-3 border-b pb-2 text-sm">
                <strong className="w-7">{String(item.position).padStart(2, '0')}</strong>
                {item.alternatives.map(a => <span key={a.position} className="whitespace-nowrap">◯ {String.fromCharCode(64 + a.position)}</span>)}
              </div>
            ))}
          </div>
        </section>
      </> : <p>Carregando simulado...</p> : (
        <>
          {/* Create class / join class */}
          <div className="my-7 grid gap-5 md:grid-cols-2">
            {user?.teacherSubject && (
              <form className="rounded-xl border bg-white p-5" onSubmit={e => { e.preventDefault(); void run(async () => { await apiCreateSimulationClass(token(), className); setClassName(''); }); }}>
                <h2 className="font-bold">Criar turma</h2>
                <input required maxLength={120} value={className} onChange={e => setClassName(e.target.value)} placeholder="Nome da turma" className="my-3 w-full rounded-lg border p-2" />
                <button disabled={busy} className="rounded-lg bg-graphite px-4 py-2 text-white">Criar turma</button>
              </form>
            )}
            <form className="rounded-xl border bg-white p-5" onSubmit={e => { e.preventDefault(); void run(async () => { await apiJoinSimulationClass(token(), joinCode); setJoinCode(''); }); }}>
              <h2 className="font-bold">Entrar em uma turma</h2>
              <input required maxLength={12} value={joinCode} onChange={e => setJoinCode(e.target.value)} placeholder="Código de ingresso" className="my-3 w-full rounded-lg border p-2" />
              <button disabled={busy} className="rounded-lg bg-graphite px-4 py-2 text-white">Entrar</button>
            </form>
          </div>
          {classes.length > 0 && (
            <section className="mb-7 rounded-xl border bg-white p-5">
              <h2 className="font-bold">Minhas turmas</h2>
              {classes.map(c => <p key={c.id} className="mt-2 text-sm">{c.name}{c.joinCode && <> · código para alunos: <strong>{c.joinCode}</strong></>}</p>)}
            </section>
          )}
          <section className="mb-7 rounded-xl border bg-white p-5">
            <h2 className="font-bold">Simulados disponíveis</h2>
            {list.length ? (
              list.map(s => (
                <button key={s.id} onClick={() => setParams({ id: s.id })} className="block w-full border-b py-3 text-left hover:underline">
                  <div className="flex items-center justify-between">
                    <span>{s.title} · {s.questionCount} questões{s.className ? ` · ${s.className}` : ''}</span>
                    <div className="flex items-center gap-2 text-xs text-graphite-500">
                      {s.durationMinutes && <span>⏱ {s.durationMinutes} min</span>}
                      {s.isRealExam && <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700">Prova real</span>}
                      {s.assessmentType !== 'SIMULATION' && <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">{ASSESSMENT_LABEL[s.assessmentType].toLowerCase()}</span>}
                    </div>
                  </div>
                  {s.result && <p className="mt-1 text-sm text-graphite-500">{s.result.correct} de {s.result.total} acertos · {new Date(s.result.submittedAt).toLocaleDateString('pt-BR')}</p>}
                </button>
              ))
            ) : (
              <p className="mt-3 text-sm">Nenhum simulado ainda.</p>
            )}
          </section>

          {/* Create simulation form */}
          <section className="rounded-xl border bg-white p-5">
            <h2 className="font-bold">Montar simulado</h2>
            <p className="text-sm text-graphite-400">Selecione de 1 a 90 questões. A ordem de seleção será a ordem da prova.</p>
            <div className="my-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <input value={title} maxLength={160} onChange={e => setTitle(e.target.value)} placeholder="Título do simulado" className="rounded-lg border p-2 sm:col-span-2 lg:col-span-3" />
              <select value={classId} onChange={e => setClassId(e.target.value)} className="rounded-lg border p-2">
                <option value="">Simulado pessoal</option>
                {classes.filter(c => c.isTeacher).map(c => <option key={c.id} value={c.id}>Turma: {c.name}</option>)}
              </select>
              <select value={assessmentType} onChange={e => setAssessmentType(e.target.value as AssessmentType)} className="rounded-lg border p-2">
                <option value="SIMULATION">Simulado</option>
                <option value="ACTIVITY">Atividade</option>
                <option value="LIST">Lista</option>
                <option value="TEST">Prova</option>
              </select>
              <label className="text-sm text-graphite-500">Prazo opcional<input type="datetime-local" value={dueAt} onChange={e => setDueAt(e.target.value)} className="mt-1 w-full rounded-lg border p-2" /></label>
              <label className="text-sm text-graphite-500">Duração (min) — opcional<input type="number" min={1} max={600} step={5} value={durationMinutes ?? ''} onChange={e => setDurationMinutes(e.target.value ? parseInt(e.target.value, 10) : undefined)} className="mt-1 w-full rounded-lg border p-2" /></label>
              <label className="flex items-center gap-2 text-sm text-graphite-500">
                <input type="checkbox" checked={isRealExam} onChange={e => setIsRealExam(e.target.checked)} />
                Modo prova real (exige duração)
              </label>
              <label className="flex items-center gap-2 text-sm text-graphite-500">
                <input type="checkbox" checked={multidisciplinar} onChange={e => setMultidisciplinar(e.target.checked)} />
                Simulado multidisciplinar (várias matérias por intervalo de questões)
              </label>
              {canGenerateAnswerSheet && (
                <label className="flex items-center gap-2 text-sm text-graphite-500 sm:col-span-2 lg:col-span-4">
                  <input type="checkbox" checked={generateAnswerSheet} onChange={e => setGenerateAnswerSheet(e.target.checked)} />
                  Gerar cartão-resposta para impressão (opcional — para aplicar em papel e ler depois no scanner)
                </label>
              )}
            </div>

            {multidisciplinar ? (
              /* Multidisciplinar: cada bloco define uma matéria e a quantidade
                 de questões dela — o intervalo (1–10, 11–20...) é calculado
                 pela ordem dos blocos, igual a uma prova real por área. */
              <div className="my-4 space-y-3">
                <p className="text-sm text-graphite-400">A ordem dos blocos abaixo é a ordem da prova.</p>
                {blocks.map((block, i) => {
                  const range = blockRanges[i];
                  const options = blockTopics[block.subjectId] ?? [];
                  return (
                    <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
                      <span className="w-16 shrink-0 text-sm font-semibold text-graphite-500">{range ? `${range.start}–${range.end}` : '—'}</span>
                      <select value={block.subjectId} onChange={e => updateBlock(i, { subjectId: e.target.value, topicId: '' })} className="rounded-lg border p-2">
                        <option value="">Escolha a matéria</option>
                        {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                      <select value={block.topicId} onChange={e => updateBlock(i, { topicId: e.target.value })} disabled={!block.subjectId} className="rounded-lg border p-2 disabled:opacity-50">
                        <option value="">Todos os subtemas</option>
                        {options.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                      <input type="number" min={1} max={90} value={block.count} onChange={e => updateBlock(i, { count: parseInt(e.target.value, 10) || 0 })} className="w-20 rounded-lg border p-2" />
                      <span className="text-sm text-graphite-400">questões</span>
                      {blocks.length > 1 && (
                        <button type="button" onClick={() => removeBlock(i)} className="ml-auto text-sm text-red-600 underline">Remover</button>
                      )}
                    </div>
                  );
                })}
                <button type="button" onClick={addBlock} className="text-sm font-semibold underline">+ Adicionar matéria</button>
                <p className={`text-sm ${totalMultiCount > 90 ? 'text-red-700' : 'text-graphite-500'}`}>
                  Total: {totalMultiCount} questões{totalMultiCount > 90 ? ' — máximo de 90' : ''}
                </p>
              </div>
            ) : (
              <>
                {/* Escolha por tema e subtema, como no QConcursos: só depois de
                    escolher a disciplina (e opcionalmente o assunto) as questões
                    disponíveis aparecem. Os demais campos (banca/prova, ano,
                    dificuldade, ordenação) usam os mesmos filtros que já existem
                    no banco de questões — não incluí campos do qconcursos sem
                    dado equivalente no Lumina (cargo, nível, área de formação/
                    atuação, modalidade, cadernos, anotações etc.).*/}
                <div className="my-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <select value={subjectId} onChange={e => { setSubjectId(e.target.value); setPage(1); }} className="rounded-lg border p-2">
                    <option value="">Escolha um tema (disciplina)</option>
                    {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  <select value={topicId} onChange={e => { setTopicId(e.target.value); setPage(1); }} disabled={!subjectId} className="rounded-lg border p-2 disabled:opacity-50">
                    <option value="">Todos os subtemas</option>
                    {topics.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  <input value={examFilter} onChange={e => { setExamFilter(e.target.value); setPage(1); }} disabled={!subjectId} placeholder="Banca/vestibular (ex: ENEM)" className="rounded-lg border p-2 disabled:opacity-50" />
                  <input type="number" min={1970} max={2100} value={yearFilter ?? ''} onChange={e => { setYearFilter(e.target.value ? parseInt(e.target.value, 10) : undefined); setPage(1); }} disabled={!subjectId} placeholder="Ano" className="rounded-lg border p-2 disabled:opacity-50" />
                  <select value={difficultyFilter} onChange={e => { setDifficultyFilter(e.target.value as QuestionDifficulty | ''); setPage(1); }} disabled={!subjectId} className="rounded-lg border p-2 disabled:opacity-50">
                    <option value="">Qualquer dificuldade</option>
                    {(Object.keys(DIFFICULTY_LABEL) as QuestionDifficulty[]).map(d => <option key={d} value={d}>{DIFFICULTY_LABEL[d]}</option>)}
                  </select>
                  <select value={sortFilter} onChange={e => { setSortFilter(e.target.value as QuestionSort); setPage(1); }} disabled={!subjectId} className="rounded-lg border p-2 disabled:opacity-50">
                    {(Object.keys(SORT_LABEL) as QuestionSort[]).map(s => <option key={s} value={s}>Ordenar por: {SORT_LABEL[s]}</option>)}
                  </select>
                </div>

                {subjectId ? (
                  <>
                    <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Buscar palavra no enunciado" className="mb-4 w-full rounded-lg border p-2" />
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm text-graphite-500">
                      <span>Foram encontradas {totalQuestions} questões</span>
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => { setTopicId(''); setExamFilter(''); setYearFilter(undefined); setDifficultyFilter(''); setSortFilter('newest'); setSearch(''); setPage(1); }} className="underline">Limpar filtros</button>
                        <label className="flex items-center gap-1">Por página
                          <select value={limit} onChange={e => { setLimit(parseInt(e.target.value, 10)); setPage(1); }} className="ml-1 rounded border p-1">
                            {[10, 20, 50].map(n => <option key={n} value={n}>{n}</option>)}
                          </select>
                        </label>
                      </div>
                    </div>
                    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-dashed p-3">
                      <label className="flex items-center gap-2 text-sm">Quantidade de questões
                        <input type="number" min={1} max={90} value={desiredCount} onChange={e => setDesiredCount(parseInt(e.target.value, 10) || 1)} className="w-20 rounded-lg border p-2" />
                      </label>
                      <button type="button" disabled={busy} onClick={() => void selectAutomatically()} className="rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-50">Selecionar automaticamente</button>
                      <span className="text-xs text-graphite-400">Escolhe as {desiredCount} primeiras questões do filtro atual — dá pra ajustar marcando/desmarcando abaixo.</span>
                    </div>
                    <div className="space-y-2">{questions.map(q => <label key={q.id} className="flex cursor-pointer gap-3 rounded-lg border p-3"><input type="checkbox" checked={selected.includes(q.id)} onChange={() => toggle(q.id)} /><span><strong>{q.subject}</strong>{q.topic ? ` · ${q.topic}` : ''}{q.exam ? ` · ${q.exam}` : ''}{q.year ? ` (${q.year})` : ''} · {q.stem.slice(0, 240)}</span></label>)}</div>
                    {questions.length === 0 && <p className="my-3 text-sm text-graphite-400">Nenhuma questão disponível para esse filtro ainda.</p>}
                    <div className="my-4 flex items-center gap-3"><button disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded border px-3 py-1">Anterior</button><span>Página {page} de {totalPages}</span><button disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="rounded border px-3 py-1">Próxima</button></div>

                    {canCreateQuestionHere && (
                      <div className="mb-5 rounded-lg border border-dashed p-4">
                        {!showCreateQuestion ? (
                          <button type="button" onClick={() => setShowCreateQuestion(true)} className="text-sm font-semibold underline">
                            + Nenhuma questão serve? Criar uma nova para este tema/subtema
                          </button>
                        ) : (
                          <div className="space-y-3">
                            <h3 className="font-semibold">Nova questão — {subjects.find(s => s.id === subjectId)?.name}{topicId ? ` · ${topics.find(t => t.id === topicId)?.name}` : ''}</h3>
                            {createQuestionError && <p role="alert" className="text-sm text-red-700">{createQuestionError}</p>}
                            <textarea value={newStem} onChange={e => setNewStem(e.target.value)} maxLength={4000} placeholder="Enunciado da questão" className="w-full rounded-lg border p-2" rows={3} />
                            <select value={newDifficulty} onChange={e => setNewDifficulty(e.target.value as QuestionDifficulty)} className="rounded-lg border p-2">
                              {(Object.keys(DIFFICULTY_LABEL) as QuestionDifficulty[]).map(d => <option key={d} value={d}>{DIFFICULTY_LABEL[d]}</option>)}
                            </select>
                            <div className="space-y-2">
                              {newAlternatives.map((alt, i) => (
                                <label key={i} className="flex items-center gap-2">
                                  <input type="radio" name="correctAlternative" checked={newCorrectIndex === i} onChange={() => setNewCorrectIndex(i)} />
                                  <input value={alt} onChange={e => setNewAlternatives(current => current.map((a, idx) => idx === i ? e.target.value : a))} maxLength={1000} placeholder={`Alternativa ${String.fromCharCode(65 + i)}`} className="flex-1 rounded-lg border p-2" />
                                </label>
                              ))}
                            </div>
                            <div className="flex gap-3">
                              <button type="button" disabled={busy} onClick={() => void createQuestionInline()} className="rounded-lg bg-graphite px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Criar e adicionar ao simulado</button>
                              <button type="button" onClick={() => setShowCreateQuestion(false)} className="rounded-lg border px-4 py-2 text-sm">Cancelar</button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <p className="my-4 text-sm text-graphite-400">Escolha um tema para ver as questões disponíveis.</p>
                )}
              </>
            )}

            <button
              disabled={busy || !title.trim() || (multidisciplinar ? totalMultiCount === 0 || totalMultiCount > 90 : !selected.length)}
              onClick={() => void run(async () => {
                const questionIds = multidisciplinar ? await buildMultidisciplinaryQuestionIds() : selected;
                const row = await apiCreateSimulation(token(), title, questionIds, classId || undefined, assessmentType, dueAt ? new Date(dueAt).toISOString() : undefined, durationMinutes, isRealExam, canGenerateAnswerSheet ? generateAnswerSheet : undefined);
                setSelected([]); setBlocks([{ subjectId: '', topicId: '', count: 10 }]); setTitle(''); setDueAt(''); setDurationMinutes(undefined); setIsRealExam(false); setGenerateAnswerSheet(false); setParams({ id: row.id });
              })}
              className="rounded-lg bg-graphite px-5 py-3 font-semibold text-white disabled:opacity-50"
            >
              Criar {ASSESSMENT_LABEL[assessmentType].toLowerCase()} com {multidisciplinar ? totalMultiCount : selected.length} questões
            </button>
          </section>
        </>
      )}
    </div>
  </main>;
}