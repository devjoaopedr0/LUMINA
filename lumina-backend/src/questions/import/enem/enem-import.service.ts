import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { QuestionDifficulty, QuestionSourceType } from '@prisma/client';
import { ExternalQuestion } from '../../domain/question-types';
import {
  areaLabelToSubject,
  classifyCienciasNaturezaSubject,
  parseAreaRanges,
  parseGabaritoText,
  parseQuestionBody,
  resolveAreaLabel,
  splitQuestionBlocks,
} from './enem-pdf.parser';

export interface FetchEnemExamParams {
  year: number;
  day: 1 | 2;
  provaUrl: string;
  gabaritoUrl: string;
}

export interface EnemFetchIssue {
  questionNumber: number;
  reason: string;
}

export interface EnemFetchResult {
  questions: ExternalQuestion[];
  skipped: EnemFetchIssue[];
}

// Único host de onde este serviço aceita baixar PDF — evita que o endpoint
// vire um proxy de SSRF que baixa qualquer URL que o chamador quiser (mesmo
// sendo um endpoint admin-only). Estender para outras bancas exige adicionar
// o host aqui explicitamente, nunca por conta própria.
const ALLOWED_PDF_HOST = 'download.inep.gov.br';

/**
 * Baixa e converte um caderno oficial do ENEM (INEP) em ExternalQuestion[] —
 * o formato neutro consumido pelo pipeline de importação já existente
 * (QuestionImportService: normalização/validação/deduplicação/persistência).
 *
 * Fonte: PDFs públicos do INEP (download.inep.gov.br/enem/provas_e_gabaritos).
 * O ENEM é uma avaliação de um órgão público federal com uso liberado para
 * fins educacionais — por isso começamos por ele. Estender para outras
 * bancas (FUVEST, UNICAMP etc.) exige mapear o formato de PDF de cada uma
 * (confirmado nesta sessão: layout, marcação de alternativas e estrutura do
 * gabarito variam por banca) e reavaliar direitos de reprodução — bancas
 * privadas costumam reservar esses direitos de forma mais restritiva que o
 * INEP.
 *
 * Limitações conhecidas desta primeira versão (documentadas, não escondidas):
 * - Imagens (gráficos, figuras) NÃO são extraídas: `imageUrl` fica vazio.
 *   Extrair exigiria renderizar a página via canvas nativo — próxima
 *   iteração, se for necessário.
 * - "Ciências da Natureza" (Física/Química/Biologia) não vem sub-classificada
 *   pelo próprio ENEM — ver classifyCienciasNaturezaSubject: é uma sugestão
 *   por palavra-chave, não fonte de verdade.
 * - Questões cujas alternativas são predominantemente gráficas ou que
 *   atravessam quebra de página de forma atípica não são reconhecidas —
 *   entram em `skipped`, nunca como um chute.
 */
@Injectable()
export class EnemImportService {
  private readonly logger = new Logger(EnemImportService.name);

  async fetchExam(params: FetchEnemExamParams): Promise<EnemFetchResult> {
    const [examText, introText, gabarito, pages] = await this.loadExamContent(params);

    const areaRanges = parseAreaRanges(introText);
    if (areaRanges.length === 0) {
      this.logger.warn(
        `Não foi possível identificar as áreas de conhecimento no caderno (ano ${params.year}, dia ${params.day}) — questões serão marcadas como "ENEM" genérico.`,
      );
    }

    const blocks = splitQuestionBlocks(examText);
    const questions: ExternalQuestion[] = [];
    const skipped: EnemFetchIssue[] = [];

    for (const block of blocks) {
      const parsed = parseQuestionBody(block.body);
      if (!parsed) {
        skipped.push({
          questionNumber: block.number,
          reason: 'Não foi possível separar enunciado e alternativas automaticamente.',
        });
        continue;
      }

      const correctLetter = gabarito.get(block.number);
      if (!correctLetter || correctLetter === 'Anulado') {
        skipped.push({
          questionNumber: block.number,
          reason:
            correctLetter === 'Anulado'
              ? 'Questão anulada pelo INEP — sem gabarito válido para importar.'
              : 'Gabarito não encontrado para esta questão.',
        });
        continue;
      }

      const areaLabel = resolveAreaLabel(block.number, areaRanges);
      let subject = areaLabel ? areaLabelToSubject(areaLabel) : 'ENEM';
      if (subject === 'Ciências da Natureza') {
        subject = classifyCienciasNaturezaSubject(parsed.stem);
      }

      questions.push({
        sourceType: QuestionSourceType.OFFICIAL,
        sourceName: 'INEP/ENEM',
        sourceId: `enem-${params.year}-d${params.day}-q${block.number}`,
        exam: 'ENEM',
        year: params.year,
        examNumber: block.number,
        subject,
        difficulty: QuestionDifficulty.MEDIA,
        stem: parsed.stem,
        options: parsed.alternatives.map((alternative) => ({ text: alternative.text })),
        correctLetter,
        ...(pages.get(block.number) ? { sourcePdf: { url: params.provaUrl, page: pages.get(block.number)! } } : {}),
      });
    }

    return { questions, skipped };
  }

  private async loadExamContent(
    params: FetchEnemExamParams,
  ): Promise<[examText: string, introText: string, gabarito: Map<number, string>, pages: Map<number, number>]> {
    // Import dinâmico: pdfjs-dist 6.x só publica build ESM (.mjs), e este
    // projeto compila para CommonJS — `import()` dinâmico é a forma correta
    // de consumir um pacote ESM-only a partir de código CJS no Node.
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');

    const [provaBytes, gabaritoBytes] = await Promise.all([
      this.download(params.provaUrl),
      this.download(params.gabaritoUrl),
    ]);

    const provaDoc = await getDocument({ data: provaBytes }).promise;
    let examText = '';
    let introText = '';
    const pages = new Map<number, number>();
    for (let pageNum = 1; pageNum <= provaDoc.numPages; pageNum++) {
      const page = await provaDoc.getPage(pageNum);
      const content = await page.getTextContent();
      const pageText = content.items.map((item) => ('str' in item ? item.str : '')).join(' ');
      if (pageNum === 1) introText = pageText;
      for (const match of pageText.matchAll(/QUEST[ÃA]O\s+(\d{1,3})\s+/g)) {
        const number = Number(match[1]);
        if (!pages.has(number)) pages.set(number, pageNum);
      }
      examText += ` ${pageText}`;
    }

    const gabaritoDoc = await getDocument({ data: gabaritoBytes }).promise;
    let gabaritoRaw = '';
    for (let pageNum = 1; pageNum <= gabaritoDoc.numPages; pageNum++) {
      const page = await gabaritoDoc.getPage(pageNum);
      const content = await page.getTextContent();
      // Sem espaço de propósito — ver comentário de parseGabaritoText.
      gabaritoRaw += content.items.map((item) => ('str' in item ? item.str : '')).join('');
    }

    return [examText, introText, parseGabaritoText(gabaritoRaw), pages];
  }

  private async download(url: string): Promise<Uint8Array> {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new BadRequestException(`URL inválida: ${url}`);
    }
    if (parsed.protocol !== 'https:' || parsed.hostname !== ALLOWED_PDF_HOST) {
      throw new BadRequestException(
        `Só é permitido baixar PDFs de https://${ALLOWED_PDF_HOST}/ (recebido: ${url}).`,
      );
    }

    const res = await fetch(url);
    if (!res.ok) {
      throw new BadRequestException(`Não foi possível baixar o PDF (status ${res.status}): ${url}`);
    }
    const buffer = await res.arrayBuffer();
    return new Uint8Array(buffer);
  }
}
