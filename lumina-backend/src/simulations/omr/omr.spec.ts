import { describe, expect, it } from 'vitest';
import { GrayImage, homography, LOW_CONFIDENCE, OmrError, project, readSheet } from './omr';
import { buildSheetLayout, CODE_BITS, decodeSheetCode, defaultSheetOptions, encodeSheetCode, MAX_SHEET_CODE, SheetLayout } from './sheet-layout';

/** Tinta de cada marca: 1 = caneta preta cheia; 0.35 = lápis fraco. */
type Marks = Record<number, { position: number; ink: number }[]>;

/** Desenha a folha impressa e preenchida, em mm → px, numa imagem de página. */
function renderPage(layout: SheetLayout, code: number, marks: Marks, pxPerMm = 6): GrayImage {
  const width = Math.round(layout.page.width * pxPerMm);
  const height = Math.round(layout.page.height * pxPerMm);
  const data = new Uint8Array(width * height).fill(245);
  const dark = (x: number, y: number, v: number) => {
    const xi = Math.round(x);
    const yi = Math.round(y);
    if (xi >= 0 && yi >= 0 && xi < width && yi < height) data[yi * width + xi] = Math.min(data[yi * width + xi], v);
  };
  const rect = (x: number, y: number, w: number, h: number, v: number, outline = false) => {
    for (let yy = y * pxPerMm; yy < (y + h) * pxPerMm; yy++) {
      for (let xx = x * pxPerMm; xx < (x + w) * pxPerMm; xx++) {
        const edge = xx - x * pxPerMm < 2 || (x + w) * pxPerMm - xx < 2 || yy - y * pxPerMm < 2 || (y + h) * pxPerMm - yy < 2;
        if (!outline || edge) dark(xx, yy, v);
      }
    }
  };
  const s = layout.fiducialSize;
  for (const f of layout.fiducials) rect(f.x - s / 2, f.y - s / 2, s, s, 15);
  const bits = encodeSheetCode(code);
  layout.codeCells.forEach((c, i) => rect(c.x, c.y, c.size, c.size, 20, !bits[i]));
  for (const q of layout.questions) {
    // número da questão
    rect(q.label.x, q.label.y - 1, 3, 2, 60);
    for (const b of q.bubbles) {
      const cx = b.x * pxPerMm;
      const cy = b.y * pxPerMm;
      const r = b.r * pxPerMm;
      const mark = marks[q.number]?.find((m) => m.position === b.position);
      for (let yy = cy - r - 2; yy <= cy + r + 2; yy++) {
        for (let xx = cx - r - 2; xx <= cx + r + 2; xx++) {
          const d = Math.hypot(xx - cx, yy - cy);
          if (Math.abs(d - r) < 1.2) dark(xx, yy, 110); // contorno impresso
          else if (d < r * 0.35) dark(xx, yy, 180); // letra clara impressa dentro
          if (mark && d < r * 0.95) dark(xx, yy, Math.round(245 - 225 * mark.ink));
        }
      }
    }
  }
  return { width, height, data };
}

/**
 * Simula o que chega do aparelho: a página já recortada, mas com erro de
 * recorte (cantos deslocados), luz desigual e ruído.
 */
function photograph(page: GrayImage, cornerJitter: number[], seed = 3): GrayImage {
  const W = 1100;
  const H = Math.round((W * page.height) / page.width);
  const out = new Uint8Array(W * H);
  const pageCorners = [
    { x: cornerJitter[0], y: cornerJitter[1] },
    { x: page.width + cornerJitter[2], y: cornerJitter[3] },
    { x: page.width + cornerJitter[4], y: page.height + cornerJitter[5] },
    { x: cornerJitter[6], y: page.height + cornerJitter[7] },
  ];
  const h = homography([{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }], pageCorners);
  let s = seed;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = project(h, { x, y });
      const xi = Math.round(p.x);
      const yi = Math.round(p.y);
      const v = xi >= 0 && yi >= 0 && xi < page.width && yi < page.height ? page.data[yi * page.width + xi] : 90;
      const light = 0.78 + 0.22 * (x / W) * (0.6 + 0.4 * (y / H));
      out[y * W + x] = Math.max(0, Math.min(255, v * light + (rnd() - 0.5) * 14));
    }
  }
  return { width: W, height: H, data: out };
}

