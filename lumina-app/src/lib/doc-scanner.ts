/**
 * Digitalização de documento no aparelho, no estilo CamScanner — sem
 * bibliotecas externas e sem enviar a foto crua para o servidor:
 *
 * 1. detectDocument: acha os quatro cantos da folha na foto.
 * 2. warpPerspective: "desentorta" a folha (homografia) num retângulo.
 * 3. enhanceDocument: tira a sombra e uniformiza a luz (divide a imagem por
 *    uma estimativa do fundo do papel), estica o contraste e, opcionalmente,
 *    deixa em tons de cinza ou preto e branco.
 *
 * Tudo opera em RasterImage (RGBA, igual ao ImageData do canvas), então dá
 * para testar no Node sem navegador.
 */

export interface RasterImage {
  width: number;
  height: number;
  /** RGBA, 4 bytes por pixel, linha a linha. */
  data: Uint8ClampedArray;
}

export interface Point {
  x: number;
  y: number;
}

/** Cantos em ordem: superior esquerdo, superior direito, inferior direito, inferior esquerdo. */
export type Quad = [Point, Point, Point, Point];

export type EnhanceMode = 'color' | 'gray' | 'bw';

export interface DetectionResult {
  quad: Quad;
  /** 0–1: quanto a região achada parece uma folha (preenchimento do quadrilátero). */
  confidence: number;
  /** false quando não achou a folha e devolveu a imagem inteira com margem. */
  found: boolean;
}

export function createRaster(width: number, height: number, fill = 255): RasterImage {
  const data = new Uint8ClampedArray(width * height * 4).fill(fill);
  return { width, height, data };
}

export function toGray(img: RasterImage): Float32Array {
  const out = new Float32Array(img.width * img.height);
  for (let i = 0, p = 0; i < out.length; i++, p += 4) out[i] = 0.299 * img.data[p] + 0.587 * img.data[p + 1] + 0.114 * img.data[p + 2];
  return out;
}

/** Reduz por média de área até o maior lado caber em `maxSide`. */
export function downscale(img: RasterImage, maxSide: number): { image: RasterImage; scale: number } {
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  if (scale === 1) return { image: img, scale };
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const out = createRaster(w, h);
  const fx = img.width / w;
  const fy = img.height / h;
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor(y * fy);
    const y1 = Math.max(y0 + 1, Math.floor((y + 1) * fy));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x * fx);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * fx));
      let r = 0, g = 0, b = 0, n = 0;
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const p = (yy * img.width + xx) * 4;
          r += img.data[p]; g += img.data[p + 1]; b += img.data[p + 2]; n++;
        }
      }
      const q = (y * w + x) * 4;
      out.data[q] = r / n; out.data[q + 1] = g / n; out.data[q + 2] = b / n; out.data[q + 3] = 255;
    }
  }
  return { image: out, scale: w / img.width };
}

/** Desfoque de caixa separável (raio r), em O(n) por passada. */
export function boxBlur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  if (r < 1) return src.slice();
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  for (let y = 0; y < h; y++) {
    let acc = 0;
    const row = y * w;
    for (let x = -r; x <= r; x++) acc += src[row + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = acc / (2 * r + 1);
      acc += src[row + Math.min(w - 1, x + r + 1)] - src[row + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = acc / (2 * r + 1);
      acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  return out;
}

/** Máximo local (dilatação em tons de cinza) — apaga traços escuros finos, como a letra. */
export function maxFilter(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let m = 0;
      for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r); k++) m = Math.max(m, src[y * w + k]);
      tmp[y * w + x] = m;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let m = 0;
      for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r); k++) m = Math.max(m, tmp[k * w + x]);
      out[y * w + x] = m;
    }
  }
  return out;
}

export function otsuThreshold(gray: Float32Array): number {
  const hist = new Array<number>(256).fill(0);
  for (const v of gray) hist[Math.min(255, Math.max(0, Math.round(v)))]++;
  const total = gray.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, best = 0, threshold = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) { best = between; threshold = t; }
  }
  return threshold;
}

/** Maior região conectada (4-vizinhança) da máscara; devolve os pixels dela. */
function largestComponent(mask: Uint8Array, w: number, h: number): { pixels: number[]; area: number } {
  const label = new Int32Array(w * h);
  let best: number[] = [];
  let next = 1;
  const stack: number[] = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || label[start]) continue;
    const pixels: number[] = [];
    stack.push(start);
    label[start] = next;
    while (stack.length) {
      const p = stack.pop()!;
      pixels.push(p);
      const x = p % w;
      const y = (p - x) / w;
      const neighbours = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1];
      for (const n of neighbours) {
        if (n >= 0 && mask[n] && !label[n]) { label[n] = next; stack.push(n); }
      }
    }
    if (pixels.length > best.length) best = pixels;
    next++;
  }
  return { pixels: best, area: best.length };
}

