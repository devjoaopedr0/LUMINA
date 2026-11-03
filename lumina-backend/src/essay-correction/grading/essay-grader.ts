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
import { CompetencyId, COMPETENCY_IDS } from '../knowledge/inep-cartilha-2025';
import { stripAccents } from '../rag/bm25';
import type { CartilhaHit, CompetencyGrade, EssayTools } from '../mcp/essay-mcp-client';
import { applyCalibrationFn, CalibrationFn, IDENTITY_FN } from './calibration';
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
export function calibrationFor(calibration: LlmCalibration | undefined, model: string): { perCompetency: Record<CompetencyId, CalibrationFn>; fitted: boolean } {
  if (!calibration || calibration.promptVersion !== GRADER_PROMPT_VERSION) return { perCompetency: IDENTITY_PER_COMPETENCY, fitted: false };
  const own = calibration.byModel?.[model] ?? calibration.byModel?.[model.replace(/^openrouter:/, '')] ?? calibration.byModel?.[`openrouter:${model}`];
  if (!own) return { perCompetency: IDENTITY_PER_COMPETENCY, fitted: false };
  const fitted = COMPETENCY_IDS.some((id) => own.perCompetency[id] && own.perCompetency[id].type !== 'identity');
  return { perCompetency: { ...IDENTITY_PER_COMPETENCY, ...own.perCompetency }, fitted };
}

export interface CompetencyEvaluation {
  score: number;
  /** Nota que o modelo deu, antes da calibração. */
  rawScore?: number;
  justification: string;
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
  /** O que faria a nota subir nesta competência. */
  tip?: string;
  evidence: string[];
  citations: { id: string; title: string; citation: string }[];
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
}

export interface GradeInput {
  text: string;
  theme: string;
  /** Linhas lidas na folha (quando veio de foto). */
  ocrLines?: number;
  /** Confiança da leitura da foto (0–1); reduz a confiança da nota. */
  ocrConfidence?: number;
}

export interface GraderDependencies {
  tools: EssayTools;
  llm: LlmGenerate;
  featureModel?: FeatureModelWeights | null;
  calibration?: LlmCalibration;
  /** Quantos trechos da cartilha, além da grade, por competência. */
  chunksPerCompetency?: number;
  /**
   * Chamadas simultâneas ao modelo (as cinco competências de um avaliador).
   * Padrão 3: os planos gratuitos limitam requisições por minuto.
   */
  concurrency?: number;
}

const DISCREPANCY_TOTAL = 100;
const DISCREPANCY_COMPETENCY = 80;

const COMPETENCY_NAMES: Record<CompetencyId, string> = {
  C1: 'domínio da escrita formal',
  C2: 'compreensão do tema e repertório',
  C3: 'seleção e organização dos argumentos',
  C4: 'coesão',
  C5: 'proposta de intervenção',
};

const ANNULMENT_CITATIONS: Record<AnnulmentCode, string> = {
  EM_BRANCO: 'Cartilha do Participante Enem 2025 (Inep), p. 7',
  TEXTO_INSUFICIENTE: 'Cartilha do Participante Enem 2025 (Inep), p. 7',
  FUGA_AO_TEMA: 'Cartilha do Participante Enem 2025 (Inep), p. 24',
  TIPO_TEXTUAL: 'Cartilha do Participante Enem 2025 (Inep), p. 25–26',
  PARTE_DESCONECTADA: 'Cartilha do Participante Enem 2025 (Inep), p. 8–9',
  IDENTIFICACAO: 'Cartilha do Participante Enem 2025 (Inep), p. 7',
  LINGUA_ESTRANGEIRA: 'Cartilha do Participante Enem 2025 (Inep), p. 8',
  ILEGIVEL: 'Cartilha do Participante Enem 2025 (Inep), p. 8',
};