function rotate180(img: GrayImage): GrayImage {
  return { width: img.width, height: img.height, data: Uint8Array.from(img.data).reverse() };
}

const ANSWERS = [1, 2, 3, 4, 5, 1, 2, 3, 4, 5, 2, 4, 1, 3, 5, 2, 2, 1, 4, 3];
function markedSheet(): Marks {
  const marks: Marks = {};
  ANSWERS.forEach((pos, i) => (marks[i + 1] = [{ position: pos, ink: 0.95 }]));
  delete marks[5]; // em branco
  marks[7] = [{ position: 2, ink: 0.95 }, { position: 4, ink: 0.9 }]; // dupla marcação
  marks[9] = [{ position: 4, ink: 0.3 }]; // lápis fraco
  marks[11] = [{ position: 2, ink: 0.95 }, { position: 3, ink: 0.4 }]; // rasura
  marks[13] = [{ position: 1, ink: 0.6 }]; // caneta azul mais clara, mas inequívoca
  return marks;
}

describe('Layout do cartão-resposta', () => {
  it('cabe na folha, sem bolhas sobrepostas, para 1 a 180 questões', () => {
    for (const n of [1, 10, 30, 45, 90, 120, 180]) {
      const layout = buildSheetLayout(Array.from({ length: n }, (_, i) => (i % 4) + 2));
      const bubbles = layout.questions.flatMap((q) => q.bubbles);
      for (const b of bubbles) {
        expect(b.x - b.r).toBeGreaterThan(12);
        expect(b.x + b.r).toBeLessThan(198);
        expect(b.y + b.r).toBeLessThan(280);
      }
      for (let i = 0; i < bubbles.length; i++) {
        for (let j = i + 1; j < bubbles.length; j++) {
          expect(Math.hypot(bubbles[i].x - bubbles[j].x, bubbles[i].y - bubbles[j].y)).toBeGreaterThan(bubbles[i].r * 2.2);
        }
      }
    }
    expect(() => buildSheetLayout([])).toThrow();
    expect(() => buildSheetLayout([6])).toThrow();
  });

  it('código da folha: ida e volta e verificação contra leitura errada', () => {
    for (const code of [0, 1, 12345, MAX_SHEET_CODE]) expect(decodeSheetCode(encodeSheetCode(code))).toBe(code);
    const bits = encodeSheetCode(4242);
    bits[3] = !bits[3];
    expect(decodeSheetCode(bits)).toBeNull();
    expect(decodeSheetCode(encodeSheetCode(4242).reverse())).not.toBe(4242);
    expect(encodeSheetCode(7)).toHaveLength(CODE_BITS);
  });
});

