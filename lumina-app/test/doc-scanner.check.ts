import assert from 'node:assert/strict';
import {
  applyHomography,
  createRaster,
  detectDocument,
  enhanceDocument,
  homography,
  luminanceStd,
  orderQuad,
  outputSize,
  rotate90,
  toGray,
  warpPerspective,
  type Point,
  type Quad,
  type RasterImage,
} from '../src/lib/doc-scanner.ts';

// Cena sintética: folha 600×850 vista em perspectiva sobre uma mesa escura,
// com sombra forte do lado esquerdo, linhas de "texto" e uma marca escura
// perto do canto superior esquerdo da folha.
const PAGE = { w: 600, h: 850 };
const SCENE = { w: 1000, h: 1300 };
const trueQuad: Quad = [{ x: 190, y: 130 }, { x: 830, y: 210 }, { x: 900, y: 1180 }, { x: 110, y: 1120 }];

function random(seed: number) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

function pageInk(px: number, py: number): boolean {
  if (px > 40 && px < 100 && py > 40 && py < 100) return true; // marca no canto
  const line = Math.floor((py - 150) / 22);
  return py > 150 && py < 800 && (py - 150) % 22 < 3 && px > 60 && px < 540 - (line % 3) * 40; // linhas de texto
}

function scene(): RasterImage {
  const img = createRaster(SCENE.w, SCENE.h);
  const toPage = homography(trueQuad, [{ x: 0, y: 0 }, { x: PAGE.w, y: 0 }, { x: PAGE.w, y: PAGE.h }, { x: 0, y: PAGE.h }]);
  const rnd = random(7);
  for (let y = 0; y < SCENE.h; y++) {
    for (let x = 0; x < SCENE.w; x++) {
      const p = (y * SCENE.w + x) * 4;
      const pg = applyHomography(toPage, { x, y });
      const shadow = 0.45 + 0.55 * Math.min(1, x / SCENE.w + 0.2); // escurece à esquerda
      let r: number, g: number, b: number;
      if (pg.x >= 0 && pg.x < PAGE.w && pg.y >= 0 && pg.y < PAGE.h) {
        const ink = pageInk(pg.x, pg.y);
        r = ink ? 30 : 235; g = ink ? 40 : 232; b = ink ? 110 : 225; // tinta azul em papel branco
      } else {
        r = 70; g = 50; b = 35; // mesa de madeira
      }
      const noise = (rnd() - 0.5) * 16;
      img.data[p] = r * shadow + noise; img.data[p + 1] = g * shadow + noise; img.data[p + 2] = b * shadow + noise; img.data[p + 3] = 255;
    }
  }
  return img;
}

const photo = scene();
const diag = Math.hypot(SCENE.w, SCENE.h);

// 1. Homografia: ida e volta devolve o mesmo ponto.
const hm = homography(trueQuad, [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }]);
const back = homography([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }], trueQuad);
const probe: Point = { x: 500, y: 600 };
const round = applyHomography(back, applyHomography(hm, probe));
assert.ok(Math.hypot(round.x - probe.x, round.y - probe.y) < 1e-6, 'homografia ida e volta');
assert.deepEqual(orderQuad([trueQuad[2], trueQuad[0], trueQuad[3], trueQuad[1]]), trueQuad, 'ordena cantos TL, TR, BR, BL');

// 2. Detecção: cada canto a menos de 2,5% da diagonal do verdadeiro.
const detection = detectDocument(photo);
assert.ok(detection.found, `folha encontrada (confiança ${detection.confidence})`);
detection.quad.forEach((corner, i) => {
  const error = Math.hypot(corner.x - trueQuad[i].x, corner.y - trueQuad[i].y) / diag;
  assert.ok(error < 0.025, `canto ${i} com erro ${(error * 100).toFixed(1)}% da diagonal`);
});

// 3. Perspectiva: proporção da folha recuperada e a marca volta ao canto superior esquerdo.
const size = outputSize(detection.quad, 900);
assert.ok(Math.abs(size.height / size.width - PAGE.h / PAGE.w) < 0.08, `proporção ${(size.height / size.width).toFixed(2)} ≈ ${(PAGE.h / PAGE.w).toFixed(2)}`);
const flat = warpPerspective(photo, detection.quad, size);
const fg = toGray(flat);
const at = (fx: number, fy: number) => fg[Math.round(fy * flat.height) * flat.width + Math.round(fx * flat.width)];
assert.ok(at(70 / PAGE.w, 70 / PAGE.h) < 90, `marca escura no canto (luminância ${at(70 / PAGE.w, 70 / PAGE.h).toFixed(0)})`);
assert.ok(at(300 / PAGE.w, 830 / PAGE.h) > 100, 'rodapé da folha é papel');

// 4. Realce: a sombra some (papel uniforme) e a tinta continua escura.
const paperRegion = { x0: Math.round(flat.width * 0.12), y0: Math.round(flat.height * 0.955), x1: Math.round(flat.width * 0.88), y1: Math.round(flat.height * 0.985) };
const before = luminanceStd(flat, paperRegion);
for (const mode of ['color', 'gray', 'bw'] as const) {
  const enhanced = enhanceDocument(flat, mode);
  const after = luminanceStd(enhanced, paperRegion);
  assert.ok(after < before * 0.35, `${mode}: sombra no papel ${before.toFixed(1)} → ${after.toFixed(1)}`);
  const eg = toGray(enhanced);
  const ink = eg[Math.round((70 / PAGE.h) * enhanced.height) * enhanced.width + Math.round((70 / PAGE.w) * enhanced.width)];
  const paper = eg[Math.round(0.97 * enhanced.height) * enhanced.width + Math.round(0.5 * enhanced.width)];
  assert.ok(paper - ink > 150, `${mode}: contraste tinta/papel ${ink.toFixed(0)} vs ${paper.toFixed(0)}`);
}
const color = enhanceDocument(flat, 'color');
const ci = (Math.round((70 / PAGE.h) * color.height) * color.width + Math.round((70 / PAGE.w) * color.width)) * 4;
assert.ok(color.data[ci + 2] > color.data[ci], 'modo colorido preserva a tinta azul');

// 5. Sem folha (imagem uniforme): não inventa cantos.
const blank = createRaster(400, 300, 128);
assert.equal(detectDocument(blank).found, false, 'imagem sem folha não é detectada');

// 6. Girar 4 vezes devolve a mesma imagem.
let spun = flat;
for (let i = 0; i < 4; i++) spun = rotate90(spun);
assert.deepEqual(spun.data, flat.data, 'quatro giros de 90° voltam ao original');

console.log(`Doc scanner checks passed: corners within 2.5% (confidence ${detection.confidence}), perspective, shadow removal ${before.toFixed(1)}→${luminanceStd(enhanceDocument(flat, 'color'), paperRegion).toFixed(1)}, ink preserved.`);
