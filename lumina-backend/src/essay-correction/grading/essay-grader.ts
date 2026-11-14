/**
 * Corretor de redação pelas cinco competências do Enem — uma avaliação por
 * competência.
 *
 * Fluxo (espelha o do Inep, cartilha 2025 p. 5–7):
 * 1. Análise determinística e checagem de nota zero pelas ferramentas MCP.
 *    "Em branco" e "até 7 linhas" zeram sem IA — são contagem, não juízo.
 * 2. Para cada competência, o contexto vem do RAG via MCP: a grade oficial
 *    de níveis + os trechos da cartilha mais próximos dos problemas que a
 *    análise encontrou.
 * 3. Cada avaliador avalia as cinco competências em CHAMADAS SEPARADAS: o
 *    modelo vê só a grade, os trechos e os sinais daquela competência, e não
 *    contamina uma nota com a outra (ex.: punir na C3 um erro de gramática).
 *    A C2 decide também anulação e tangenciamento (tema e tipo textual); a
 *    C5, o respeito aos direitos humanos.
 * 4. Dois avaliadores independentes. Discrepância = diferença > 80 numa
 *    competência ou > 100 no total. O terceiro avaliador reavalia só as
 *    competências que divergiram, e em cada uma vale a média das duas notas
 *    mais próximas.
 * 5. Cada nota bruta passa pela calibração funcional da competência,
 *    ajustada para o modelo que respondeu (calibration.ts), e é arredondada
 *    ao nível válido.
 *
 * O que o corretor NÃO aceita do modelo sem checar: nota fora dos níveis,
 * trecho "citado" que não está na redação (é descartado) e referência a
 * trecho da cartilha que não lhe foi entregue (é descartada).
 */
import { EssayTextAnalysis } from '../analysis/text-analysis';
import { CARTILHA_2026, CompetencyId, COMPETENCY_IDS, KNOWLEDGE_DOCUMENTS, KnowledgeDocument } from '../knowledge';
import { stripAccents } from '../rag/bm25';
import type { CartilhaHit, CompetencyGrade, EssayTools } from '../mcp/essay-mcp-client';
import { applyCalibrationFn, CalibrationFn, IDENTITY_FN } from './calibration';
import { CompetencyContext, PROMPT_SETS, PromptSet } from './prompt-sets';
import { extractFeatures, FeatureModelWeights, predictWithFeatureModel, snapToLevel } from './feature-model';

export type LlmGenerate = (args: { system: string; prompt: string; temperature: number; maxTokens: number }) => Promise<{ text: string; model: string } | null>;

/**
 * Versão dos prompts. A calibração é ajustada para uma versão: trocar o
 * prompt muda a distribuição das notas brutas e exige calibrar de novo.
 */
export const GRADER_PROMPT_VERSION = 'v2-competencia';

export type AnnulmentCode =
  | 'EM_BRANCO'
  | 'TEXTO_INSUFICIENTE'
  | 'FUGA_AO_TEMA'
  | 'TIPO_TEXTUAL'
  | 'PARTE_DESCONECTADA'
  | 'IDENTIFICACAO'
  | 'LINGUA_ESTRANGEIRA'
  | 'ILEGIVEL';

export interface LlmCalibration {
  version: 2;
  /** Versão dos prompts com que foi ajustada; outra versão = sem calibração. */
  promptVersion: string;
  /**
   * Calibração de cada modelo (chave = modelo como a auditoria o registra,
   * ex.: "gemini:gemini-3.5-flash-lite"), uma função por competência.
   */
  byModel: Record<
    string,
    {
      perCompetency: Record<CompetencyId, CalibrationFn>;
      fittedAt?: string;
      sampleSize?: number;
      /** Erro (validação cruzada) de cada forma, por competência. */
      selection?: unknown;
    }
  >;
}

export const IDENTITY_CALIBRATION: LlmCalibration = { version: 2, promptVersion: GRADER_PROMPT_VERSION, byModel: {} };

const IDENTITY_PER_COMPETENCY = Object.fromEntries(COMPETENCY_IDS.map((id) => [id, IDENTITY_FN])) as Record<CompetencyId, CalibrationFn>;

/**
 * Calibração que vale para o modelo que respondeu: a dele, na versão de
 * prompt atual. Modelo sem calibração própria fica sem calibração — a
 * função de um modelo não serve para outro.
 */