function cross(o: Point, a: Point, b: Point) {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

/** Envoltória convexa (cadeia monótona de Andrew). */
export function convexHull(points: Point[]): Point[] {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (pts.length < 3) return pts;
  const lower: Point[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Point[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

export function polygonArea(points: Point[]): number {
  let a = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const q = points[(i + 1) % points.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

/** Ordena 4 pontos como TL, TR, BR, BL. */
export function orderQuad(points: Point[]): Quad {
  const bySum = [...points].sort((a, b) => a.x + a.y - (b.x + b.y));
  const byDiff = [...points].sort((a, b) => a.x - a.y - (b.x - b.y));
  return [bySum[0], byDiff[byDiff.length - 1], bySum[bySum.length - 1], byDiff[0]];
}

/** Os 4 vértices da envoltória que formam o quadrilátero de maior área. */
function bestQuadFromHull(hull: Point[]): Point[] {
  let candidates = hull;
  if (candidates.length > 16) {
    // Reduz a envoltória aos pontos mais "pontudos" (maior desvio angular).
    const scored = candidates.map((p, i) => {
      const a = candidates[(i - 1 + candidates.length) % candidates.length];
      const b = candidates[(i + 1) % candidates.length];
      const v1 = Math.atan2(p.y - a.y, p.x - a.x);
      const v2 = Math.atan2(b.y - p.y, b.x - p.x);
      let turn = Math.abs(v2 - v1);
      if (turn > Math.PI) turn = 2 * Math.PI - turn;
      return { p, i, turn };
    });
    candidates = scored.sort((x, y) => y.turn - x.turn).slice(0, 16).sort((x, y) => x.i - y.i).map((s) => s.p);
  }
  let best = candidates.slice(0, 4);
  let bestArea = -1;
  const n = candidates.length;
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) for (let c = b + 1; c < n; c++) for (let d = c + 1; d < n; d++) {
    const quad = [candidates[a], candidates[b], candidates[c], candidates[d]];
    const area = polygonArea(quad);
    if (area > bestArea) { bestArea = area; best = quad; }
  }
  return best;
}

function insetQuad(w: number, h: number, margin = 0.03): Quad {
  const mx = w * margin;
  const my = h * margin;
  return [{ x: mx, y: my }, { x: w - mx, y: my }, { x: w - mx, y: h - my }, { x: mx, y: h - my }];
}

/**
 * Acha a folha: o papel é a maior região clara e contínua da foto. Limiar de
 * Otsu sobre a imagem desfocada separa papel de fundo; fechamento morfológico
 * tapa os buracos da letra e das linhas; a maior região vira envoltória
 * convexa; e o quadrilátero de maior área inscrito nela dá os cantos.
 */
export function detectDocument(img: RasterImage): DetectionResult {
  const { image: small, scale } = downscale(img, 480);
  const w = small.width;
  const h = small.height;
  const gray = boxBlur(boxBlur(toGray(small), w, h, 2), w, h, 2);
  const t = otsuThreshold(gray);
  // Fechamento (dilata o claro e depois o reduz) para a letra não furar a folha.
  const closed = maxFilter(gray, w, h, 3);
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < mask.length; i++) mask[i] = closed[i] > t ? 1 : 0;
  const { pixels, area } = largestComponent(mask, w, h);
  const fallback: DetectionResult = { quad: scaleQuad(insetQuad(w, h), 1 / scale), confidence: 0, found: false };
  // Região minúscula, ou que cobre o quadro inteiro (sem fundo visível: ou a
  // folha preenche a foto ou não há folha) — cantos ficam para o aluno ajustar.
  if (area < w * h * 0.12 || area > w * h * 0.97) return fallback;
  // O papel tem de ser claramente mais claro que o fundo.
  let inside = 0;
  let outside = 0;
  for (let i = 0; i < mask.length; i++) {
    if (mask[i]) inside += gray[i];
    else outside += gray[i];
  }
  if (inside / Math.max(1, area) - outside / Math.max(1, mask.length - area) < 25) return fallback;

  // Só os pixels de borda da região entram na envoltória (bem menos pontos).
  const border: Point[] = [];
  for (const p of pixels) {
    const x = p % w;
    const y = (p - x) / w;
    if (x === 0 || y === 0 || x === w - 1 || y === h - 1 || !mask[p - 1] || !mask[p + 1] || !mask[p - w] || !mask[p + w]) border.push({ x, y });
  }
  const hull = convexHull(border);
  if (hull.length < 4) return fallback;
  const quad = orderQuad(bestQuadFromHull(hull));
  const quadArea = polygonArea(quad);
  if (quadArea < w * h * 0.15) return fallback;
  // Folha que ocupa a foto inteira: a região encosta nas quatro bordas.
  const confidence = Math.min(1, area / quadArea);
  return { quad: scaleQuad(quad, 1 / scale), confidence: Number(confidence.toFixed(2)), found: confidence > 0.75 };
}

export function scaleQuad(quad: Quad, factor: number): Quad {
  return quad.map((p) => ({ x: p.x * factor, y: p.y * factor })) as Quad;
}

/** Resolve A·x = b (8×8) por eliminação de Gauss com pivotamento parcial. */
function solve(a: number[][], b: number[]): number[] {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
    [m[col], m[pivot]] = [m[pivot], m[col]];
    const p = m[col][col];
    if (Math.abs(p) < 1e-12) throw new Error('Cantos degenerados: não formam um quadrilátero.');
    for (let j = col; j <= n; j++) m[col][j] /= p;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = m[r][col];
      for (let j = col; j <= n; j++) m[r][j] -= f * m[col][j];
    }
  }
  return m.map((row) => row[n]);
}

/** Homografia H (3×3, h33 = 1) que leva cada ponto `from[i]` em `to[i]`. */
export function homography(from: Point[], to: Point[]): number[] {
  const a: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = from[i];
    const { x: u, y: v } = to[i];
    a.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    a.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  return [...solve(a, b), 1];
}

export function applyHomography(hm: number[], p: Point): Point {
  const d = hm[6] * p.x + hm[7] * p.y + hm[8];
  return { x: (hm[0] * p.x + hm[1] * p.y + hm[2]) / d, y: (hm[3] * p.x + hm[4] * p.y + hm[5]) / d };
}

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** Tamanho de saída: a média dos lados opostos do quadrilátero, limitada a `maxSide`. */
export function outputSize(quad: Quad, maxSide = 1800): { width: number; height: number } {
  const width = (dist(quad[0], quad[1]) + dist(quad[3], quad[2])) / 2;
  const height = (dist(quad[0], quad[3]) + dist(quad[1], quad[2])) / 2;
  const s = Math.min(1, maxSide / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * s)), height: Math.max(1, Math.round(height * s)) };
}

