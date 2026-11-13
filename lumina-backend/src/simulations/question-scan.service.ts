import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { Prisma, PrismaClient, QuestionDifficulty, ErrorReason } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { QuestionAccessService } from '../questions/question-access.service';
import { nextErrorReviewAt } from '../questions/review-schedule';
import { ERROR_NOTEBOOK_MASTERED_STREAK } from '../questions/dto/error-notebook.dto';
import { AiService } from '../ai/ai.service';
import { decodeImage } from '../essay-correction/essay-correction.service';
import { PlanUsageService } from '../plans/plan-usage.service';
import { parseQuestionOcr, QUESTION_OCR_PROMPT, QUESTION_OCR_SYSTEM, QuestionNotReadableError, QuestionOcrResult } from './question-ocr';

/** Leitura que falhou: devolve o registro FAILED e o crédito do plano volta. */
class ScanFailed extends Error {
  constructor(readonly processing: unknown) {
    super('leitura falhou');
  }
}

@Injectable()
export class QuestionScanService {
  private readonly logger = new Logger(QuestionScanService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly questionAccess: QuestionAccessService,
    // Opcionais para testes montados à mão; no app vêm do AiModule e do PlansModule.
    @Optional() private readonly ai?: AiService,
    @Optional() private readonly planUsage?: PlanUsageService,
  ) {}

  // ---------- Upload (Presigned URL) ----------

  async createPresignedUpload(userId: string, dto: { contentType: string }) {
    await this.questionAccess.getPersonalWorkspaceOrThrow(userId);

    const upload = await this.prisma.questionScanUpload.create({
      data: {
        userId,
        fileUrl: '',
        metaJson: { contentType: dto.contentType },
        status: 'PENDING',
      },
    });

    // Em produção: presigned URL S3/MinIO. Aqui endpoint local.
    const uploadUrl = `/api/v1/simulations/question-scans/upload/${upload.id}`;
    const expiresIn = 3600;

    return { uploadUrl, uploadId: upload.id, key: upload.id, expiresIn };
  }

  /**
   * Conclui o upload e já faz a leitura (a resposta volta com o resultado,
   * sem o app precisar consultar de novo). Só o dono conclui o próprio
   * upload, e só uma vez. Cada leitura gasta uma mensagem da LuminIA do
   * plano; se a leitura falhar, a mensagem volta.
   */
  async completeUpload(userId: string, uploadId: string, dto: { fileUrl: string; width: number; height: number; sizeBytes: number }) {
    const upload = await this.prisma.questionScanUpload.findFirst({ where: { id: uploadId, userId } });
    if (!upload) throw new NotFoundException('Envio não encontrado.');
    if (upload.status !== 'PENDING') throw new ConflictException('Esta foto já foi enviada para leitura.');
    // Confere o tipo pelos bytes (JPEG, PNG ou WebP) e o tamanho máximo.
    const image = decodeImage(dto.fileUrl);

    const run = async () => {
      await this.prisma.questionScanUpload.update({
        where: { id: upload.id },
        data: {
          fileUrl: dto.fileUrl,
          metaJson: { width: dto.width, height: dto.height, sizeBytes: image.bytes.length, mimeType: image.mime },
          status: 'PROCESSING',
        },
      });
      const processing = await this.processUpload(upload.id);
      // Leitura que falhou não deve custar a mensagem do aluno.
      if (processing?.status === 'FAILED') throw new ScanFailed(processing);
      return processing;
    };

    try {
      return this.planUsage ? await this.planUsage.withQuota(userId, 'LUMINIA_MESSAGE', run) : await run();
    } catch (error) {
      if (error instanceof ScanFailed) return error.processing;
      throw error;
    }
  }

  // ---------- Processamento ----------

