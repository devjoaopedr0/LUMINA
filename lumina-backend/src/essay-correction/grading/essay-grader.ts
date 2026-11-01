/**
 * Corretor de redação pelas cinco competências do Enem.
 *
 * Fluxo (espelha o do Inep, cartilha 2025 p. 5–7):
 * 1. Análise determinística e checagem de nota zero pelas ferramentas MCP.
 *    "Em branco" e "até 7 linhas" zeram sem IA — são contagem, não juízo.
 * 2. Para cada competência, o contexto vem do RAG via MCP: a grade oficial
 *    de níveis + os trechos da cartilha mais próximos dos problemas que a
 *    análise encontrou.
 * 3. Dois avaliadores independentes (duas chamadas ao modelo, sem uma ver a
 *    outra). Discrepância = diferença > 100 no total ou > 80 numa
 *    competência; aí entra um terceiro, e a nota final é a média das duas
 *    avaliações mais próximas.
 * 4. Cada nota bruta passa pela calibração ajustada com redações já
 *    avaliadas (llm-calibration.json) e é arredondada ao nível válido.
 *
 * O que o corretor NÃO aceita do modelo sem checar: nota fora dos níveis,
 * trecho "citado" que não está na redação (é descartado) e referência a
 * trecho da cartilha que não lhe foi entregue (é descartada).
 */
import { EssayTextAnalysis } from '../analysis/text-analysis';
import { CompetencyId, COMPETENCY_IDS } from '../knowledge/inep-cartilha-2025';
import { stripAccents } from '../rag/bm25';
import type { CartilhaHit, CompetencyGrade, EssayTools } from '../mcp/essay-mcp-client';
import { extractFeatures, FeatureModelWeights, predictWithFeatureModel, snapToLevel } from './feature-model';

export type LlmGenerate = (args: { system: string; prompt: string; temperature: number; maxTokens: number }) => Promise<{ text: string; model: string } | null>;

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
  version: 1;
  fitted: boolean;
  fittedAt?: string;
  sampleSize?: number;
  /** nota calibrada = a·bruta + b, antes de arredondar ao nível. */
  perCompetency: Record<CompetencyId, { a: number; b: number }>;
}

export const IDENTITY_CALIBRATION: LlmCalibration = {
  version: 1,
  fitted: false,
  perCompetency: { C1: { a: 1, b: 0 }, C2: { a: 1, b: 0 }, C3: { a: 1, b: 0 }, C4: { a: 1, b: 0 }, C5: { a: 1, b: 0 } },
};

export interface CompetencyEvaluation {
  score: number;
  justification: string;
  evidence: string[];
  references: string[];
}

export interface EvaluatorRun {
  evaluator: string;
  method: 'llm' | 'modelo-estatistico';
  model: string | null;
  annulment: { code: AnnulmentCode; explanation: string } | null;
  tangencia: boolean;
  humanRightsViolation: boolean;
  competencies: Record<CompetencyId, CompetencyEvaluation>;
  total: number;
  generalComment: string;
}

export interface CompetencyResult {
  competency: CompetencyId;
  score: number;
  level: string;
  justification: string;
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
  discrepancy: { total: number; maxCompetency: number; thirdEvaluator: boolean } | null;
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
}

const DISCREPANCY_TOTAL = 100;
const DISCREPANCY_COMPETENCY = 80;

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

const SYSTEM_PROMPT = `Você é avaliador(a) da redação do Enem, formado(a) em Letras, treinado(a) pela Matriz de Referência do Inep.
Avalie a redação de forma independente, competência por competência, usando SOMENTE os critérios dos trechos da cartilha fornecidos.
Regras:
- Cada competência recebe exatamente um destes valores: 0, 40, 80, 120, 160 ou 200. Escolha o nível cujo descritor melhor descreve o texto.
- Fundamente cada nota com trechos copiados LITERALMENTE da redação (até 3 por competência) e com os ids dos trechos da cartilha usados.
- Anulação (nota zero total) só nos casos da cartilha: fuga total ao tema, não atendimento ao tipo dissertativo-argumentativo, parte deliberadamente desconectada, identificação, texto predominantemente em língua estrangeira. Na dúvida, não anule.
- Tangenciamento (abordagem só do assunto amplo) limita C2, C3 e C5 a 40.
- Proposta que desrespeite os direitos humanos zera a C5.
- Trechos marcados como "critério operacional da Lumina" não são texto do Inep: use-os como guia de consistência, sem dizer que são da cartilha.
- Escreva as justificativas em português, dirigidas ao(à) estudante, diretas e específicas (2 a 4 frases), apontando o que levou ao nível e o que faria subir.
Responda APENAS com um objeto JSON válido, sem texto antes ou depois.`;

