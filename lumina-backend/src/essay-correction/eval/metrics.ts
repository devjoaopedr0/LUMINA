/**
 * Métricas de concordância entre a correção automática e a humana.
 *
 * A principal é a do próprio Inep: duas correções "concordam" quando não são
 * discrepantes — diferença de até 100 pontos no total e de até 80 em cada
 * competência (cartilha 2025, p. 6). É a régua que decide se, no Enem, uma
 * terceira correção seria chamada.
 */
import { CompetencyId, COMPETENCY_IDS } from '../knowledge';

export interface ScoredPair {
  human: Record<CompetencyId, number>;
  predicted: Record<CompetencyId, number>;
}

const total = (s: Record<CompetencyId, number>) => COMPETENCY_IDS.reduce((sum, id) => sum + s[id], 0);

export function mae(values: [number, number][]): number {
  return values.length ? values.reduce((s, [a, b]) => s + Math.abs(a - b), 0) / values.length : NaN;
}

export function pearson(values: [number, number][]): number {
  const n = values.length;
  if (n < 2) return NaN;
  const mx = values.reduce((s, [a]) => s + a, 0) / n;
  const my = values.reduce((s, [, b]) => s + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (const [a, b] of values) {
    sxy += (a - mx) * (b - my);
    sxx += (a - mx) ** 2;
    syy += (b - my) ** 2;
  }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0;
}

/** Kappa ponderado quadrático (QWK) sobre os níveis 0..5 — padrão em correção automática de redação. */
export function quadraticWeightedKappa(values: [number, number][], levels = 6, step = 40): number {
  const n = values.length;
  if (!n) return NaN;
  const o = Array.from({ length: levels }, () => new Array<number>(levels).fill(0));
  const ha = new Array<number>(levels).fill(0);
  const hb = new Array<number>(levels).fill(0);
  for (const [a, b] of values) {
    const i = Math.min(levels - 1, Math.max(0, Math.round(a / step)));
    const j = Math.min(levels - 1, Math.max(0, Math.round(b / step)));
    o[i][j]++;
    ha[i]++;
    hb[j]++;
  }
  let num = 0;
  let den = 0;
  for (let i = 0; i < levels; i++) {
    for (let j = 0; j < levels; j++) {
      const w = (i - j) ** 2 / (levels - 1) ** 2;
      num += w * o[i][j];
      den += w * ((ha[i] * hb[j]) / n);
    }
  }
  return den ? 1 - num / den : 1;
}

export interface AgreementReport {
  n: number;
  totalMae: number;
  totalPearson: number;
  /** Fração sem discrepância pela regra do Inep (≤100 no total e ≤80 em cada competência). */
  inepAgreement: number;
  /** Fração com diferença ≤ 100 no total. */
  within100Total: number;
  /** Viés: média de (previsto − humano) no total. */
  totalBias: number;
  perCompetency: Record<CompetencyId, { mae: number; qwk: number; exact: number; within40: number; bias: number }>;
}

export function agreementReport(pairs: ScoredPair[]): AgreementReport {
  const perCompetency = {} as AgreementReport['perCompetency'];
  for (const id of COMPETENCY_IDS) {
    const v = pairs.map((p) => [p.human[id], p.predicted[id]] as [number, number]);
    perCompetency[id] = {
      mae: round(mae(v)),
      qwk: round(quadraticWeightedKappa(v), 3),
      exact: round(v.filter(([a, b]) => a === b).length / v.length, 3),
      within40: round(v.filter(([a, b]) => Math.abs(a - b) <= 40).length / v.length, 3),
      bias: round(v.reduce((s, [a, b]) => s + (b - a), 0) / v.length),
    };
  }
  const totals = pairs.map((p) => [total(p.human), total(p.predicted)] as [number, number]);
  return {
    n: pairs.length,
    totalMae: round(mae(totals)),
    totalPearson: round(pearson(totals), 3),
    inepAgreement: round(
      pairs.filter((p) => Math.abs(total(p.human) - total(p.predicted)) <= 100 && COMPETENCY_IDS.every((id) => Math.abs(p.human[id] - p.predicted[id]) <= 80)).length / pairs.length,
      3,
    ),
    within100Total: round(totals.filter(([a, b]) => Math.abs(a - b) <= 100).length / totals.length, 3),
    totalBias: round(totals.reduce((s, [a, b]) => s + (b - a), 0) / totals.length),
    perCompetency,
  };
}

function round(value: number, digits = 1): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

/** Ajuste linear y ≈ a·x + b por mínimos quadrados, com a limitado (encolhe calibração com pouca amostra). */
export function fitLinear(values: [number, number][], aMin = 0.5, aMax = 1.5): { a: number; b: number } {
  const n = values.length;
  if (n < 3) return { a: 1, b: 0 };
  const mx = values.reduce((s, [x]) => s + x, 0) / n;
  const my = values.reduce((s, [, y]) => s + y, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (const [x, y] of values) {
    sxy += (x - mx) * (y - my);
    sxx += (x - mx) ** 2;
  }
  const a = sxx ? Math.min(aMax, Math.max(aMin, sxy / sxx)) : 1;
  return { a: round(a, 3), b: round(my - a * mx, 1) };
}
