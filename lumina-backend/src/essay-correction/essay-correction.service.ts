import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EssayCorrectionStatus, EssayScanStatus, Prisma } from '@prisma/client';
import { AiService } from '../ai/ai.service';
import { PrismaService } from '../database/prisma.service';
import { countWords } from '../essays/essays.dto';
import { EssayGradeResult, EssayGrader, GRADER_PROMPT_VERSION, LlmCalibration } from './grading/essay-grader';
import { FeatureModelWeights } from './grading/feature-model';
import { EssayMcpClient } from './mcp/essay-mcp-client';
import featureModelJson from './model/feature-model.json';
import calibrationJson from './model/llm-calibration.json';
import { transcribeEssayPages } from './ocr/essay-ocr';
import { buildQuota, CorrectionQuota, monthlyCorrectionLimit, periodStart, quotaExceededMessage, quotaPeriod } from './quota/correction-quota';

const MAX_PAGES = 2;
const MAX_PAGE_BYTES = 3 * 1024 * 1024;
/**
 * Leituras de foto por mês, por correção da cota: cada leitura custa uma
 * chamada de visão por página, e o aluno pode refazer a foto algumas vezes.
 */
const SCANS_PER_CORRECTION = 3;
/** Métodos em que a nota saiu sem chamar a IA: o crédito da cota volta. */
const NO_AI_METHODS = new Set(['modelo-estatistico', 'regra']);

/** O aluno estourou a cota do mês: 429 com a cota no corpo, para a tela mostrar. */
export class CorrectionQuotaExceededException extends HttpException {
  constructor(readonly quota: CorrectionQuota) {
    super({ statusCode: HttpStatus.TOO_MANY_REQUESTS, message: quotaExceededMessage(quota), quota }, HttpStatus.TOO_MANY_REQUESTS);
  }
}
/** Processamento parado há mais que isto foi interrompido (ex.: reinício). */
// A correção por competência faz 10 a 15 chamadas (5 em paralelo por avaliador).
const STALE_AFTER_MS = 10 * 60 * 1000;
const CORRECTION_TIMEOUT_MS = 120_000;

const featureModel = (featureModelJson as { trained?: boolean }).trained === false ? null : (featureModelJson as unknown as FeatureModelWeights);
const calibration = calibrationJson as unknown as LlmCalibration;

/** Modelos da correção (AI_ESSAY_MODELS, separados por vírgula); vazio = cadeia padrão do AiService. */
export function essayModels(): string[] {
  return (process.env.AI_ESSAY_MODELS ?? '').split(',').map((m) => m.trim()).filter(Boolean);
}