/** Desentorta a região do quadrilátero num retângulo, com interpolação bilinear. */
export function warpPerspective(img: RasterImage, quad: Quad, size = outputSize(quad)): RasterImage {
  const { width, height } = size;
  const out = createRaster(width, height);
  // Mapeamento inverso: para cada pixel do destino, de onde ele vem na foto.
  const inv = homography([{ x: 0, y: 0 }, { x: width - 1, y: 0 }, { x: width - 1, y: height - 1 }, { x: 0, y: height - 1 }], quad);
  const sw = img.width;
  const sh = img.height;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const src = applyHomography(inv, { x, y });
      const fx = Math.min(sw - 1.001, Math.max(0, src.x));
      const fy = Math.min(sh - 1.001, Math.max(0, src.y));
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const dx = fx - x0;
      const dy = fy - y0;
      const p00 = (y0 * sw + x0) * 4;
      const p10 = p00 + 4;
      const p01 = p00 + sw * 4;
      const p11 = p01 + 4;
      const q = (y * width + x) * 4;
      for (let c = 0; c < 3; c++) {
        const top = img.data[p00 + c] * (1 - dx) + img.data[p10 + c] * dx;
        const bottom = img.data[p01 + c] * (1 - dx) + img.data[p11 + c] * dx;
        out.data[q + c] = top * (1 - dy) + bottom * dy;
      }
      out.data[q + 3] = 255;
    }
  }
  return out;
}