const COMPETENCY_QUERIES: Record<CompetencyId, string> = {
  C1: 'desvios gramaticais convenções da escrita estrutura sintática escolha de registro vocabular',
  C2: 'tema recorte repertório sociocultural produtivo tipo dissertativo-argumentativo proposição argumentação conclusão',
  C3: 'projeto de texto desenvolvimento dos argumentos autoria organização ponto de vista',
  C4: 'coesão conectivos operadores argumentativos referenciação articulação entre parágrafos',
  C5: 'proposta de intervenção elementos ação agente meio finalidade detalhamento',
};

/** Consulta do RAG montada a partir dos problemas encontrados no texto. */
export function buildCompetencyQuery(competency: CompetencyId, analysis: EssayTextAnalysis): string {
  const extra: string[] = [];
  switch (competency) {
    case 'C1':
      if (analysis.informalMarkers.length) extra.push('registro informal marcas de oralidade');
      if (analysis.longestSentenceWords > 60) extra.push('períodos truncados justaposição pontuação');
      break;
    case 'C2':
      if (analysis.themeCoverage !== null && analysis.themeCoverage < 0.6) extra.push('fuga ao tema tangenciamento abordagem parcial');
      extra.push('repertório de bolso');
      if (analysis.paragraphs < 3) extra.push('estrutura proposição argumentação conclusão');
      break;
    case 'C3':
      if (analysis.paragraphs < 3) extra.push('informações soltas sem desenvolvimento');
      break;
    case 'C4':
      if (analysis.connectives.overused.length || analysis.repeatedWords.length) extra.push('repetição conector inadequado substituição');
      if (analysis.paragraphs <= 1) extra.push('ausência de paragrafação');
      break;
    case 'C5':
      if (analysis.humanRightsFlags.length) extra.push('direitos humanos violência justiça com as próprias mãos');
      if (analysis.proposal.count < 3) extra.push('proposta vaga genérica explícita');
      extra.push('contagem de elementos');
      break;
  }
  return `${COMPETENCY_QUERIES[competency]} ${extra.join(' ')}`.trim();
}

interface CompetencyContext {
  competency: CompetencyId;
  grade: CompetencyGrade;
  chunks: CartilhaHit[];
}

/** O que cada chamada avalia — e o que ela deve ignorar. */
const COMPETENCY_TASK: Record<CompetencyId, string> = {
  C1: 'Avalie SOMENTE a Competência 1 — domínio da modalidade escrita formal: desvios gramaticais (concordância, regência, crase, pontuação), de convenção da escrita (ortografia, acentuação, maiúsculas), estrutura sintática (períodos truncados ou justapostos) e escolha de registro. Não avalie tema, argumentos, coesão nem proposta.',
  C2: 'Avalie SOMENTE a Competência 2 — compreensão da proposta: abordagem completa do tema (o recorte, não só o assunto amplo), estrutura do tipo dissertativo-argumentativo (proposição, argumentação, conclusão) e repertório sociocultural (legitimado, pertinente ao tema e usado de forma produtiva). Decida também se a redação deve ser anulada e se tangencia o tema.',
  C3: 'Avalie SOMENTE a Competência 3 — seleção, relação, organização e interpretação de informações, fatos e opiniões em defesa de um ponto de vista: projeto de texto, desenvolvimento e aprofundamento dos argumentos, autoria. Não avalie gramática, conectivos nem a proposta.',
  C4: 'Avalie SOMENTE a Competência 4 — mecanismos linguísticos de coesão: conectivos entre parágrafos e entre períodos, referenciação (pronomes, sinônimos, expressões resumitivas), repetições e conectores inadequados. Não avalie o mérito dos argumentos nem a gramática em geral.',
  C5: 'Avalie SOMENTE a Competência 5 — proposta de intervenção: presença e detalhamento dos elementos (agente, ação, modo/meio, finalidade/efeito e detalhamento), articulação com a discussão do texto e respeito aos direitos humanos.',
};

