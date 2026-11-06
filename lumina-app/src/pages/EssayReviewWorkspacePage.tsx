import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  Loader2,
  MessageSquare,
  Quote,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Target,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useAuth } from '@/contexts/AuthContext';
import {
  ESSAY_COMPETENCY_LABELS,
  ESSAY_SCORE_LEVELS,
  apiEssayReviewSubmit,
  apiEssayReviewWorkspace,
  type EssayCompetencyId,
  type EssayReviewDecision,
  type EssayReviewMessage,
  type EssayReviewWorkspace,
} from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { EssayReviewChat, type ChatFocus } from '@/components/essays/EssayReviewChat';
import { EssayReviewHistory } from '@/components/essays/EssayReviewHistory';
import { EssayReviewLearning } from '@/components/essays/EssayReviewLearning';
import {
  Badge,
  LearningLevelBadge,
  ReviewStatusBadge,
  ScoreDelta,
  formatDateTime,
} from '@/components/essays/essay-review-ui';

const COMPETENCIES: EssayCompetencyId[] = ['C1', 'C2', 'C3', 'C4', 'C5'];
const DECISION_OPTIONS: EssayReviewDecision[] = ['AGREE', 'ADJUST', 'DISAGREE'];
const DECISION_SHORT: Record<EssayReviewDecision, string> = {
  AGREE: 'Concordo',
  ADJUST: 'Ajustar',
  DISAGREE: 'Discordo',
};
const DECISION_OVERALL: Record<EssayReviewDecision, string> = {
  AGREE: 'Concordo com a nota final da IA',
  ADJUST: 'Ajusto notas em alguma competência',
  DISAGREE: 'Discordo tecnicamente da IA',
};

type Scores = Record<EssayCompetencyId, number>;
type Decisions = Record<EssayCompetencyId, EssayReviewDecision>;
type TextFields = Record<EssayCompetencyId, string>;

function emptyScores(): Scores {
  return { C1: 0, C2: 0, C3: 0, C4: 0, C5: 0 };
}

function emptyDecisions(): Decisions {
  return { C1: 'AGREE', C2: 'AGREE', C3: 'AGREE', C4: 'AGREE', C5: 'AGREE' };
}

function emptyText(): TextFields {
  return { C1: '', C2: '', C3: '', C4: '', C5: '' };
}

function evidenceText(evidence: string[] | undefined): string {
  return (evidence ?? []).join('\n');
}

function highlightedEssay(content: string, evidence: string[]): ReactNode {
  const terms = Array.from(new Set(evidence.map((item) => item.trim()).filter((item) => item.length >= 4)));
  if (!terms.length) return <p className="whitespace-pre-wrap break-words leading-8">{content}</p>;
  const escaped = terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(`(${escaped.join('|')})`, 'gi');
  const normalized = new Set(terms.map((term) => term.toLowerCase()));
  return (
    <p className="whitespace-pre-wrap break-words leading-8">
      {content.split(pattern).map((part, index) => normalized.has(part.trim().toLowerCase())
        ? <mark key={index} title="Trecho citado pela correção da IA" className="rounded bg-primary/35 px-0.5 text-inherit">{part}</mark>
        : <span key={index}>{part}</span>)}
    </p>
  );
}