describe('Leitura óptica (OMR)', () => {
  const layout = buildSheetLayout(ANSWERS.map(() => 5));
  const page = renderPage(layout, 90210, markedSheet());

  function check(reading: ReturnType<typeof readSheet>) {
    expect(reading.code).toBe(90210);
    const by = new Map(reading.questions.map((q) => [q.number, q]));
    // Marcas inequívocas: lidas com confiança alta.
    for (const n of [1, 2, 3, 4, 6, 8, 10, 12, 14, 15, 16, 17, 18, 19, 20, 13]) {
      expect(by.get(n)).toMatchObject({ status: 'OK', selected: ANSWERS[n - 1] });
      expect(by.get(n)!.confidence).toBeGreaterThanOrEqual(LOW_CONFIDENCE);
    }
    expect(by.get(5)).toMatchObject({ status: 'BLANK', selected: null });
    expect(by.get(7)).toMatchObject({ status: 'MULTIPLE', selected: null });
    // Lápis fraco e rasura: nunca decididos sozinhos — vão para revisão.
    expect(by.get(9)!.status).toBe('AMBIGUOUS');
    expect(by.get(9)!.confidence).toBeLessThan(LOW_CONFIDENCE);
    expect(['AMBIGUOUS', 'MULTIPLE']).toContain(by.get(11)!.status);
    expect(by.get(11)!.confidence).toBeLessThan(LOW_CONFIDENCE);
  }

  it('lê respostas, branco, dupla marcação e marcas duvidosas numa página bem recortada', () => {
    check(readSheet(photograph(page, [0, 0, 0, 0, 0, 0, 0, 0]), layout));
  });

  it('corrige o erro de recorte do aparelho pelos marcadores (cantos deslocados até ~2%)', () => {
    check(readSheet(photograph(page, [-25, 18, 20, -22, 30, 25, -18, 28]), layout));
  });

  it('folha fotografada de cabeça para baixo: acha a rotação pelo código', () => {
    const reading = readSheet(rotate180(photograph(page, [10, -8, -12, 6, 8, 10, -6, -9])), layout);
    expect(reading.rotation).toBe(180);
    check(reading);
  });

  it('caixa de cada questão aponta para a linha certa na imagem (recorte da revisão)', () => {
    const img = photograph(page, [0, 0, 0, 0, 0, 0, 0, 0]);
    const reading = readSheet(img, layout);
    const q1 = reading.questions[0].box;
    const q20 = reading.questions[19].box;
    expect(q1.y).toBeLessThan(q20.y);
    expect(q1.width).toBeGreaterThan(q1.height * 3);
    expect(q20.y + q20.height).toBeLessThanOrEqual(img.height);
  });

  it('90 questões (modelo Enem) em 3 colunas, com pouca resolução por bolha', () => {
    const big = buildSheetLayout(Array.from({ length: 90 }, () => 5));
    const marks: Marks = {};
    for (let n = 1; n <= 90; n++) marks[n] = [{ position: ((n * 7) % 5) + 1, ink: 0.95 }];
    const reading = readSheet(photograph(renderPage(big, 77, marks), [12, -10, -8, 9, 14, 11, -9, 13]), big);
    expect(reading.code).toBe(77);
    const wrong = reading.questions.filter((q) => q.selected !== ((q.number * 7) % 5) + 1);
    expect(wrong.map((q) => `${q.number}:${q.status}:${q.fills.join('/')}`)).toEqual([]);
  });

  it('sem marcadores, explica o que falta em vez de inventar respostas', () => {
    const blank: GrayImage = { width: 1100, height: 1556, data: new Uint8Array(1100 * 1556).fill(240) };
    expect(() => readSheet(blank, layout)).toThrow(OmrError);
    expect(() => readSheet(blank, layout)).toThrow(/marcador preto/);
  });
});

describe('PDF do cartão-resposta', () => {
  it('ida e volta: várias folhas num PDF, lidas na ordem e com os mesmos pixels', async () => {
    const { extractPdfImages, grayImagesToPdf } = await import('./pdf');
    const a: GrayImage = { width: 640, height: 900, data: new Uint8Array(640 * 900).map((_, i) => i % 251) };
    const b: GrayImage = { width: 700, height: 990, data: new Uint8Array(700 * 990).fill(200) };
    const pages = extractPdfImages(grayImagesToPdf([a, b]));
    expect(pages.map((p) => `${p.width}x${p.height}`)).toEqual(['640x900', '700x990']);
    expect(Buffer.from(pages[0].data).equals(Buffer.from(a.data))).toBe(true);
  });

  it('lê o cartão direto do PDF (foto → PDF → leitura)', async () => {
    const { extractPdfImages, grayImagesToPdf } = await import('./pdf');
    const layout = buildSheetLayout(ANSWERS.map(() => 5));
    const photo = photograph(renderPage(layout, 31337, markedSheet()), [8, -6, -10, 7, 9, 8, -7, 10]);
    const [page] = extractPdfImages(grayImagesToPdf([photo]));
    const reading = readSheet(page, layout);
    expect(reading.code).toBe(31337);
    expect(reading.questions[0]).toMatchObject({ status: 'OK', selected: ANSWERS[0] });
    // Cada bolha tem posição na imagem: a conferência desenha e deixa tocar.
    const b = reading.questions[0].bubbles[ANSWERS[0] - 1];
    expect(page.data[Math.round(b.y) * page.width + Math.round(b.x)]).toBeLessThan(120);
    expect(reading.questions[0].bubbles).toHaveLength(5);
  });

  it('recusa PDF com foto em JPEG e arquivo que não é PDF, explicando', async () => {
    const { extractPdfImages, PdfError } = await import('./pdf');
    const { decodePdf } = await import('./answer-sheet-scan.service');
    const jpegPdf = Buffer.from(['%PDF-1.4', '1 0 obj', '<< /Type /XObject /Subtype /Image /Width 10 /Height 10 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length 4 >>', 'stream', 'abcd', 'endstream', 'endobj', ''].join(String.fromCharCode(10)), 'latin1');
    expect(() => extractPdfImages(jpegPdf)).toThrow(PdfError);
    expect(() => extractPdfImages(jpegPdf)).toThrow(/JPEG/);
    expect(() => extractPdfImages(Buffer.from('%PDF-1.4 %%EOF'))).toThrow(/nenhuma página/);
    expect(() => decodePdf(`data:application/pdf;base64,${Buffer.from('não é pdf').toString('base64')}`)).toThrow('não é um PDF');
    expect(() => decodePdf('data:image/png;base64,AAAA')).toThrow('data URL');
  });

  it('gera PNG válido da página para a conferência', async () => {
    const { grayToPng } = await import('./pdf');
    const png = grayToPng({ width: 3, height: 2, data: Uint8Array.from([0, 128, 255, 10, 20, 30]) });
    expect(png.subarray(1, 4).toString('ascii')).toBe('PNG');
    expect(png.readUInt32BE(16)).toBe(3);
    expect(png.readUInt32BE(20)).toBe(2);
  });

  it('só questões duvidosas exigem conferência; branco e dupla nítidos valem como erro', async () => {
    const { needsReview } = await import('./answer-sheet-scan.service');
    const base = { number: 1, selected: null, fills: [], box: { x: 0, y: 0, width: 1, height: 1 }, bubbles: [] };
    expect(needsReview({ ...base, status: 'BLANK', confidence: 0.95 })).toBe(false);
    expect(needsReview({ ...base, status: 'MULTIPLE', confidence: 0.9 })).toBe(false);
    expect(needsReview({ ...base, status: 'MULTIPLE', confidence: 0.5 })).toBe(true);
    expect(needsReview({ ...base, status: 'AMBIGUOUS', confidence: 0.9 })).toBe(true);
  });
});