const SYSTEM_PROMPT = `Você é avaliador(a) da redação do Enem, formado(a) em Letras, treinado(a) pela Matriz de Referência do Inep.
Nesta tarefa você avalia UMA competência, usando SOMENTE os critérios dos trechos da cartilha fornecidos.
Regras:
- A nota é exatamente um destes valores: 0, 40, 80, 120, 160 ou 200. Escolha o nível cujo descritor melhor descreve o texto NESTA competência; use a escala inteira (200 para o que atende plenamente ao descritor, 0 ou 40 para o que quase não atende).
- Fundamente a nota com trechos copiados LITERALMENTE da redação (até 3) e com os ids dos trechos da cartilha usados.
- Trechos marcados como "critério operacional da Lumina" não são texto do Inep: use-os como guia de consistência, sem dizer que são da cartilha.
- Escreva em português, dirigindo-se ao(à) estudante, de forma direta e específica: a justificativa (2 a 4 frases) diz o que levou ao nível; "como_melhorar" (1 a 2 frases) diz o que faria a nota subir.
Responda APENAS com um objeto JSON válido, sem texto antes ou depois.`;

/** Sinais automáticos relevantes para cada competência. */
function competencySignals(competency: CompetencyId, analysis: EssayTextAnalysis, zeroAlerts: string[]): string[] {
  const shape = `Parágrafos: ${analysis.paragraphs}; linhas: ${analysis.lines} (${analysis.linesSource}); palavras: ${analysis.words}.`;
  switch (competency) {
    case 'C1':
      return [
        `Períodos: ${analysis.sentences}; média de ${analysis.avgSentenceWords.toFixed(0)} palavras; maior período: ${analysis.longestSentenceWords} palavras.`,
        ...(analysis.informalMarkers.length ? [`Marcas de informalidade: ${analysis.informalMarkers.join(', ')}.`] : []),
      ];
    case 'C2':
      return [
        shape,
        ...(analysis.themeCoverage !== null ? [`Cobertura dos termos do tema: ${Math.round(analysis.themeCoverage * 100)}%${analysis.themeTermsMissing.length ? ` (ausentes: ${analysis.themeTermsMissing.join(', ')})` : ''}.`] : []),
        ...zeroAlerts.map((w) => `Possível anulação (confira lendo o texto): ${w}`),
      ];
    case 'C3':
      return [shape];
    case 'C4':
      return [
        shape,
        `Conectivos distintos: ${analysis.connectives.distinct} (${Object.entries(analysis.connectives.byRelation).map(([r, l]) => `${r}: ${l?.join(', ')}`).join('; ') || 'nenhum'}).`,
        ...(analysis.connectives.overused.length ? [`Conectivos repetidos: ${analysis.connectives.overused.join(', ')}.`] : []),
        ...(analysis.connectives.paragraphsWithoutLink.length ? [`Parágrafos que não começam com elemento de ligação: ${analysis.connectives.paragraphsWithoutLink.join(', ')}.`] : []),
        ...(analysis.repeatedWords.length ? [`Palavras repetidas: ${analysis.repeatedWords.map((w) => `${w.word} (${w.count}x)`).join(', ')}.`] : []),
      ];
    case 'C5':
      return [
        `Proposta (parágrafo ${analysis.proposal.paragraph ?? '—'}): ${Object.entries(analysis.proposal.elements).map(([k, v]) => `${k}=${v ?? 'não encontrado'}`).join(', ')}.`,
        ...(analysis.humanRightsFlags.length ? [`Possível desrespeito aos direitos humanos (confira): ${analysis.humanRightsFlags.join(', ')}.`] : []),
      ];
  }
}

const EXTRA_FIELDS: Record<CompetencyId, string> = {
  C1: '',
  C2: `,
 "anulacao": null ou {"motivo": "FUGA_AO_TEMA"|"TIPO_TEXTUAL"|"PARTE_DESCONECTADA"|"IDENTIFICACAO"|"LINGUA_ESTRANGEIRA", "explicacao": "..."},
 "tangenciamento": false`,
  C3: '',
  C4: '',
  C5: `,
 "direitos_humanos_desrespeitados": false`,
};

