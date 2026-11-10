import { describe, expect, it } from 'vitest';
import { decodePdfDataUrl, MAX_FLASHCARD_PDF_BYTES } from './flashcard-pdf';

const pdf = (body: string) => `data:application/pdf;base64,${Buffer.from(body).toString('base64')}`;

describe('PDF de flashcards', () => {
  it('decodifica um data URL de PDF em memória', () => {
    const bytes = decodePdfDataUrl(pdf('%PDF-1.4\nconteúdo'));
    expect(Buffer.from(bytes).toString()).toContain('%PDF-1.4');
  });

  it('recusa mimetype errado, arquivo vazio, conteúdo não-PDF e excesso de tamanho', () => {
    expect(() => decodePdfDataUrl('data:text/plain;base64,abc')).toThrow('PDF válido');
    expect(() => decodePdfDataUrl('data:application/pdf;base64,')).toThrow('vazio');
    expect(() => decodePdfDataUrl(pdf('não é pdf'))).toThrow('não parece ser um PDF');
    expect(() =>
      decodePdfDataUrl(
        `data:application/pdf;base64,${Buffer.alloc(MAX_FLASHCARD_PDF_BYTES + 1, 0x20).toString('base64')}`,
      ),
    ).toThrow('8 MB');
  });
});