/** Amplia um mapa (w×h) para W×H com interpolação bilinear. */
function upsample(src: Float32Array, w: number, h: number, W: number, H: number): Float32Array {
  const out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    const fy = Math.min(h - 1.001, Math.max(0, ((y + 0.5) * h) / H - 0.5));
    const y0 = Math.floor(fy);
    const dy = fy - y0;
    for (let x = 0; x < W; x++) {
      const fx = Math.min(w - 1.001, Math.max(0, ((x + 0.5) * w) / W - 0.5));
      const x0 = Math.floor(fx);
      const dx = fx - x0;
      const a = src[y0 * w + x0] * (1 - dx) + src[y0 * w + x0 + 1] * dx;
      const b = src[(y0 + 1) * w + x0] * (1 - dx) + src[(y0 + 1) * w + x0 + 1] * dx;
      out[y * W + x] = a * (1 - dy) + b * dy;
    }
  }
  return out;
}

/**
 * Remove sombra e luz desigual: estima o "branco do papel" em cada ponto
 * (reduz a imagem, apaga a letra com um filtro de máximo, suaviza e amplia de
 * volta) e divide a foto por ele. Depois estica o contraste entre os
 * percentis de tinta e de papel.
 */
export function enhanceDocument(img: RasterImage, mode: EnhanceMode = 'color'): RasterImage {
  const { width: W, height: H } = img;
  const gray = toGray(img);
  const factor = Math.max(1, Math.round(Math.max(W, H) / 160));
  const w = Math.max(2, Math.floor(W / factor));
  const h = Math.max(2, Math.floor(H / factor));
  const small = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let m = 0;
      // Máximo do bloco: o papel, não a tinta.
      for (let yy = y * factor; yy < Math.min(H, (y + 1) * factor); yy++) {
        for (let xx = x * factor; xx < Math.min(W, (x + 1) * factor); xx++) m = Math.max(m, gray[yy * W + xx]);
      }
      small[y * w + x] = m;
    }
  }
  const background = upsample(boxBlur(maxFilter(small, w, h, 2), w, h, 3), w, h, W, H);

  const out = createRaster(W, H);
  const norm = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) norm[i] = Math.min(1.2, gray[i] / Math.max(24, background[i]));
  // Percentis para o contraste: 2% mais escuros (tinta) e 60% (papel).
  const sorted = Float32Array.from(norm).sort();
  const ink = sorted[Math.floor(sorted.length * 0.02)];
  const paper = Math.max(ink + 0.05, sorted[Math.floor(sorted.length * 0.6)]);
  const stretch = (v: number) => Math.min(1, Math.max(0, (v - ink) / (paper - ink)));

  for (let i = 0, p = 0; i < W * H; i++, p += 4) {
    const level = stretch(norm[i]);
    if (mode === 'bw') {
      const v = level > 0.72 ? 255 : 0;
      out.data[p] = out.data[p + 1] = out.data[p + 2] = v;
    } else if (mode === 'gray') {
      out.data[p] = out.data[p + 1] = out.data[p + 2] = Math.round(255 * level ** 1.4);
    } else {
      // Cor: aplica o mesmo ganho de luz em cada canal (preserva a tinta azul).
      const gain = (255 * level ** 1.4) / Math.max(1, gray[i]);
      for (let c = 0; c < 3; c++) out.data[p + c] = Math.min(255, img.data[p + c] * gain);
    }
    out.data[p + 3] = 255;
  }
  return out;
}

export function rotate90(img: RasterImage, clockwise = true): RasterImage {
  const out = createRaster(img.height, img.width);
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const nx = clockwise ? img.height - 1 - y : y;
      const ny = clockwise ? x : img.width - 1 - x;
      const s = (y * img.width + x) * 4;
      const d = (ny * out.width + nx) * 4;
      out.data[d] = img.data[s];
      out.data[d + 1] = img.data[s + 1];
      out.data[d + 2] = img.data[s + 2];
      out.data[d + 3] = 255;
    }
  }
  return out;
}

/** Desvio-padrão da luminância numa região — usado para medir sombra que sobrou. */
export function luminanceStd(img: RasterImage, region?: { x0: number; y0: number; x1: number; y1: number }): number {
  const r = region ?? { x0: 0, y0: 0, x1: img.width, y1: img.height };
  let sum = 0, sq = 0, n = 0;
  for (let y = r.y0; y < r.y1; y++) {
    for (let x = r.x0; x < r.x1; x++) {
      const p = (y * img.width + x) * 4;
      const v = 0.299 * img.data[p] + 0.587 * img.data[p + 1] + 0.114 * img.data[p + 2];
      sum += v; sq += v * v; n++;
    }
  }
  const mean = sum / n;
  return Math.sqrt(Math.max(0, sq / n - mean * mean));
}