const EXTRA_RULES: Record<CompetencyId, string> = {
  C1: '',
  C2: '\nAnulação (nota zero total) só nos casos da cartilha: fuga total ao tema, não atendimento ao tipo dissertativo-argumentativo, parte deliberadamente desconectada, identificação, texto predominantemente em língua estrangeira. Na dúvida, não anule. Tangenciamento = aborda só o assunto amplo, não o recorte do tema (limita C2, C3 e C5 a 40).',
  C3: '',
  C4: '',
  C5: '\nProposta que desrespeite os direitos humanos zera a C5: marque "direitos_humanos_desrespeitados" só se for o caso.',
};

export function buildCompetencyPrompt(input: GradeInput, analysis: EssayTextAnalysis, context: CompetencyContext, zeroAlerts: string[]): string {
  const { competency, grade, chunks } = context;
  const levels = grade.niveis.map((n) => `  ${n.nota}: ${n.descritor}`).join('\n');
  const extra = chunks.map((c) => `  [${c.id}] ${c.titulo} (${c.citacao}): ${c.texto}`).join('\n');
  const signals = competencySignals(competency, analysis, zeroAlerts);
  return `${COMPETENCY_TASK[competency]}${EXTRA_RULES[competency]}

TEMA: ${input.theme || '(não informado — avalie a coerência interna e não anule por fuga ao tema)'}

CRITÉRIOS DA CARTILHA — ${competency}: ${grade.descricao}
[${competency.toLowerCase()}-niveis] Níveis (${grade.citacao}):
${levels}
${extra}

SINAIS AUTOMÁTICOS DO TEXTO (indícios a conferir, não notas):
${signals.join('\n') || '(nenhum)'}

REDAÇÃO:
"""
${input.text}
"""

Formato da resposta:
{"nota": 0, "justificativa": "...", "trechos": ["..."], "referencias": ["${competency.toLowerCase()}-niveis"], "como_melhorar": "..."${EXTRA_FIELDS[competency]}}`;
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
): CompetencyRun {
  const data = (raw ?? {}) as Record<string, unknown>;
  const rawScore = Number(data.nota);
  if (!Number.isFinite(rawScore)) throw new Error(`Avaliação sem nota numérica em ${competency}.`);
  const clamped = snapToLevel(Math.min(200, Math.max(0, rawScore)));
  const fn = calibrationFor(calibration, model).perCompetency[competency];
  const refs = Array.isArray(data.referencias) ? data.referencias.filter((r): r is string => typeof r === 'string' && allowedRefs.has(r)) : [];
  const run: CompetencyRun = {
    competency,
    evaluator: label,
    model,
    rawScore: clamped,
    score: snapToLevel(applyCalibrationFn(fn, clamped)),
    justification: String(data.justificativa ?? '').trim().slice(0, 1500),
    tip: String(data.como_melhorar ?? '').trim().slice(0, 600),
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
    competencies[id] = { score, rawScore: part.rawScore, justification: part.justification, tip: part.tip, evidence: part.evidence, references: part.references };
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
  for (const id of COMPETENCY_IDS) competencies[id] = { score: snapToLevel(raw[id]), justification: [...signals[id], note].join(' '), evidence: [], references: [] };
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
    competencies: COMPETENCY_IDS.map((id) => ({ competency: id, score: 0, level: '', justification: '', evidence: [], citations: [] })),
    generalFeedback: explanation,
    confidence: method === 'regra' ? 1 : 0.7,
    method,
    discrepancy: null,
    runs,
    analysis,
    toolCalls: [...tools.calls],
    calibrated: false,
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
            tools.buscarCartilha({ consulta: buildCompetencyQuery(competency, analysis), competencia: competency, limite: perCompetency + 1 }),
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
    const prompt = buildCompetencyPrompt(prepared.input, prepared.analysis, context, prepared.zeroAlerts);
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await this.deps.llm({ system: SYSTEM_PROMPT, prompt, temperature, maxTokens: 900 });
      if (!result) return null;
      try {
        return parseCompetencyEvaluation(extractJson(result.text), competency, prepared.input.text, prepared.allowedRefs, this.deps.calibration, label, result.model);
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
      calibrated: [...models].some((m) => calibrationFor(this.deps.calibration, m).fitted),
    };
  }
}
