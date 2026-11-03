/**
 * Leitura óptica do cartão-resposta (OMR), determinística e sem IA.
 *
 * Entrada: a página já digitalizada no aparelho (recorte, perspectiva e luz
 * corrigidos pelo doc-scanner do app), em tons de cinza. Mesmo assim o
 * alinhamento final é feito aqui, pelos 4 marcadores pretos impressos: a
 * homografia marcador → imagem corrige o que o recorte do aparelho deixou
 * de erro, e cada bolha é amostrada no próprio espaço da folha (mm).
 *
 * Decisão por questão (regras do Enem para o cartão: em branco ou com mais de
 * uma marcação conta como erro), com confiança e motivo, para a revisão
 * humana olhar só o que é duvidoso.
 */
import { CODE_BITS, decodeSheetCode, MmPoint, SheetLayout } from './sheet-layout';

export interface GrayImage {
  width: number;
  height: number;
  /** Luminância 0–255, uma por pixel, linha a linha. */
  data: Uint8Array;
}

export type QuestionStatus = 'OK' | 'BLANK' | 'MULTIPLE' | 'AMBIGUOUS';

export interface QuestionReading {
  number: number;
  /** Alternativa lida (1 = A …), ou null em branco / múltipla / ambígua. */
  selected: number | null;
  status: QuestionStatus;
  /** 0–1. Abaixo de LOW_CONFIDENCE vai para revisão. */
  confidence: number;
  /** Preenchimento medido de cada bolha (0 = papel, 1 = tinta). */
  fills: number[];
  /** Caixa da questão na imagem (px), para recortar na revisão. */
  box: { x: number; y: number; width: number; height: number };
  /** Centro e raio (px) de cada bolha na imagem — a conferência desenha e deixa tocar. */
  bubbles: { x: number; y: number; r: number }[];
}

export interface SheetReading {
  code: number | null;
  /** Rotação aplicada (0, 90, 180, 270) para o código conferir. */
  rotation: 0 | 90 | 180 | 270;
  /** Limiar de marcação adotado para esta folha. */
  threshold: number;
  questions: QuestionReading[];
  warnings: string[];
  fiducials: MmPoint[];
}

export const LOW_CONFIDENCE = 0.75;

export class OmrError extends Error {}

// ---------------------------------------------------------------- álgebra

function solve(a: number[][], b: number[]): number[] {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
    [m[col], m[pivot]] = [m[pivot], m[col]];
    const p = m[col][col];
    if (Math.abs(p) < 1e-12) throw new OmrError('Marcadores alinhados de forma impossível.');
    for (let j = col; j <= n; j++) m[col][j] /= p;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = m[r][col];
      for (let j = col; j <= n; j++) m[r][j] -= f * m[col][j];
    }
  }
  return m.map((row) => row[n]);
}

export function homography(from: MmPoint[], to: MmPoint[]): number[] {
  const a: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    a.push([from[i].x, from[i].y, 1, 0, 0, 0, -to[i].x * from[i].x, -to[i].x * from[i].y]);
    b.push(to[i].x);
    a.push([0, 0, 0, from[i].x, from[i].y, 1, -to[i].y * from[i].x, -to[i].y * from[i].y]);
    b.push(to[i].y);
  }
  return [...solve(a, b), 1];
}

export function project(h: number[], p: MmPoint): MmPoint {
  const d = h[6] * p.x + h[7] * p.y + h[8];
  return { x: (h[0] * p.x + h[1] * p.y + h[2]) / d, y: (h[3] * p.x + h[4] * p.y + h[5]) / d };
}

function sample(img: GrayImage, x: number, y: number): number {
  const fx = Math.min(img.width - 1.001, Math.max(0, x));
  const fy = Math.min(img.height - 1.001, Math.max(0, y));
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const dx = fx - x0;
  const dy = fy - y0;
  const i = y0 * img.width + x0;
  const top = img.data[i] * (1 - dx) + img.data[i + 1] * dx;
  const bottom = img.data[i + img.width] * (1 - dx) + img.data[i + img.width + 1] * dx;
  return top * (1 - dy) + bottom * dy;
}

