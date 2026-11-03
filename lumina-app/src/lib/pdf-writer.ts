/**
 * Gera o PDF das folhas digitalizadas (A4, uma por página), no navegador e
 * sem dependência: cada página é uma imagem em tons de cinza comprimida com
 * FlateDecode (zlib), o formato de imagem padrão do PDF. Abre em qualquer
 * leitor e é o mesmo formato que o servidor lê para corrigir o cartão.
 */

export interface GrayPage {
  width: number;
  height: number;
  /** Luminância 0–255, um byte por pixel. */
  data: Uint8Array;
}

const A4 = { width: 595.28, height: 841.89 };

/** zlib (RFC 1950) — o que o FlateDecode do PDF espera. */
export async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

const encoder = new TextEncoder();

export async function buildPdf(pages: GrayPage[]): Promise<Uint8Array> {
  if (!pages.length) throw new Error('Nenhuma folha para o PDF.');
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (part: string | Uint8Array) => {
    const bytes = typeof part === 'string' ? encoder.encode(part) : part;
    chunks.push(bytes);
    length += bytes.length;
  };
  const object = (id: number, parts: (string | Uint8Array)[]) => {
    offsets[id] = length;
    push(`${id} 0 obj\n`);
    parts.forEach(push);
    push('\nendobj\n');
  };

  push('%PDF-1.4\n');
  const pageIds = pages.map((_, i) => 3 + i * 3);
  object(1, ['<< /Type /Catalog /Pages 2 0 R >>']);
  object(2, [`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`]);
  for (const [i, page] of pages.entries()) {
    const id = pageIds[i];
    if (page.data.length !== page.width * page.height) throw new Error('Página com tamanho inconsistente.');
    // A imagem ocupa a folha inteira, mantendo a proporção (centralizada).
    const scale = Math.min(A4.width / page.width, A4.height / page.height);
    const w = page.width * scale;
    const h = page.height * scale;
    const x = (A4.width - w) / 2;
    const y = (A4.height - h) / 2;
    const content = encoder.encode(`q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm /Im0 Do Q`);
    const image = await deflate(page.data);
    object(id, [`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4.width} ${A4.height}] /Resources << /XObject << /Im0 ${id + 2} 0 R >> >> /Contents ${id + 1} 0 R >>`]);
    object(id + 1, [`<< /Length ${content.length} >>\nstream\n`, content, '\nendstream']);
    object(id + 2, [`<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode /Length ${image.length} >>\nstream\n`, image, '\nendstream']);
  }
  const xref = length;
  const count = 3 + pages.length * 3;
  push(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let id = 1; id < count; id++) push(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`);
  push(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  const out = new Uint8Array(length);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
