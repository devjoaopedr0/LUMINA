import { BadGatewayException, BadRequestException, Injectable, Logger } from '@nestjs/common';
import { QuestionDifficulty, QuestionSourceType } from '@prisma/client';
import { ExternalQuestion } from '../../domain/question-types';
import { fetchCompletingChain } from './incomplete-chain-fetch';
import {
  areaLabelToSubject,
  classifyCienciasNaturezaSubject,
  isEnemPageFurniture,
  isUnreliableEnemExtraction,
  parseAreaRanges,
  parseOfficialGabarito,
  type GabaritoLanguage,
  type OfficialGabarito,
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
    // Questões de língua (1–5 do 1º dia) aparecem duas vezes no caderno: o
    // bloco de inglês vem antes do de espanhol, cada um com o próprio gabarito.
    const seenCount = new Map<number, number>();

    for (const block of blocks) {
      const occurrence = seenCount.get(block.number) ?? 0;
      seenCount.set(block.number, occurrence + 1);
      const languages = gabarito.items.filter((i) => i.number === block.number && i.language !== '');
      const language: GabaritoLanguage = languages.length ? (occurrence === 0 ? 'INGLES' : 'ESPANHOL') : '';
      if (languages.length && occurrence > 1) {
        skipped.push({ questionNumber: block.number, reason: 'Questão de língua repetida mais de duas vezes no caderno.' });
        continue;
      }

      const parsed = parseQuestionBody(block.body);
      if (!parsed) {
        skipped.push({
          questionNumber: block.number,
          reason: 'Não foi possível separar enunciado e alternativas automaticamente.',
        });
        continue;
      }
      if (isUnreliableEnemExtraction(parsed)) {
        skipped.push({
          questionNumber: block.number,
          reason: 'Alternativas com fórmulas ou figuras não puderam ser lidas com segurança no PDF.',
        });
        continue;
      }

      const entry = gabarito.items.find((i) => i.number === block.number && i.language === language);
      if (!entry || entry.letter === null) {
        skipped.push({
          questionNumber: block.number,
          reason:
            entry && entry.letter === null
              ? 'Questão anulada pelo INEP — sem gabarito válido para importar.'
              : 'Gabarito não encontrado para esta questão.',
        });
        continue;
      }
      const correctLetter = entry.letter;

      const areaLabel = resolveAreaLabel(block.number, areaRanges);
      let subject = areaLabel ? areaLabelToSubject(areaLabel) : 'ENEM';
      if (language) subject = language === 'INGLES' ? 'Inglês' : 'Espanhol';
      if (subject === 'Ciências da Natureza') {
        subject = classifyCienciasNaturezaSubject(parsed.stem);
      }

      questions.push({
        sourceType: QuestionSourceType.OFFICIAL,
        sourceName: 'INEP/ENEM',
        sourceId: `enem-${params.year}-d${params.day}-q${block.number}${language ? `-${language.toLowerCase()}` : ''}`,
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
  ): Promise<[examText: string, introText: string, gabarito: OfficialGabarito, pages: Map<number, number>]> {
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
      // Remove marca d'água, rodapé, cabeçalho de área e número de página
      // antes de juntar o texto: sem isso, a "moldura" da página entra no
      // meio das questões que atravessam quebra de página (ver
      // isEnemPageFurniture).
      const pageText = content.items
        .flatMap((item) => {
          if (!('str' in item)) return [];
          return isEnemPageFurniture(item) ? [] : [item.str];
        })
        .join(' ');
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

    // parseOfficialGabarito aceita as questões 1–9 e separa as duas línguas
    // do 1º dia (o antigo parseGabaritoText perdia as duas coisas).
    return [examText, introText, parseOfficialGabarito(gabaritoRaw), pages];
  }

  /**
   * Gabarito oficial completo (cabeçalho do caderno e as duas línguas do 1º
   * dia), para o Gabarito Inteligente. Mesmo host permitido do caderno.
   */
  async fetchOfficialGabarito(gabaritoUrl: string): Promise<OfficialGabarito> {
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const doc = await getDocument({ data: await this.download(gabaritoUrl) }).promise;
    let raw = '';
    for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
      const content = await (await doc.getPage(pageNum)).getTextContent();
      // Sem espaço entre os runs — ver comentário de parseGabaritoText.
      raw += content.items.map((item) => ('str' in item ? item.str : '')).join('');
    }
    return parseOfficialGabarito(raw);
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

    // O servidor do INEP não envia o certificado intermediário: sem completar
    // a cadeia, o Node recusa a conexão (ver incomplete-chain-fetch.ts).
    let res: Awaited<ReturnType<typeof fetchCompletingChain>>;
    try {
      res = await fetchCompletingChain(url);
    } catch (first) {
      // Rede instável do servidor do INEP: uma nova tentativa costuma passar.
      this.logger.warn(`Download do INEP falhou (${(first as { cause?: { code?: string } }).cause?.code ?? (first as Error).message}); tentando de novo.`);
      try {
        res = await fetchCompletingChain(url);
      } catch {
        throw new BadGatewayException('Não foi possível baixar o PDF do INEP agora (falha de rede). Tente de novo em instantes.');
      }
    }
    if (res.status < 200 || res.status >= 300) {
      throw new BadRequestException(`Não foi possível baixar o PDF (status ${res.status}): ${url}`);
    }
    return res.bytes;
  }
}