  /** Lê a questão na foto com o modelo de visão e grava o resultado para o aluno conferir. */
  async processUpload(uploadId: string) {
    const upload = await this.prisma.questionScanUpload.findUnique({ where: { id: uploadId } });
    if (!upload) return null;

    try {
      const result = await this.readQuestion(upload.fileUrl);
      const processing = await this.prisma.questionScanProcessing.create({
        data: {
          uploadId: upload.id,
          stemText: result.stemText,
          alternativesJson: result.alternatives.length ? result.alternatives : Prisma.JsonNull,
          subject: result.subject,
          topic: result.topic,
          difficulty: result.difficulty,
          // A leitura não sabe a alternativa correta: sem explicação inventada.
          explanationJson: Prisma.JsonNull,
          confidence: result.confidence,
          warningsJson: result.warnings.length > 0 ? result.warnings : Prisma.JsonNull,
          status: 'COMPLETED',
          finishedAt: new Date(),
        },
        include: { upload: true, result: true },
      });
      await this.prisma.questionScanUpload.update({ where: { id: uploadId }, data: { status: 'COMPLETED' } });
      return processing;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido';
      if (!(err instanceof QuestionNotReadableError)) this.logger.warn(`Leitura da questão ${uploadId} falhou: ${message}`);
      const processing = await this.prisma.questionScanProcessing.create({
        data: {
          uploadId,
          stemText: null,
          alternativesJson: Prisma.JsonNull,
          subject: null,
          topic: null,
          difficulty: null,
          explanationJson: Prisma.JsonNull,
          confidence: null,
          warningsJson: Prisma.JsonNull,
          status: 'FAILED',
          errorMessage: message,
          finishedAt: new Date(),
        },
        include: { upload: true, result: true },
      });
      await this.prisma.questionScanUpload.update({ where: { id: uploadId }, data: { status: 'FAILED' } });
      return processing;
    }
  }

  /** Chama o modelo de visão (AI_VISION_MODELS). Sem IA configurada, falha com mensagem clara. */
  private async readQuestion(dataUrl: string): Promise<QuestionOcrResult> {
    if (!this.ai) throw new Error('A leitura de questões por foto não está configurada neste ambiente.');
    const result = await this.ai.generateStructured({
      system: QUESTION_OCR_SYSTEM,
      prompt: QUESTION_OCR_PROMPT,
      imageDataUrl: dataUrl,
      maxTokens: 2500,
      timeoutMs: 60_000,
      temperature: 0,
    });
    if (!result?.text?.trim()) throw new Error('A leitura de questões por foto não está disponível agora. Tente de novo em instantes.');
    return parseQuestionOcr(result.text);
  }

  // ---------- Salvar resultado (criar questão ou adicionar ao caderno) ----------

  /** Salva o resultado do scanner como questão oficial do banco. */
  async saveAsQuestion(userId: string, processingId: string, dto: {
    finalStem: string;
    finalAlternatives: { position: number; text: string; isCorrect?: boolean }[];
    finalSubject: string;
    finalTopic: string;
    finalDifficulty: QuestionDifficulty;
    finalExplanation?: Record<number, string>;
    exam?: string;
  }) {
    await this.questionAccess.getPersonalWorkspaceOrThrow(userId);

    const processing = await this.prisma.questionScanProcessing.findUnique({
      where: { id: processingId },
      include: { upload: true },
    });
    if (!processing) throw new NotFoundException('Processamento não encontrado.');
    if (processing.upload.userId !== userId) throw new BadRequestException('Não autorizado.');

    const workspaceId = (await this.questionAccess.getPersonalWorkspaceOrThrow(userId)).id;

    // Valida alternativas: exatamente uma correta
    const correctCount = dto.finalAlternatives.filter(a => a.isCorrect).length;
    if (correctCount !== 1) throw new BadRequestException('Deve haver exatamente uma alternativa correta.');

    const question = await this.prisma.question.create({
      data: {
        workspaceId,
        subject: dto.finalSubject,
        topic: dto.finalTopic,
        difficulty: dto.finalDifficulty,
        exam: dto.exam ?? 'SCANNER',
        stem: dto.finalStem,
        alternatives: {
          create: dto.finalAlternatives.map(a => ({
            position: a.position,
            text: a.text,
            isCorrect: a.isCorrect ?? false,
            explanation: dto.finalExplanation?.[a.position] ?? null,
          })),
        },
      },
    });

    // Liga ao resultado do scanner
    await this.prisma.questionScanResult.create({
      data: {
        processingId,
        userId,
        questionId: question.id,
        finalStem: dto.finalStem,
        finalAlternatives: dto.finalAlternatives,
        finalSubject: dto.finalSubject,
        finalTopic: dto.finalTopic,
        finalDifficulty: dto.finalDifficulty,
        finalExplanation: dto.finalExplanation ?? Prisma.JsonNull,
      },
    });

    return question;
  }

