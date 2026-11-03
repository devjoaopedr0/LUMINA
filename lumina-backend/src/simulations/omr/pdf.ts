/**
 * PDF do cartão-resposta: o app transforma as fotos digitalizadas num PDF A4
 * (uma folha por página) e é esse PDF que o servidor lê.
 *
 * O app grava cada página como imagem em tons de cinza comprimida com
 * FlateDecode — o formato de imagem padrão do PDF, que abre em qualquer
 * leitor e que o servidor descomprime com o zlib do Node, sem biblioteca de
 * JPEG. Este leitor é mínimo de propósito: extrai as imagens (XObject) na
 * ordem em que aparecem no arquivo. Aceita cinza e RGB em FlateDecode ou sem
 * filtro; PDF com foto em JPEG (DCTDecode, típico de apps de scanner de
 * terceiros) é recusado com explicação.
 */
import { crc32, deflateSync, inflateSync } from 'node:zlib';
import type { GrayImage } from './omr';

export class PdfError extends Error {}

export const MAX_PDF_PAGES = 60;

function dictValue(dict: string, key: string): string | null {
  const match = new RegExp(`/${key}\\s*(\\[[^\\]]*\\]|/[A-Za-z0-9]+|\\d+(?:\\s+\\d+\\s+R)?)`).exec(dict);
  return match ? match[1].trim() : null;
}

/** Extrai as imagens das páginas, em tons de cinza. */
export function extractPdfImages(pdf: Buffer): GrayImage[] {
  if (pdf.subarray(0, 5).toString('latin1') !== '%PDF-') throw new PdfError('O arquivo não é um PDF.');
  const text = pdf.toString('latin1');
  const images: GrayImage[] = [];
  const objectPattern = /(\d+)\s+0\s+obj\s*<<([\s\S]*?)>>\s*stream\r?\n/g;
  let match: RegExpExecArray | null;
  while ((match = objectPattern.exec(text))) {
    const dict = match[2];
    if (!/\/Subtype\s*\/Image/.test(dict)) continue;
    if (images.length >= MAX_PDF_PAGES) throw new PdfError(`O PDF pode ter no máximo ${MAX_PDF_PAGES} folhas.`);
    const width = Number(dictValue(dict, 'Width'));
    const height = Number(dictValue(dict, 'Height'));
    const bits = Number(dictValue(dict, 'BitsPerComponent'));
    const colorSpace = dictValue(dict, 'ColorSpace');
    const filter = dictValue(dict, 'Filter');
    if (filter && /DCTDecode|JPXDecode|CCITT|JBIG2/.test(filter)) {
      throw new PdfError('Este PDF guarda a foto em JPEG, formato que a leitura não usa. Fotografe pelo scanner da Lumina, que gera o PDF no formato certo.');
    }
    if (dictValue(dict, 'DecodeParms') || /\/DecodeParms/.test(dict)) throw new PdfError('PDF com compressão não suportada (preditor). Gere o PDF pelo scanner da Lumina.');
    const channels = colorSpace === '/DeviceGray' ? 1 : colorSpace === '/DeviceRGB' ? 3 : 0;
    if (!channels || bits !== 8 || !Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
      throw new PdfError('Imagem do PDF em formato não suportado (use tons de cinza ou RGB de 8 bits).');
    }
    const start = match.index + match[0].length;
    const lengthValue = dictValue(dict, 'Length');
    let end = lengthValue && /^\d+$/.test(lengthValue) ? start + Number(lengthValue) : text.indexOf('endstream', start);
    if (end < start || end > pdf.length) end = text.indexOf('endstream', start);
    if (end < 0) throw new PdfError('PDF corrompido: imagem sem fim.');
    let raw = pdf.subarray(start, end);
    if (filter === '/FlateDecode') {
      try {
        raw = inflateSync(raw);
      } catch {
        throw new PdfError('PDF corrompido: não deu para descomprimir a imagem.');
      }
    } else if (filter) {
      throw new PdfError(`Compressão ${filter} não suportada no PDF.`);
    }
    if (raw.length < width * height * channels) throw new PdfError('PDF corrompido: imagem menor que o tamanho declarado.');
    const data = new Uint8Array(width * height);
    if (channels === 1) data.set(raw.subarray(0, width * height));
    else for (let i = 0, p = 0; i < data.length; i++, p += 3) data[i] = Math.round(0.299 * raw[p] + 0.587 * raw[p + 1] + 0.114 * raw[p + 2]);
    images.push({ width, height, data });
    objectPattern.lastIndex = end;
  }
  if (!images.length) throw new PdfError('O PDF não tem nenhuma página digitalizada.');
  return images;
}

/** PNG em tons de cinza — a página que o corretor vê na conferência. */
export function grayToPng(img: GrayImage): Buffer {
  const rowLength = img.width + 1;
  const raw = Buffer.alloc(rowLength * img.height);
  for (let y = 0; y < img.height; y++) {
    raw[y * rowLength] = 0; // filtro "nenhum"
    raw.set(img.data.subarray(y * img.width, (y + 1) * img.width), y * rowLength + 1);
  }
  const chunk = (type: string, body: Buffer) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(body.length, 0);
    head.write(type, 4, 'ascii');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])) >>> 0, 0);
    return Buffer.concat([head, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(img.width, 0);
  ihdr.writeUInt32BE(img.height, 4);
  ihdr[8] = 8; // bits
  ihdr[9] = 0; // cinza
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0))]);
}

/**
 * Monta um PDF A4 com uma imagem cinza por página — mesmo formato que o app
 * gera. Usado nos testes e para baixar a folha de uma leitura antiga.
 */
export function grayImagesToPdf(pages: GrayImage[]): Buffer {
  const parts: Buffer[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (chunk: Buffer | string) => {
    const b = typeof chunk === 'string' ? Buffer.from(chunk, 'latin1') : chunk;
    parts.push(b);
    length += b.length;
  };
  const object = (id: number, body: (Buffer | string)[]) => {
    offsets[id] = length;
    push(`${id} 0 obj\n`);
    body.forEach(push);
    push('\nendobj\n');
  };
  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  const pageIds = pages.map((_, i) => 3 + i * 3);
  object(1, ['<< /Type /Catalog /Pages 2 0 R >>']);
  object(2, [`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`]);
  pages.forEach((img, i) => {
    const pageId = pageIds[i];
    const content = Buffer.from('q 595.28 0 0 841.89 0 0 cm /Im0 Do Q', 'latin1');
    const data = deflateSync(Buffer.from(img.data));
    object(pageId, [`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /Im0 ${pageId + 2} 0 R >> >> /Contents ${pageId + 1} 0 R >>`]);
    object(pageId + 1, [`<< /Length ${content.length} >>\nstream\n`, content, '\nendstream']);
    object(pageId + 2, [`<< /Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode /Length ${data.length} >>\nstream\n`, data, '\nendstream']);
  });
  const xref = length;
  const count = 3 + pages.length * 3;
  push(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let id = 1; id < count; id++) push(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`);
  push(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return Buffer.concat(parts);
}