export function calibrationFor(calibration: LlmCalibration | undefined, model: string, promptVersion: string = GRADER_PROMPT_VERSION): { perCompetency: Record<CompetencyId, CalibrationFn>; fitted: boolean } {
  // Calibração de outra versão de prompt não vale: a distribuição das notas muda.
  if (!calibration || calibration.promptVersion !== promptVersion) return { perCompetency: IDENTITY_PER_COMPETENCY, fitted: false };
  const own = calibration.byModel?.[model] ?? calibration.byModel?.[model.replace(/^openrouter:/, '')] ?? calibration.byModel?.[`openrouter:${model}`];
  if (!own) return { perCompetency: IDENTITY_PER_COMPETENCY, fitted: false };
  const fitted = COMPETENCY_IDS.some((id) => own.perCompetency[id] && own.perCompetency[id].type !== 'identity');
  return { perCompetency: { ...IDENTITY_PER_COMPETENCY, ...own.perCompetency }, fitted };
}

export interface CompetencyEvaluation {
  score: number;
  /** Nota que o modelo deu, antes da calibração. */
  rawScore?: number;
  /** Descrição do desempenho que levou ao nível. */
  justification: string;
  /** Pontos fortes observados, sempre ancorados no texto. */
  strengths: string[];
  /** Problemas observados, sempre ancorados no texto. */
  problems: string[];
  /** Por que o nível escolhido descreve o texto (não é a nota isolada). */
  levelExplanation: string;
  /** O que faria a nota subir nesta competência. */
  tip?: string;
  evidence: string[];
  references: string[];
}

/** Uma chamada: a avaliação de UMA competência por um avaliador. */
export interface CompetencyRun extends CompetencyEvaluation {
  competency: CompetencyId;
  evaluator: string;
  model: string;
  /** Só na C2. */
  annulment?: { code: AnnulmentCode; explanation: string } | null;
  /** Só na C2. */
  tangencia?: boolean;
  /** Só na C5. */
  humanRightsViolation?: boolean;
}

export interface EvaluatorRun {
  evaluator: string;
  method: 'llm' | 'modelo-estatistico';
  model: string | null;
  annulment: { code: AnnulmentCode; explanation: string } | null;
  tangencia: boolean;
  humanRightsViolation: boolean;
  /** No terceiro avaliador, só as competências reavaliadas. */
  competencies: Record<CompetencyId, CompetencyEvaluation>;
  total: number;
  generalComment: string;
}

export interface CompetencyResult {
  competency: CompetencyId;
  score: number;
  level: string;
  justification: string;
  strengths: string[];
  problems: string[];
  levelExplanation: string;
  /** O que faria a nota subir nesta competência. */
  tip?: string;
  evidence: string[];
  citations: { id: string; title: string; citation: string }[];
}

/** Versão da base usada na correção, para auditoria e transparência. */
export interface GradeKnowledgeInfo {
  activeDocument: Pick<KnowledgeDocument, 'id' | 'title' | 'version' | 'publishedAt' | 'sourceUrl'>;
  documents: Pick<KnowledgeDocument, 'id' | 'title' | 'version' | 'publishedAt' | 'status'>[];
}

export interface EssayGradeResult {
  total: number;
  annulment: { code: AnnulmentCode; explanation: string; citation: string } | null;
  competencies: CompetencyResult[];
  generalFeedback: string;
  /** 0–1: concordância entre avaliadores, método e qualidade da leitura da foto. */
  confidence: number;
  method: 'dois-avaliadores' | 'tres-avaliadores' | 'modelo-estatistico' | 'regra';
  discrepancy: { total: number; maxCompetency: number; thirdEvaluator: boolean; competencies?: CompetencyId[] } | null;
  runs: EvaluatorRun[];
  analysis: EssayTextAnalysis;
  toolCalls: { tool: string; at: string }[];
  calibrated: boolean;
  knowledge: GradeKnowledgeInfo;
  /** Exemplos validados efetivamente enviados ao prompt (para auditoria). */
  learningExamples?: ValidatedLearningExample[];
}

/**
 * Exemplo de correção humana já validado (VALIDATED/CONSOLIDATED). Entra no
 * prompt como contexto auxiliar, nunca como critério oficial nem como nota
 * automática. O registro já chega anonimizado e com consentimento conferido
 * pelo serviço de revisão.
 */
export interface ValidatedLearningExample {
  id: string;
  competency: CompetencyId;
  criterion: string | null;
  humanScore: number | null;
  aiScore: number | null;
  evidence: string | null;
  learning: string;
  divergenceReason?: string | null;
  version?: number;
}

export interface GradeInput {
  text: string;
  theme: string;
  /** Linhas lidas na folha (quando veio de foto). */
  ocrLines?: number;
  /** Confiança da leitura da foto (0-1); reduz a confiança da nota. */
  ocrConfidence?: number;
  /**
   * Exemplos recuperados do aprendizado humano validado. O serviço de
   * correção preenche este campo; o RAG oficial continua sendo a fonte
   * primária e a nota final passa pela mesma calibração.
   */
  learningExamples?: Partial<Record<CompetencyId, ValidatedLearningExample[]>>;
}