  /** Adiciona o resultado do scanner ao caderno de erros do aluno. */
  async saveToErrorNotebook(userId: string, processingId: string, dto: {
    finalStem: string;
    finalAlternatives: { position: number; text: string; isCorrect?: boolean }[];
    finalSubject: string;
    finalTopic: string;
    finalDifficulty: QuestionDifficulty;
    finalExplanation?: Record<number, string>;
    reason?: ErrorReason;
    notes?: string;
  }) {
    await this.questionAccess.getPersonalWorkspaceOrThrow(userId);

    const processing = await this.prisma.questionScanProcessing.findUnique({
      where: { id: processingId },
      include: { upload: true },
    });
    if (!processing) throw new NotFoundException('Processamento não encontrado.');
    if (processing.upload.userId !== userId) throw new BadRequestException('Não autorizado.');

    // Cria ou reutiliza a questão (não oficial, sourceType=IMPORTED)
    const workspaceId = (await this.questionAccess.getPersonalWorkspaceOrThrow(userId)).id;

    const question = await this.prisma.question.create({
      data: {
        workspaceId,
        subject: dto.finalSubject,
        topic: dto.finalTopic,
        difficulty: dto.finalDifficulty,
        exam: 'SCANNER',
        stem: dto.finalStem,
        sourceType: 'IMPORTED',
        sourceName: 'Scanner de Questões',
        sourceId: `scan:${processingId}`,
        alternatives: {
          create: dto.finalAlternatives.map(a => ({
            position: a.position,
            text: a.text,
            isCorrect: a.isCorrect ?? false,
            explanation: dto.finalExplanation?.[a.position] ?? null,
          })),
        },
      },
    });

    // Cria entrada no caderno de erros
    const entry = await this.prisma.errorNotebookEntry.create({
      data: {
        userId,
        questionId: question.id,
        reason: dto.reason ?? null,
        notes: dto.notes ?? null,
        status: 'ABERTA',
        wrongAttempts: 1,
        correctStreak: 0,
        evolution: 'E',
        reviewScheduledAt: nextErrorReviewAt(
          new Date(),
          'WRONG',
          0,
          ERROR_NOTEBOOK_MASTERED_STREAK,
        ),
        firstWrongAt: new Date(),
        lastWrongAt: new Date(),
      },
    });

    // Liga ao resultado do scanner
    await this.prisma.questionScanResult.create({
      data: {
        processingId,
        userId,
        questionId: question.id,
        errorNotebookEntryId: entry.id,
        finalStem: dto.finalStem,
        finalAlternatives: dto.finalAlternatives,
        finalSubject: dto.finalSubject,
        finalTopic: dto.finalTopic,
        finalDifficulty: dto.finalDifficulty,
        finalExplanation: dto.finalExplanation ?? Prisma.JsonNull,
      },
    });

    return { question, entry };
  }

  // ---------- Consulta ----------

  async getProcessing(userId: string, processingId: string) {
    await this.questionAccess.getPersonalWorkspaceOrThrow(userId);
    const p = await this.prisma.questionScanProcessing.findUnique({
      where: { id: processingId },
      include: { upload: true, result: true },
    });
    if (!p) throw new NotFoundException('Processamento não encontrado.');
    if (p.upload.userId !== userId) throw new BadRequestException('Não autorizado.');
    return p;
  }

  async listUploads(userId: string) {
    await this.questionAccess.getPersonalWorkspaceOrThrow(userId);
    return this.prisma.questionScanUpload.findMany({
      where: { userId },
      // `result` é relação do processing (1:1), não do upload.
      include: { processing: { include: { result: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getStats(userId: string) {
    await this.questionAccess.getPersonalWorkspaceOrThrow(userId);
    const [uploads, processings, results] = await Promise.all([
      this.prisma.questionScanUpload.count({ where: { userId } }),
      this.prisma.questionScanProcessing.count({ where: { upload: { userId } } }),
      this.prisma.questionScanResult.count({ where: { userId } }),
    ]);
    return { uploads, processings, results };
  }
}