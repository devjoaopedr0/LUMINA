/**
 * Modelo de atributos treinado com redações já avaliadas (Essay-BR).
 *
 * Papel: (1) dar uma nota de referência que funciona sem IA nenhuma
 * (AI_PROVIDER=mock ou provedor fora do ar); (2) servir de "segundo
 * avaliador" independente do modelo de linguagem — se os dois discordam
 * além do limite de discrepância do Inep, a correção pede uma terceira
 * leitura, como no Enem.
 *
 * É uma regressão ridge por competência sobre atributos da análise
 * determinística; os pesos vêm de `scripts/essay-eval/train.ts` e ficam em
 * `feature-model.json`. Sem o JSON (modelo não treinado), não há previsão.
 */
import { CompetencyId, COMPETENCY_IDS } from '../knowledge';
import { EssayTextAnalysis } from '../analysis/text-analysis';

export const FEATURE_NAMES = [
  'bias',
  'log_words',
  'paragraphs',
  'paragraphs_3_to_5',
  'sentences_per_paragraph',
  'avg_sentence_words',
  'long_sentence',
  'lexical_diversity',
  'connectives_distinct',
  'connectives_per_100_words',
  'connective_relations',
  'paragraphs_without_link_ratio',
  'overused_connectives',
  'repeated_words',
  'informal_markers',
  'proposal_elements',
  'proposal_has_agent',
  'proposal_has_means',
  'proposal_has_purpose',
  'human_rights_flags',
  'short_text',
  'comma_per_sentence',
  'uppercase_after_period_ratio',
  'lowercase_sentence_start_ratio',
] as const;

export type FeatureName = (typeof FEATURE_NAMES)[number];

export function extractFeatures(analysis: EssayTextAnalysis, text: string): number[] {
  const sentences = Math.max(1, analysis.sentences);
  const paragraphs = Math.max(1, analysis.paragraphs);
  const commas = (text.match(/,/g) ?? []).length;
  const starts = text.match(/[.!?]\s+(\p{L})/gu) ?? [];
  const lowerStarts = starts.filter((m) => /\p{Ll}$/u.test(m)).length;
  const values: Record<FeatureName, number> = {
    bias: 1,
    log_words: Math.log1p(analysis.words),
    paragraphs: Math.min(analysis.paragraphs, 8),
    paragraphs_3_to_5: analysis.paragraphs >= 3 && analysis.paragraphs <= 5 ? 1 : 0,
    sentences_per_paragraph: Math.min(sentences / paragraphs, 10),
    avg_sentence_words: Math.min(analysis.avgSentenceWords, 80) / 10,
    long_sentence: analysis.longestSentenceWords > 60 ? 1 : 0,
    lexical_diversity: analysis.lexicalDiversity,
    connectives_distinct: Math.min(analysis.connectives.distinct, 20) / 5,
    connectives_per_100_words: analysis.words ? Math.min((analysis.connectives.total / analysis.words) * 100, 10) : 0,
    connective_relations: Object.keys(analysis.connectives.byRelation).length / 5,
    paragraphs_without_link_ratio: analysis.paragraphs > 1 ? analysis.connectives.paragraphsWithoutLink.length / (analysis.paragraphs - 1) : 1,
    overused_connectives: Math.min(analysis.connectives.overused.length, 4),
    repeated_words: Math.min(analysis.repeatedWords.length, 8) / 4,
    informal_markers: Math.min(analysis.informalMarkers.length, 4),
    proposal_elements: analysis.proposal.count,
    proposal_has_agent: analysis.proposal.elements.agente ? 1 : 0,
    proposal_has_means: analysis.proposal.elements.meio ? 1 : 0,
    proposal_has_purpose: analysis.proposal.elements.finalidade ? 1 : 0,
    human_rights_flags: Math.min(analysis.humanRightsFlags.length, 2),
    short_text: analysis.words < 150 ? 1 : 0,
    comma_per_sentence: Math.min(commas / sentences, 8),
    uppercase_after_period_ratio: starts.length ? (starts.length - lowerStarts) / starts.length : 1,
    lowercase_sentence_start_ratio: starts.length ? lowerStarts / starts.length : 0,
  };
  return FEATURE_NAMES.map((name) => values[name]);
}

/** Resolve (XᵀX + λI)w = Xᵀy por eliminação de Gauss; o viés não é penalizado. */
export function fitRidge(x: number[][], y: number[], lambda: number): number[] {
  const d = x[0].length;
  const a = Array.from({ length: d }, () => new Array<number>(d + 1).fill(0));
  for (let r = 0; r < x.length; r++) {
    const row = x[r];
    for (let i = 0; i < d; i++) {
      a[i][d] += row[i] * y[r];
      for (let j = 0; j < d; j++) a[i][j] += row[i] * row[j];
    }
  }
  for (let i = 1; i < d; i++) a[i][i] += lambda;
  for (let col = 0; col < d; col++) {
    let pivot = col;
    for (let r = col + 1; r < d; r++) if (Math.abs(a[r][col]) > Math.abs(a[pivot][col])) pivot = r;
    [a[col], a[pivot]] = [a[pivot], a[col]];
    const p = a[col][col] || 1e-12;
    for (let j = col; j <= d; j++) a[col][j] /= p;
    for (let r = 0; r < d; r++) {
      if (r === col || !a[r][col]) continue;
      const factor = a[r][col];
      for (let j = col; j <= d; j++) a[r][j] -= factor * a[col][j];
    }
  }
  return a.map((row) => row[d]);
}

export interface FeatureModelWeights {
  version: 1;
  trainedAt: string;
  dataset: string;
  trainSize: number;
  /** Média e desvio de cada atributo no treino, para padronizar. */
  mean: number[];
  std: number[];
  weights: Record<CompetencyId, number[]>;
  /** Erro médio absoluto por competência no conjunto de teste. */
  testMae?: Record<CompetencyId, number>;
}

export function standardize(features: number[], mean: number[], std: number[]): number[] {
  return features.map((value, i) => (i === 0 ? 1 : (value - mean[i]) / (std[i] || 1)));
}

/** Arredonda para o nível válido mais próximo (0, 40, …, 200). */
export function snapToLevel(score: number): number {
  return Math.min(200, Math.max(0, Math.round(score / 40) * 40));
}

export function predictWithFeatureModel(model: FeatureModelWeights, features: number[]): Record<CompetencyId, number> {
  const z = standardize(features, model.mean, model.std);
  const out = {} as Record<CompetencyId, number>;
  for (const id of COMPETENCY_IDS) {
    const w = model.weights[id];
    out[id] = z.reduce((sum, value, i) => sum + value * (w[i] ?? 0), 0);
  }
  return out;
}