export interface GraderDependencies {
  tools: EssayTools;
  llm: LlmGenerate;
  featureModel?: FeatureModelWeights | null;
  calibration?: LlmCalibration;
  /** Quantos trechos da cartilha, além da grade, por competência. */
  chunksPerCompetency?: number;
  /** Versão do prompt (A/B na medição); padrão: GRADER_PROMPT_VERSION. */
  promptVersion?: string;
  /**
   * Chamadas simultâneas ao modelo (as cinco competências de um avaliador).
   * Padrão 3: os planos gratuitos limitam requisições por minuto.
   */
  concurrency?: number;
}

const DISCREPANCY_TOTAL = 100;
const DISCREPANCY_COMPETENCY = 80;

const KNOWLEDGE_INFO: GradeKnowledgeInfo = {
  activeDocument: {
    id: CARTILHA_2026.id,
    title: CARTILHA_2026.title,
    version: CARTILHA_2026.version,
    publishedAt: CARTILHA_2026.publishedAt,
    sourceUrl: CARTILHA_2026.sourceUrl,
  },
  documents: KNOWLEDGE_DOCUMENTS.map((document) => ({
    id: document.id,
    title: document.title,
    version: document.version,
    publishedAt: document.publishedAt,
    status: document.status,
  })),
};

const COMPETENCY_NAMES: Record<CompetencyId, string> = {
  C1: 'domínio da escrita formal',
  C2: 'compreensão do tema e repertório',
  C3: 'seleção e organização dos argumentos',
  C4: 'coesão',
  C5: 'proposta de intervenção',
};

const CARTILHA_2026_CITATION = `${CARTILHA_2026.title} (Inep), ${CARTILHA_2026.version}`;
const annulmentCitation = (pages: string) => `${CARTILHA_2026_CITATION}, p. ${pages}`;

const ANNULMENT_CITATIONS: Record<AnnulmentCode, string> = {
  EM_BRANCO: annulmentCitation('7'),
  TEXTO_INSUFICIENTE: annulmentCitation('7'),
  FUGA_AO_TEMA: annulmentCitation('25'),
  TIPO_TEXTUAL: annulmentCitation('26–27'),
  PARTE_DESCONECTADA: annulmentCitation('8–9'),
  IDENTIFICACAO: annulmentCitation('8'),
  LINGUA_ESTRANGEIRA: annulmentCitation('8'),
  ILEGIVEL: annulmentCitation('8'),
};

/** Conjunto de prompts da versão ativa (ver prompt-sets.ts). */
export function activePromptSet(version: string = GRADER_PROMPT_VERSION): PromptSet {
  const set = PROMPT_SETS[version];
  if (!set) throw new Error(`Prompt do avaliador não encontrado: ${version}`);
  return set;
}

export function buildCompetencyQuery(competency: CompetencyId, analysis: EssayTextAnalysis): string {
  return activePromptSet().buildQuery(competency, analysis);
}

export function buildCompetencyPrompt(input: GradeInput, analysis: EssayTextAnalysis, context: CompetencyContext, zeroAlerts: string[]): string {
  return activePromptSet().buildPrompt(input, analysis, context, zeroAlerts);
}

/** Extrai o primeiro objeto JSON da resposta (modelos às vezes cercam com ```). */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('Resposta sem objeto JSON.');
  return JSON.parse(body.slice(start, end + 1));
}

function normalizeQuote(text: string): string {
  return stripAccents(text.toLowerCase()).replace(/[^a-z0-9]+/g, ' ').trim();
}

function textList(value: unknown, limit = 5, maxLength = 300): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim().slice(0, maxLength))
    .slice(0, limit);
}