/** Desenha também o cabeçalho e as molduras do layout configurável (o que a impressão põe além das bolhas). */
function renderFullPage(layout: SheetLayout, code: number, marks: Marks, pxPerMm = 6): GrayImage {
  const img = renderPage(layout, code, marks, pxPerMm);
  const { width, height, data } = img;
  const dark = (x: number, y: number, v: number) => {
    const xi = Math.round(x * pxPerMm);
    const yi = Math.round(y * pxPerMm);
    if (xi >= 0 && yi >= 0 && xi < width && yi < height) data[yi * width + xi] = Math.min(data[yi * width + xi], v);
  };
  const hLine = (x: number, y: number, w: number, v = 80) => { for (let t = 0; t <= w * pxPerMm; t++) dark(x + t / pxPerMm, y, v); };
  const vLine = (x: number, y: number, h: number, v = 80) => { for (let t = 0; t <= h * pxPerMm; t++) dark(x, y + t / pxPerMm, v); };
  const frame = (x: number, y: number, w: number, h: number) => { hLine(x, y, w); hLine(x, y + h, w); vLine(x, y, h); vLine(x + w, y, h); };
  const block = (x: number, y: number, w: number, h: number, v: number) => { for (let yy = 0; yy <= h * pxPerMm; yy++) for (let xx = 0; xx <= w * pxPerMm; xx++) dark(x + xx / pxPerMm, y + yy / pxPerMm, v); };
  block(22, 11, 70, 6, 40); // título em negrito
  for (const s of layout.sections ?? []) {
    if (s.kind === 'boxes') for (let r = 0; r < s.rows; r++) for (let c = 0; c < s.columns; c++) frame(s.x + c * s.cell, s.y + 4.5 + r * s.cell, s.cell, s.cell);
    else {
      frame(s.x, s.y, s.width, s.height);
      block(s.x, s.y, s.width, 5, 225); // faixa cinza do título
    }
    if (s.kind === 'choices') s.choices.forEach((ch, i) => block(ch.x - ch.r, ch.y - ch.r, ch.r * 2, ch.r * 2, i === 0 ? 30 : 200));
  }
  for (const c of layout.gridColumns ?? []) {
    frame(c.x, c.y, c.width, c.height);
    block(c.x, c.y, c.width, 5.5, 225);
    for (const y of c.rowLines) hLine(c.x, y, c.width, 150);
  }
  return img;
}

