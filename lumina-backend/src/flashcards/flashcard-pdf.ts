import { BadRequestException } from '@nestjs/common';

/** Limites do material enviado: o PDF é lido em memória e não é armazenado. */
export const MAX_FLASHCARD_PDF_BYTES = 8 * 1024 * 1024;
export const MAX_FLASHCARD_PDF_PAGES = 40;
export const MAX_FLASHCARD_PDF_CHARS = 20_000;

const PDF_DATA_URL = /^data:application\/pdf;base64,([A-Za-z0-9+/=\s]*)$/i;

/** Decodifica o data URL do PDF e recusa arquivo grande ou que não seja PDF. */
export function decodePdfDataUrl(value: string): Uint8Array {
  const match = PDF_DATA_URL.exec(value.trim());
  if (!match) {
    throw new BadRequestException('Envie um PDF válido no campo pdf.');
  }

  const buffer = Buffer.from(match[1].replace(/\s+/g, ''), 'base64');
  if (!buffer.length) {
    throw new BadRequestException('O PDF enviado está vazio.');
  }
  if (buffer.length > MAX_FLASHCARD_PDF_BYTES) {
    throw new BadRequestException('O PDF passa do limite de 8 MB.');
  }
  // Alguns uploads chegam com BOM ou com bytes de controle antes do cabeçalho.
  // O pdf.js aceita o arquivo assim, mas recusar aqui evita gastar memória com
  // algo que claramente não é PDF.
  if (buffer.subarray(0, 1024).indexOf(Buffer.from('%PDF-')) < 0) {
    throw new BadRequestException('O arquivo enviado não parece ser um PDF.');
  }
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}

/**
 * Extrai o texto de um PDF em memória. Diferente da importação do ENEM, aqui
 * não há download remoto: o arquivo veio do aluno e não é persistido.
 */
export async function extractPdfText(dataUrl: string): Promise<string> {
  const data = decodePdfDataUrl(dataUrl);
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');

  const loadingTask = getDocument({ data });
  let doc: Awaited<typeof loadingTask.promise>;
  try {
    doc = await loadingTask.promise;
  } catch {
    throw new BadRequestException('Não foi possível abrir o PDF enviado.');
  }

  try {
    if (doc.numPages > MAX_FLASHCARD_PDF_PAGES) {
      throw new BadRequestException(
        `O PDF tem ${doc.numPages} páginas; o limite é ${MAX_FLASHCARD_PDF_PAGES}.`,
      );
    }

    const parts: string[] = [];
    let chars = 0;
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();
      for (const item of content.items) {
        if (!('str' in item)) continue;
        const text = item.str.trim();
        if (!text) continue;
        parts.push(text);
        chars += text.length + 1;
        if (chars >= MAX_FLASHCARD_PDF_CHARS) break;
      }
      if (chars >= MAX_FLASHCARD_PDF_CHARS) break;
    }

    const text = parts
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, MAX_FLASHCARD_PDF_CHARS);

    if (text.length < 20) {
      throw new BadRequestException(
        'O PDF não tem texto selecionável suficiente. Se ele for uma imagem digitalizada, cole o conteúdo como texto.',
      );
    }
    return text;
  } finally {
    await loadingTask.destroy();
  }
}