// ------------------------------------------------------------ marcadores

interface Blob {
  cx: number;
  cy: number;
  area: number;
  w: number;
  h: number;
}

function darkBlobs(img: GrayImage, x0: number, y0: number, x1: number, y1: number, threshold: number): Blob[] {
  const w = x1 - x0;
  const h = y1 - y0;
  const seen = new Uint8Array(w * h);
  const blobs: Blob[] = [];
  const stack: number[] = [];
  for (let start = 0; start < w * h; start++) {
    if (seen[start]) continue;
    const sx = start % w;
    const sy = (start - sx) / w;
    if (img.data[(y0 + sy) * img.width + x0 + sx] >= threshold) continue;
    let area = 0, sumX = 0, sumY = 0, minX = sx, maxX = sx, minY = sy, maxY = sy;
    seen[start] = 1;
    stack.push(start);
    while (stack.length) {
      const p = stack.pop()!;
      const px = p % w;
      const py = (p - px) / w;
      area++;
      sumX += px;
      sumY += py;
      if (px < minX) minX = px;
      if (px > maxX) maxX = px;
      if (py < minY) minY = py;
      if (py > maxY) maxY = py;
      for (const [nx, ny] of [[px - 1, py], [px + 1, py], [px, py - 1], [px, py + 1]]) {
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const q = ny * w + nx;
        if (seen[q] || img.data[(y0 + ny) * img.width + x0 + nx] >= threshold) continue;
        seen[q] = 1;
        stack.push(q);
      }
    }
    blobs.push({ cx: x0 + sumX / area, cy: y0 + sumY / area, area, w: maxX - minX + 1, h: maxY - minY + 1 });
  }
  return blobs;
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

/**
 * Acha os 4 marcadores: em cada canto da imagem, a mancha escura mais
 * "quadrado cheio" do tamanho esperado, a mais próxima do canto.
 */
export function locateFiducials(img: GrayImage, layout: SheetLayout): MmPoint[] {
  const pxPerMm = img.width / layout.page.width;
  const expectedSide = layout.fiducialSize * pxPerMm;
  const winW = Math.round(img.width * 0.22);
  const winH = Math.round(img.height * 0.16);
  const corners: [number, number][] = [[0, 0], [img.width - winW, 0], [img.width - winW, img.height - winH], [0, img.height - winH]];
  const outer: MmPoint[] = [{ x: 0, y: 0 }, { x: img.width, y: 0 }, { x: img.width, y: img.height }, { x: 0, y: img.height }];
  const names = ['superior esquerdo', 'superior direito', 'inferior direito', 'inferior esquerdo'];
  return corners.map(([x0, y0], i) => {
    const values: number[] = [];
    for (let y = y0; y < y0 + winH; y += 3) for (let x = x0; x < x0 + winW; x += 3) values.push(img.data[y * img.width + x]);
    const paper = percentile(values, 0.9);
    const blobs = darkBlobs(img, x0, y0, x0 + winW, y0 + winH, paper * 0.5);
    const candidates = blobs.filter((b) => {
      const side = Math.sqrt(b.area);
      const aspect = b.w / b.h;
      const solidity = b.area / (b.w * b.h);
      return side > expectedSide * 0.45 && side < expectedSide * 2.2 && aspect > 0.55 && aspect < 1.8 && solidity > 0.6;
    });
    if (!candidates.length) throw new OmrError(`Não achamos o marcador preto do canto ${names[i]}. Fotografe a folha inteira, com os quatro quadrados pretos aparecendo.`);
    candidates.sort((a, b) => Math.hypot(a.cx - outer[i].x, a.cy - outer[i].y) - Math.hypot(b.cx - outer[i].x, b.cy - outer[i].y));
    return { x: candidates[0].cx, y: candidates[0].cy };
  });
}

// ------------------------------------------------------------ amostragem

/**
 * Preenchimento de uma área circular (ou quadrada) no espaço da folha:
 * (papel − interior) / papel, com o "papel" medido num anel em volta. O
 * interior usa 65% do raio — fica de fora o contorno impresso da bolha.
 */
function fillAt(img: GrayImage, h: number[], center: MmPoint, r: number, square = false): number {
  const inner: number[] = [];
  const ring: number[] = [];
  for (let i = 0; i < 9; i++) {
    for (let j = 0; j < 9; j++) {
      const u = (i / 8) * 2 - 1;
      const v = (j / 8) * 2 - 1;
      if (!square && u * u + v * v > 1) continue;
      const p = project(h, { x: center.x + u * r * 0.65, y: center.y + v * r * 0.65 });
      inner.push(sample(img, p.x, p.y));
    }
  }
  for (let k = 0; k < 24; k++) {
    const angle = (k / 24) * Math.PI * 2;
    for (const f of square ? [1.6, 1.75] : [1.22, 1.36]) {
      const p = project(h, { x: center.x + Math.cos(angle) * r * f, y: center.y + Math.sin(angle) * r * f });
      ring.push(sample(img, p.x, p.y));
    }
  }
  const paper = Math.max(40, percentile(ring, 0.8));
  const ink = inner.reduce((s, v) => s + v, 0) / inner.length;
  return Math.min(1, Math.max(0, (paper - ink) / paper));
}

/** Otsu sobre valores contínuos 0–1 (histograma de 100 classes). */
function otsu(values: number[]): number {
  const bins = new Array<number>(101).fill(0);
  for (const v of values) bins[Math.round(Math.min(1, Math.max(0, v)) * 100)]++;
  const total = values.length;
  let sum = 0;
  for (let i = 0; i <= 100; i++) sum += i * bins[i];
  let sumB = 0, wB = 0, best = -1, t = 40;
  for (let i = 0; i <= 100; i++) {
    wB += bins[i];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += i * bins[i];
    const between = wB * wF * (sumB / wB - (sum - sumB) / wF) ** 2;
    if (between > best) {
      best = between;
      t = i;
    }
  }
  return (t + 0.5) / 100;
}

const ROTATIONS = [0, 90, 180, 270] as const;

/** Correspondência marcador da folha → marcador achado, para cada rotação da foto. */
function rotatedTargets(found: MmPoint[], rotation: (typeof ROTATIONS)[number]): MmPoint[] {
  const shift = rotation / 90;
  return found.map((_, i) => found[(i + shift) % 4]);
}

export function readSheet(img: GrayImage, layout: SheetLayout): SheetReading {
  if (img.width < 300 || img.height < 400) throw new OmrError('Imagem pequena demais para ler as bolhas.');
  const found = locateFiducials(img, layout);
  const warnings: string[] = [];

  // A folha pode ter sido fotografada girada: vale a rotação em que o código confere.
  let chosen: { rotation: (typeof ROTATIONS)[number]; h: number[]; code: number | null } | null = null;
  for (const rotation of ROTATIONS) {
    const h = homography(layout.fiducials, rotatedTargets(found, rotation));
    const bits = layout.codeCells.map((cell) => fillAt(img, h, { x: cell.x + cell.size / 2, y: cell.y + cell.size / 2 }, cell.size / 2, true) > 0.45);
    const code = bits.length === CODE_BITS ? decodeSheetCode(bits) : null;
    if (code !== null) {
      chosen = { rotation, h, code };
      break;
    }
    if (!chosen) chosen = { rotation: 0, h: rotation === 0 ? h : homography(layout.fiducials, found), code: null };
  }
  const { h, rotation, code } = chosen!;
  if (code === null) warnings.push('Não deu para ler o código da folha (faixa de quadrados do topo). Confira se é o cartão deste simulado.');

  const pxPerMm = Math.hypot(found[1].x - found[0].x, found[1].y - found[0].y) / Math.hypot(layout.fiducials[1].x - layout.fiducials[0].x, layout.fiducials[1].y - layout.fiducials[0].y);
  if (pxPerMm < 3.2) warnings.push('Resolução baixa: aproxime a câmera para as bolhas ficarem nítidas.');

  const raw = layout.questions.map((q) => q.bubbles.map((b) => fillAt(img, h, b, b.r)));
  // Limiar por folha: as bolhas vazias e as marcadas formam dois grupos; Otsu
  // separa os dois, preso numa faixa razoável (caneta clara, lápis, folha toda em branco).
  const all = raw.flat();
  const contrastGroup = all.filter((v) => v > 0.3).length;
  const threshold = contrastGroup >= Math.max(1, layout.questions.length * 0.1) ? Math.min(0.5, Math.max(0.3, otsu(all))) : 0.4;

  const questions: QuestionReading[] = layout.questions.map((q, qi) => {
    const fills = raw[qi].map((f) => Number(f.toFixed(3)));
    const order = fills.map((f, i) => ({ f, i })).sort((a, b) => b.f - a.f);
    const top = order[0];
    const second = order[1] ?? { f: 0, i: -1 };
    const marked = order.filter((o) => o.f >= threshold);
    let status: QuestionStatus;
    let selected: number | null = null;
    let confidence: number;
    if (marked.length === 1) {
      // Marca clara e as demais bem abaixo: confiança alta.
      const margin = Math.min((top.f - threshold) / 0.15, (top.f - second.f) / 0.3);
      if (second.f > threshold * 0.75) {
        status = 'AMBIGUOUS';
        confidence = Math.max(0.2, Math.min(0.7, 0.4 + margin * 0.3));
      } else {
        status = 'OK';
        selected = q.bubbles[top.i].position;
        confidence = Math.min(0.99, 0.6 + 0.4 * Math.min(1, margin));
      }
    } else if (marked.length === 0) {
      if (top.f > threshold * 0.7) {
        status = 'AMBIGUOUS';
        confidence = 0.4;
      } else {
        status = 'BLANK';
        confidence = Math.min(0.99, 0.6 + (threshold * 0.7 - top.f) / threshold);
      }
    } else {
      status = 'MULTIPLE';
      // Duas marcas fortes de verdade: é dupla marcação (alta confiança).
      // Uma bem mais fraca que a outra: pode ser rasura — revisão.
      confidence = marked[1].f > top.f * 0.7 ? 0.9 : 0.5;
    }
    if (status === 'OK' && confidence < LOW_CONFIDENCE) status = 'AMBIGUOUS';
    if (status === 'AMBIGUOUS') selected = top.f >= threshold ? q.bubbles[top.i].position : null;

    const corners = [
      { x: q.label.x - 1, y: q.label.y - 3.2 },
      { x: q.bubbles[q.bubbles.length - 1].x + 3, y: q.label.y - 3.2 },
      { x: q.bubbles[q.bubbles.length - 1].x + 3, y: q.label.y + 3.2 },
      { x: q.label.x - 1, y: q.label.y + 3.2 },
    ].map((p) => project(h, p));
    const xs = corners.map((p) => p.x);
    const ys = corners.map((p) => p.y);
    const box = { x: Math.max(0, Math.floor(Math.min(...xs))), y: Math.max(0, Math.floor(Math.min(...ys))), width: Math.ceil(Math.max(...xs) - Math.min(...xs)), height: Math.ceil(Math.max(...ys) - Math.min(...ys)) };
    const bubbles = q.bubbles.map((b) => {
      const c = project(h, b);
      const edge = project(h, { x: b.x + b.r, y: b.y });
      return { x: Number(c.x.toFixed(1)), y: Number(c.y.toFixed(1)), r: Number(Math.hypot(edge.x - c.x, edge.y - c.y).toFixed(1)) };
    });
    return { number: q.number, selected, status, confidence: Number(confidence.toFixed(2)), fills, box, bubbles };
  });

  const blanks = questions.filter((q) => q.status === 'BLANK').length;
  if (blanks === questions.length) warnings.push('Nenhuma bolha marcada foi encontrada. A foto é do cartão preenchido?');
  return { code, rotation, threshold: Number(threshold.toFixed(3)), questions, warnings, fiducials: found };
}