/** Mantém só citações que estão de fato na redação (evita trecho inventado). */
export function verifiedEvidence(quotes: unknown, essay: string): string[] {
  if (!Array.isArray(quotes)) return [];
  const haystack = normalizeQuote(essay);
  return quotes
    .filter((q): q is string => typeof q === 'string' && q.trim().length >= 3)
    .map((q) => q.trim().replace(/^["“'…]+|["”'…]+$/g, ''))
    .filter((q) => {
      const n = normalizeQuote(q);
      if (n.length < 3) return false;
      if (haystack.includes(n)) return true;
      // Citação com reticências no meio: confere cada pedaço.
      const parts = q.split(/\.\.\.|…|\[\.\.\.\]/).map(normalizeQuote).filter((p) => p.length >= 8);
      return parts.length > 1 && parts.every((p) => haystack.includes(p));
    })
    .slice(0, 3);
}

/** Remove citações repetidas ou contidas em outra (mesmo trecho com e sem ponto final). */
export function dedupeQuotes(quotes: string[]): string[] {
  const kept: { quote: string; norm: string }[] = [];
  for (const quote of quotes) {
    const norm = normalizeQuote(quote);
    if (kept.some((k) => k.norm.includes(norm))) continue;
    for (let i = kept.length - 1; i >= 0; i--) if (norm.includes(kept[i].norm)) kept.splice(i, 1);
    kept.push({ quote, norm });
  }
  return kept.map((k) => k.quote);
}

const VALID_ANNULMENTS: AnnulmentCode[] = ['FUGA_AO_TEMA', 'TIPO_TEXTUAL', 'PARTE_DESCONECTADA', 'IDENTIFICACAO', 'LINGUA_ESTRANGEIRA'];

/** Valida a resposta de uma competência e aplica a calibração do modelo. */
export function parseCompetencyEvaluation(
  raw: unknown,
  competency: CompetencyId,
  essay: string,
  allowedRefs: Set<string>,
  calibration: LlmCalibration | undefined,
  label: string,
  model: string,
  promptVersion: string = GRADER_PROMPT_VERSION,
): CompetencyRun {
  const data = (raw ?? {}) as Record<string, unknown>;
  const rawScore = Number(data.nota);
  if (!Number.isFinite(rawScore)) throw new Error(`Avaliação sem nota numérica em ${competency}.`);
  const clamped = snapToLevel(Math.min(200, Math.max(0, rawScore)));
  const fn = calibrationFor(calibration, model, promptVersion).perCompetency[competency];
  const refs = Array.isArray(data.referencias) ? data.referencias.filter((r): r is string => typeof r === 'string' && allowedRefs.has(r)) : [];
  const justification = String(data.justificativa ?? '').trim().slice(0, 1500);
  const levelExplanation = String(data.explicacao_nivel ?? '').trim().slice(0, 900) || justification;
  const fallback = 'A nota corresponde ao nível cujo descritor melhor descreve o desempenho observado nesta competência.';
  const run: CompetencyRun = {
    competency,
    evaluator: label,
    model,
    rawScore: clamped,
    score: snapToLevel(applyCalibrationFn(fn, clamped)),
    justification: justification || levelExplanation || fallback,
    strengths: textList(data.pontos_fortes),
    problems: textList(data.problemas),
    levelExplanation: levelExplanation || fallback,
    tip: String(data.como_melhorar ?? '').trim().slice(0, 600) || 'Reescreva os trechos apontados em "problemas" e compare a nova versão com o descritor do nível seguinte.',
    evidence: verifiedEvidence(data.trechos, essay),
    references: [...new Set(refs)],
  };
  if (competency === 'C2') {
    const a = data.anulacao as { motivo?: string; explicacao?: string } | null | undefined;
    run.annulment = a && typeof a === 'object' && VALID_ANNULMENTS.includes(a.motivo as AnnulmentCode) ? { code: a.motivo as AnnulmentCode, explanation: String(a.explicacao ?? '').slice(0, 800) } : null;
    run.tangencia = data.tangenciamento === true;
  }
  if (competency === 'C5') run.humanRightsViolation = data.direitos_humanos_desrespeitados === true;
  return run;
}

/**
 * Junta as cinco competências de um avaliador e aplica as regras que cruzam
 * competências: tangenciamento (da C2) limita C2, C3 e C5 a 40; direitos
 * humanos (da C5) zeram a C5; anulação (da C2) zera tudo.
 */
export function assembleRun(label: string, parts: Partial<Record<CompetencyId, CompetencyRun>>, options: { ignoreAnnulment?: boolean } = {}): EvaluatorRun {
  const c2 = parts.C2;
  const tangencia = c2?.tangencia === true;
  const humanRightsViolation = parts.C5?.humanRightsViolation === true;
  const annulment = c2?.annulment ?? null;
  const competencies = {} as Record<CompetencyId, CompetencyEvaluation>;
  for (const id of COMPETENCY_IDS) {
    const part = parts[id];
    if (!part) continue;
    let score = part.score;
    if (tangencia && (id === 'C2' || id === 'C3' || id === 'C5')) score = Math.min(score, 40);
    if (humanRightsViolation && id === 'C5') score = 0;
    if (annulment && !options.ignoreAnnulment) score = 0;
    competencies[id] = {
      score,
      rawScore: part.rawScore,
      justification: part.justification,
      strengths: part.strengths,
      problems: part.problems,
      levelExplanation: part.levelExplanation,
      tip: part.tip,
      evidence: part.evidence,
      references: part.references,
    };
  }
  const models = [...new Set(Object.values(parts).map((p) => p!.model))];
  return {
    evaluator: label,
    method: 'llm',
    model: models.join(', ') || null,
    annulment,
    tangencia,
    humanRightsViolation,
    competencies,
    total: Object.values(competencies).reduce((sum, c) => sum + c.score, 0),
    generalComment: '',
  };
}

export function discrepancyBetween(a: EvaluatorRun, b: EvaluatorRun) {
  const diffs = Object.fromEntries(COMPETENCY_IDS.map((id) => [id, Math.abs(a.competencies[id].score - b.competencies[id].score)])) as Record<CompetencyId, number>;
  const maxCompetency = Math.max(...Object.values(diffs));
  const total = Math.abs(a.total - b.total);
  return { total, maxCompetency, diffs, discrepant: total > DISCREPANCY_TOTAL || maxCompetency > DISCREPANCY_COMPETENCY };
}

/** Das avaliações, o par cujas notas totais mais se aproximam (regra do Inep). */
export function closestPair(runs: EvaluatorRun[]): [EvaluatorRun, EvaluatorRun] {
  let best: [EvaluatorRun, EvaluatorRun] = [runs[0], runs[1]];
  let bestGap = Infinity;
  for (let i = 0; i < runs.length; i++) {
    for (let j = i + 1; j < runs.length; j++) {
      const gap = Math.abs(runs[i].total - runs[j].total);
      if (gap < bestGap) {
        bestGap = gap;
        best = [runs[i], runs[j]];
      }
    }
  }
  return best;
}

/** Das notas de uma competência, as duas mais próximas (com 2 notas, as duas). */
export function closestScores(scores: number[]): [number, number] {
  if (scores.length < 3) return [scores[0], scores[1] ?? scores[0]];
  let best: [number, number] = [scores[0], scores[1]];
  for (let i = 0; i < scores.length; i++) {
    for (let j = i + 1; j < scores.length; j++) {
      if (Math.abs(scores[i] - scores[j]) < Math.abs(best[0] - best[1])) best = [scores[i], scores[j]];
    }
  }
  return best;
}

/**
 * Competências que vão ao terceiro avaliador: as que divergiram mais de 80;
 * se só o total divergiu (> 100), as de maior diferença.
 */
export function competenciesForThird(d: ReturnType<typeof discrepancyBetween>, annulmentDisagrees: boolean): CompetencyId[] {
  const out = new Set<CompetencyId>(COMPETENCY_IDS.filter((id) => d.diffs[id] > DISCREPANCY_COMPETENCY));
  if (!out.size && d.total > DISCREPANCY_TOTAL) for (const id of COMPETENCY_IDS) if (d.diffs[id] === d.maxCompetency && d.maxCompetency > 0) out.add(id);
  if (annulmentDisagrees) out.add('C2');
  return COMPETENCY_IDS.filter((id) => out.has(id));
}

function featureRun(model: FeatureModelWeights, analysis: EssayTextAnalysis, text: string): EvaluatorRun {
  const raw = predictWithFeatureModel(model, extractFeatures(analysis, text));
  const competencies = {} as Record<CompetencyId, CompetencyEvaluation>;
  const note = 'Estimativa do modelo estatístico (sem leitura por IA): use como referência, não como nota definitiva.';
  const signals: Record<CompetencyId, string[]> = {
    C1: [
      ...(analysis.informalMarkers.length ? [`Marcas de registro informal: ${analysis.informalMarkers.join(', ')}.`] : []),
      ...(analysis.longestSentenceWords > 60 ? [`Há um período com ${analysis.longestSentenceWords} palavras: confira a pontuação.`] : []),
    ],
    C2: analysis.paragraphs < 3 ? ['O texto tem menos de três parágrafos: confira se há proposição, argumentação e conclusão.'] : [],
    C3: analysis.paragraphs < 4 ? ['Com poucos parágrafos de desenvolvimento, os argumentos tendem a ficar pouco aprofundados.'] : [],
    C4: [
      `${analysis.connectives.distinct} conectivos diferentes encontrados.`,
      ...(analysis.connectives.overused.length ? [`Repetidos: ${analysis.connectives.overused.join(', ')}.`] : []),
    ],
    C5: [
      analysis.proposal.count
        ? `Proposta com ${analysis.proposal.count} de 5 elementos identificados (${Object.entries(analysis.proposal.elements).filter(([, v]) => v).map(([k]) => k).join(', ')}).`
        : 'Nenhuma proposta de intervenção identificada nos últimos parágrafos.',
    ],
  };
  for (const id of COMPETENCY_IDS) {
    const explanation = [...signals[id], note].join(' ');
    competencies[id] = {
      score: snapToLevel(raw[id]),
      justification: explanation,
      strengths: [],
      problems: [],
      levelExplanation: signals[id].length ? signals[id].join(' ') : note,
      evidence: [],
      references: [],
    };
  }
  if (analysis.humanRightsFlags.length) competencies.C5.score = Math.min(competencies.C5.score, 40);
  return {
    evaluator: 'modelo-estatistico',
    method: 'modelo-estatistico',
    model: `ridge-${model.dataset}`,
    annulment: null,
    tangencia: false,
    humanRightsViolation: false,
    competencies,
    total: COMPETENCY_IDS.reduce((sum, id) => sum + competencies[id].score, 0),
    generalComment: '',
  };
}

function levelText(grade: CompetencyGrade | undefined, score: number): string {
  // A média de dois avaliadores pode cair entre níveis (ex.: 140): descreve
  // pelo nível inferior, que é o que o texto garantidamente alcançou.
  const level = Math.floor(score / 40) * 40;
  return grade?.niveis.find((n) => n.nota === level)?.descritor ?? '';
}

/** Comentário geral montado das competências: ponto forte e o que priorizar. */
export function composeGeneralFeedback(results: { competency: CompetencyId; score: number; tip?: string }[]): string {
  if (!results.length) return '';
  const sorted = [...results].sort((a, b) => b.score - a.score);
  const best = sorted[0];
  const weakest = [...results].sort((a, b) => a.score - b.score).filter((r) => r.score < 200).slice(0, 2);
  const parts = [`Ponto mais forte: ${best.competency} (${COMPETENCY_NAMES[best.competency]}), com ${best.score}.`];
  if (!weakest.length) parts.push('Todas as competências atingiram o nível máximo.');
  else {
    parts.push(`Para subir a nota, priorize ${weakest.map((w) => `${w.competency} (${COMPETENCY_NAMES[w.competency]}, ${w.score})`).join(' e ')}.`);
    for (const w of weakest) if (w.tip) parts.push(`${w.competency}: ${w.tip}`);
  }
  return parts.join(' ');
}

function annulledResult(code: AnnulmentCode, explanation: string, analysis: EssayTextAnalysis, runs: EvaluatorRun[], tools: EssayTools, method: EssayGradeResult['method']): EssayGradeResult {
  return {
    total: 0,
    annulment: { code, explanation, citation: ANNULMENT_CITATIONS[code] },
    competencies: COMPETENCY_IDS.map((id) => ({ competency: id, score: 0, level: '', justification: explanation, strengths: [], problems: [], levelExplanation: explanation, evidence: [], citations: [] })),
    generalFeedback: explanation,
    confidence: method === 'regra' ? 1 : 0.7,
    method,
    discrepancy: null,
    runs,
    analysis,
    toolCalls: [...tools.calls],
    calibrated: false,
    knowledge: KNOWLEDGE_INFO,
  };
}

/** Contexto preparado uma vez por redação e reaproveitado por todos os avaliadores. */
export interface PreparedEssay {
  input: GradeInput;
  analysis: EssayTextAnalysis;
  /** Anulação certa por regra (sem IA). */
  ruleAnnulment: { code: AnnulmentCode; detail: string } | null;
  zeroAlerts: string[];
  contexts: Map<CompetencyId, CompetencyContext>;
  allowedRefs: Set<string>;
  chunkInfo: Map<string, { title: string; citation: string }>;
}

/** Executa tarefas com no máximo `limit` ao mesmo tempo, preservando a ordem. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

export class EssayGrader {
  constructor(private readonly deps: GraderDependencies) {}

  /** Versão do prompt em uso por este avaliador. */
  get promptVersion(): string {
    return this.deps.promptVersion ?? GRADER_PROMPT_VERSION;
  }

  /** Análise, nota zero por regra e contexto do RAG de cada competência. */
  async prepare(input: GradeInput): Promise<PreparedEssay> {
    const tools = this.deps.tools;
    const analysis = await tools.analisarRedacao({ texto: input.text, tema: input.theme || undefined, linhas_ocr: input.ocrLines });
    const zero = await tools.verificarNotaZero({ texto: input.text, tema: input.theme || undefined, linhas_ocr: input.ocrLines });
    const certain = zero.anulacao_certa[0];
    const perCompetency = this.deps.chunksPerCompetency ?? 3;
    const contexts = new Map<CompetencyId, CompetencyContext>();
    const allowedRefs = new Set<string>();
    const chunkInfo = new Map<string, { title: string; citation: string }>();
    if (!certain) {
      const list = await Promise.all(
        COMPETENCY_IDS.map(async (competency) => {
          const [grade, hits] = await Promise.all([
            tools.gradeCompetencia(competency),
            tools.buscarCartilha({ consulta: activePromptSet(this.promptVersion).buildQuery(competency, analysis), competencia: competency, limite: perCompetency + 1 }),
          ]);
          return { competency, grade, chunks: hits.filter((hit) => hit.id !== `${competency.toLowerCase()}-niveis`).slice(0, perCompetency) };
        }),
      );
      for (const c of list) {
        contexts.set(c.competency, c);
        allowedRefs.add(`${c.competency.toLowerCase()}-niveis`);
        chunkInfo.set(`${c.competency.toLowerCase()}-niveis`, { title: `Níveis da ${c.competency}`, citation: c.grade.citacao });
        for (const h of c.chunks) {
          allowedRefs.add(h.id);
          chunkInfo.set(h.id, { title: h.titulo, citation: h.citacao });
        }
      }
    }
    return {
      input,
      analysis,
      ruleAnnulment: certain ? { code: certain.code as AnnulmentCode, detail: certain.detail } : null,
      zeroAlerts: zero.alertas_para_conferir.map((a) => a.detail),
      contexts,
      allowedRefs,
      chunkInfo,
    };
  }

  /**
   * Uma competência por um avaliador (uma chamada ao modelo). Devolve null
   * sem provedor de IA. Duas tentativas: modelo gratuito às vezes devolve
   * JSON quebrado.
   */
  async evaluateCompetency(prepared: PreparedEssay, competency: CompetencyId, label: string, temperature: number): Promise<CompetencyRun | null> {
    const context = prepared.contexts.get(competency);
    if (!context) throw new Error(`Sem contexto para ${competency}.`);
    const prompt = activePromptSet(this.promptVersion).buildPrompt(prepared.input, prepared.analysis, context, prepared.zeroAlerts);
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await this.deps.llm({ system: activePromptSet(this.promptVersion).system, prompt, temperature, maxTokens: 900 });
      if (!result) return null;
      try {
        return parseCompetencyEvaluation(extractJson(result.text), competency, prepared.input.text, prepared.allowedRefs, this.deps.calibration, label, result.model, this.promptVersion);
      } catch (error) {
        lastError = error;
      }
    }
    throw new Error(`${label} ${competency}: resposta inválida do modelo (${lastError instanceof Error ? lastError.message : String(lastError)}).`);
  }

  /** Um avaliador nas competências pedidas. Null sem provedor de IA. */
  private async evaluator(prepared: PreparedEssay, label: string, temperature: number, ids: readonly CompetencyId[] = COMPETENCY_IDS): Promise<Partial<Record<CompetencyId, CompetencyRun>> | null> {
    const results = await mapLimit([...ids], this.deps.concurrency ?? 3, (id) => this.evaluateCompetency(prepared, id, label, temperature));
    if (results.some((r) => r === null)) return null;
    return Object.fromEntries(results.map((r) => [r!.competency, r!]));
  }

  /**
   * Uma única avaliação (um avaliador, cinco competências) — usada pela
   * validação com redações já corrigidas. Null quando a regra zera sem IA.
   */
  async evaluateOnce(input: GradeInput, temperature = 0.2): Promise<EvaluatorRun | null> {
    const prepared = await this.prepare(input);
    if (prepared.ruleAnnulment) return null;
    const parts = await this.evaluator(prepared, 'avaliador-1', temperature);
    return parts ? assembleRun('avaliador-1', parts) : null;
  }

  async grade(input: GradeInput): Promise<EssayGradeResult> {
    const tools = this.deps.tools;
    const prepared = await this.prepare(input);
    const { analysis } = prepared;
    if (prepared.ruleAnnulment) return annulledResult(prepared.ruleAnnulment.code, prepared.ruleAnnulment.detail, analysis, [], tools, 'regra');

    const gradeById = new Map([...prepared.contexts.values()].map((c) => [c.competency, c.grade]));
    const first = await this.evaluator(prepared, 'avaliador-1', 0.2);

    if (!first) {
      // Sem provedor de IA: só o modelo estatístico, com confiança baixa.
      if (!this.deps.featureModel) throw new Error('Correção indisponível: nenhum provedor de IA configurado e modelo estatístico não treinado.');
      const run = featureRun(this.deps.featureModel, analysis, input.text);
      return {
        total: run.total,
        annulment: null,
        competencies: COMPETENCY_IDS.map((id) => ({
          competency: id,
          score: run.competencies[id].score,
          level: levelText(gradeById.get(id), run.competencies[id].score),
          justification: run.competencies[id].justification,
          strengths: run.competencies[id].strengths,
          problems: run.competencies[id].problems,
          levelExplanation: run.competencies[id].levelExplanation,
          evidence: [],
          citations: [{ id: `${id.toLowerCase()}-niveis`, ...(prepared.chunkInfo.get(`${id.toLowerCase()}-niveis`) ?? { title: id, citation: '' }) }],
        })),
        generalFeedback: '',
        confidence: input.ocrConfidence !== undefined ? Number((0.35 * (0.5 + 0.5 * input.ocrConfidence)).toFixed(2)) : 0.35,
        method: 'modelo-estatistico',
        discrepancy: null,
        runs: [run],
        analysis,
        toolCalls: [...tools.calls],
        calibrated: false,
        knowledge: KNOWLEDGE_INFO,
      };
    }

    const second = await this.evaluator(prepared, 'avaliador-2', 0.7);
    // Notas comparadas SEM o zero da anulação: a anulação se decide por voto
    // da C2; o resto da redação é comparado pelo que cada avaliador viu.
    const run1 = assembleRun('avaliador-1', first, { ignoreAnnulment: true });
    const runs: EvaluatorRun[] = [run1];
    const byEvaluator: Partial<Record<CompetencyId, CompetencyRun>>[] = [first];
    let method: EssayGradeResult['method'] = 'dois-avaliadores';
    let discrepancy: EssayGradeResult['discrepancy'] = null;
    let third: Partial<Record<CompetencyId, CompetencyRun>> | null = null;

    if (second) {
      const run2 = assembleRun('avaliador-2', second, { ignoreAnnulment: true });
      runs.push(run2);
      byEvaluator.push(second);
      const d = discrepancyBetween(run1, run2);
      const annulmentDisagrees = Boolean(run1.annulment) !== Boolean(run2.annulment);
      const recheck = d.discrepant || annulmentDisagrees ? competenciesForThird(d, annulmentDisagrees) : [];
      discrepancy = { total: d.total, maxCompetency: d.maxCompetency, thirdEvaluator: recheck.length > 0, competencies: recheck };
      if (recheck.length) {
        third = await this.evaluator(prepared, 'avaliador-3', 0.4, recheck);
        if (third) {
          runs.push(assembleRun('avaliador-3', third, { ignoreAnnulment: true }));
          byEvaluator.push(third);
          method = 'tres-avaliadores';
        }
      }
    }

    // Anulação: só quando a maioria das avaliações da C2 concorda (com dois
    // avaliadores, os dois; com o terceiro, dois dos três).
    const annulVotes = byEvaluator.map((e) => e.C2?.annulment).filter((a) => a !== undefined);
    const annulled = annulVotes.filter(Boolean);
    if (annulled.length >= 2 || (annulVotes.length === 1 && annulled.length === 1 && !second)) {
      const a = annulled[0]!;
      return annulledResult(a.code, a.explanation, analysis, runs, tools, method);
    }

    // Em cada competência: as notas (já com as regras de cada avaliador
    // aplicadas), e a média das duas mais próximas.
    const usable = runs;
    const competencies: CompetencyResult[] = COMPETENCY_IDS.map((id) => {
      const candidates = usable.filter((r) => r.competencies[id]).map((r) => ({ run: r, score: r.competencies[id].score }));
      const [a, b] = closestScores(candidates.map((c) => c.score));
      // Múltiplo de 20, como a média de dois níveis.
      const score = Math.round((a + b) / 2 / 20) * 20;
      const used = candidates.filter((c) => c.score === a || c.score === b);
      const lead = [...used].sort((x, y) => Math.abs(x.score - score) - Math.abs(y.score - score))[0] ?? candidates[0];
      const refs = [...new Set(used.flatMap((c) => c.run.competencies[id].references))];
      return {
        competency: id,
        score,
        level: levelText(gradeById.get(id), score),
        justification: lead.run.competencies[id].justification,
        strengths: lead.run.competencies[id].strengths,
        problems: lead.run.competencies[id].problems,
        levelExplanation: lead.run.competencies[id].levelExplanation,
        evidence: dedupeQuotes(used.flatMap((c) => c.run.competencies[id].evidence)).slice(0, 3),
        citations: (refs.length ? refs : [`${id.toLowerCase()}-niveis`]).map((ref) => ({ id: ref, ...(prepared.chunkInfo.get(ref) ?? { title: ref, citation: '' }) })),
        tip: lead.run.competencies[id].tip,
      };
    });
    const total = competencies.reduce((sum, c) => sum + c.score, 0);

    let confidence = method === 'tres-avaliadores' ? 0.6 : runs.length >= 2 ? 0.85 : 0.65;
    if (input.ocrConfidence !== undefined) confidence *= 0.5 + 0.5 * Math.min(1, Math.max(0, input.ocrConfidence));

    const models = new Set(byEvaluator.flatMap((e) => Object.values(e).map((r) => r!.model)));
    return {
      total,
      annulment: null,
      competencies,
      generalFeedback: composeGeneralFeedback(competencies),
      confidence: Number(confidence.toFixed(2)),
      method,
      discrepancy,
      runs,
      analysis,
      toolCalls: [...tools.calls],
      calibrated: [...models].some((m) => calibrationFor(this.deps.calibration, m, this.promptVersion).fitted),
      knowledge: KNOWLEDGE_INFO,
    };
  }
}