const MAGIC: { mime: string; test: (b: Buffer) => boolean }[] = [
  { mime: 'image/jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/png', test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: 'image/webp', test: (b) => b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP' },
];

/** Decodifica a data URL e confere o tipo pelos bytes, não pelo que o cliente declarou. */
export function decodeImage(dataUrl: string): { mime: string; bytes: Buffer } {
  const match = /^data:(image\/[a-z+]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUrl);
  if (!match) throw new BadRequestException('Imagem inválida: envie a página como data URL base64.');
  const bytes = Buffer.from(match[2], 'base64');
  if (bytes.length < 1024) throw new BadRequestException('Imagem vazia ou corrompida.');
  if (bytes.length > MAX_PAGE_BYTES) throw new BadRequestException('Cada página pode ter no máximo 3 MB depois de digitalizada.');
  const kind = MAGIC.find((m) => m.test(bytes));
  if (!kind) throw new BadRequestException('Formato não suportado: use JPEG, PNG ou WebP.');
  return { mime: kind.mime, bytes };
}

@Injectable()
export class EssayCorrectionService {
  private readonly logger = new Logger(EssayCorrectionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
  ) {}

  // ------------------------------------------------------------------ scans

  async createScan(userId: string, data: { pages: string[]; theme?: string }) {
    if (!data.pages.length || data.pages.length > MAX_PAGES) throw new BadRequestException(`Envie de 1 a ${MAX_PAGES} páginas.`);
    const decoded = data.pages.map(decodeImage);
    // Sem correção sobrando no mês, a leitura só gastaria chamada de visão.
    const quota = await this.getQuota(userId);
    if (quota.remaining <= 0) throw new CorrectionQuotaExceededException(quota);
    const scansThisMonth = await this.prisma.essayScan.count({ where: { userId, createdAt: { gte: periodStart(quota.period) } } });
    if (scansThisMonth >= quota.limit * SCANS_PER_CORRECTION) {
      throw new HttpException(`Limite de ${quota.limit * SCANS_PER_CORRECTION} fotos lidas por mês atingido. Você ainda pode digitar a redação e pedir a correção.`, HttpStatus.TOO_MANY_REQUESTS);
    }
    const scan = await this.prisma.essayScan.create({
      data: {
        userId,
        theme: (data.theme ?? '').trim().slice(0, 300),
        pages: { create: decoded.map((page, index) => ({ index, mimeType: page.mime, sizeBytes: page.bytes.length, image: new Uint8Array(page.bytes) })) },
      },
      select: { id: true, status: true, createdAt: true },
    });
    void this.processScan(scan.id);
    return scan;
  }

  async processScan(scanId: string) {
    try {
      const pages = await this.prisma.essayScanPage.findMany({ where: { scanId }, orderBy: { index: 'asc' } });
      const dataUrls = pages.map((p) => `data:${p.mimeType};base64,${Buffer.from(p.image).toString('base64')}`);
      const transcription = await transcribeEssayPages(
        (args) => this.ai.generateStructured({ ...args, timeoutMs: 90_000 }),
        dataUrls,
      );
      if (!transcription) {
        await this.prisma.essayScan.update({
          where: { id: scanId },
          data: { status: EssayScanStatus.FAILED, errorMessage: 'A leitura de foto precisa de um provedor de IA com visão (AI_PROVIDER). Você ainda pode digitar o texto.' },
        });
        return;
      }
      await this.prisma.essayScan.update({
        where: { id: scanId },
        data: {
          status: EssayScanStatus.READY,
          linesJson: transcription.lines as unknown as Prisma.InputJsonValue,
          transcribedText: transcription.text,
          title: transcription.title,
          lineCount: transcription.lineCount,
          illegibleWords: transcription.illegibleWords,
          ocrConfidence: transcription.confidence,
          ocrModel: transcription.model.slice(0, 300),
          warningsJson: transcription.warnings as Prisma.InputJsonValue,
          errorMessage: null,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Leitura do scan ${scanId} falhou: ${message}`);
      await this.prisma.essayScan
        .update({ where: { id: scanId }, data: { status: EssayScanStatus.FAILED, errorMessage: 'Não conseguimos ler a foto agora. Tente de novo em instantes ou refaça a foto com mais luz.' } })
        .catch(() => undefined);
    }
  }

  private async ownedScan(userId: string, id: string) {
    const scan = await this.prisma.essayScan.findFirst({ where: { id, userId }, include: { pages: { select: { index: true, mimeType: true, sizeBytes: true } } } });
    if (!scan) throw new NotFoundException('Digitalização não encontrada.');
    if (scan.status === EssayScanStatus.PROCESSING && Date.now() - scan.updatedAt.getTime() > STALE_AFTER_MS) {
      return this.prisma.essayScan.update({
        where: { id },
        data: { status: EssayScanStatus.FAILED, errorMessage: 'A leitura foi interrompida. Tente novamente.' },
        include: { pages: { select: { index: true, mimeType: true, sizeBytes: true } } },
      });
    }
    return scan;
  }

  async getScan(userId: string, id: string) {
    const scan = await this.ownedScan(userId, id);
    return {
      id: scan.id,
      status: scan.status,
      theme: scan.theme,
      title: scan.title,
      text: scan.transcribedText,
      lines: scan.linesJson,
      lineCount: scan.lineCount,
      illegibleWords: scan.illegibleWords,
      confidence: scan.ocrConfidence,
      model: scan.ocrModel,
      warnings: scan.warningsJson ?? [],
      errorMessage: scan.errorMessage,
      essayId: scan.essayId,
      pages: scan.pages.sort((a, b) => a.index - b.index),
      createdAt: scan.createdAt,
      updatedAt: scan.updatedAt,
    };
  }

  async listScans(userId: string) {
    return this.prisma.essayScan.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { id: true, status: true, theme: true, title: true, lineCount: true, ocrConfidence: true, essayId: true, createdAt: true },
    });
  }

  async getScanPage(userId: string, id: string, index: number) {
    const page = await this.prisma.essayScanPage.findFirst({ where: { scanId: id, index, scan: { userId } } });
    if (!page) throw new NotFoundException('Página não encontrada (ela pode ter sido apagada).');
    return { mimeType: page.mimeType, image: Buffer.from(page.image) };
  }

  async retryScan(userId: string, id: string) {
    const scan = await this.ownedScan(userId, id);
    if (scan.status !== EssayScanStatus.FAILED) throw new ConflictException('Só dá para repetir uma leitura que falhou.');
    if (!scan.pages.length) throw new ConflictException('As fotos desta digitalização foram apagadas. Envie uma foto nova.');
    await this.prisma.essayScan.update({ where: { id }, data: { status: EssayScanStatus.PROCESSING, errorMessage: null } });
    void this.processScan(id);
    return { id, status: EssayScanStatus.PROCESSING };
  }

  /** Apaga as fotos e mantém o texto (exclusão das imagens a pedido do aluno). */
  async deleteScanImages(userId: string, id: string) {
    await this.ownedScan(userId, id);
    const { count } = await this.prisma.essayScanPage.deleteMany({ where: { scanId: id } });
    return { deletedPages: count };
  }

  /**
   * O aluno conferiu (e corrigiu) a transcrição: vira uma redação e vai para
   * a correção. É aqui — não no OCR — que o texto passa a valer como dele.
   */
  async confirmScan(userId: string, id: string, data: { text: string; theme: string; title?: string }) {
    const scan = await this.ownedScan(userId, id);
    if (scan.status === EssayScanStatus.PROCESSING) throw new ConflictException('A leitura da foto ainda não terminou.');
    if (scan.status === EssayScanStatus.CONFIRMED && scan.essayId) return { essayId: scan.essayId, correction: await this.getCorrection(userId, scan.essayId) };
    const text = data.text.replace(/\r\n?/g, '\n').trim();
    if (!text) throw new BadRequestException('O texto está vazio.');
    if (/\[ileg[ií]vel\]/i.test(text)) throw new BadRequestException('Ainda há palavras marcadas como [ilegível]. Substitua-as pelo que você escreveu antes de enviar.');
    const title = (data.title ?? scan.title ?? '').trim().slice(0, 160);
    const theme = data.theme.trim().slice(0, 300);
    const values = { title, theme, content: text, wordCount: countWords(text), version: 1 };
    const essay = await this.prisma.$transaction(async (tx) => {
      const created = await tx.essay.create({ data: { userId, ...values } });
      await tx.essayRevision.create({ data: { essayId: created.id, ...values } });
      await tx.essayScan.update({ where: { id }, data: { status: EssayScanStatus.CONFIRMED, essayId: created.id, theme } });
      return created;
    });
    // Linhas e confiança do OCR só valem se o texto não foi reescrito: se o
    // aluno mudou muito, a contagem de linhas da foto deixa de ser a do texto.
    const ocrStillValid = scan.transcribedText ? countWords(scan.transcribedText) > 0 && Math.abs(countWords(text) - countWords(scan.transcribedText)) / countWords(scan.transcribedText) < 0.25 : false;
    try {
      const correction = await this.requestCorrection(userId, essay.id, {
        ocrLines: ocrStillValid ? scan.lineCount ?? undefined : undefined,
        ocrConfidence: ocrStillValid ? scan.ocrConfidence ?? undefined : undefined,
      });
      return { essayId: essay.id, correction };
    } catch (error) {
      // A cota acabou entre a foto e a confirmação: a redação fica salva (o
      // aluno não perde o texto) e pode ser corrigida quando a cota renovar.
      if (error instanceof CorrectionQuotaExceededException) {
        return { essayId: essay.id, correction: { essayId: essay.id, status: null }, quota: error.quota, quotaMessage: quotaExceededMessage(error.quota) };
      }
      throw error;
    }
  }

  // ------------------------------------------------------------------ quota

  async getQuota(userId: string, period = quotaPeriod()): Promise<CorrectionQuota> {
    const used = await this.prisma.essayCorrectionUsage.count({ where: { userId, period, refundedAt: null } });
    return buildQuota(monthlyCorrectionLimit(), used, period);
  }

  /** Devolve o crédito de uma correção que não usou a IA. */
  private async refund(usageId: string) {
    await this.prisma.essayCorrectionUsage.updateMany({ where: { id: usageId, refundedAt: null }, data: { refundedAt: new Date() } }).catch(() => undefined);
  }

  // ------------------------------------------------------------- correction

  async requestCorrection(userId: string, essayId: string, ocr: { ocrLines?: number; ocrConfidence?: number } = {}) {
    const essay = await this.prisma.essay.findFirst({ where: { id: essayId, userId }, include: { correction: true } });
    if (!essay) throw new NotFoundException('Redação não encontrada.');
    if (countWords(essay.content) < 20) throw new BadRequestException('Escreva a redação antes de pedir a correção.');
    if (essay.correction?.status === EssayCorrectionStatus.IN_PROGRESS && Date.now() - essay.correction.updatedAt.getTime() < STALE_AFTER_MS) {
      return this.getCorrection(userId, essayId);
    }
    if (essay.correction?.status === EssayCorrectionStatus.COMPLETED && essay.correction.essayVersion === essay.version) {
      return this.getCorrection(userId, essayId);
    }
    // Reserva do crédito e início da correção numa transação com trava por
    // aluno: dois cliques (ou duas abas) ao mesmo tempo não passam juntos do
    // limite nem disparam duas correções da mesma redação.
    const period = quotaPeriod();
    const limit = monthlyCorrectionLimit();
    const usageId = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`essay-quota:${userId}`}))`;
      const current = await tx.essayCorrection.findUnique({ where: { essayId }, select: { status: true, updatedAt: true } });
      if (current?.status === EssayCorrectionStatus.IN_PROGRESS && Date.now() - current.updatedAt.getTime() < STALE_AFTER_MS) return null;
      const used = await tx.essayCorrectionUsage.count({ where: { userId, period, refundedAt: null } });
      if (used >= limit) throw new CorrectionQuotaExceededException(buildQuota(limit, used, period));
      const usage = await tx.essayCorrectionUsage.create({ data: { userId, essayId, period }, select: { id: true } });
      const base = { status: EssayCorrectionStatus.IN_PROGRESS, isAiCorrection: true, correctedBy: 'luminia', essayVersion: essay.version, errorMessage: null };
      await tx.essayCorrection.upsert({
        where: { essayId },
        create: { essayId, competenciesJson: {}, totalScore: 0, ...base },
        update: base,
      });
      return usage.id;
    });
    if (usageId) void this.runCorrection(essayId, essay.content, essay.theme, ocr, usageId);
    return { ...(await this.getCorrection(userId, essayId)), quota: await this.getQuota(userId, period) };
  }

  /** Correção completa — usada também pela ferramenta MCP `corrigir_redacao`. */
  async gradeText(input: { text: string; theme: string; ocrLines?: number; ocrConfidence?: number }): Promise<EssayGradeResult> {
    const tools = await EssayMcpClient.connect();
    try {
      const grader = new EssayGrader({
        tools,
        featureModel,
        calibration,
        concurrency: Number(process.env.ESSAY_COMPETENCY_CONCURRENCY) || undefined,
        llm: ({ system, prompt, temperature, maxTokens }) =>
          this.ai.generateStructured({ system, prompt, temperature, maxTokens, timeoutMs: CORRECTION_TIMEOUT_MS, models: essayModels() }),
      });
      return await grader.grade(input);
    } finally {
      await tools.close();
    }
  }

  private async runCorrection(essayId: string, text: string, theme: string, ocr: { ocrLines?: number; ocrConfidence?: number }, usageId: string) {
    try {
      const result = await this.gradeText({ text, theme, ...ocr });
      if (NO_AI_METHODS.has(result.method)) await this.refund(usageId);
      const competencies = Object.fromEntries(result.competencies.map((c) => [c.competency, c.score]));
      await this.prisma.$transaction(async (tx) => {
        const correction = await tx.essayCorrection.update({
          where: { essayId },
          data: {
            status: EssayCorrectionStatus.COMPLETED,
            competenciesJson: competencies,
            totalScore: result.total,
            confidence: result.confidence,
            generalFeedback: result.generalFeedback || null,
            annulmentJson: (result.annulment ?? Prisma.DbNull) as Prisma.InputJsonValue,
            auditJson: {
              method: result.method,
              discrepancy: result.discrepancy,
              calibrated: result.calibrated,
              runs: result.runs.map((r) => ({ evaluator: r.evaluator, method: r.method, model: r.model, total: r.total, annulment: r.annulment, tangencia: r.tangencia, scores: Object.fromEntries(Object.entries(r.competencies).map(([k, v]) => [k, v.score])), rawScores: Object.fromEntries(Object.entries(r.competencies).map(([k, v]) => [k, v.rawScore ?? null])) })),
              promptVersion: GRADER_PROMPT_VERSION,
              toolCalls: result.toolCalls,
              analysis: result.analysis,
              ocr,
            } as unknown as Prisma.InputJsonValue,
            errorMessage: null,
          },
        });
        await tx.essayCorrectionDetail.deleteMany({ where: { correctionId: correction.id } });
        await tx.essayCorrectionDetail.createMany({
          data: result.competencies.map((c) => ({
            correctionId: correction.id,
            competency: c.competency,
            score: c.score,
            justification: c.justification || null,
            evidenceJson: { level: c.level, evidence: c.evidence, citations: c.citations, tip: c.tip ?? null } as Prisma.InputJsonValue,
          })),
        });
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Correção da redação ${essayId} falhou: ${message}`);
      await this.refund(usageId);
      await this.prisma.essayCorrection
        .update({
          where: { essayId },
          data: {
            status: EssayCorrectionStatus.FAILED,
            errorMessage: message.startsWith('Correção indisponível')
              ? message
              : 'A correção não pôde ser concluída agora (o serviço de IA não respondeu). Tente novamente em alguns minutos.',
          },
        })
        .catch(() => undefined);
    }
  }

  async getCorrection(userId: string, essayId: string) {
    const essay = await this.prisma.essay.findFirst({
      where: { id: essayId, userId },
      select: { id: true, version: true, correction: { include: { details: true } } },
    });
    if (!essay) throw new NotFoundException('Redação não encontrada.');
    let c = essay.correction;
    if (!c) return { essayId, status: null };
    if (c.status === EssayCorrectionStatus.IN_PROGRESS && Date.now() - c.updatedAt.getTime() > STALE_AFTER_MS) {
      c = await this.prisma.essayCorrection.update({
        where: { id: c.id },
        data: { status: EssayCorrectionStatus.FAILED, errorMessage: 'A correção foi interrompida. Peça novamente.' },
        include: { details: true },
      });
    }
    const audit = (c.auditJson ?? {}) as { method?: string; discrepancy?: unknown; calibrated?: boolean; runs?: { evaluator: string; model: string | null; total: number }[]; analysis?: { lines?: number; linesSource?: string; words?: number; paragraphs?: number; warnings?: string[]; proposal?: unknown } };
    const order = ['C1', 'C2', 'C3', 'C4', 'C5'];
    return {
      essayId,
      status: c.status,
      outdated: c.essayVersion !== null && c.essayVersion !== essay.version,
      totalScore: c.status === EssayCorrectionStatus.COMPLETED ? c.totalScore : null,
      confidence: c.confidence,
      generalFeedback: c.generalFeedback,
      annulment: c.annulmentJson,
      errorMessage: c.errorMessage,
      method: audit.method ?? null,
      calibrated: audit.calibrated ?? false,
      discrepancy: audit.discrepancy ?? null,
      evaluators: (audit.runs ?? []).map((r) => ({ evaluator: r.evaluator, model: r.model, total: r.total })),
      analysis: audit.analysis
        ? { lines: audit.analysis.lines, linesSource: audit.analysis.linesSource, words: audit.analysis.words, paragraphs: audit.analysis.paragraphs, warnings: audit.analysis.warnings ?? [], proposal: audit.analysis.proposal }
        : null,
      competencies: c.details
        .sort((a, b) => order.indexOf(a.competency) - order.indexOf(b.competency))
        .map((d) => {
          const extra = (d.evidenceJson ?? {}) as { level?: string; evidence?: string[]; citations?: unknown[]; tip?: string | null };
          return { competency: d.competency, score: d.score, justification: d.justification, tip: extra.tip ?? null, level: extra.level ?? '', evidence: extra.evidence ?? [], citations: extra.citations ?? [] };
        }),
      updatedAt: c.updatedAt,
    };
  }
}
