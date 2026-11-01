/**
 * Leitura da redação manuscrita a partir da foto já digitalizada no app
 * (recorte, perspectiva e realce feitos no aparelho, estilo CamScanner).
 *
 * OCR clássico (Tesseract) não lê letra cursiva de forma utilizável; quem lê
 * é um modelo de visão. Duas regras que não podem ser violadas:
 * 1. Transcrever SEM corrigir — o erro de ortografia/acentuação do aluno é
 *    exatamente o que a Competência I avalia. Um OCR que "conserta" o texto
 *    dá nota de C1 que o aluno não mereceu.
 * 2. Não adivinhar: palavra que não dá para ler vira [ilegível]. A
 *    transcrição volta para o aluno revisar antes de qualquer nota (a
 *    cartilha anula texto ilegível; a Lumina pede confirmação humana).
 */
import { extractJson } from '../grading/essay-grader';

export type VisionGenerate = (args: { system: string; prompt: string; imageDataUrl: string; temperature: number; maxTokens: number }) => Promise<{ text: string; model: string } | null>;

export interface OcrLine {
  /** Número da linha na folha (1 a 30 por página). */
  number: number;
  text: string;
  /** A linha começa um parágrafo novo (recuo visível). */
  paragraphStart: boolean;
  illegibleWords: number;
}

export interface EssayTranscription {
  title: string | null;
  lines: OcrLine[];
  text: string;
  /** Linhas escritas do texto (sem título), somadas as páginas. */
  lineCount: number;
  illegibleWords: number;
  /** 0–1, combinando a autoavaliação do modelo e as palavras ilegíveis. */
  confidence: number;
  warnings: string[];
  model: string;
}

const SYSTEM = `Você transcreve redações manuscritas do Enem fotografadas na folha oficial de 30 linhas.
Transcreva EXATAMENTE o que está escrito, linha por linha, preservando:
- erros de ortografia, acentuação, concordância e pontuação (NÃO corrija nada);
- palavras riscadas NÃO entram; palavras inseridas acima da linha entram no lugar indicado;
- hífen de translineação no fim da linha.
Quando não conseguir ler uma palavra, escreva [ilegível] no lugar dela — nunca invente.
Indique se a linha começa um parágrafo (recuo no início).
O título (se houver, acima da linha 1 ou na linha 1 separado do texto) vai em "titulo", não nas linhas.
Responda APENAS com JSON válido.`;

const PROMPT = `Formato:
{"legivel": true,
 "titulo": null,
 "linhas": [{"n": 1, "texto": "...", "novo_paragrafo": true}],
 "confianca": 0.0,
 "observacoes": "problemas da foto, se houver (borrão, sombra, corte)"}
"confianca" é sua estimativa (0 a 1) de que a transcrição está fiel. Linhas em branco não entram.`;

const ILLEGIBLE = /\[ileg[ií]vel\]/gi;

/** Junta as linhas em texto corrido, desfazendo a translineação. */
export function linesToText(lines: OcrLine[]): string {
  const paragraphs: string[] = [];
  let current = '';
  for (const line of lines) {
    const text = line.text.trim();
    if (!text) continue;
    if (line.paragraphStart && current) {
      paragraphs.push(current);
      current = '';
    }
    if (!current) current = text;
    else if (/[\p{L}]-$/u.test(current)) current = current.slice(0, -1) + text;
    else current = `${current} ${text}`;
  }
  if (current) paragraphs.push(current);
  return paragraphs.join('\n\n');
}

export function parseTranscription(raw: unknown, model: string, pageOffset = 0, firstPage = true): Omit<EssayTranscription, 'text' | 'lineCount' | 'confidence'> & { modelConfidence: number; legible: boolean } {
  const data = (raw ?? {}) as Record<string, unknown>;
  const rawLines = Array.isArray(data.linhas) ? data.linhas : [];
  const lines: OcrLine[] = rawLines
    .map((item, index) => {
      const line = (item ?? {}) as Record<string, unknown>;
      const text = String(line.texto ?? '').replace(/\s+/g, ' ').trim();
      return {
        number: pageOffset + (Number.isInteger(line.n) ? Number(line.n) : index + 1),
        text,
        // Na 2ª página, a 1ª linha costuma continuar o parágrafo anterior.
        paragraphStart: line.novo_paragrafo === true || (index === 0 && firstPage),
        illegibleWords: (text.match(ILLEGIBLE) ?? []).length,
      };
    })
    .filter((line) => line.text.length > 0)
    .slice(0, 40);
  const warnings: string[] = [];
  const notes = String(data.observacoes ?? '').trim();
  if (notes) warnings.push(notes.slice(0, 300));
  const modelConfidence = Math.min(1, Math.max(0, Number(data.confianca) || 0));
  return {
    title: typeof data.titulo === 'string' && data.titulo.trim() ? data.titulo.trim().slice(0, 160) : null,
    lines,
    illegibleWords: lines.reduce((sum, l) => sum + l.illegibleWords, 0),
    warnings,
    model,
    modelConfidence,
    legible: data.legivel !== false,
  };
}

export function combineConfidence(modelConfidence: number, words: number, illegibleWords: number): number {
  const illegibleShare = words ? illegibleWords / words : 1;
  // Cada 1% de palavras ilegíveis tira ~4 pontos; a autoavaliação do modelo
  // pesa metade (modelos tendem a se superestimar).
  const fromIllegible = Math.max(0, 1 - illegibleShare * 4);
  return Number((0.5 * modelConfidence + 0.5 * fromIllegible).toFixed(2));
}

export async function transcribeEssayPages(vision: VisionGenerate, pages: string[]): Promise<EssayTranscription | null> {
  const parts: ReturnType<typeof parseTranscription>[] = [];
  let offset = 0;
  for (const [index, imageDataUrl] of pages.entries()) {
    const prompt = pages.length > 1 ? `${PROMPT}\nEsta é a página ${index + 1} de ${pages.length}.` : PROMPT;
    let parsed: ReturnType<typeof parseTranscription> | null = null;
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 2 && !parsed; attempt++) {
      const result = await vision({ system: SYSTEM, prompt, imageDataUrl, temperature: 0, maxTokens: 4000 });
      if (!result) return null;
      try {
        parsed = parseTranscription(extractJson(result.text), result.model, offset, index === 0);
      } catch (error) {
        lastError = error;
      }
    }
    if (!parsed) throw new Error(`Não foi possível ler a página ${index + 1}: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
    offset += 30;
    parts.push(parsed);
  }

  const lines = parts.flatMap((p) => p.lines);
  const text = linesToText(lines);
  const words = (text.match(/[\p{L}\p{N}]+/gu) ?? []).length;
  const illegibleWords = parts.reduce((s, p) => s + p.illegibleWords, 0);
  const modelConfidence = parts.reduce((s, p) => s + p.modelConfidence, 0) / parts.length;
  const warnings = parts.flatMap((p) => p.warnings);
  if (parts.some((p) => !p.legible)) warnings.push('O modelo indicou que a foto está ilegível em parte. Refaça a foto com mais luz e sem sombra.');
  if (illegibleWords) warnings.push(`${illegibleWords} palavra(s) não puderam ser lidas e estão marcadas como [ilegível]. Corrija-as antes de enviar para correção.`);
  return {
    title: parts[0]?.title ?? null,
    lines,
    text,
    lineCount: lines.length,
    illegibleWords,
    confidence: combineConfidence(modelConfidence, words, illegibleWords),
    warnings,
    model: [...new Set(parts.map((p) => p.model))].join(', '),
  };
}