function buildPrompt(input: GradeInput, analysis: EssayTextAnalysis, contexts: CompetencyContext[], zeroAlerts: string[]): string {
  const contextText = contexts
    .map(({ competency, grade, chunks }) => {
      const levels = grade.niveis.map((n) => `  ${n.nota}: ${n.descritor}`).join('\n');
      const extra = chunks.map((c) => `  [${c.id}] ${c.titulo} (${c.citacao}): ${c.texto}`).join('\n');
      return `### ${competency} — ${grade.descricao}\n[${competency.toLowerCase()}-niveis] Níveis (${grade.citacao}):\n${levels}\n${extra}`;
    })
    .join('\n\n');
  const signals = [
    `Parágrafos: ${analysis.paragraphs}; linhas: ${analysis.lines} (${analysis.linesSource}); palavras: ${analysis.words}; períodos: ${analysis.sentences}; maior período: ${analysis.longestSentenceWords} palavras.`,
    `Conectivos distintos: ${analysis.connectives.distinct} (${Object.entries(analysis.connectives.byRelation).map(([r, l]) => `${r}: ${l?.join(', ')}`).join('; ') || 'nenhum'}).`,
    `Proposta (parágrafo ${analysis.proposal.paragraph ?? '—'}): ${Object.entries(analysis.proposal.elements).map(([k, v]) => `${k}=${v ?? 'não encontrado'}`).join(', ')}.`,
    ...analysis.warnings.map((w) => `Alerta: ${w}`),
    ...zeroAlerts.map((w) => `Possível anulação (confira lendo o texto): ${w}`),
  ].join('\n');
  return `TEMA: ${input.theme || '(não informado — avalie a coerência interna e não anule por fuga ao tema)'}

TRECHOS DA CARTILHA (fonte dos critérios):
${contextText}

SINAIS AUTOMÁTICOS DO TEXTO (são indícios a conferir, não notas):
${signals}

REDAÇÃO:
"""
${input.text}
"""

Formato da resposta:
{"anulacao": null ou {"motivo": "FUGA_AO_TEMA"|"TIPO_TEXTUAL"|"PARTE_DESCONECTADA"|"IDENTIFICACAO"|"LINGUA_ESTRANGEIRA", "explicacao": "..."},
 "tangenciamento": false,
 "direitos_humanos_desrespeitados": false,
 "competencias": {
   "C1": {"nota": 0, "justificativa": "...", "trechos": ["..."], "referencias": ["c1-niveis"]},
   "C2": {...}, "C3": {...}, "C4": {...}, "C5": {...}
 },
 "comentario_geral": "..."}`;
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

export function parseEvaluation(raw: unknown, essay: string, allowedRefs: Set<string>, calibration: LlmCalibration, label: string, model: string): EvaluatorRun {
  const data = (raw ?? {}) as Record<string, unknown>;
  const comps = (data.competencias ?? {}) as Record<string, Record<string, unknown> | undefined>;
  const annulmentRaw = data.anulacao as { motivo?: string; explicacao?: string } | null | undefined;
  const annulment =
    annulmentRaw && typeof annulmentRaw === 'object' && VALID_ANNULMENTS.includes(annulmentRaw.motivo as AnnulmentCode)
      ? { code: annulmentRaw.motivo as AnnulmentCode, explanation: String(annulmentRaw.explicacao ?? '').slice(0, 800) }
      : null;
  const tangencia = data.tangenciamento === true;
  const humanRightsViolation = data.direitos_humanos_desrespeitados === true;

  const competencies = {} as Record<CompetencyId, CompetencyEvaluation>;
  for (const id of COMPETENCY_IDS) {
    const c = comps[id] ?? {};
    const rawScore = Number(c.nota);
    if (!Number.isFinite(rawScore)) throw new Error(`Avaliação sem nota numérica em ${id}.`);
    const { a, b } = calibration.perCompetency[id];
    let score = snapToLevel(a * Math.min(200, Math.max(0, rawScore)) + b);
    if (tangencia && (id === 'C2' || id === 'C3' || id === 'C5')) score = Math.min(score, 40);
    if (humanRightsViolation && id === 'C5') score = 0;
    const refs = Array.isArray(c.referencias) ? c.referencias.filter((r): r is string => typeof r === 'string' && allowedRefs.has(r)) : [];
    competencies[id] = {
      score,
      justification: String(c.justificativa ?? '').trim().slice(0, 1500),
      evidence: verifiedEvidence(c.trechos, essay),
      references: [...new Set(refs)],
    };
  }
  if (annulment) for (const id of COMPETENCY_IDS) competencies[id].score = 0;
  const total = COMPETENCY_IDS.reduce((sum, id) => sum + competencies[id].score, 0);
  return {
    evaluator: label,
    method: 'llm',
    model,
    annulment,
    tangencia,
    humanRightsViolation,
    competencies,
    total,
    generalComment: String(data.comentario_geral ?? '').trim().slice(0, 2000),
  };
}

export function discrepancyBetween(a: EvaluatorRun, b: EvaluatorRun) {
  const maxCompetency = Math.max(...COMPETENCY_IDS.map((id) => Math.abs(a.competencies[id].score - b.competencies[id].score)));
  const total = Math.abs(a.total - b.total);
  return { total, maxCompetency, discrepant: total > DISCREPANCY_TOTAL || maxCompetency > DISCREPANCY_COMPETENCY };
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

export class EssayGrader {
  constructor(private readonly deps: GraderDependencies) {}

  private async contexts(analysis: EssayTextAnalysis): Promise<CompetencyContext[]> {
    const perCompetency = this.deps.chunksPerCompetency ?? 3;
    return Promise.all(
      COMPETENCY_IDS.map(async (competency) => {
        const [grade, hits] = await Promise.all([
          this.deps.tools.gradeCompetencia(competency),
          this.deps.tools.buscarCartilha({ consulta: buildCompetencyQuery(competency, analysis), competencia: competency, limite: perCompetency + 1 }),
        ]);
        return { competency, grade, chunks: hits.filter((hit) => hit.id !== `${competency.toLowerCase()}-niveis`).slice(0, perCompetency) };
      }),
    );
  }

  private async runLlm(label: string, temperature: number, prompt: string, input: GradeInput, allowedRefs: Set<string>): Promise<EvaluatorRun | null> {
    // Duas tentativas: modelo gratuito às vezes devolve JSON quebrado.
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await this.deps.llm({ system: SYSTEM_PROMPT, prompt, temperature, maxTokens: 2500 });
      if (!result) return null;
      try {
        return parseEvaluation(extractJson(result.text), input.text, allowedRefs, this.deps.calibration ?? IDENTITY_CALIBRATION, label, result.model);
      } catch (error) {
        lastError = error;
      }
    }
    throw new Error(`${label}: resposta inválida do modelo (${lastError instanceof Error ? lastError.message : String(lastError)}).`);
  }

  /**
   * Uma única avaliação (um avaliador), sem o segundo nem o terceiro — usada
   * pela validação com redações já corrigidas, que mede o avaliador isolado
   * e ajusta a calibração. Devolve null quando a regra zera sem IA.
   */
  async evaluateOnce(input: GradeInput, temperature = 0.2): Promise<EvaluatorRun | null> {
    const analysis = await this.deps.tools.analisarRedacao({ texto: input.text, tema: input.theme || undefined, linhas_ocr: input.ocrLines });
    const zero = await this.deps.tools.verificarNotaZero({ texto: input.text, tema: input.theme || undefined, linhas_ocr: input.ocrLines });
    if (zero.anulacao_certa.length) return null;
    const contexts = await this.contexts(analysis);
    const allowedRefs = new Set(contexts.flatMap((c) => [`${c.competency.toLowerCase()}-niveis`, ...c.chunks.map((h) => h.id)]));
    const prompt = buildPrompt(input, analysis, contexts, zero.alertas_para_conferir.map((a) => a.detail));
    return this.runLlm('avaliador-1', temperature, prompt, input, allowedRefs);
  }

  async grade(input: GradeInput): Promise<EssayGradeResult> {
    const tools = this.deps.tools;
    const analysis = await tools.analisarRedacao({ texto: input.text, tema: input.theme || undefined, linhas_ocr: input.ocrLines });
    const zero = await tools.verificarNotaZero({ texto: input.text, tema: input.theme || undefined, linhas_ocr: input.ocrLines });

    const certain = zero.anulacao_certa[0];
    if (certain) return annulledResult(certain.code as AnnulmentCode, certain.detail, analysis, [], tools, 'regra');

    const contexts = await this.contexts(analysis);
    const gradeById = new Map(contexts.map((c) => [c.competency, c.grade]));
    const allowedRefs = new Set(contexts.flatMap((c) => [`${c.competency.toLowerCase()}-niveis`, ...c.chunks.map((h) => h.id)]));
    const chunkInfo = new Map<string, { title: string; citation: string }>();
    for (const c of contexts) {
      chunkInfo.set(`${c.competency.toLowerCase()}-niveis`, { title: `Níveis da ${c.competency}`, citation: c.grade.citacao });
      for (const h of c.chunks) chunkInfo.set(h.id, { title: h.titulo, citation: h.citacao });
    }
    const prompt = buildPrompt(input, analysis, contexts, zero.alertas_para_conferir.map((a) => a.detail));

    const first = await this.runLlm('avaliador-1', 0.2, prompt, input, allowedRefs);
    const runs: EvaluatorRun[] = [];
    let method: EssayGradeResult['method'];
    let discrepancy: EssayGradeResult['discrepancy'] = null;

    if (!first) {
      // Sem provedor de IA: só o modelo estatístico, com confiança baixa.
      if (!this.deps.featureModel) throw new Error('Correção indisponível: nenhum provedor de IA configurado e modelo estatístico não treinado.');
      runs.push(featureRun(this.deps.featureModel, analysis, input.text));
      method = 'modelo-estatistico';
    } else {
      runs.push(first);
      const second = await this.runLlm('avaliador-2', 0.7, prompt, input, allowedRefs);
      if (second) runs.push(second);
      method = 'dois-avaliadores';
      if (second) {
        const d = discrepancyBetween(first, second);
        const annulmentDisagrees = Boolean(first.annulment) !== Boolean(second.annulment);
        discrepancy = { total: d.total, maxCompetency: d.maxCompetency, thirdEvaluator: d.discrepant || annulmentDisagrees };
        if (d.discrepant || annulmentDisagrees) {
          const third = await this.runLlm('avaliador-3', 0.4, prompt, input, allowedRefs);
          if (third) runs.push(third);
          method = 'tres-avaliadores';
        }
      }
    }

    const pair: EvaluatorRun[] = runs.length >= 2 ? closestPair(runs) : runs;
    // Anulação só quando as duas avaliações finais concordam nela.
    if (pair.every((run) => run.annulment)) {
      const a = pair[0].annulment!;
      return annulledResult(a.code, a.explanation, analysis, runs, tools, method);
    }
    const scored = pair.filter((run) => !run.annulment);
    const lead = scored[0];

    const competencies: CompetencyResult[] = COMPETENCY_IDS.map((id) => {
      // Média das duas avaliações; múltiplo de 20, como a média de dois níveis.
      const score = Math.round(scored.reduce((sum, run) => sum + run.competencies[id].score, 0) / scored.length / 20) * 20;
      const refs = [...new Set(scored.flatMap((run) => run.competencies[id].references))];
      return {
        competency: id,
        score,
        level: levelText(gradeById.get(id), score),
        justification: lead.competencies[id].justification,
        evidence: dedupeQuotes(scored.flatMap((run) => run.competencies[id].evidence)).slice(0, 3),
        citations: (refs.length ? refs : [`${id.toLowerCase()}-niveis`]).map((ref) => ({ id: ref, ...(chunkInfo.get(ref) ?? { title: ref, citation: '' }) })),
      };
    });
    const total = competencies.reduce((sum, c) => sum + c.score, 0);

    let confidence = method === 'modelo-estatistico' ? 0.35 : method === 'tres-avaliadores' ? 0.6 : runs.length >= 2 ? 0.85 : 0.65;
    if (input.ocrConfidence !== undefined) confidence *= 0.5 + 0.5 * Math.min(1, Math.max(0, input.ocrConfidence));

    return {
      total,
      annulment: null,
      competencies,
      generalFeedback: lead.generalComment,
      confidence: Number(confidence.toFixed(2)),
      method,
      discrepancy,
      runs,
      analysis,
      toolCalls: [...tools.calls],
      calibrated: method !== 'modelo-estatistico' && (this.deps.calibration?.fitted ?? false),
    };
  }
}