describe('Cartão configurável pelo gestor', () => {
  it('2º dia do Enem: numeração 91–180, cabeçalho completo e linhas com folga', () => {
    const layout = buildSheetLayout(Array.from({ length: 90 }, () => 5), defaultSheetOptions({ enemDay: 2 }));
    expect(layout.questions[0].displayNumber).toBe(91);
    expect(layout.questions[89].displayNumber).toBe(180);
    expect(layout.questions[0].number).toBe(1);
    expect(layout.sections?.map((s) => s.kind)).toEqual(['boxes', 'boxes', 'instructions', 'phrase']);
    expect(layout.notes).toEqual([]);
    expect(layout.gridColumns).toHaveLength(4);
    const rowGap = layout.questions[1].label.y - layout.questions[0].label.y;
    expect(rowGap).toBeGreaterThanOrEqual(5.2);
  });

  it('1º dia: quadro da língua estrangeira; cor do caderno só quando o gestor pede', () => {
    const day1 = buildSheetLayout(Array.from({ length: 90 }, () => 5), defaultSheetOptions({ enemDay: 1 }));
    expect(day1.sections?.filter((s) => s.kind === 'choices').map((s) => s.kind === 'choices' && s.key)).toEqual(['language']);
    const both = buildSheetLayout(Array.from({ length: 45 }, () => 5), { ...defaultSheetOptions({ enemDay: 1 }), bookletColors: ['Azul', 'Amarelo', 'Branco', 'Rosa'] });
    const keys = both.sections?.filter((s) => s.kind === 'choices').map((s) => s.kind === 'choices' && s.key);
    expect(keys).toEqual(['booklet', 'language']);
  });

  it('adaptativo: com muitas questões, tira seções do cabeçalho e avisa', () => {
    const layout = buildSheetLayout(Array.from({ length: 180 }, () => 5), { ...defaultSheetOptions({ enemDay: 1 }), bookletColors: ['Azul', 'Rosa'] });
    expect(layout.notes?.length).toBeGreaterThan(0);
    expect(layout.sections?.some((s) => s.kind === 'instructions')).toBe(false);
    expect(layout.sections?.some((s) => s.kind === 'boxes' && s.key === 'student')).toBe(true);
    const last = layout.questions[179];
    expect(last.label.y).toBeLessThan(layout.fiducials[2].y - layout.fiducialSize / 2);
  });

  it('o gestor pode desligar tudo, menos o nome do aluno', () => {
    const layout = buildSheetLayout([5, 5, 5], { showInstitution: false, institutionName: null, instructions: [], phrase: null, bookletColors: [], foreignLanguage: false, firstQuestionNumber: 1 });
    expect(layout.sections?.map((s) => s.kind === 'boxes' && s.key)).toEqual(['student']);
  });

  it('instituição com nome impresso em vez de quadrados', () => {
    const layout = buildSheetLayout([5, 5], { ...defaultSheetOptions(), institutionName: 'Colégio Exemplo' });
    expect(layout.sections?.[0]).toMatchObject({ kind: 'text', text: 'Colégio Exemplo' });
  });

  it('código e marcadores no mesmo lugar em qualquer configuração (a leitura acha o código antes do layout)', () => {
    const probe = buildSheetLayout([2]);
    const custom = buildSheetLayout(Array.from({ length: 90 }, () => 5), { ...defaultSheetOptions({ enemDay: 1 }), bookletColors: ['Azul', 'Rosa'] });
    expect(custom.codeCells).toEqual(probe.codeCells);
    expect(custom.fiducials).toEqual(probe.fiducials);
  });

  it('lê o cartão completo do Enem (cabeçalho, molduras e bolha de língua marcada) sem erro', () => {
    const layout = buildSheetLayout(Array.from({ length: 90 }, () => 5), { ...defaultSheetOptions({ enemDay: 1 }), bookletColors: ['Azul', 'Amarelo', 'Rosa'] });
    const marks: Marks = {};
    for (let n = 1; n <= 90; n++) if (n % 9 !== 0) marks[n] = [{ position: ((n * 3) % 5) + 1, ink: 0.95 }];
    const reading = readSheet(photograph(renderFullPage(layout, 4242, marks), [10, -8, -9, 7, 12, 10, -7, 11]), layout);
    expect(reading.code).toBe(4242);
    const wrong = reading.questions.filter((q) => (q.number % 9 === 0 ? q.status !== 'BLANK' : q.selected !== ((q.number * 3) % 5) + 1));
    expect(wrong.map((q) => `${q.number}:${q.status}:${q.fills.join('/')}`)).toEqual([]);
  });
});
