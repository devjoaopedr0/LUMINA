/**
 * Calibração funcional da nota da IA, por competência e por modelo.
 *
 * Cada modelo distorce a escala de um jeito diferente em cada competência
 * (ex.: comprime a C5 para o meio, é rígido demais na C1). Por isso cada
 * competência tem a própria FUNÇÃO nota_bruta → nota esperada, escolhida
 * por validação cruzada entre três formas:
 *
 * - identidade: a nota do modelo já está na escala certa;
 * - linear: a·bruta + b;
 * - isotônica: uma função monotônica (não decrescente) definida nos seis
 *   níveis 0, 40, …, 200 e interpolada entre eles. Corrige compressões que a
 *   reta não pega (ex.: o modelo dá 120 tanto para 80 quanto para 160).
 *   Em cada nível, a média humana é puxada para a identidade com peso
 *   `PRIOR_WEIGHT`: nível com pouca redação não "decide" sozinho.
 *
 * A forma escolhida é a de menor erro deixando cada redação de fora
 * (leave-one-out), desde que preserve os extremos da escala (ver
 * `preservesExtremes`). Mais complexa só ganha se errar menos — com amostra
 * pequena, isso costuma não acontecer, e fica a identidade.
 */
import { COMPETENCY_IDS, CompetencyId } from '../knowledge';
import { snapToLevel } from './feature-model';

export const LEVELS = [0, 40, 80, 120, 160, 200] as const;
/** Peso (em "redações") da identidade em cada nível da isotônica. */
const PRIOR_WEIGHT = 3;
/**
 * A forma mais complexa precisa errar pelo menos isto a menos (pontos, na
 * validação cruzada). Com 30 redações, ganhos de ~2,5 pontos foram ruído: a
 * calibração escolhida assim piorou o teste em temas inéditos (01/11/2026).
 */
const MIN_GAIN = 3;

export type CalibrationFn =
  | { type: 'identity' }
  | { type: 'linear'; a: number; b: number }
  | { type: 'isotonic'; points: [number, number][] }
  /** Formato antigo (só reta), ainda aceito na leitura. */
  | { type?: undefined; a: number; b: number };

export const IDENTITY_FN: CalibrationFn = { type: 'identity' };