export function EssayReviewWorkspacePage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [workspace, setWorkspace] = useState<EssayReviewWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [messages, setMessages] = useState<EssayReviewMessage[]>([]);
  const [selectedText, setSelectedText] = useState<string | null>(null);
  const [chatFocus, setChatFocus] = useState<ChatFocus>('FINAL');
  const [scores, setScores] = useState<Scores>(emptyScores);
  const [decisions, setDecisions] = useState<Decisions>(emptyDecisions);
  const [criteria, setCriteria] = useState<TextFields>(emptyText);
  const [justifications, setJustifications] = useState<TextFields>(emptyText);
  const [evidence, setEvidence] = useState<TextFields>(emptyText);
  const [anchors, setAnchors] = useState<Partial<Record<EssayCompetencyId, string>>>({});
  const [overallDecision, setOverallDecision] = useState<EssayReviewDecision>('AGREE');
  const [generalFeedback, setGeneralFeedback] = useState('');
  const [submitBusy, setSubmitBusy] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [notice, setNotice] = useState('');
  const essayRef = useRef<HTMLDivElement>(null);
  const initializedFor = useRef('');

  const hydrateForm = useCallback((data: EssayReviewWorkspace, userId: string | undefined) => {
    const mine = data.reviews.find((review) => review.evaluator.id === userId) ?? null;
    const nextScores = emptyScores();
    const nextDecisions = emptyDecisions();
    const nextCriteria = emptyText();
    const nextJustifications = emptyText();
    const nextEvidence = emptyText();
    const nextAnchors: Partial<Record<EssayCompetencyId, string>> = {};
    const aiByCompetency = new Map(data.correction?.details.map((detail) => [detail.competency, detail.score]) ?? []);
    for (const competency of COMPETENCIES) {
      const detail = mine?.details.find((item) => item.competency === competency);
      const aiScore = aiByCompetency.get(competency) ?? 0;
      nextScores[competency] = mine?.competenciesJson[competency] ?? aiScore;
      nextDecisions[competency] = detail?.decision ?? (nextScores[competency] === aiScore ? 'AGREE' : 'ADJUST');
      nextCriteria[competency] = detail?.criterion ?? '';
      nextJustifications[competency] = detail?.justification ?? '';
      nextEvidence[competency] = evidenceText(detail?.evidenceJson?.evidence);
      if (detail?.evidenceJson?.anchorText) nextAnchors[competency] = detail.evidenceJson.anchorText;
    }
    setScores(nextScores);
    setDecisions(nextDecisions);
    setCriteria(nextCriteria);
    setJustifications(nextJustifications);
    setEvidence(nextEvidence);
    setAnchors(nextAnchors);
    setGeneralFeedback(mine?.generalFeedback ?? '');
    setOverallDecision(mine?.decision ?? (COMPETENCIES.every((competency) => nextScores[competency] === (aiByCompetency.get(competency) ?? 0)) ? 'AGREE' : 'ADJUST'));
  }, []);

  const load = useCallback(async (resetForm = true) => {
    if (!id) return;
    setLoading(true);
    setLoadError('');
    try {
      const data = await apiEssayReviewWorkspace(getAccessToken() ?? '', id);
      setWorkspace(data);
      setMessages(data.messages);
      const marker = `${data.essay.id}:${data.essay.version}:${data.reviews.find((review) => review.evaluator.id === user?.id)?.id ?? 'none'}`;
      if (resetForm || initializedFor.current !== marker) {
        hydrateForm(data, user?.id);
        initializedFor.current = marker;
      }
    } catch (caught) {
      setLoadError(caught instanceof Error ? caught.message : 'Não foi possível carregar a revisão.');
    } finally {
      setLoading(false);
    }
  }, [hydrateForm, id, user?.id]);

  useEffect(() => {
    void load(true);
    // O formulário é reidratado quando a redação ou o usuário mudam.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, user?.id]);

  const aiScores = useMemo(() => {
    const map = new Map<EssayCompetencyId, number>();
    for (const competency of COMPETENCIES) {
      const detail = workspace?.correction?.details.find((item) => item.competency === competency);
      map.set(competency, detail?.score ?? 0);
    }
    return map;
  }, [workspace]);

  const aiTotal = workspace?.correction?.totalScore ?? 0;
  const humanTotal = COMPETENCIES.reduce((sum, competency) => sum + scores[competency], 0);
  const allAgree = COMPETENCIES.every((competency) => scores[competency] === (aiScores.get(competency) ?? 0));
  const invalidAgree = overallDecision === 'AGREE' && !allAgree;
  const invalidDisagree = overallDecision === 'DISAGREE' && allAgree;
  const aiEvidence = useMemo(() => Array.from(new Set(COMPETENCIES.flatMap((competency) => {
    const detail = workspace?.correction?.details.find((item) => item.competency === competency);
    return detail?.evidenceJson?.evidence ?? [];
  }).map((item) => item.trim()).filter(Boolean))), [workspace]);

  function captureSelection() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;
    const text = selection.toString().replace(/\s+/g, ' ').trim();
    if (!text || text.length < 4) return;
    if (!essayRef.current?.contains(selection.anchorNode) || !essayRef.current?.contains(selection.focusNode)) return;
    setSelectedText(text.slice(0, 1000));
  }

  function setScore(competency: EssayCompetencyId, value: number) {
    const aiScore = aiScores.get(competency) ?? 0;
    setScores((current) => ({ ...current, [competency]: value }));
    setDecisions((current) => ({
      ...current,
      [competency]: current[competency] === 'DISAGREE' ? 'DISAGREE' : value === aiScore ? 'AGREE' : 'ADJUST',
    }));
    setNotice('');
  }

  function attachSelection(competency: EssayCompetencyId) {
    if (!selectedText) return;
    setAnchors((current) => ({ ...current, [competency]: selectedText }));
    setEvidence((current) => ({
      ...current,
      [competency]: [current[competency], selectedText].filter(Boolean).join('\n'),
    }));
    setChatFocus(competency);
    document.getElementById('review-chat')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function askAbout(competency: EssayCompetencyId | 'FINAL') {
    setChatFocus(competency);
    document.getElementById('review-chat')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function submit() {
    if (!workspace || !workspace.correction || submitBusy) return;
    if (invalidAgree) {
      setSubmitError('Para concordar com a nota final, as cinco notas humanas precisam ser iguais às da IA.');
      return;
    }
    if (invalidDisagree) {
      setSubmitError('Para registrar discordância, altere ao menos uma nota ou escolha "Ajustar notas".');
      return;
    }
    setSubmitBusy(true); setSubmitError(''); setNotice('');
    try {
      await apiEssayReviewSubmit(getAccessToken() ?? '', workspace.essay.id, {
        decision: overallDecision,
        generalFeedback: generalFeedback.trim() || undefined,
        competencies: COMPETENCIES.map((competency) => ({
          competency,
          score: scores[competency],
          decision: decisions[competency],
          criterion: criteria[competency].trim() || undefined,
          justification: justifications[competency].trim() || undefined,
          evidence: evidence[competency].split('\n').map((item) => item.trim()).filter(Boolean),
          anchorText: anchors[competency]?.trim() || undefined,
        })),
      });
      setNotice('Revisão registrada. Ela está estruturada e aguarda validação independente.');
      await load(true);
    } catch (caught) {
      setSubmitError(caught instanceof Error ? caught.message : 'Não foi possível enviar a revisão.');
    } finally {
      setSubmitBusy(false);
    }
  }

  if (loading && !workspace) {
    return <main className="min-h-screen bg-surface-card px-5 py-10"><p role="status" className="mx-auto flex max-w-6xl items-center gap-2 text-graphite-500"><Loader2 size={18} className="animate-spin" />Abrindo a área de revisão humana.</p></main>;
  }

  if (!workspace || !user) {
    return (
      <main className="min-h-screen bg-surface-card px-5 py-10">
        <div className="mx-auto max-w-3xl">
          <Link to="/app/redacoes" className="inline-flex items-center gap-2 text-sm font-semibold"><ArrowLeft size={16} />Voltar às redações</Link>
          <Card className="mt-6 border-red-200 bg-red-50">
            <h1 className="text-lg font-bold text-red-800">Não foi possível abrir a revisão</h1>
            <p className="mt-2 text-sm text-red-700">{loadError || 'A redação não está disponível para este perfil.'}</p>
            <Button className="mt-4" variant="outline" onClick={() => navigate(-1)}>Voltar</Button>
          </Card>
        </div>
      </main>
    );
  }

  const latest = workspace.reviews[0] ?? null;
  const myReview = workspace.reviews.find((review) => review.evaluator.id === user.id) ?? null;
  const latestStatus = latest?.status;
  const scan = workspace.essay.scans[0] ?? null;

  return (
    <main className="min-h-screen bg-surface-card px-4 py-7 text-graphite sm:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link to={workspace.canReview ? '/app/revisoes' : `/app/redacoes/${workspace.essay.id}`} className="inline-flex items-center gap-2 text-sm font-semibold">
            <ArrowLeft size={16} />{workspace.canReview ? 'Fila de revisões' : 'Voltar à redação'}
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <Link to={`/app/redacoes/${workspace.essay.id}`} className="text-xs font-semibold text-graphite-500 underline">Abrir redação original</Link>
            {workspace.canReview ? <Link to="/app/revisoes/divergencias" className="text-xs font-semibold text-graphite-500 underline">Relatório de divergências</Link> : null}
          </div>
        </div>

        <header className="my-6">
          <p className="flex items-center gap-2 text-sm font-semibold text-primary-700"><ClipboardCheck size={18} />Revisão humana · {workspace.canReview ? 'avaliador' : 'leitura validada'}</p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold sm:text-3xl">{workspace.essay.title || 'Redação sem título'}</h1>
              <p className="mt-1 max-w-3xl text-sm text-graphite-500">{workspace.essay.theme || 'Tema livre'} · versão {workspace.essay.version} · {workspace.essay.wordCount} palavras · autoria de {workspace.essay.owner.name}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge>{workspace.canValidate ? 'Você pode validar' : 'Somente leitura'}</Badge>
              {myReview ? <LearningLevelBadge level={myReview.validationLevel} /> : <Badge tone="warn">Sem revisão sua</Badge>}
              {latestStatus ? <ReviewStatusBadge status={latestStatus} /> : null}
            </div>
          </div>
        </header>

        {!workspace.canReview ? (
          <div className="mb-5 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
            <p className="font-semibold">Esta é a devolutiva validada da sua redação.</p>
            <p className="mt-1">Você vê apenas revisões e aprendizados que passaram pela validação independente. O chat interno dos avaliadores não é exposto ao autor.</p>
          </div>
        ) : null}

        <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="bg-white p-4"><p className="text-xs font-semibold text-graphite-500">Nota da IA</p><p className="mt-1 text-3xl font-bold">{aiTotal}</p><p className="text-[11px] text-graphite-400">de 1000 · confiança {workspace.correction?.confidence !== null && workspace.correction?.confidence !== undefined ? `${Math.round(workspace.correction.confidence * 100)}%` : 'não informada'}</p></Card>
          <Card className="bg-white p-4"><p className="text-xs font-semibold text-graphite-500">Sua nota proposta</p><p className="mt-1 text-3xl font-bold">{workspace.canReview ? humanTotal : myReview?.totalScore ?? workspace.reviews[0]?.totalScore ?? '—'}</p><p className="text-[11px] text-graphite-400">{workspace.canReview ? <ScoreDelta aiScore={aiTotal} humanScore={humanTotal} total /> : 'somente revisões validadas'}</p></Card>
          <Card className="bg-white p-4"><p className="text-xs font-semibold text-graphite-500">Divergência total</p><p className={`mt-1 text-3xl font-bold ${latest?.divergenceJson?.discrepant ? 'text-red-700' : 'text-emerald-700'}`}>{latest?.divergenceJson?.total ?? 0}</p><p className="text-[11px] text-graphite-400">{latest?.divergenceJson?.discrepant ? 'acima do limite de discrepância' : 'dentro do limite operacional'}</p></Card>
          <Card className="bg-white p-4"><p className="text-xs font-semibold text-graphite-500">Aprendizados ativos</p><p className="mt-1 text-3xl font-bold">{workspace.learning.length}</p><p className="text-[11px] text-graphite-400">{workspace.learning.filter((record) => record.level === 'CONSOLIDATED').length} consolidado(s) para RAG</p></Card>
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
          <div className="space-y-6">
            <Card className="bg-white p-4 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="flex items-center gap-2 text-lg font-bold"><FileText size={18} />Texto da redação e OCR</h2>
                  <p className="mt-1 text-xs text-graphite-500">Selecione qualquer trecho para ancorar uma pergunta ou usá-lo como evidência. Trechos em amarelo foram citados pela IA.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {scan ? <Badge tone={scan.status === 'CONFIRMED' || scan.status === 'READY' ? 'good' : 'warn'}><ScanLine size={12} />OCR {scan.status.toLowerCase()}</Badge> : <Badge>Texto digitado</Badge>}
                  <Badge>{workspace.essay.wordCount} palavras</Badge>
                </div>
              </div>
              {scan ? (
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 rounded-xl bg-surface-card px-3 py-2 text-[11px] text-graphite-500">
                  <span>Linhas: {scan.lineCount ?? '—'}</span>
                  <span>Palavras ilegíveis: {scan.illegibleWords ?? 0}</span>
                  <span>Confiança OCR: {scan.ocrConfidence !== null ? `${Math.round(scan.ocrConfidence * 100)}%` : '—'}</span>
                  {scan.warnings.length ? <span className="text-amber-800">Avisos: {scan.warnings.join(' · ')}</span> : null}
                </div>
              ) : null}
              <div
                ref={essayRef}
                onMouseUp={captureSelection}
                onTouchEnd={captureSelection}
                className="mt-4 max-h-[540px] overflow-y-auto rounded-xl border border-surface-line bg-[#fffdf7] p-4 text-[15px] text-graphite-700"
                aria-label="Texto da redação para seleção de trechos"
              >
                {highlightedEssay(workspace.essay.content || '(Texto vazio)', aiEvidence)}
              </div>
              {selectedText ? (
                <div className="mt-3 flex flex-wrap items-start gap-2 rounded-xl border border-primary/30 bg-primary/10 p-3 text-xs">
                  <Quote size={15} className="mt-0.5 shrink-0" />
                  <p className="min-w-[180px] flex-1 italic">“{selectedText}”</p>
                  <Button size="sm" variant="outline" onClick={() => askAbout(chatFocus === 'FINAL' ? 'C3' : chatFocus)}><MessageSquare size={14} />Perguntar no chat</Button>
                  <Button size="sm" variant="ghost" onClick={() => setSelectedText(null)}>Limpar seleção</Button>
                </div>
              ) : null}
              {scan?.transcribedText && scan.transcribedText !== workspace.essay.content ? (
                <details className="mt-3 rounded-xl border border-surface-line p-3 text-sm">
                  <summary className="cursor-pointer font-semibold">Transcrição original do OCR</summary>
                  <p className="mt-2 max-h-52 overflow-y-auto whitespace-pre-wrap text-xs leading-6 text-graphite-500">{scan.transcribedText}</p>
                </details>
              ) : null}
            </Card>

            <Card className="bg-white p-4 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="flex items-center gap-2 text-lg font-bold"><Target size={18} />Análise da IA por competência</h2>
                  <p className="mt-1 text-xs text-graphite-500">Confira a interpretação registrada antes de alterar a nota. Cada mudança precisa de critério e evidência.</p>
                </div>
                <Badge><BookOpen size={12} />{workspace.knowledge.activeDocument?.version ?? 'Base oficial'}</Badge>
              </div>
              <div className="mt-4 space-y-3">
                {COMPETENCIES.map((competency) => {
                  const detail = workspace.correction?.details.find((item) => item.competency === competency);
                  return (
                    <div key={competency} className="rounded-xl border border-surface-line p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-semibold">{competency} · {ESSAY_COMPETENCY_LABELS[competency]}</p>
                        <div className="flex items-center gap-2"><Badge>{detail?.score ?? 0}/200</Badge><Button size="sm" variant="ghost" onClick={() => askAbout(competency)}><MessageSquare size={13} />Discutir</Button></div>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-sm text-graphite-600">{detail?.justification || 'Sem justificativa registrada.'}</p>
                      {detail?.evidenceJson?.evidence?.length ? <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-primary/10 px-2 py-1.5 text-xs italic text-graphite-600"><Quote size={12} className="mt-0.5 shrink-0" />“{detail.evidenceJson.evidence.join('” · “')}”</p> : null}
                      {detail?.evidenceJson?.level || detail?.evidenceJson?.levelExplanation ? <p className="mt-1 text-[11px] text-graphite-500">Nível {detail.evidenceJson?.level ?? '—'}: {detail.evidenceJson?.levelExplanation ?? 'sem explicação adicional'}</p> : null}
                    </div>
                  );
                })}
              </div>
              {workspace.correction?.generalFeedback ? <div className="mt-4 rounded-xl bg-surface-card p-3 text-sm"><p className="font-semibold">Comentário geral da IA</p><p className="mt-1 whitespace-pre-wrap text-graphite-600">{workspace.correction.generalFeedback}</p></div> : null}
              {workspace.correction?.annulmentJson ? <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"><p className="font-semibold">Anulação: {workspace.correction.annulmentJson.code}</p><p className="mt-1">{workspace.correction.annulmentJson.explanation}</p></div> : null}
              <div className="mt-4 grid gap-2 text-[11px] text-graphite-500 sm:grid-cols-2">
                <span>Método: {workspace.correction?.auditJson?.method ?? '—'}</span>
                <span>Calibrado: {workspace.correction?.auditJson?.calibrated ? 'sim' : 'não'}</span>
                <span>Linhas estimadas: {workspace.correction?.auditJson?.analysis?.lines ?? '—'} ({workspace.correction?.auditJson?.analysis?.linesSource ?? '—'})</span>
                <span>Parágrafos: {workspace.correction?.auditJson?.analysis?.paragraphs ?? '—'}</span>
                {workspace.correction?.auditJson?.analysis?.warnings?.length ? <span className="sm:col-span-2 text-amber-800">Avisos: {workspace.correction.auditJson.analysis.warnings.join(' · ')}</span> : null}
                {workspace.knowledge.activeDocument?.sourceUrl ? <a className="underline sm:col-span-2" href={workspace.knowledge.activeDocument.sourceUrl} target="_blank" rel="noopener noreferrer">Fonte oficial: {workspace.knowledge.activeDocument.title}</a> : null}
              </div>
            </Card>

            {workspace.canReview && workspace.correction ? (
              <Card className="bg-white p-4 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="flex items-center gap-2 text-lg font-bold"><ShieldCheck size={18} />Sua revisão por competência</h2>
                    <p className="mt-1 text-xs text-graphite-500">Edite a nota humana, registre o critério e a justificativa. A IA pode discordar de você, mas não decide sozinha.</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-graphite-500">Total humano</p>
                    <p className="text-2xl font-bold">{humanTotal} <span className="text-sm font-medium text-graphite-400">/ 1000</span></p>
                    <ScoreDelta aiScore={aiTotal} humanScore={humanTotal} total />
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-end gap-2 rounded-xl border border-surface-line bg-surface-card/60 p-3">
                  <label className="text-xs font-semibold text-graphite-700">Decisão final
                    <select value={overallDecision} onChange={(event) => setOverallDecision(event.target.value as EssayReviewDecision)} className="mt-1 block rounded-xl border border-surface-line bg-white px-3 py-2 text-sm">
                      {DECISION_OPTIONS.map((decision) => <option key={decision} value={decision}>{DECISION_OVERALL[decision]}</option>)}
                    </select>
                  </label>
                  <Button size="sm" variant="outline" onClick={() => { setScores(Object.fromEntries(COMPETENCIES.map((competency) => [competency, aiScores.get(competency) ?? 0])) as Scores); setDecisions(emptyDecisions()); setOverallDecision('AGREE'); }}>Voltar às notas da IA</Button>
                  <p className="text-[11px] text-graphite-500">A nota final é comparada com a soma da IA. Divergência não é média: cada competência é analisada.</p>
                </div>
                {invalidAgree ? <p role="alert" className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">Para concordar, as cinco notas precisam ser iguais às da IA.</p> : null}
                {invalidDisagree ? <p role="alert" className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">Para discordar, altere ao menos uma nota.</p> : null}

                <div className="mt-4 space-y-3">
                  {COMPETENCIES.map((competency) => {
                    const detail = workspace.correction?.details.find((item) => item.competency === competency);
                    const diff = scores[competency] - (aiScores.get(competency) ?? 0);
                    return (
                      <details key={competency} className="group rounded-xl border border-surface-line p-3" open={diff !== 0}>
                        <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold">{competency} · {ESSAY_COMPETENCY_LABELS[competency]}</span>
                            {diff !== 0 ? <Badge tone="warn">{diff > 0 ? '+' : ''}{diff}</Badge> : <Badge tone="good">igual à IA</Badge>}
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs text-graphite-500">IA {aiScores.get(competency) ?? 0}</span>
                            <select aria-label={`Nota humana de ${competency}`} value={scores[competency]} onChange={(event) => setScore(competency, Number(event.target.value))} className="rounded-lg border border-surface-line bg-white px-2 py-1 text-sm font-semibold">
                              {ESSAY_SCORE_LEVELS.map((level) => <option key={level} value={level}>{level}</option>)}
                            </select>
                            <select aria-label={`Decisão em ${competency}`} value={decisions[competency]} onChange={(event) => setDecisions((current) => ({ ...current, [competency]: event.target.value as EssayReviewDecision }))} className="rounded-lg border border-surface-line bg-white px-2 py-1 text-xs">
                              {DECISION_OPTIONS.map((decision) => <option key={decision} value={decision}>{DECISION_SHORT[decision]}</option>)}
                            </select>
                            <span className="text-graphite-400">⌄</span>
                          </div>
                        </summary>
                        <div className="mt-3 grid gap-3">
                          <p className="rounded-lg bg-surface-card px-2.5 py-2 text-xs text-graphite-500"><strong>Leitura da IA:</strong> {detail?.justification || 'Sem justificativa registrada.'}</p>
                          {detail?.evidenceJson?.evidence?.length ? <p className="flex items-start gap-1.5 text-xs italic text-graphite-500"><Quote size={12} className="mt-0.5 shrink-0" />“{detail.evidenceJson.evidence.join('” · “')}”</p> : null}
                          <div className="grid gap-3 sm:grid-cols-2">
                            <label className="text-xs font-semibold text-graphite-700">Critério discutido
                              <input value={criteria[competency]} maxLength={240} onChange={(event) => setCriteria((current) => ({ ...current, [competency]: event.target.value }))} placeholder="Ex.: progressão argumentativa" className="mt-1 w-full rounded-xl border border-surface-line px-3 py-2 text-sm" />
                            </label>
                            <label className="text-xs font-semibold text-graphite-700">Justificativa técnica
                              <textarea value={justifications[competency]} maxLength={6000} onChange={(event) => setJustifications((current) => ({ ...current, [competency]: event.target.value }))} placeholder="Explique o critério e por que a nota muda ou se mantém." className="mt-1 min-h-24 w-full rounded-xl border border-surface-line px-3 py-2 text-sm" />
                            </label>
                          </div>
                          <label className="text-xs font-semibold text-graphite-700">Evidências textuais (uma por linha)
                            <textarea value={evidence[competency]} maxLength={5000} onChange={(event) => setEvidence((current) => ({ ...current, [competency]: event.target.value }))} placeholder="Cole o trecho literal que sustenta sua leitura." className="mt-1 min-h-20 w-full rounded-xl border border-surface-line px-3 py-2 text-sm" />
                          </label>
                          <div className="flex flex-wrap gap-2">
                            {selectedText ? <Button size="sm" variant="outline" onClick={() => attachSelection(competency)}><Quote size={13} />Usar trecho selecionado</Button> : <span className="text-[11px] text-graphite-400">Selecione um trecho na redação para anexá-lo como evidência.</span>}
                            {anchors[competency] ? <Badge tone="warn">Âncora anexada</Badge> : null}
                          </div>
                        </div>
                      </details>
                    );
                  })}
                </div>

                <label className="mt-4 block text-xs font-semibold text-graphite-700">Comentário geral da revisão
                  <textarea value={generalFeedback} maxLength={6000} onChange={(event) => setGeneralFeedback(event.target.value)} placeholder="Síntese qualitativa para o histórico da revisão." className="mt-1 min-h-24 w-full rounded-xl border border-surface-line px-3 py-2 text-sm" />
                </label>
                {submitError ? <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{submitError}</p> : null}
                {notice ? <p role="status" className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p> : null}
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <Button disabled={submitBusy} onClick={() => void submit()}>{submitBusy ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}{myReview ? 'Atualizar revisão' : 'Enviar revisão para validação'}</Button>
                  {myReview ? <Link to={`/app/redacoes/${workspace.essay.id}`} className="text-xs font-semibold underline">Ver redação do aluno</Link> : null}
                </div>
              </Card>
            ) : null}

            {!workspace.canReview && workspace.reviews.length ? (
              <Card className="bg-white p-4 sm:p-6">
                <h2 className="text-lg font-bold">Devolutiva das competências</h2>
                <div className="mt-3 space-y-3">
                  {workspace.reviews[0].details.map((detail) => (
                    <div key={detail.id} className="rounded-xl border border-surface-line p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold">{detail.competency} · {ESSAY_COMPETENCY_LABELS[detail.competency]}</p><Badge>{detail.humanScore}/200</Badge></div>
                      <p className="mt-2 text-sm text-graphite-600">{detail.justification || 'Sem justificativa textual.'}</p>
                      {detail.evidenceJson?.evidence?.length ? <p className="mt-2 text-xs italic text-graphite-500">“{detail.evidenceJson.evidence.join('” · “')}”</p> : null}
                    </div>
                  ))}
                </div>
              </Card>
            ) : null}
          </div>

          <div id="review-chat" className="space-y-6">
            <EssayReviewChat
              essayId={workspace.essay.id}
              reviewId={myReview?.id ?? latest?.id}
              messages={messages}
              focus={chatFocus}
              onFocusChange={setChatFocus}
              selectedText={selectedText}
              onClearSelectedText={() => setSelectedText(null)}
              onAppended={(appended) => setMessages((current) => [...current, ...appended])}
              disabled={!workspace.canReview}
            />
            {!workspace.canReview ? <p className="rounded-2xl border border-surface-line bg-white p-4 text-xs text-graphite-500">O chat é uma ferramenta de trabalho do avaliador. Como autor, você recebe apenas a devolutiva validada.</p> : null}
            <Card className="bg-white p-4">
              <h2 className="flex items-center gap-2 font-semibold"><Sparkles size={16} />Como a LuminIA usa os aprendizados</h2>
              <ul className="mt-2 space-y-2 text-xs text-graphite-500">
                <li>1. A conversa é registrada como evidência, não como treinamento.</li>
                <li>2. Um aprendizado <strong>estruturado</strong> precisa de validação de outra pessoa.</li>
                <li>3. Só o nível <strong>consolidado</strong>, anonimizado e consentido entra no RAG.</li>
                <li>4. A redação em revisão é excluída da recuperação para não contaminar o teste.</li>
              </ul>
              <p className="mt-3 text-[11px] text-graphite-400">Prompt {workspace.knowledge.promptVersion} · base {workspace.knowledge.activeDocument?.title ?? 'oficial'} · atualizado em {formatDateTime(workspace.knowledge.activeDocument?.publishedAt)}</p>
            </Card>
          </div>
        </div>

        <div className="mt-8 space-y-8">
          <EssayReviewHistory workspace={workspace} userId={user.id} onReload={() => load(false)} />
          <EssayReviewLearning workspace={workspace} userId={user.id} selectedText={selectedText} onReload={() => load(false)} />
        </div>

        {latestStatus ? <p className="mt-6 flex items-center gap-2 text-[11px] text-graphite-400"><AlertTriangle size={12} />Relatório descritivo: média de notas não substitui a análise técnica de cada divergência.</p> : null}
      </div>
    </main>
  );
}
