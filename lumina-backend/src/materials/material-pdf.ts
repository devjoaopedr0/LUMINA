import { BadRequestException } from '@nestjs/common';

export const MAX_MATERIAL_PDF_BYTES = 15 * 1024 * 1024;
export const MAX_MATERIAL_PAGES = 300;
const MAX_PAGE_CHARS = 20_000;
const PDF_DATA_URL = /^data:application\/pdf;base64,([A-Za-z0-9+/=\s]*)$/i;

/** Decodifica o data URL do PDF e recusa arquivo vazio, grande ou que não seja PDF. */
export function decodeMaterialPdf(value: string): Buffer {
  const match = PDF_DATA_URL.exec(value.trim());
  if (!match) throw new BadRequestException('Envie o arquivo como PDF.');
  const buffer = Buffer.from(match[1].replace(/\s+/g, ''), 'base64');
  if (!buffer.length) throw new BadRequestException('O PDF enviado está vazio.');
  if (buffer.length > MAX_MATERIAL_PDF_BYTES) throw new BadRequestException('O PDF passa do limite de 15 MB.');
  if (buffer.subarray(0, 1024).indexOf(Buffer.from('%PDF-')) < 0) throw new BadRequestException('O arquivo enviado não parece ser um PDF.');
  return buffer;
}

/** Texto de cada página (pdf.js). PDF digitalizado volta com páginas vazias. */
export async function extractPages(buffer: Buffer): Promise<string[]> {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = getDocument({ data: new Uint8Array(buffer) });
  let doc: Awaited<typeof task.promise>;
  try {
    doc = await task.promise;
  } catch {
    throw new BadRequestException('Não foi possível abrir o PDF enviado.');
  }
  try {
    if (doc.numPages > MAX_MATERIAL_PAGES) throw new BadRequestException(`O PDF tem ${doc.numPages} páginas; o limite é ${MAX_MATERIAL_PAGES}.`);
    const pages: string[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      const text = content.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, MAX_PAGE_CHARS);
      pages.push(text);
    }
    return pages;
  } finally {
    await task.destroy();
  }
}