/** Nota calibrada (antes de arredondar ao nível). */
export function applyCalibrationFn(fn: CalibrationFn | undefined, raw: number): number {
  const x = Math.min(200, Math.max(0, raw));
  if (!fn || fn.type === 'identity') return x;
  if (fn.type === 'isotonic') {
    const pts = [...fn.points].sort((p, q) => p[0] - q[0]);
    if (!pts.length) return x;
    if (x <= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i++) {
      const [x1, y1] = pts[i];
      const [x0, y0] = pts[i - 1];
      if (x <= x1) return x1 === x0 ? y1 : y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
    return pts[pts.length - 1][1];
  }
  return Math.min(200, Math.max(0, fn.a * x + fn.b));
}

const round = (v: number, digits = 1) => Math.round(v * 10 ** digits) / 10 ** digits;

/** Mínimos quadrados com inclinação limitada (evita reta degenerada com pouco dado). */
export function fitLinearFn(pairs: [number, number][], aMin = 0.5, aMax = 1.6): CalibrationFn {
  const n = pairs.length;
  if (n < 3) return IDENTITY_FN;
  const mx = pairs.reduce((s, [x]) => s + x, 0) / n;
  const my = pairs.reduce((s, [, y]) => s + y, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (const [x, y] of pairs) {
    sxy += (x - mx) * (y - my);
    sxx += (x - mx) ** 2;
  }
  const a = sxx ? Math.min(aMax, Math.max(aMin, sxy / sxx)) : 1;
  return { type: 'linear', a: round(a, 3), b: round(my - a * mx) };
}

/**
 * Isotônica nos seis níveis: média humana por nível bruto, puxada para a
 * identidade, e depois "pool adjacent violators" para ficar monotônica.
 */
export function fitIsotonicFn(pairs: [number, number][], prior = PRIOR_WEIGHT): CalibrationFn {
  const blocks = LEVELS.map((level) => {
    const ys = pairs.filter(([x]) => snapToLevel(x) === level).map(([, y]) => y);
    const weight = ys.length + prior;
    return { xs: [level as number], value: (ys.reduce((s, y) => s + y, 0) + prior * level) / weight, weight };
  });
  // Pool adjacent violators.
  const stack: typeof blocks = [];
  for (const block of blocks) {
    stack.push({ ...block, xs: [...block.xs] });
    while (stack.length > 1 && stack[stack.length - 2].value > stack[stack.length - 1].value) {
      const b = stack.pop()!;
      const a = stack.pop()!;
      const weight = a.weight + b.weight;
      stack.push({ xs: [...a.xs, ...b.xs], value: (a.value * a.weight + b.value * b.weight) / weight, weight });
    }
  }
  const points: [number, number][] = stack.flatMap((block) => block.xs.map((x) => [x, round(block.value)] as [number, number]));
  return { type: 'isotonic', points };
}

export interface CompetencySelection {
  fn: CalibrationFn;
  /** Erro médio (pontos) de cada forma, deixando cada redação de fora. */
  loo: { identity: number; linear: number; isotonic: number };
  n: number;
  /** Formas que erravam menos mas foram recusadas por achatar os extremos. */
  rejectedForExtremes?: ('linear' | 'isotonic')[];
}

/** Escolhe a forma da calibração de uma competência por validação cruzada. */
export function selectCalibrationFn(pairs: [number, number][]): CompetencySelection {
  const n = pairs.length;
  const err = { identity: 0, linear: 0, isotonic: 0 };
  pairs.forEach(([x, y], i) => {
    const rest = pairs.filter((_, j) => j !== i);
    err.identity += Math.abs(snapToLevel(x) - y);
    err.linear += Math.abs(snapToLevel(applyCalibrationFn(fitLinearFn(rest), x)) - y);
    err.isotonic += Math.abs(snapToLevel(applyCalibrationFn(fitIsotonicFn(rest), x)) - y);
  });
  const loo = { identity: round(err.identity / n), linear: round(err.linear / n), isotonic: round(err.isotonic / n) };
  const candidates = { linear: fitLinearFn(pairs), isotonic: fitIsotonicFn(pairs) };
  const rejected: ('linear' | 'isotonic')[] = [];
  let best: keyof typeof loo = 'identity';
  for (const form of ['linear', 'isotonic'] as const) {
    if (loo[form] > loo[best] - MIN_GAIN) continue;
    if (!preservesExtremes(candidates[form])) {
      rejected.push(form);
      continue;
    }
    best = form;
  }
  const fn = best === 'identity' ? IDENTITY_FN : candidates[best];
  return { fn, loo, n, rejectedForExtremes: rejected };
}

/**
 * A função mantém os extremos da escala: 200 continua 200 e 0 continua 0
 * (depois de arredondar ao nível). Os níveis 0 e 200 são descritores da
 * cartilha ("atende plenamente", "desconhece"). Mínimos quadrados com
 * avaliadores ruidosos puxam os extremos para o meio (regressão à média), e
 * aí nenhuma redação alcançaria 1000 — foi o que aconteceu com as redações
 * nota mil do Inep na validação de 01/11/2026 (1000 → 920).
 */
export function preservesExtremes(fn: CalibrationFn): boolean {
  return snapToLevel(applyCalibrationFn(fn, 200)) === 200 && snapToLevel(applyCalibrationFn(fn, 0)) === 0;
}

/** Calibração de todas as competências a partir de pares (bruta, humana). */
export function fitCalibration(pairs: { raw: Record<CompetencyId, number>; human: Record<CompetencyId, number> }[]) {
  const perCompetency = {} as Record<CompetencyId, CalibrationFn>;
  const selection = {} as Record<CompetencyId, CompetencySelection>;
  for (const id of COMPETENCY_IDS) {
    selection[id] = selectCalibrationFn(pairs.map((p) => [p.raw[id], p.human[id]]));
    perCompetency[id] = selection[id].fn;
  }
  return { perCompetency, selection };
}
