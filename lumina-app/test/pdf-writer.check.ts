import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import { buildPdf } from '../src/lib/pdf-writer.ts';

// Duas folhas, com conteúdo diferente, para conferir ordem e pixels.
const a = { width: 640, height: 900, data: new Uint8Array(640 * 900).map((_, i) => (i * 7) % 256) };
const b = { width: 700, height: 990, data: new Uint8Array(700 * 990).fill(230) };
const pdf = await buildPdf([a, b]);
const text = Buffer.from(pdf).toString('latin1');

assert.ok(text.startsWith('%PDF-1.4'), 'cabeçalho PDF');
assert.ok(text.trimEnd().endsWith('%%EOF'), 'rodapé PDF');
assert.match(text, /\/Count 2/, 'duas páginas');

// A tabela xref aponta para o início de cada objeto (o PDF abre em qualquer leitor).
const xrefAt = Number(/startxref\n(\d+)/.exec(text)![1]);
assert.ok(text.slice(xrefAt).startsWith('xref'), 'startxref aponta para a xref');
const entries = text.slice(xrefAt).split('\n').slice(3).filter((l) => / 00000 n $/.test(l)).map((l) => Number(l.slice(0, 10)));
entries.forEach((offset, i) => assert.ok(text.slice(offset).startsWith(`${i + 1} 0 obj`), `objeto ${i + 1} no offset certo`));

// As imagens voltam idênticas ao descomprimir (é o que o servidor faz).
const images = [...text.matchAll(/\/Subtype \/Image \/Width (\d+) \/Height (\d+)[^>]*\/Length (\d+) >>\nstream\n/g)];
assert.equal(images.length, 2);
images.forEach((m, i) => {
  const start = m.index! + m[0].length;
  const raw = inflateSync(Buffer.from(pdf.subarray(start, start + Number(m[3]))));
  assert.ok(raw.equals(Buffer.from([a, b][i].data)), `pixels da página ${i + 1}`);
});
assert.ok(pdf.length < (a.data.length + b.data.length) / 2, `comprimido (${(pdf.length / 1024).toFixed(0)} KB)`);

await assert.rejects(() => buildPdf([]), /Nenhuma folha/);
console.log(`PDF writer checks passed: 2 pages, valid xref, lossless FlateDecode images (${(pdf.length / 1024).toFixed(0)} KB).`);
